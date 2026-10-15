import { mount } from 'svelte';
import App from '../App.svelte';
import FakeChrome from './ui/FakeChrome.svelte';
import { Router } from './nav/router.svelte';
import type { AppContext } from './app-context';

export const SCENES = ['onboarding', 'search-en', 'search-ar', 'entry-ar', 'entry-en', 'library', 'broken'] as const;
export type Scene = (typeof SCENES)[number];

async function until(check: () => boolean | Promise<boolean>, ms = 10_000): Promise<void> {
  const end = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > end) throw new Error('scene setup timed out');
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function installAll(ctx: AppContext, ids: string[]): Promise<void> {
  await ctx.installer.install(ids);
  await until(() => ids.every((id) => ctx.catalog.installedRecord(id)));
}

async function openEntry(ctx: AppContext, router: Router, headword: string, dictionaryId: string): Promise<void> {
  const hit = (await ctx.store.suggest(headword, { kind: 'one', id: dictionaryId })).items.find((s) => s.headword === headword);
  if (!hit) throw new Error(`scene: ${headword} not in ${dictionaryId}`);
  router.push({ name: 'entry', dictionaryId, entryId: hit.entryId });
}

export async function applyScene(ctx: AppContext, params: URLSearchParams, target: HTMLElement): Promise<void> {
  const scene = params.get('scene') as Scene;
  if (!SCENES.includes(scene)) throw new Error(`unknown scene ${scene}`);
  const lang = params.get('lang') === 'ar' ? 'ar' : 'en';
  const chrome = params.get('chrome');
  ctx.platform.deviceLanguages = async () => [lang === 'ar' ? 'ar-SA' : 'en-US'];
  await ctx.settings.update({ uiLanguage: lang, theme: params.get('theme') === 'dark' ? 'dark' : 'light', openKeyboardOnLaunch: false, onboardingDone: scene !== 'onboarding' });
  const router = new Router();
  const all = ctx.catalog.current.available.map((d) => d.id);

  if (scene === 'library') {
    await installAll(ctx, ['oewn-2025', 'wiktionary-ar-en']);
    const big = ctx.catalog.find('wiktionary-en')!;
    ctx.installer.setSceneJob({ id: big.id, version: big.version, state: 'downloading', bytesDownloaded: Math.round(big.size_bytes * 0.42), totalBytes: big.size_bytes });
    router.push({ name: 'library' });
  } else if (scene !== 'onboarding') {
    await installAll(ctx, all);
    await ctx.settings.update({ lastScope: { kind: 'all' } });
  }
  if (scene === 'search-en') ctx.search.setQuery('writ', { kind: 'all' });
  if (scene === 'search-ar') ctx.search.setQuery('كتب', { kind: 'all' });
  if (scene === 'entry-ar') await openEntry(ctx, router, 'كَتَبَ', 'wiktionary-ar-en');
  if (scene === 'entry-en') await openEntry(ctx, router, 'write', 'oewn-2025');
  if (scene === 'broken') {
    const d = ctx.catalog.find('oewn-2025')!;
    await ctx.catalog.markInstalled(d, 'oewn-2025/missing.sqlite');
    await ctx.store.setInstalled(ctx.catalog.forStore());
  }

  mount(App, { target, props: { ctx, router } });
  if (chrome === 'ios' || chrome === 'android') mount(FakeChrome, { target: document.body, props: { kind: chrome } });
  if (scene.startsWith('search')) await until(() => ctx.search.current.result !== null);
  await until(() => !!target.querySelector('.layer:not(.under) .page > *'));
  if (scene.startsWith('entry')) await until(() => !!target.querySelector('.layer:not(.under) h1'));
  await document.fonts.ready;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await new Promise((r) => setTimeout(r, 300));
  document.body.dataset.sceneReady = '1';
}
