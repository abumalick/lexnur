<script lang="ts">
  import { dirOfLanguage, type Suggestion } from '../data/dictionary-store';
  import { useApp } from '../app-context';
  import { labelOrRaw } from '../i18n';
  let { suggestion: s, showBadge, onOpen }: { suggestion: Suggestion; showBadge: boolean; onOpen: () => void } = $props();
  const { catalog, i18n } = useApp();
  const rec = $derived($catalog.installed.find((d) => d.id === s.dictionaryId));
</script>

<button class="row" onclick={onOpen}>
  <span class="l1">
    <span class="hw headword" lang={rec?.from} dir={rec ? dirOfLanguage(rec.from) : 'auto'}>{s.headword}</span>
    <span class="meta">{#if s.pos}<bdi>{labelOrRaw($i18n.t, 'pos', s.pos)}</bdi>{/if}{#if s.root}{' · '}<bdi lang="ar" dir="rtl">{s.root}</bdi>{/if}</span>
  </span>
  <span class="l2">
    {#if s.gloss}<span class="gloss" lang={rec?.to} dir={rec ? dirOfLanguage(rec.to) : 'auto'}>{s.gloss}</span>{/if}
    {#if showBadge && rec}
      <span class="badge"><bdi>{rec.title}</bdi>{#if s.alsoIn.length}{' · '}{$i18n.t('search.also_in', { count: s.alsoIn.length })}{/if}</span>
    {/if}
  </span>
</button>

<style>
  .row { all: unset; box-sizing: border-box; display: flex; flex-direction: column; gap: 2px; width: 100%; min-height: 56px; padding: 8px 16px; border-bottom: 1px solid var(--md-outline-variant); cursor: pointer; }
  .row:active { background: var(--md-surface-container-high); }
  .l1 { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 4px 12px; }
  .hw { font-size: 1.125rem; }
  .hw[lang="ar"] { font-size: 1.375rem; line-height: 1.8; }
  .meta { font-size: 0.75rem; color: var(--md-on-surface-variant); }
  .l2 { display: flex; justify-content: space-between; gap: 8px; font-size: 0.875rem; color: var(--md-on-surface-variant); }
  .gloss { flex: 1 1 auto; min-width: 0; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
  .badge { flex: none; align-self: flex-start; border: 1px solid var(--md-outline-variant); border-radius: 4px; padding: 0 4px; font-size: 0.6875rem; white-space: nowrap; }
</style>
