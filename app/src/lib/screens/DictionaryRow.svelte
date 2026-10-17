<script lang="ts">
  import type { PublishedDictionary } from '@lexnur/core';
  import type { InstallJob } from '@lexnur/native';
  import type { InstalledRecord } from '../data/catalog-repository';
  import { useApp } from '../app-context';
  import { formatBytes } from '../data/format';
  import { jobLabel } from './job-label';
  import Icon from '../ui/Icon.svelte';
  import ProgressBar from '../ui/ProgressBar.svelte';
  import Chip from '../ui/Chip.svelte';

  type Fn = () => void;
  let {
    mode, title, dict, rec, job, direction, selected = false, recommended = false, broken = false, update,
    onToggle, onInfo, onPause, onResume, onCancel, onRetry, onDownloadNow, onDelete, onUpdate, onReinstall,
  }: {
    mode: 'select' | 'installed' | 'job'; title: string; dict?: PublishedDictionary; rec?: InstalledRecord; job?: InstallJob; direction?: string;
    selected?: boolean; recommended?: boolean; broken?: boolean; update?: PublishedDictionary;
    onToggle?: Fn; onInfo?: Fn; onPause?: Fn; onResume?: Fn; onCancel?: Fn; onRetry?: Fn; onDownloadNow?: Fn; onDelete?: Fn; onUpdate?: Fn; onReinstall?: Fn;
  } = $props();
  const { i18n } = useApp();
  const label = $derived(job ? jobLabel(job, $i18n.t, $i18n.lang) : null);
</script>

<div class="row">
  {#if mode === 'select'}
    <label class="main">
      <input type="checkbox" checked={selected} onchange={onToggle} aria-label={title} />
      <span class="info">
        {#if direction}<span class="direction">{direction}</span>{/if}
        <span class="title">{title}</span>
        <span class="sec">
          {#if dict}<Chip>{$i18n.t(`difficulty.${dict.difficulty}`)}</Chip> · {formatBytes(dict.size_bytes, $i18n.lang)}{/if}
          {#if recommended} · <strong>{$i18n.t('library.recommended')}</strong>{/if}
        </span>
        {#if dict}<span class="hint">{dict.summary[$i18n.lang]}</span>{/if}
      </span>
    </label>
  {:else}
    <div class="main">
      <span class="info">
        <span class="title">{title}</span>
        {#if mode === 'installed' && rec}
          {#if broken}
            <span class="sec error">{$i18n.t('broken.title', { title })}</span>
          {:else}
            <span class="sec">{$i18n.t('library.size_on_device', { size: formatBytes(rec.installed_size_bytes, $i18n.lang), version: rec.version })}</span>
            {#if update}<span class="sec">{$i18n.t('library.update_available', { size: formatBytes(update.size_bytes, $i18n.lang) })}</span>{/if}
          {/if}
        {:else if label}
          <span class="sec" class:error={label.error}>{label.text}</span>
          {#if label.progress !== null || label.indeterminate}
            <ProgressBar value={label.indeterminate ? null : label.progress} label={title} />
          {/if}
        {/if}
      </span>
    </div>
  {/if}
  <div class="actions">
    {#if mode === 'job' && job}
      {#if job.state === 'downloading' || job.state === 'queued' || job.state === 'waiting_network'}
        <button class="icon" onclick={onPause} aria-label={$i18n.t('job.pause')}><Icon name="pause" /></button>
      {/if}
      {#if job.state === 'paused'}<button class="icon" onclick={onResume} aria-label={$i18n.t('job.resume')}><Icon name="play" /></button>{/if}
      {#if job.state === 'waiting_wifi'}<button class="text" onclick={onDownloadNow}>{$i18n.t('common.download_now')}</button>{/if}
      {#if job.state === 'failed'}<button class="text" onclick={onRetry}>{$i18n.t('common.retry')}</button>{/if}
      {#if job.state !== 'verifying' && job.state !== 'installing'}
        <button class="icon" onclick={onCancel} aria-label={$i18n.t('common.cancel')}><Icon name="close" /></button>
      {/if}
    {:else if mode === 'installed'}
      {#if broken}<button class="text" onclick={onReinstall}>{$i18n.t('common.reinstall')}</button>
      {:else if update}<button class="text" onclick={onUpdate}>{$i18n.t('library.update')}</button>{/if}
      <button class="icon" onclick={onDelete} aria-label={$i18n.t('common.delete')}><Icon name="delete" /></button>
    {/if}
    {#if dict}<button class="icon" onclick={onInfo} aria-label={$i18n.t('library.info', { title })}><Icon name="info" /></button>{/if}
  </div>
</div>

<style>
  .row { display: flex; align-items: flex-start; gap: 8px; padding: 8px; padding-inline-start: 16px; min-height: 56px; }
  .main { flex: 1; display: flex; gap: 12px; align-items: flex-start; min-width: 0; cursor: pointer; }
  input[type="checkbox"] { width: 24px; height: 24px; margin: 2px 0 0; accent-color: var(--md-primary); flex: none; }
  .info { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
  .title { font-weight: 600; overflow-wrap: anywhere; }
  .direction { font-size: 0.8125rem; font-weight: 600; color: var(--md-primary); }
  .sec, .hint { font-size: 0.875rem; color: var(--md-on-surface-variant); }
  .error { color: var(--md-error); font-weight: 600; }
  .actions { display: flex; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
  .icon { all: unset; display: grid; place-items: center; width: var(--tap); height: var(--tap); border-radius: 50%; cursor: pointer; }
  button.text { all: unset; min-height: var(--tap); padding: 0 12px; color: var(--md-primary); font-weight: 500; cursor: pointer; display: grid; place-items: center; }
</style>
