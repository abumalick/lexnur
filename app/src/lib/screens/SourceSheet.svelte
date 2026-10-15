<script lang="ts">
  import type { InstalledRecord } from '../data/catalog-repository';
  import Sheet from '../ui/Sheet.svelte';
  import { useApp } from '../app-context';
  let { rec, open, onClose }: { rec: InstalledRecord | undefined; open: boolean; onClose: () => void } = $props();
  const { i18n } = useApp();
</script>

<Sheet open={open && !!rec} label={rec?.title ?? ''} {onClose}>
  {#if rec}
    <div class="src">
      <h2>{rec.title}</h2>
      <p>{$i18n.t('details.licence')}: <bdi>{rec.license}</bdi> · <a href={rec.license_url} target="_blank" rel="noopener">{$i18n.t('details.licence_link')}</a></p>
      <p>{$i18n.t('entry.version', { version: rec.version })} · {$i18n.t('entry.source_date', { date: rec.source_date })}</p>
      <h3>{$i18n.t('details.attribution')}</h3>
      <p class="attr" dir="auto">{rec.attribution}</p>
      {#if rec.availability}
        <h3>{$i18n.t('details.availability')}</h3>
        <p class="attr" dir="auto">{rec.availability}</p>
      {/if}
    </div>
  {/if}
</Sheet>

<style>
  .src { padding: 0 24px; }
  h2 { margin: 0 0 8px; font-size: 1.375rem; }
  h3 { font-size: 1rem; margin: 16px 0 4px; }
  .attr { font-size: 0.875rem; color: var(--md-on-surface-variant); }
  a { color: var(--md-primary); }
</style>
