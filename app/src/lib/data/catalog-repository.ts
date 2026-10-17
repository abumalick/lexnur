import { parsePublishedCatalog, type ParsedCatalog, type PublishedCatalog, type PublishedDictionary } from '@lexnur/core';
import { Observable } from '../observable';
import { readJson, type KeyValueStore } from './kv';
import type { InstalledDictionary } from './dictionary-store';

export interface InstalledRecord {
  id: string; version: string; relativePath: string; title: string; from: string; to: string;
  license: string; license_url: string; attribution: string; source_date: string; ai_generated: boolean;
  installed_size_bytes: number; entry_count: number; installedAt: number;
  availability?: string;
}
// from/to are the pair's two languages in alphabetical order; the dictionaries run in either direction
export interface PairGroup { from: string; to: string; dictionaries: PublishedDictionary[] }
export interface CatalogState { available: PublishedDictionary[]; installed: InstalledRecord[] }

const CACHE = 'catalog.cache';
const INSTALLED = 'installed';
const PAIR_ORDER = ['en-en', 'ar-en'];

interface Deps { snapshot: PublishedCatalog; catalogUrl: string; fetch: typeof fetch; kv: KeyValueStore; appVersion?: string }

function parse(json: unknown): PublishedCatalog {
  const { skipped, ...catalog }: ParsedCatalog = parsePublishedCatalog(json);
  for (const x of skipped) console.warn(`catalog: skipped ${x.id ?? `entry ${x.index}`}: ${x.error}`);
  return catalog;
}

const versionParts = (v: string) => v.split('.').map(Number);
function supports(appVersion: string, min: string | undefined): boolean {
  if (!min) return true;
  const a = versionParts(appVersion);
  const m = versionParts(min);
  for (let i = 0; i < 3; i++) if (a[i] !== m[i]) return a[i] > m[i];
  return true;
}

export class CatalogRepository extends Observable<CatalogState> {
  private d: Deps;
  private generatedAt: string;
  private format: PublishedCatalog['format'];
  private writes: Promise<void> = Promise.resolve();

  private constructor(d: Deps, state: CatalogState, catalog: PublishedCatalog) {
    super(state);
    this.d = d;
    this.generatedAt = catalog.generated_at;
    this.format = catalog.format;
  }

  private static resolve(c: PublishedCatalog, d: Deps): PublishedDictionary[] {
    const appVersion = d.appVersion ?? __APP_VERSION__;
    return c.dictionaries.filter((x) => supports(appVersion, x.min_app_version)).map((x) => ({ ...x, url: new URL(x.url, d.catalogUrl).href }));
  }

  static async load(d: Deps): Promise<CatalogRepository> {
    let catalog = d.snapshot;
    const cached = await readJson<PublishedCatalog>(d.kv, CACHE);
    if (cached) {
      try {
        const c = parse(cached);
        if (c.format >= catalog.format && c.generated_at > catalog.generated_at) catalog = c;
      } catch { /* a corrupt cache falls back to the snapshot */ }
    }
    const saved = await readJson<InstalledRecord[]>(d.kv, INSTALLED);
    const installed = Array.isArray(saved) ? saved : [];
    return new CatalogRepository(d, { available: CatalogRepository.resolve(catalog, d), installed }, catalog);
  }

  find(id: string) { return this.value.available.find((x) => x.id === id); }
  installedRecord(id: string) { return this.value.installed.find((x) => x.id === id); }

  async refresh(): Promise<'updated' | 'unchanged' | 'offline'> {
    let c: PublishedCatalog;
    try {
      const res = await this.d.fetch(this.d.catalogUrl, { cache: 'no-cache' });
      if (!res.ok) return 'offline';
      c = parse(await res.json());
    } catch {
      return 'offline';
    }
    if (c.generated_at === this.generatedAt && c.format === this.format) return 'unchanged';
    try {
      await this.d.kv.set(CACHE, JSON.stringify(c));
    } catch {
      return 'offline';
    }
    this.generatedAt = c.generated_at;
    this.format = c.format;
    this.set({ ...this.value, available: CatalogRepository.resolve(c, this.d) });
    return 'updated';
  }

  async markInstalled(x: PublishedDictionary, relativePath: string, now = Date.now()): Promise<void> {
    const rec: InstalledRecord = {
      id: x.id, version: x.version, relativePath, title: x.title, from: x.from, to: x.to, license: x.license,
      license_url: x.license_url, attribution: x.attribution, source_date: x.source_date, ai_generated: x.ai_generated,
      installed_size_bytes: x.installed_size_bytes, entry_count: x.entry_count, installedAt: now,
    };
    if (x.availability) rec.availability = x.availability;
    await this.mutateInstalled((list) => [...list.filter((r) => r.id !== x.id), rec]);
  }

  async markRemoved(id: string): Promise<void> {
    await this.mutateInstalled((list) => list.filter((r) => r.id !== id));
  }

  private mutateInstalled(change: (list: InstalledRecord[]) => InstalledRecord[]): Promise<void> {
    const run = this.writes.then(async () => {
      const installed = change(this.value.installed);
      await this.d.kv.set(INSTALLED, JSON.stringify(installed));
      this.set({ ...this.value, installed });
    });
    this.writes = run.catch(() => undefined);
    return run;
  }

  updates(): PublishedDictionary[] {
    return this.value.installed.flatMap((r) => { const a = this.find(r.id); return a && a.version !== r.version ? [a] : []; });
  }

  groups(): PairGroup[] {
    const m = new Map<string, PairGroup>();
    for (const x of this.value.available) {
      const [from, to] = [x.from, x.to].sort();
      const k = `${from}-${to}`;
      if (!m.has(k)) m.set(k, { from, to, dictionaries: [] });
      m.get(k)!.dictionaries.push(x);
    }
    const idx = (k: string) => { const i = PAIR_ORDER.indexOf(k); return i < 0 ? PAIR_ORDER.length : i; };
    return [...m.entries()]
      .sort(([a], [b]) => idx(a) - idx(b) || a.localeCompare(b))
      .map(([, g]) => ({ ...g, dictionaries: [...g.dictionaries].sort((a, b) => a.from.localeCompare(b.from) || a.rank - b.rank || a.size_bytes - b.size_bytes) }));
  }

  forStore(): InstalledDictionary[] {
    return this.value.installed.map((r) => ({ id: r.id, title: r.title, from: r.from, to: r.to, relativePath: r.relativePath }));
  }

  defaultSelection(deviceLanguages: string[]): string[] {
    const arabic = deviceLanguages.some((l) => l.toLowerCase().split(/[-_]/)[0] === 'ar');
    const pool = this.value.available.filter((x) => (arabic ? x.from === 'ar' && x.to === 'en' : x.from === 'en' && x.to === 'en'));
    if (!pool.length) return [];
    const pick = arabic ? [...pool].sort((a, b) => a.rank - b.rank)[0] : [...pool].sort((a, b) => a.size_bytes - b.size_bytes)[0];
    return [pick.id];
  }
}
