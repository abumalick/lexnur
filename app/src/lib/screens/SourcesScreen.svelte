<script lang="ts">
  import { useApp } from '../app-context';
  import { useRouter, type Route } from '../nav/router.svelte';
  import TopBar from '../ui/TopBar.svelte';
  let { route: _route }: { route: Route } = $props();
  const { catalog, i18n } = useApp();
  const router = useRouter();
  const all = $derived([
    ...$catalog.installed.map((r) => ({ id: r.id, title: r.title, license: r.license, license_url: r.license_url, attribution: r.attribution, date: r.source_date, ai: r.ai_generated })),
    ...$catalog.available.filter((d) => !$catalog.installed.some((r) => r.id === d.id))
      .map((d) => ({ id: d.id, title: d.title, license: d.license, license_url: d.license_url, attribution: d.attribution, date: d.source_date, ai: d.ai_generated })),
  ]);
</script>

<TopBar title={$i18n.t('sources.title')} onBack={() => router.back()} />
<div class="sources">
  {#each all as d (d.id)}
    <section>
      <h2>{d.title}</h2>
      {#if d.ai}<p class="ai">{$i18n.t('entry.ai')}</p>{/if}
      <p><bdi>{d.license}</bdi> · <a href={d.license_url} target="_blank" rel="noopener">{$i18n.t('details.licence_link')}</a></p>
      <p class="attr" dir="auto">{d.attribution}</p>
      <p class="attr">{$i18n.t('entry.source_date', { date: d.date })}</p>
    </section>
  {/each}
  <section>
    <h2>{$i18n.t('sources.app')}</h2>
    <p class="attr">{$i18n.t('sources.app_body')}</p>
  </section>
</div>

<style>
  .sources { padding: 0 16px calc(24px + var(--safe-bottom)); }
  section { padding: 12px 0; border-bottom: 1px solid var(--md-outline-variant); }
  h2 { font-size: 1.0625rem; margin: 0 0 4px; }
  p { margin: 4px 0; }
  .attr { font-size: 0.875rem; color: var(--md-on-surface-variant); }
  .ai { font-weight: 600; color: var(--md-error); }
  a { color: var(--md-primary); }
</style>
