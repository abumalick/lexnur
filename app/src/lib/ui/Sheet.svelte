<script lang="ts">
  import type { Snippet } from 'svelte';
  import { overlays } from '../nav/overlays';
  import { trapTab } from './focus';
  let { open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: Snippet } = $props();
  // svelte-ignore non_reactive_update
  let panel: HTMLDivElement | undefined;
  $effect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const unregister = overlays.push(() => onClose());
    panel?.focus();
    return () => { unregister(); previous?.focus?.(); };
  });
</script>

{#if open}
  <div class="scrim" onclick={onClose} aria-hidden="true"></div>
  <div class="sheet" role="dialog" aria-modal="true" aria-label={label} tabindex="-1" bind:this={panel}
    onkeydown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } else if (panel) trapTab(e, panel); }}>
    <div class="grab" aria-hidden="true"></div>
    {@render children()}
  </div>
{/if}

<style>
  .scrim { position: fixed; inset: 0; background: color-mix(in srgb, var(--md-scrim) 40%, transparent); z-index: 10; }
  .sheet { position: fixed; inset-inline: 0; bottom: 0; max-width: 640px; margin-inline: auto; max-height: 85vh; overflow: auto; z-index: 11; background: var(--md-surface-container-low);
    border-radius: 28px 28px 0 0; padding: 8px 0 calc(16px + var(--safe-bottom)); outline: none; overscroll-behavior: contain; }
  .grab { width: 32px; height: 4px; border-radius: 2px; background: var(--md-on-surface-variant); opacity: 0.4; margin: 8px auto 12px; }
</style>
