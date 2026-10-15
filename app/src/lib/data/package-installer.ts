import type { PublishedDictionary } from '@lexnur/core';
import type { InstallJob, LexnurNativePlugin } from '@lexnur/native';
import { Observable } from '../observable';
import type { CatalogRepository } from './catalog-repository';
import type { DictionaryStore } from './dictionary-store';
import { readJson, type KeyValueStore } from './kv';
import type { RecentSearches } from './recent-searches';
import type { Settings } from './settings';

const QUEUE_KEY = 'installer.queue';
export const CELLULAR_PROMPT_BYTES = 52_428_800;
export type ConnectionType = 'wifi' | 'cellular' | 'none' | 'unknown';
export type NativeDownloads = Pick<LexnurNativePlugin,
  'startInstall' | 'pauseInstall' | 'resumeInstall' | 'cancelInstall' | 'removePackage' | 'status' | 'acknowledge' | 'freeSpace' | 'addListener'>;
export type StartResult = { kind: 'started' } | { kind: 'no_space'; needed: number; free: number } | { kind: 'cancelled' } | { kind: 'nothing' };

interface Deps {
  native: NativeDownloads; catalog: CatalogRepository; store: Pick<DictionaryStore, 'setInstalled' | 'sameHeadword'>; settings: Settings;
  recents: RecentSearches; kv: KeyValueStore; connection: () => Promise<ConnectionType>;
  askCellular: (bytes: number) => Promise<'now' | 'wifi' | 'cancel'>;
}
interface Queued { dict: PublishedDictionary; allowCellular: boolean }

export function spaceNeeded(ds: PublishedDictionary[]): number {
  return ds.reduce((s, x) => s + x.installed_size_bytes, 0) + Math.max(0, ...ds.map((x) => x.size_bytes));
}

export class PackageInstaller extends Observable<Map<string, InstallJob>> {
  private queue: Queued[] = [];
  private active: string | null = null;
  private allow = new Map<string, boolean>();
  private pending = new Map<string, PublishedDictionary>();
  private d: Deps;
  private initialising = false;

  constructor(d: Deps) {
    super(new Map());
    this.d = d;
  }

  async init(): Promise<void> {
    this.initialising = true;
    try {
      await this.d.native.addListener('installProgress', (j) => { void this.onJob(j); });
      const { jobs } = await this.d.native.status();
      await this.restoreQueue();
      const live = new Set(jobs.filter((j) => j.state !== 'done' && j.state !== 'failed').map((j) => j.id));
      this.queue = this.queue.filter((q) => !live.has(q.dict.id));
      for (const j of jobs) {
        const dict = this.d.catalog.find(j.id);
        if (dict) this.pending.set(j.id, { ...dict, version: j.version });
        if (j.state === 'done' || j.state === 'failed') await this.onJob(j);
        else { this.put(j); if (j.state !== 'paused') this.active = j.id; }
      }
      await this.saveQueue();
    } finally {
      this.initialising = false;
    }
    await this.pump();
  }

  private async restoreQueue(): Promise<void> {
    const saved = await readJson<{ id: string; allowCellular: boolean }[]>(this.d.kv, QUEUE_KEY);
    for (const { id, allowCellular } of Array.isArray(saved) ? saved : []) {
      const dict = this.d.catalog.find(id);
      if (!dict || this.d.catalog.installedRecord(id) || this.queue.some((q) => q.dict.id === id)) continue;
      this.queue.push({ dict, allowCellular });
      this.put({ id, version: dict.version, state: 'queued', bytesDownloaded: 0, totalBytes: dict.size_bytes });
    }
  }

  private saveQueue(): Promise<void> {
    return this.d.kv.set(QUEUE_KEY, JSON.stringify(this.queue.map((q) => ({ id: q.dict.id, allowCellular: q.allowCellular }))));
  }

  private cellularWithoutAsking(bytes: number): boolean {
    const policy = this.d.settings.current.cellular;
    return policy === 'allow' || (policy === 'ask' && bytes <= CELLULAR_PROMPT_BYTES);
  }

  private async start(dict: PublishedDictionary, allowCellular: boolean): Promise<void> {
    this.active = dict.id;
    this.allow.set(dict.id, allowCellular);
    this.pending.set(dict.id, dict);
    try {
      await this.d.native.startInstall({
        id: dict.id, version: dict.version, url: dict.url, sha256: dict.sha256,
        sizeBytes: dict.size_bytes, installedSizeBytes: dict.installed_size_bytes, allowCellular,
      });
    } catch {
      this.active = null;
      this.pending.delete(dict.id);
      this.put({ id: dict.id, version: dict.version, state: 'failed', error: 'io', bytesDownloaded: 0, totalBytes: dict.size_bytes });
    }
  }

  private put(j: InstallJob) { const m = new Map(this.value); m.set(j.id, j); this.set(m); }
  private drop(id: string) { const m = new Map(this.value); m.delete(id); this.set(m); }

  private resolve(ids: string[]): PublishedDictionary[] {
    return ids.map((id) => this.d.catalog.find(id)).filter((x): x is PublishedDictionary => !!x);
  }

  async spaceFor(ids: string[]): Promise<{ needed: number; free: number; ok: boolean }> {
    const needed = spaceNeeded(this.resolve(ids));
    const { bytes } = await this.d.native.freeSpace();
    return { needed, free: bytes, ok: bytes >= needed };
  }

  private async cellularFor(bytes: number): Promise<boolean | 'cancel'> {
    const policy = this.d.settings.current.cellular;
    if (policy === 'wifi_only') return false;
    if (policy === 'allow' || bytes <= CELLULAR_PROMPT_BYTES) return true;
    if ((await this.d.connection()) !== 'cellular') return false;
    const choice = await this.d.askCellular(bytes);
    return choice === 'cancel' ? 'cancel' : choice === 'now';
  }

  private async enqueue(ds: PublishedDictionary[]): Promise<StartResult> {
    const todo = ds.filter((x) => !this.value.has(x.id) || this.value.get(x.id)!.state === 'failed').sort((a, b) => a.size_bytes - b.size_bytes);
    if (!todo.length) return { kind: 'nothing' };
    const space = await this.spaceFor(todo.map((x) => x.id));
    if (!space.ok) return { kind: 'no_space', needed: space.needed, free: space.free };
    const allow = await this.cellularFor(todo.reduce((s, x) => s + x.size_bytes, 0));
    if (allow === 'cancel') return { kind: 'cancelled' };
    for (const dict of todo) {
      this.queue.push({ dict, allowCellular: allow });
      this.put({ id: dict.id, version: dict.version, state: 'queued', bytesDownloaded: 0, totalBytes: dict.size_bytes });
    }
    await this.saveQueue();
    await this.pump();
    return { kind: 'started' };
  }

  install(ids: string[]): Promise<StartResult> {
    return this.enqueue(this.resolve(ids).filter((x) => !this.d.catalog.installedRecord(x.id)));
  }
  update(id: string): Promise<StartResult> { return this.enqueue(this.d.catalog.updates().filter((x) => x.id === id)); }
  updateAll(): Promise<StartResult> { return this.enqueue(this.d.catalog.updates()); }
  retry(id: string): Promise<StartResult> { return this.enqueue(this.resolve([id])); }

  private async pump(): Promise<void> {
    if (this.initialising) return;
    while (!this.active) {
      const next = this.queue.shift();
      if (!next) return;
      this.active = next.dict.id;
      await this.saveQueue();
      await this.start(next.dict, next.allowCellular);
    }
  }

  private async onJob(j: InstallJob): Promise<void> {
    if (j.state === 'done' && j.relativePath) {
      await this.register(j);
    } else if (j.state === 'failed' && j.error === 'checksum' && !(await this.d.kv.get(`retried:${j.id}:${j.version}`))) {
      await this.d.kv.set(`retried:${j.id}:${j.version}`, '1');
      this.put({ ...j, state: 'queued' });
      const dict = this.pending.get(j.id) ?? this.d.catalog.find(j.id);
      await this.d.native.cancelInstall({ id: j.id });
      if (dict) await this.start(dict, this.allow.get(j.id) ?? this.cellularWithoutAsking(dict.size_bytes));
      return;
    } else {
      this.put(j);
    }
    if (j.state === 'done' || j.state === 'failed' || j.state === 'paused') {
      if (this.active === j.id) this.active = null;
      await this.pump();
    }
  }

  private async register(j: InstallJob): Promise<void> {
    const dict = this.pending.get(j.id) ?? this.d.catalog.find(j.id);
    if (!dict) { await this.d.native.removePackage({ relativePath: j.relativePath! }); await this.d.native.acknowledge({ id: j.id }); return; }
    const previous = this.d.catalog.installedRecord(j.id);
    await this.d.catalog.markInstalled({ ...dict, version: j.version }, j.relativePath!);
    await this.d.store.setInstalled(this.d.catalog.forStore());
    // Entry ids are row ids, which a new version may renumber.
    if (previous && previous.version !== j.version) {
      await this.d.recents.remap(j.id, async (h) => (await this.d.store.sameHeadword(h, [j.id]).catch(() => []))[0]?.entryId ?? null);
    }
    if (previous && previous.relativePath !== j.relativePath) await this.d.native.removePackage({ relativePath: previous.relativePath });
    await this.d.native.acknowledge({ id: j.id });
    await this.d.kv.remove(`retried:${j.id}:${j.version}`);
    this.pending.delete(j.id);
    this.drop(j.id);
  }

  async pause(id: string) { await this.d.native.pauseInstall({ id }); }
  async resume(id: string) { await this.d.native.resumeInstall({ id, allowCellular: this.allow.get(id) ?? false }); }
  async downloadNow(id: string) { this.allow.set(id, true); await this.d.native.resumeInstall({ id, allowCellular: true }); }

  async cancel(id: string): Promise<void> {
    this.queue = this.queue.filter((q) => q.dict.id !== id);
    await this.saveQueue();
    await this.d.native.cancelInstall({ id });
    this.drop(id);
    if (this.active === id) { this.active = null; await this.pump(); }
  }

  async remove(id: string): Promise<void> {
    const rec = this.d.catalog.installedRecord(id);
    if (!rec) return;
    if (this.value.has(id)) await this.cancel(id);
    await this.d.catalog.markRemoved(id);
    await this.d.store.setInstalled(this.d.catalog.forStore());
    await this.d.native.removePackage({ relativePath: rec.relativePath });
    await this.d.recents.removeDictionary(id);
    const scope = this.d.settings.current.lastScope;
    if (scope?.kind === 'one' && scope.id === id) await this.d.settings.update({ lastScope: { kind: 'all' } });
  }

  async reinstall(id: string): Promise<StartResult> {
    const rec = this.d.catalog.installedRecord(id);
    if (rec) {
      await this.d.catalog.markRemoved(id);
      await this.d.store.setInstalled(this.d.catalog.forStore());
      await this.d.native.removePackage({ relativePath: rec.relativePath });
    }
    return this.install([id]);
  }

  setSceneJob(job: InstallJob): void { this.put(job); }
}
