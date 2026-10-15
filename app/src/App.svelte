<script lang="ts">
  import { onMount, setContext, type Component } from 'svelte';
  import { Router, type Route } from './lib/nav/router.svelte';
  import { overlays } from './lib/nav/overlays';
  import SwipeBack from './lib/nav/SwipeBack.svelte';
  import Snackbar from './lib/ui/Snackbar.svelte';
  import CellularDialog from './lib/ui/CellularDialog.svelte';
  import { applyTheme, BRAND_SEED } from './lib/theme/theme';
  import { resolveSeed, systemPrefersDark, watchSystemDark } from './lib/theme/system';
  import type { AppContext } from './lib/app-context';

  let { ctx, router = new Router() }: { ctx: AppContext; router?: Router } = $props();
  // svelte-ignore state_referenced_locally
  setContext('app', ctx);
  // svelte-ignore state_referenced_locally
  setContext('router', router);
  // svelte-ignore state_referenced_locally
  const { settings, i18n, platform, catalog } = ctx;

  const SCREENS: Record<Route['name'], () => Promise<{ default: Component<any> }>> = {
    search: () => import('./lib/screens/SearchScreen.svelte'),
    entry: () => import('./lib/screens/EntryScreen.svelte'),
    library: () => import('./lib/screens/LibraryScreen.svelte'),
    settings: () => import('./lib/screens/SettingsScreen.svelte'),
    sources: () => import('./lib/screens/SourcesScreen.svelte'),
  };

  const visible = $derived(router.stack.slice(-2));
  const keyOf = (r: Route, i: number) => `${router.stack.length - visible.length + i}:${r.name}:${'entryId' in r ? `${r.dictionaryId}/${r.entryId}` : ''}`;

  let seed = $state(BRAND_SEED);
  let systemDark = $state(systemPrefersDark());
  const dark = $derived($settings.theme === 'dark' || ($settings.theme === 'system' && systemDark));
  const applyBars = () => platform.setSystemBarsDark(dark).catch((e) => console.warn('system bars update failed', e));
  const refreshSeed = () => resolveSeed(() => platform.systemSeed()).then((s) => (seed = s));
  $effect(() => { applyTheme(seed, dark); void applyBars(); });
  $effect(() => { document.documentElement.style.setProperty('--entry-scale', String($settings.entryTextScale)); });

  onMount(() => {
    const stopWatching = watchSystemDark((d) => (systemDark = d));
    void refreshSeed();
    void platform.applyTextZoom();
    void platform.setKeyboardAccessoryBar(false);
    platform.onResume(() => { void platform.applyTextZoom(); void refreshSeed(); void applyBars(); void catalog.refresh(); });
    platform.onBack(() => overlays.closeTop() || router.back());
    if (!settings.current.onboardingDone && catalog.current.installed.length === 0) router.reset({ name: 'library', onboarding: true });
    return stopWatching;
  });
</script>

<div class="stack">
  {#each visible as route, i (keyOf(route, i))}
    {@const top = i === visible.length - 1}
    <div class="layer" class:under={!top} inert={!top} aria-hidden={!top}>
      <SwipeBack enabled={top && router.canGoBack && platform.os === 'ios'} rtl={$i18n.dir === 'rtl'} onBack={() => router.back()}>
        <div class="scroller"><div class="page">{#await SCREENS[route.name]() then mod}<mod.default {route} />{/await}</div></div>
      </SwipeBack>
    </div>
  {/each}
</div>
<CellularDialog />
<Snackbar />

<style>
  .stack { position: relative; height: 100%; overflow: hidden; }
  .layer { position: absolute; inset: 0; }
  .layer.under { filter: brightness(0.96); }
  .scroller { height: 100%; overflow: auto; overscroll-behavior: contain; }
  .page { max-width: 720px; min-height: 100%; margin-inline: auto; display: flex; flex-direction: column; }
</style>
