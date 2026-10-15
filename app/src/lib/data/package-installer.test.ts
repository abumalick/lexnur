import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { InstallJob, StartInstallOptions } from '@lexnur/native';
import { MemoryKv } from './kv';
import { Settings } from './settings';
import { RecentSearches } from './recent-searches';
import { CatalogRepository } from './catalog-repository';
import { PackageInstaller, CELLULAR_PROMPT_BYTES, spaceNeeded, type NativeDownloads } from './package-installer';
import { fixtureCatalog } from '../test/fixtures';

class FakeNative implements NativeDownloads {
  started: StartInstallOptions[] = [];
  jobs = new Map<string, InstallJob>();
  removed: string[] = [];
  free = 10 * 1024 ** 3;
  private fn: ((j: InstallJob) => void) | null = null;
  async startInstall(o: StartInstallOptions) {
    this.started.push(o);
    this.jobs.set(o.id, { id: o.id, version: o.version, state: 'queued', bytesDownloaded: 0, totalBytes: o.sizeBytes });
  }
  async pauseInstall({ id }: { id: string }) { this.emit({ ...this.jobs.get(id)!, state: 'paused' }); }
  async resumeInstall({ id }: { id: string }) { this.emit({ ...this.jobs.get(id)!, state: 'queued' }); }
  async cancelInstall({ id }: { id: string }) { this.jobs.delete(id); }
  async removePackage({ relativePath }: { relativePath: string }) { this.removed.push(relativePath); }
  async status() { return { jobs: [...this.jobs.values()] }; }
  async acknowledge({ id }: { id: string }) { this.jobs.delete(id); }
  async freeSpace() { return { bytes: this.free }; }
  async addListener(_e: 'installProgress', fn: (j: InstallJob) => void) { this.fn = fn; return { remove: async () => { this.fn = null; } }; }
  emit(j: InstallJob) { this.jobs.set(j.id, j); this.fn?.(j); }
  finish(id: string, state: 'done' | 'failed' = 'done', error?: InstallJob['error']) {
    const j = this.jobs.get(id)!;
    this.emit({ ...j, state, error, bytesDownloaded: j.totalBytes, relativePath: state === 'done' ? `${id}/${j.version}.sqlite` : undefined });
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));
let native: FakeNative, catalog: CatalogRepository, settings: Settings, recents: RecentSearches;
let store: { setInstalled: ReturnType<typeof vi.fn>; sameHeadword: ReturnType<typeof vi.fn> };
let connection: 'wifi' | 'cellular'; let ask: Mock<(bytes: number) => Promise<'now' | 'wifi' | 'cancel'>>; let installer: PackageInstaller; let kv: MemoryKv;

beforeEach(async () => {
  kv = new MemoryKv();
  native = new FakeNative();
  catalog = await CatalogRepository.load({ snapshot: fixtureCatalog, catalogUrl: 'https://dl.lexnur.com/catalog/v1.json', fetch: vi.fn() as any, kv });
  settings = await Settings.load(kv);
  recents = await RecentSearches.load(kv);
  store = { setInstalled: vi.fn(async () => {}), sameHeadword: vi.fn(async () => []) };
  connection = 'wifi';
  ask = vi.fn(async () => 'now' as const);
  installer = new PackageInstaller({ native, catalog, store: store as any, settings, recents, kv, connection: async () => connection, askCellular: ask });
  await installer.init();
});

const ids = () => fixtureCatalog.dictionaries.map((d) => d.id);

// Records whether the store dropped its connection before the native side deleted the file.
function trackOrder(): string[] {
  const order: string[] = [];
  store.setInstalled.mockImplementation(async () => { order.push('store'); });
  const original = native.removePackage.bind(native);
  native.removePackage = async (o) => { order.push('remove'); return original(o); };
  return order;
}

describe('PackageInstaller', () => {
  it('downloads one at a time, smallest first', async () => {
    await installer.install(ids());
    expect(native.started).toHaveLength(1);
    const sizes = [...fixtureCatalog.dictionaries].sort((a, b) => a.size_bytes - b.size_bytes);
    expect(native.started[0].id).toBe(sizes[0].id);
    native.finish(sizes[0].id); await flush();
    expect(native.started.map((s) => s.id)).toEqual([sizes[0].id, sizes[1].id]);
  });

  it('refuses to start without enough space and starts nothing', async () => {
    native.free = 10;
    const r = await installer.install(['oewn-2025']);
    expect(r.kind).toBe('no_space');
    expect(native.started).toEqual([]);
  });

  it('asks before a large download on mobile data', async () => {
    connection = 'cellular';
    const big = catalog.find('oewn-2025')!;
    (big as any).size_bytes = CELLULAR_PROMPT_BYTES + 1;
    ask.mockResolvedValueOnce('wifi');
    await installer.install(['oewn-2025']);
    expect(ask).toHaveBeenCalledWith(CELLULAR_PROMPT_BYTES + 1);
    expect(native.started[0].allowCellular).toBe(false);
  });

  it('does not ask for small downloads, and cancel starts nothing', async () => {
    connection = 'cellular';
    await installer.install(['oewn-2025']);
    expect(ask).not.toHaveBeenCalled();
    expect(native.started[0].allowCellular).toBe(true);
    const big = catalog.find('wiktionary-en')!;
    (big as any).size_bytes = CELLULAR_PROMPT_BYTES * 2;
    ask.mockResolvedValueOnce('cancel');
    expect((await installer.install(['wiktionary-en'])).kind).toBe('cancelled');
  });

  it('honours the Wi-Fi-only setting without asking', async () => {
    connection = 'cellular';
    await settings.update({ cellular: 'wifi_only' });
    await installer.install(['oewn-2025']);
    expect(ask).not.toHaveBeenCalled();
    expect(native.started[0].allowCellular).toBe(false);
  });

  it('registers a finished install and opens it in the store', async () => {
    await installer.install(['oewn-2025']);
    native.finish('oewn-2025'); await flush();
    expect(catalog.installedRecord('oewn-2025')?.relativePath).toBe(`oewn-2025/${catalog.find('oewn-2025')!.version}.sqlite`);
    expect(store.setInstalled).toHaveBeenLastCalledWith(catalog.forStore());
    expect(installer.current.has('oewn-2025')).toBe(false);
  });

  it('swaps an update in, then removes the old file', async () => {
    const order = trackOrder();
    const d = catalog.find('oewn-2025')!;
    await catalog.markInstalled({ ...d, version: 'old' }, 'oewn-2025/old.sqlite');
    await installer.update('oewn-2025');
    native.finish('oewn-2025'); await flush();
    expect(catalog.installedRecord('oewn-2025')?.version).toBe(d.version);
    expect(native.removed).toEqual(['oewn-2025/old.sqlite']);
    expect(order).toEqual(['store', 'remove']);
  });


  it('re-resolves the recents of an updated dictionary, since entry ids are not stable across versions', async () => {
    const d = catalog.find('oewn-2025')!;
    await catalog.markInstalled({ ...d, version: 'old' }, 'oewn-2025/old.sqlite');
    await recents.add({ dictionaryId: 'oewn-2025', entryId: 7, headword: 'write', gloss: null });
    await recents.add({ dictionaryId: 'oewn-2025', entryId: 8, headword: 'gone', gloss: null });
    await recents.add({ dictionaryId: 'wiktionary-en', entryId: 7, headword: 'write', gloss: null });
    store.sameHeadword.mockImplementation(async (h: string, ids: string[]) =>
      h === 'write' && ids.includes('oewn-2025') ? [{ dictionaryId: 'oewn-2025', entryId: 9, headword: 'write' }] : []);
    await installer.update('oewn-2025');
    native.finish('oewn-2025'); await flush();
    expect(recents.current.map((x) => [x.dictionaryId, x.entryId])).toEqual([['wiktionary-en', 7], ['oewn-2025', 9]]);
  });

  it('leaves recents alone on a first install', async () => {
    await recents.add({ dictionaryId: 'oewn-2025', entryId: 7, headword: 'write', gloss: null });
    await installer.install(['oewn-2025']);
    native.finish('oewn-2025'); await flush();
    expect(store.sameHeadword).not.toHaveBeenCalled();
    expect(recents.current.map((x) => x.entryId)).toEqual([7]);
  });
  it('retries a checksum failure once from scratch, then reports it', async () => {
    await installer.install(['oewn-2025']);
    native.finish('oewn-2025', 'failed', 'checksum'); await flush();
    expect(native.started.filter((s) => s.id === 'oewn-2025')).toHaveLength(2);
    native.finish('oewn-2025', 'failed', 'checksum'); await flush();
    expect(native.started.filter((s) => s.id === 'oewn-2025')).toHaveLength(2);
    expect(installer.current.get('oewn-2025')?.state).toBe('failed');
  });

  it('reconcile registers a job that finished while JS was dead', async () => {
    const v = catalog.find('wiktionary-ar-en')!.version;
    native.jobs.set('wiktionary-ar-en', { id: 'wiktionary-ar-en', version: v, state: 'done', bytesDownloaded: 1, totalBytes: 1, relativePath: `wiktionary-ar-en/${v}.sqlite` });
    native.jobs.set('wiktionary-en', { id: 'wiktionary-en', version: 'x', state: 'waiting_network', bytesDownloaded: 5, totalBytes: 9 });
    const fresh = new PackageInstaller({ native, catalog, store: store as any, settings, recents, kv, connection: async () => 'wifi', askCellular: ask });
    await fresh.init();
    expect(catalog.installedRecord('wiktionary-ar-en')).toBeDefined();
    expect(fresh.current.get('wiktionary-en')?.state).toBe('waiting_network');
    expect(store.setInstalled).toHaveBeenCalledWith(catalog.forStore());
    expect(native.jobs.has('wiktionary-ar-en')).toBe(false);
  });

  it('remove closes store first and resets scope', async () => {
    const d = catalog.find('oewn-2025')!;
    await catalog.markInstalled(d, `oewn-2025/${d.version}.sqlite`);
    await settings.update({ lastScope: { kind: 'one', id: 'oewn-2025' } });
    await recents.add({ dictionaryId: 'oewn-2025', entryId: 1, headword: 'write', gloss: null });
    const order = trackOrder();
    await installer.remove('oewn-2025');
    expect(store.setInstalled).toHaveBeenLastCalledWith([]);
    expect(native.removed).toEqual([`oewn-2025/${d.version}.sqlite`]);
    expect(order).toEqual(['store', 'remove']);
    expect(settings.current.lastScope).toEqual({ kind: 'all' });
    expect(recents.current).toEqual([]);
  });
});

describe('PackageInstaller mobile data and reinstall', () => {
  const makeBig = () => { (catalog.find('oewn-2025') as any).size_bytes = CELLULAR_PROMPT_BYTES + 1; };

  it('asks exactly at cellular above the threshold, and "now" allows cellular', async () => {
    connection = 'cellular';
    makeBig();
    ask.mockResolvedValueOnce('now');
    expect((await installer.install(['oewn-2025'])).kind).toBe('started');
    expect(ask).toHaveBeenCalledTimes(1);
    expect(native.started[0].allowCellular).toBe(true);
  });

  it('does not ask on Wi-Fi even above the threshold', async () => {
    makeBig();
    await installer.install(['oewn-2025']);
    expect(ask).not.toHaveBeenCalled();
    expect(native.started).toHaveLength(1);
  });

  it('does not ask when the setting allows mobile data', async () => {
    connection = 'cellular';
    makeBig();
    await settings.update({ cellular: 'allow' });
    await installer.install(['oewn-2025']);
    expect(ask).not.toHaveBeenCalled();
    expect(native.started[0].allowCellular).toBe(true);
  });

  it('declining leaves the installed set and the queue unchanged', async () => {
    connection = 'cellular';
    makeBig();
    ask.mockResolvedValueOnce('cancel');
    expect((await installer.install(['oewn-2025'])).kind).toBe('cancelled');
    expect(native.started).toEqual([]);
    expect(catalog.current.installed).toEqual([]);
    expect(installer.current.size).toBe(0);
    expect(store.setInstalled).not.toHaveBeenCalled();
  });

  it('reinstall closes the store, removes the file and installs again without touching recents or scope', async () => {
    const d = catalog.find('oewn-2025')!;
    await catalog.markInstalled(d, `oewn-2025/${d.version}.sqlite`);
    await settings.update({ lastScope: { kind: 'one', id: 'oewn-2025' } });
    await recents.add({ dictionaryId: 'oewn-2025', entryId: 1, headword: 'write', gloss: null });
    const order = trackOrder();
    expect((await installer.reinstall('oewn-2025')).kind).toBe('started');
    expect(order).toEqual(['store', 'remove']);
    expect(native.removed).toEqual([`oewn-2025/${d.version}.sqlite`]);
    expect(native.started.map((s) => s.id)).toEqual(['oewn-2025']);
    expect(settings.current.lastScope).toEqual({ kind: 'one', id: 'oewn-2025' });
    expect(recents.current).toHaveLength(1);
    native.finish('oewn-2025'); await flush();
    expect(catalog.installedRecord('oewn-2025')).toBeDefined();
  });
});

describe('PackageInstaller fixes', () => {
  const fresh = () => new PackageInstaller({ native, catalog, store: store as any, settings, recents, kv, connection: async () => connection, askCellular: ask });

  it('computes spaceNeeded as sum of installed sizes plus the largest download', () => {
    const [a, b] = fixtureCatalog.dictionaries;
    expect(spaceNeeded([a, b])).toBe(a.installed_size_bytes + b.installed_size_bytes + Math.max(a.size_bytes, b.size_bytes));
    expect(spaceNeeded([])).toBe(0);
  });

  it('acknowledges only after the store has been updated', async () => {
    const order: string[] = [];
    store.setInstalled.mockImplementation(async () => { order.push('store'); });
    const ack = native.acknowledge.bind(native);
    native.acknowledge = async (o) => { order.push('ack'); return ack(o); };
    await installer.install(['oewn-2025']);
    native.finish('oewn-2025'); await flush();
    expect(order).toEqual(['store', 'ack']);
    expect(native.jobs.has('oewn-2025')).toBe(false);
  });

  it('retries a checksum failure found at init under the Wi-Fi-only setting and keeps one download active', async () => {
    const d = catalog.find('wiktionary-en')!;
    (d as any).size_bytes = CELLULAR_PROMPT_BYTES * 2;
    await settings.update({ cellular: 'wifi_only' });
    native.jobs.set(d.id, { id: d.id, version: d.version, state: 'failed', error: 'checksum', bytesDownloaded: 1, totalBytes: 1 });
    const again = fresh();
    await again.init();
    expect(native.started).toHaveLength(1);
    expect(native.started[0].allowCellular).toBe(false);
    await again.install(['oewn-2025']);
    expect(native.started).toHaveLength(1);
  });

  it('does not allow cellular for a large init-time retry when the policy is ask', async () => {
    const d = catalog.find('wiktionary-en')!;
    (d as any).size_bytes = CELLULAR_PROMPT_BYTES * 2;
    native.jobs.set(d.id, { id: d.id, version: d.version, state: 'failed', error: 'checksum', bytesDownloaded: 1, totalBytes: 1 });
    await fresh().init();
    expect(native.started[0].allowCellular).toBe(false);
    expect(ask).not.toHaveBeenCalled();
  });

  it('restores the waiting queue after a restart and keeps pumping', async () => {
    const all = [...fixtureCatalog.dictionaries].sort((a, b) => a.size_bytes - b.size_bytes).map((x) => x.id);
    await installer.install(all);
    expect(native.started.map((s) => s.id)).toEqual([all[0]]);
    const v = native.jobs.get(all[0])!.version;
    native.jobs.set(all[0], { ...native.jobs.get(all[0])!, state: 'done', relativePath: `${all[0]}/${v}.sqlite` });
    const again = fresh();
    await again.init();
    expect(catalog.installedRecord(all[0])).toBeDefined();
    expect(native.started.map((s) => s.id)).toEqual([all[0], all[1]]);
    expect(again.current.get(all[2])?.state).toBe('queued');
    native.finish(all[1]); await flush();
    expect(native.started.map((s) => s.id)).toEqual([all[0], all[1], all[2]]);
  });

  it('marks an entry failed when startInstall rejects and continues the queue', async () => {
    const [first, second] = [...fixtureCatalog.dictionaries].sort((a, b) => a.size_bytes - b.size_bytes);
    const start = native.startInstall.bind(native);
    native.startInstall = async (o) => { if (o.id === first.id) throw new Error('boom'); return start(o); };
    await installer.install([first.id, second.id]);
    expect(installer.current.get(first.id)?.state).toBe('failed');
    expect(installer.current.get(first.id)?.error).toBe('io');
    expect(native.started.map((s) => s.id)).toEqual([second.id]);
  });

  it('remove cancels a running update first', async () => {
    const d = catalog.find('oewn-2025')!;
    await catalog.markInstalled({ ...d, version: 'old' }, 'oewn-2025/old.sqlite');
    await installer.update('oewn-2025');
    await installer.remove('oewn-2025');
    expect(native.jobs.has('oewn-2025')).toBe(false);
    expect(installer.current.has('oewn-2025')).toBe(false);
    expect(catalog.installedRecord('oewn-2025')).toBeUndefined();
  });

  it('starts exactly one download for overlapping install calls', async () => {
    const [a, b] = [...fixtureCatalog.dictionaries].sort((x, y) => x.size_bytes - y.size_bytes);
    await Promise.all([installer.install([a.id]), installer.install([b.id])]);
    expect(native.started.map((s) => s.id)).toEqual([a.id]);
    native.finish(a.id); await flush();
    expect(native.started.map((s) => s.id)).toEqual([a.id, b.id]);
  });

  it('does not restart a restored queue entry that native already runs', async () => {
    const [a, b] = [...fixtureCatalog.dictionaries].sort((x, y) => x.size_bytes - y.size_bytes);
    await installer.install([a.id, b.id]);
    native.jobs.set(b.id, { id: b.id, version: b.version, state: 'paused', bytesDownloaded: 1, totalBytes: 2 });
    native.jobs.delete(a.id);
    await fresh().init();
    expect(native.started.map((s) => s.id)).toEqual([a.id]);
  });

  it('re-enables pumping when init throws', async () => {
    const again = fresh();
    native.status = async () => { throw new Error('x'); };
    await expect(again.init()).rejects.toThrow();
    await again.install(['oewn-2025']);
    expect(native.started).toHaveLength(1);
  });
});
