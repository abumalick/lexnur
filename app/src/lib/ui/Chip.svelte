<script lang="ts">
  import type { Snippet } from 'svelte';
  import { dirOfLanguage } from '../data/dictionary-store';
  let { onClick, label, lang, children }: { onClick?: () => void; label?: string; lang?: string; children: Snippet } = $props();
</script>

{#if onClick}
  <button class="chip" {lang} dir={lang ? dirOfLanguage(lang) : undefined} aria-label={label} onclick={onClick}>{@render children()}</button>
{:else}
  <span class="chip static" {lang} dir={lang ? dirOfLanguage(lang) : undefined}>{@render children()}</span>
{/if}

<style>
  .chip { all: unset; display: inline-flex; align-items: center; gap: 4px; min-height: 32px; padding: 0 12px; margin: 4px 4px 0 0;
    border: 1px solid var(--md-outline); border-radius: 8px; font-size: 0.875rem; cursor: pointer; }
  .chip:not(.static) { min-height: var(--tap); box-sizing: border-box; }
  .static { cursor: default; min-height: 24px; padding: 0 8px; font-size: 0.75rem; border-radius: 6px; border-color: var(--md-outline-variant); }
</style>
