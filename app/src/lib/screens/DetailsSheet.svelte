<script lang="ts">
  import type { PublishedDictionary } from '@lexnur/core';
  import Sheet from '../ui/Sheet.svelte';
  import { useApp } from '../app-context';
  import { formatBytes } from '../data/format';
  let { dict, onClose }: { dict: PublishedDictionary | null; onClose: () => void } = $props();
  const { i18n } = useApp();
</script>

<Sheet open={dict !== null} label={dict?.title ?? ''} {onClose}>
  {#if dict}
    <div class="details">
      <h2>{dict.title}</h2>
      {#if dict.ai_generated}<p class="ai">{$i18n.t('entry.ai')}</p>{/if}
      <p>{dict.summary[$i18n.lang]}</p>
      <ul>
        <li>{$i18n.t('details.entries', { count: dict.entry_count })}</li>
        <li>{$i18n.t('details.download_size', { size: formatBytes(dict.size_bytes, $i18n.lang) })}</li>
        <li>{$i18n.t('details.installed_size', { size: formatBytes(dict.installed_size_bytes, $i18n.lang) })}</li>
        <li>{$i18n.t('details.licence')}: <bdi>{dict.license}</bdi> · <a href={dict.license_url} target="_blank" rel="noopener">{$i18n.t('details.licence_link')}</a></li>
      </ul>
      <h3>{$i18n.t('details.attribution')}</h3>
      <p class="attr" dir="auto">{dict.attribution}</p>
      {#if dict.availability}
        <h3>{$i18n.t('details.availability')}</h3>
        <p class="attr" dir="auto">{dict.availability}</p>
      {/if}
    </div>
  {/if}
</Sheet>

<style>
  .details { padding: 0 24px; }
  h2 { margin: 0 0 8px; font-size: 1.375rem; }
  h3 { font-size: 1rem; margin: 16px 0 4px; }
  ul { padding-inline-start: 20px; }
  .ai { font-weight: 600; color: var(--md-error); }
  .attr { font-size: 0.875rem; color: var(--md-on-surface-variant); }
  a { color: var(--md-primary); }
</style>
