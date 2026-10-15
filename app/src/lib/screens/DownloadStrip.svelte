<script lang="ts">
  import { useApp } from '../app-context';
  import { useRouter } from '../nav/router.svelte';
  import { formatBytes, formatPercent } from '../data/format';
  import { isolate } from '../i18n';
  import ProgressBar from '../ui/ProgressBar.svelte';
  const { installer, catalog, i18n } = useApp();
  const router = useRouter();
  const jobs = $derived([...$installer.values()].filter((j) => j.state !== 'failed' && j.state !== 'done'));
  const active = $derived(jobs.find((j) => j.state === 'downloading') ?? jobs[0]);
</script>

{#if active}
  {@const frac = active.bytesDownloaded / Math.max(1, active.totalBytes)}
  {@const status = active.state === 'paused' ? $i18n.t('job.paused') : active.state === 'waiting_network' ? $i18n.t('job.waiting_network') : active.state === 'waiting_wifi' ? $i18n.t('job.waiting_wifi', { size: formatBytes(active.totalBytes, $i18n.lang) }) : null}
  {@const title = catalog.find(active.id)?.title ?? active.id}
  <button class="strip" onclick={() => router.push({ name: 'library' })}>
    <span>{$i18n.t(status ? 'strip.stopped' : 'strip.downloading', { index: jobs.indexOf(active) + 1, count: jobs.length, title: isolate(title), percent: formatPercent(frac, $i18n.lang) })}</span>
    {#if status}<span>{status}</span>{/if}
    <ProgressBar value={active.state === 'verifying' || active.state === 'installing' ? null : frac} label={title} />
  </button>
{/if}

<style>
  .strip { all: unset; box-sizing: border-box; display: flex; flex-direction: column; gap: 6px; width: calc(100% - 32px); margin: 4px 16px 8px; padding: 8px 12px;
    border-radius: var(--radius); background: var(--md-secondary-container); color: var(--md-on-secondary-container); font-size: 0.8125rem; cursor: pointer; }
</style>
