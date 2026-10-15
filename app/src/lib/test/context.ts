import type { PluginListenerHandle } from '@capacitor/core';
import type { InstallJob, StartInstallOptions } from '@lexnur/native';
import { MemoryKv } from '../data/kv';
import { Settings } from '../data/settings';
import { RecentSearches } from '../data/recent-searches';
import { CatalogRepository } from '../data/catalog-repository';
import { DictionaryStore } from '../data/dictionary-store';
import { PackageInstaller, type NativeDownloads } from '../data/package-installer';
import { SearchController } from '../data/search-controller';
import { Observable } from '../observable';
import { createTranslator, type Lang } from '../i18n';
import { Prompt, Toasts, type AppContext, type I18nState } from '../app-context';
import { Router } from '../nav/router.svelte';
import { nodeDriver } from '../sql/node-driver';
import { fixtureCatalog, resolveFixture } from './fixtures';
import type { Platform } from '../platform/types';

export class TestNative implements NativeDownloads {
  started: StartInstallOptions[] = [];
  removed: string[] = [];
  free = 10e9;
  private jobs = new Map<string, InstallJob>();
  private fn: ((j: InstallJob) => void) | null = null;
  async startInstall(o: StartInstallOptions) { this.started.push(o); this.emit({ id: o.id, version: o.version, state: 'queued', bytesDownloaded: 0, totalBytes: o.sizeBytes }); }
  async pauseInstall({ id }: { id: string }) { this.emit({ ...this.jobs.get(id)!, state: 'paused' }); }
  async resumeInstall({ id }: { id: string }) { this.emit({ ...this.jobs.get(id)!, state: 'queued' }); }
  async cancelInstall({ id }: { id: string }) { this.jobs.delete(id); }
  async removePackage({ relativePath }: { relativePath: string }) { this.removed.push(relativePath); }
  async status() { return { jobs: [...this.jobs.values()] }; }
  async acknowledge({ id }: { id: string }) { this.jobs.delete(id); }
  async freeSpace() { return { bytes: this.free }; }
  async addListener(_e: 'installProgress', fn: (j: InstallJob) => void): Promise<PluginListenerHandle> { this.fn = fn; return { remove: async () => { this.fn = null; } }; }
  emit(j: InstallJob) { this.jobs.set(j.id, j); this.fn?.(j); }
}

class TestI18n extends Observable<I18nState> {
  constructor(lang: Lang) { super({ lang, dir: lang === 'ar' ? 'rtl' : 'ltr', t: createTranslator(lang) }); }
}

export async function makeTestContext(o: { lang?: Lang; installed?: string[]; deviceLanguages?: string[]; platform?: Partial<Platform> } = {}) {
  const kv = new MemoryKv();
  const native = new TestNative();
  const resolvePackagePath = async (rel: string) => resolveFixture(`${rel.split('/')[0]}.sqlite`);
  const platform: Platform = {
    kind: 'web-fixture', os: 'web', sql: nodeDriver, resolvePackagePath, native, kv,
    catalogUrl: 'https://dl.lexnur.com/catalog/v1.json', snapshot: fixtureCatalog,
    connection: async () => 'wifi', onConnectionChange: () => {}, deviceLanguages: async () => o.deviceLanguages ?? ['en-US'],
    share: async () => {}, copy: async () => {}, haptic: async () => {}, systemSeed: async () => null, onResume: () => {}, onBack: () => {},
    setSystemBarsDark: async () => {}, applyTextZoom: async () => {}, isScreenReaderOn: async () => false, setKeyboardAccessoryBar: async () => {},
    appVersion: async () => 'test',
    ...o.platform,
  };
  const settings = await Settings.load(kv);
  const recents = await RecentSearches.load(kv);
  const catalog = await CatalogRepository.load({ snapshot: fixtureCatalog, catalogUrl: platform.catalogUrl, fetch: (async () => { throw new TypeError('offline'); }) as unknown as typeof fetch, kv });
  for (const id of o.installed ?? []) { const d = catalog.find(id)!; await catalog.markInstalled(d, `${id}/${d.version}.sqlite`); }
  const store = new DictionaryStore(nodeDriver, resolvePackagePath);
  await store.setInstalled(catalog.forStore());
  const cellular = new Prompt<{ bytes: number }, 'now' | 'wifi' | 'cancel'>();
  const installer = new PackageInstaller({ native, catalog, store, settings, recents, kv, connection: async () => 'wifi', askCellular: (bytes) => cellular.ask({ bytes }) });
  await installer.init();
  const ctx: AppContext = { platform, settings, recents, catalog, store, installer, search: new SearchController(store, 0), i18n: new TestI18n(o.lang ?? 'en'), cellular, toasts: new Toasts() };
  const router = new Router();
  return { ctx, router, native, context: new Map<string, unknown>([['app', ctx], ['router', router]]) };
}
