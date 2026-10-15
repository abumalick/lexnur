import { getContext } from 'svelte';
import { Observable } from './observable';
import { createTranslator, resolveLang, applyDocumentLanguage, type Lang, type Translate } from './i18n';
import { Settings } from './data/settings';
import { RecentSearches } from './data/recent-searches';
import { CatalogRepository } from './data/catalog-repository';
import { DictionaryStore } from './data/dictionary-store';
import { PackageInstaller } from './data/package-installer';
import { SearchController } from './data/search-controller';
import type { KeyValueStore } from './data/kv';
import type { Platform } from './platform/types';

export class Prompt<Req, Res> extends Observable<(Req & { resolve: (r: Res) => void }) | null> {
  constructor() { super(null); }
  ask(req: Req): Promise<Res> {
    return new Promise((ok) => this.set({ ...req, resolve: (r: Res) => { this.set(null); ok(r); } }));
  }
}

export class Toasts extends Observable<string | null> {
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor() { super(null); }
  show(message: string) { clearTimeout(this.timer); this.set(message); this.timer = setTimeout(() => this.set(null), 3500); }
}

export interface I18nState { lang: Lang; dir: 'ltr' | 'rtl'; t: Translate }

class I18nStore extends Observable<I18nState> {
  constructor(lang: Lang) { super(I18nStore.state(lang)); }
  static state(lang: Lang): I18nState { return { lang, dir: lang === 'ar' ? 'rtl' : 'ltr', t: createTranslator(lang) }; }
  setLang(lang: Lang) { if (lang !== this.value.lang) { applyDocumentLanguage(lang); this.set(I18nStore.state(lang)); } }
}

export interface AppContext {
  platform: Platform; settings: Settings; recents: RecentSearches; catalog: CatalogRepository; store: DictionaryStore;
  installer: PackageInstaller; search: SearchController; i18n: Observable<I18nState>; cellular: Prompt<{ bytes: number }, 'now' | 'wifi' | 'cancel'>; toasts: Toasts;
}

// A failing read must not stop the app from starting: unreadable keys behave as missing and defaults apply.
export function tolerantKv(kv: KeyValueStore): KeyValueStore {
  return {
    get: async (key) => { try { return await kv.get(key); } catch (e) { console.warn(`kv read failed for ${key}`, e); return null; } },
    set: (key, value) => kv.set(key, value),
    remove: (key) => kv.remove(key),
  };
}

export async function createAppContext(platform: Platform): Promise<AppContext> {
  const kv = tolerantKv(platform.kv);
  const settings = await Settings.load(kv);
  const recents = await RecentSearches.load(kv);
  const catalog = await CatalogRepository.load({ snapshot: platform.snapshot, catalogUrl: platform.catalogUrl, fetch: (u, i) => fetch(u, i), kv });
  const store = new DictionaryStore(platform.sql, (rel) => platform.resolvePackagePath(rel));
  await store.setInstalled(catalog.forStore());
  const cellular = new Prompt<{ bytes: number }, 'now' | 'wifi' | 'cancel'>();
  const installer = new PackageInstaller({
    native: platform.native, catalog, store, settings, recents, kv,
    connection: () => platform.connection(), askCellular: (bytes) => cellular.ask({ bytes }),
  });
  await installer.init();
  const devices = await platform.deviceLanguages();
  const i18n = new I18nStore(resolveLang(settings.current.uiLanguage, devices));
  applyDocumentLanguage(i18n.current.lang);
  settings.subscribe((s) => i18n.setLang(resolveLang(s.uiLanguage, devices)));
  void catalog.refresh();
  platform.onConnectionChange((c) => { if (c !== 'none') void catalog.refresh(); });
  return { platform, settings, recents, catalog, store, installer, search: new SearchController(store), i18n, cellular, toasts: new Toasts() };
}

export const useApp = () => getContext<AppContext>('app');
