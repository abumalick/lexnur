<script lang="ts">
  import { onMount } from 'svelte';
  import { useApp } from '../app-context';
  import { useRouter, type Route } from '../nav/router.svelte';
  import type { SettingsData } from '../data/settings';
  import TopBar from '../ui/TopBar.svelte';
  import Dialog from '../ui/Dialog.svelte';

  let { route: _route }: { route: Route } = $props();
  const { settings, recents, platform, i18n } = useApp();
  const router = useRouter();
  let version = $state('');
  let confirmClear = $state(false);
  onMount(async () => { version = await platform.appVersion(); });

  const set = (patch: Partial<SettingsData>) => settings.update(patch);
  const themes = ['system', 'light', 'dark'] as const;
  const languages = ['system', 'en', 'ar'] as const;
  const policies = ['ask', 'wifi_only', 'allow'] as const;
</script>

<TopBar title={$i18n.t('settings.title')} onBack={() => router.back()} />
<div class="settings">
  <fieldset><legend>{$i18n.t('settings.theme')}</legend>
    {#each themes as v (v)}
      <label><input type="radio" name="theme" checked={$settings.theme === v} onchange={() => set({ theme: v })} />{$i18n.t(`settings.theme_${v}`)}</label>
    {/each}
  </fieldset>

  <fieldset><legend>{$i18n.t('settings.text_size')}</legend>
    <input type="range" min="0.85" max="2" step="0.05" value={$settings.entryTextScale} aria-label={$i18n.t('settings.text_size')}
      oninput={(e) => set({ entryTextScale: Math.round(Number((e.currentTarget as HTMLInputElement).value) * 100) / 100 })} />
    <p class="sample" style:font-size="calc(1rem * {$settings.entryTextScale})"><span lang="ar">كَتَبَ</span> · write</p>
  </fieldset>

  <fieldset><legend>{$i18n.t('settings.language')}</legend>
    {#each languages as v (v)}
      <label><input type="radio" name="lang" checked={$settings.uiLanguage === v} onchange={() => set({ uiLanguage: v })} />
        <span lang={v === 'ar' ? 'ar' : undefined}>{$i18n.t(`settings.language_${v}`)}</span></label>
    {/each}
  </fieldset>

  <label class="switch"><span>{$i18n.t('settings.transliteration')}</span>
    <input type="checkbox" role="switch" checked={$settings.showTransliteration} onchange={(e) => set({ showTransliteration: (e.currentTarget as HTMLInputElement).checked })} /></label>

  <fieldset><legend>{$i18n.t('settings.downloads')}</legend>
    {#each policies as v (v)}
      <label><input type="radio" name="cellular" checked={$settings.cellular === v} onchange={() => set({ cellular: v })} />{$i18n.t(`settings.cellular_${v}`)}</label>
    {/each}
    {#if $settings.cellular === 'ask'}<p class="note">{$i18n.t('settings.downloads_note')}</p>{/if}
  </fieldset>

  <label class="switch"><span>{$i18n.t('settings.keyboard')}</span>
    <input type="checkbox" role="switch" checked={$settings.openKeyboardOnLaunch} onchange={(e) => set({ openKeyboardOnLaunch: (e.currentTarget as HTMLInputElement).checked })} /></label>

  <fieldset><legend>{$i18n.t('settings.history')}</legend>
    <p class="note">{$i18n.t('settings.history_note')}</p>
    <button class="row" disabled={!$recents.length} onclick={() => (confirmClear = true)}>{$i18n.t('settings.clear_history')}</button>
  </fieldset>

  <button class="row" onclick={() => router.push({ name: 'library' })}>{$i18n.t('settings.dictionaries')}</button>
  <button class="row" onclick={() => router.push({ name: 'sources' })}>{$i18n.t('settings.sources')}</button>

  <fieldset><legend>{$i18n.t('settings.about')}</legend>
    <p>{$i18n.t('settings.version', { version })}</p>
    <p>{$i18n.t('settings.about_line')}</p>
  </fieldset>
</div>

{#if confirmClear}
  <Dialog open title={$i18n.t('settings.clear_history_confirm')} onClose={() => (confirmClear = false)}
    actions={[
      { label: $i18n.t('common.cancel'), onClick: () => (confirmClear = false) },
      { label: $i18n.t('settings.clear_history'), destructive: true, onClick: async () => { confirmClear = false; await recents.clear(); } },
    ]} />
{/if}

<style>
  .settings { padding: 0 16px calc(24px + var(--safe-bottom)); }
  fieldset { border: 0; margin: 16px 0 0; padding: 0; }
  legend { font-size: 0.8125rem; font-weight: 600; color: var(--md-primary); margin-bottom: 4px; padding: 0; }
  label { display: flex; align-items: center; gap: 12px; min-height: var(--tap); cursor: pointer; }
  input[type="radio"], input[type="checkbox"] { width: 20px; height: 20px; accent-color: var(--md-primary); flex: none; }
  input[type="range"] { width: 100%; min-height: var(--tap); accent-color: var(--md-primary); }
  .switch { justify-content: space-between; margin-top: 12px; }
  .note { margin: 0; font-size: 0.875rem; color: var(--md-on-surface-variant); }
  .sample { margin: 4px 0 0; }
  .row { all: unset; display: flex; align-items: center; min-height: var(--tap); width: 100%; cursor: pointer; color: var(--md-primary); }
  .row:disabled { opacity: 0.38; cursor: default; }
  p { margin: 4px 0; }
</style>
