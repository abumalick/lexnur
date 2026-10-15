<script lang="ts">
  import { useApp } from '../app-context';
  import { formatBytes } from '../data/format';
  import type { SelectionSummary } from './library-model';
  let { summary, online, onboarding, used, onDownload, onSkip }:
    { summary: SelectionSummary; online: boolean; onboarding: boolean; used: number; onDownload: () => void; onSkip: () => void } = $props();
  const { i18n } = useApp();
  const size = (b: number) => formatBytes(b, $i18n.lang);
</script>

<footer class="footer">
  {#if summary.count && summary.free !== null}
    <p>{$i18n.t('library.footer_total', { size: size(summary.download), needed: size(summary.needed), free: size(summary.free) })}</p>
    {#if !summary.ok}<p class="error">{$i18n.t('library.not_enough', { needed: size(summary.needed), free: size(summary.free) })} {$i18n.t('library.untick_hint')}</p>{/if}
  {:else if !onboarding && summary.free !== null}
    <p>{$i18n.t('library.storage', { used: size(used), free: size(summary.free) })}</p>
  {/if}
  {#if !online && summary.count}<p>{$i18n.t('onboarding.waiting_connection')}</p>{/if}
  <div class="buttons">
    <button class="primary" disabled={!summary.count || !summary.ok || !online} onclick={onDownload}>{$i18n.t('library.download', { count: summary.count })}</button>
    {#if onboarding}<button class="text" onclick={onSkip}>{$i18n.t('onboarding.skip')}</button>{/if}
  </div>
</footer>

<style>
  .footer { position: sticky; bottom: 0; background: var(--md-surface-container); padding: 12px 16px calc(12px + var(--safe-bottom)); border-top: 1px solid var(--md-outline-variant); }
  p { margin: 0 0 8px; font-size: 0.875rem; }
  .error { color: var(--md-error); font-weight: 600; }
  .buttons { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  button { all: unset; min-height: var(--tap); padding: 0 24px; border-radius: 24px; cursor: pointer; display: grid; place-items: center; font-weight: 500; }
  .primary { background: var(--md-primary); color: var(--md-on-primary); }
  .primary:disabled { opacity: 0.38; cursor: default; }
  .text { color: var(--md-primary); padding: 0 12px; }
</style>
