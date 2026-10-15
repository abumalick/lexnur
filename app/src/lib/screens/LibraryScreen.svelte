<script lang="ts">
  import { onMount } from 'svelte';
  import type { PublishedDictionary } from '@lexnur/core';
  import { useApp } from '../app-context';
  import { useRouter, type Route } from '../nav/router.svelte';
  import { formatBytes } from '../data/format';
  import { isolate } from '../i18n';
  import TopBar from '../ui/TopBar.svelte';
  import Dialog from '../ui/Dialog.svelte';
  import DictionaryRow from './DictionaryRow.svelte';
  import DetailsSheet from './DetailsSheet.svelte';
  import StorageFooter from './StorageFooter.svelte';
  import { summarize } from './library-model';
  import { reinstallNotice } from './job-label';

  let { route }: { route: Extract<Route, { name: 'library' }> } = $props();
  const { catalog, installer, settings, platform, store, i18n, toasts } = useApp();
  const router = useRouter();
  const onboarding = $derived(route.onboarding === true);

  let selected = $state(new Set<string>());
  let defaults = $state<string[]>([]);
  let free = $state<number | null>(null);
  let busy = false;
  let online = $state(true);
  let details = $state<PublishedDictionary | null>(null);
  let confirm = $state<{ title: string; body: string; label: string; run: () => Promise<void> } | null>(null);

  const groups = $derived.by(() => { void $catalog; return catalog.groups(); });
  const updates = $derived.by(() => { void $catalog; return catalog.updates(); });
  const installedIds = $derived(new Set($catalog.installed.map((r) => r.id)));
  const chosen = $derived($catalog.available.filter((d) => selected.has(d.id) && !installedIds.has(d.id) && !$installer.has(d.id)));
  const summary = $derived(summarize(chosen, free));
  const broken = $derived.by(() => { void $store; return new Set(store.broken); });
  const used = $derived($catalog.installed.reduce((s, r) => s + r.installed_size_bytes, 0));

  async function refreshFree() {
    try { free = (await platform.native.freeSpace()).bytes; } catch { /* no verdict on space; the installer checks again */ }
  }

  $effect(() => { void $catalog.installed.length; void refreshFree(); });

  onMount(async () => {
    try {
      defaults = catalog.defaultSelection(await platform.deviceLanguages());
      if (onboarding) selected = new Set(defaults.filter((id) => !installedIds.has(id)));
      online = (await platform.connection()) !== 'none';
      platform.onConnectionChange((c) => (online = c !== 'none'));
    } catch { /* defaults stay empty; the user can still pick */ }
  });

  function toggle(id: string) {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id); else s.add(id);
    selected = s;
  }

  async function download() {
    if (busy) return;
    busy = true;
    try {
      const r = await installer.install(chosen.map((d) => d.id));
      if (r.kind === 'no_space') { free = r.free; return; }
      if (r.kind !== 'started') return;
      selected = new Set();
      await settings.update({ onboardingDone: true });
      if (onboarding) router.reset({ name: 'search' });
    } finally {
      busy = false;
    }
  }

  async function skip() {
    await settings.update({ onboardingDone: true });
    router.reset({ name: 'search' });
  }

  async function reinstall(id: string) {
    const title = catalog.installedRecord(id)?.title ?? id;
    const notice = reinstallNotice(await installer.reinstall(id), isolate(title), $i18n.t, $i18n.lang);
    if (notice) toasts.show(notice);
  }

  function askDelete(id: string) {
    const rec = catalog.installedRecord(id);
    if (!rec) return;
    confirm = {
      title: $i18n.t('library.delete_title', { title: isolate(rec.title) }),
      body: $i18n.t('library.delete_body', { size: formatBytes(rec.installed_size_bytes, $i18n.lang) }),
      label: $i18n.t('common.delete'),
      run: async () => { await installer.remove(id); await refreshFree(); },
    };
  }

  function askCancel(id: string) {
    const job = $installer.get(id);
    if (!job || job.bytesDownloaded < 10_000_000) { void installer.cancel(id); return; }
    confirm = {
      title: $i18n.t('library.cancel_title'),
      body: $i18n.t('library.cancel_body', { done: formatBytes(job.bytesDownloaded, $i18n.lang) }),
      label: $i18n.t('common.ok'),
      run: () => installer.cancel(id),
    };
  }

</script>

<div class="library">
  {#if onboarding}
    <header class="welcome">
      <h1>{$i18n.t('onboarding.title')}</h1>
      <p>{$i18n.t('onboarding.subtitle')}</p>
      {#if !online}<p class="offline" role="status">{$i18n.t('onboarding.offline')}</p>{/if}
    </header>
  {:else}
    <TopBar title={$i18n.t('library.title')} onBack={() => router.back()} />
  {/if}

  {#if !onboarding && $catalog.installed.length}
    <div class="section"><h2>{$i18n.t('library.installed')}</h2>
      {#if updates.length > 1}<button class="text" onclick={() => installer.updateAll()}>{$i18n.t('library.update_all')}</button>{/if}
    </div>
    {#each $catalog.installed as rec (rec.id)}
      {@const dict = catalog.find(rec.id)}
      <DictionaryRow mode={$installer.has(rec.id) ? 'job' : 'installed'} title={rec.title} {rec} {dict} job={$installer.get(rec.id)}
        broken={broken.has(rec.id)} update={updates.find((u) => u.id === rec.id)}
        onInfo={() => { if (dict) details = dict; }} onDelete={() => askDelete(rec.id)} onUpdate={() => installer.update(rec.id)}
        onReinstall={() => reinstall(rec.id)} onPause={() => installer.pause(rec.id)} onResume={() => installer.resume(rec.id)}
        onCancel={() => askCancel(rec.id)} onRetry={() => installer.update(rec.id)} onDownloadNow={() => installer.downloadNow(rec.id)} />
    {/each}
  {/if}

  {#if !onboarding}<div class="section"><h2>{$i18n.t('library.available')}</h2></div>{/if}
  {#each groups as g (g.from + g.to)}
    {@const items = g.dictionaries.filter((d) => onboarding || !installedIds.has(d.id))}
    {#if items.length}
      <h3 class="pair">{$i18n.t('pair', { from: $i18n.t(`lang.${g.from}`), to: $i18n.t(`lang.${g.to}`) })}</h3>
      {#each items as d (d.id)}
        <DictionaryRow mode={$installer.has(d.id) ? 'job' : installedIds.has(d.id) ? 'installed' : 'select'} title={d.title} dict={d}
          rec={catalog.installedRecord(d.id)} job={$installer.get(d.id)} selected={selected.has(d.id)} recommended={defaults.includes(d.id)}
          onToggle={() => toggle(d.id)} onInfo={() => (details = d)} onPause={() => installer.pause(d.id)} onResume={() => installer.resume(d.id)}
          onCancel={() => askCancel(d.id)} onRetry={() => installer.retry(d.id)} onDownloadNow={() => installer.downloadNow(d.id)}
          onDelete={() => askDelete(d.id)} />
      {/each}
    {/if}
  {/each}

  <StorageFooter {summary} {online} {onboarding} {used} onDownload={download} onSkip={skip} />
</div>

<DetailsSheet dict={details} onClose={() => (details = null)} />
{#if confirm}
  <Dialog open title={confirm.title} body={confirm.body} onClose={() => (confirm = null)}
    actions={[
      { label: $i18n.t('common.cancel'), onClick: () => (confirm = null) },
      { label: confirm.label, destructive: true, onClick: async () => { const c = confirm!; confirm = null; await c.run(); } },
    ]} />
{/if}

<style>
  .library { flex: 1 0 auto; display: flex; flex-direction: column; }
  .welcome { padding: calc(var(--safe-top) + 24px) 16px 8px; }
  .welcome h1 { margin: 0 0 4px; font-size: 1.75rem; }
  .welcome p { margin: 0; color: var(--md-on-surface-variant); }
  .offline { margin-top: 8px !important; }
  .section { display: flex; align-items: center; justify-content: space-between; padding: 16px 16px 0; }
  .section h2 { margin: 0; font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--md-on-surface-variant); }
  .pair { margin: 16px 16px 4px; font-size: 0.8125rem; font-weight: 600; color: var(--md-primary); }
  button.text { all: unset; min-height: var(--tap); padding: 0 12px; color: var(--md-primary); cursor: pointer; }
  :global(.library > footer) { margin-top: auto; }
</style>
