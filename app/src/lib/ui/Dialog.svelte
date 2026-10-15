<script lang="ts" module>
  export interface DialogAction { label: string; onClick: () => void; primary?: boolean; destructive?: boolean }
</script>

<script lang="ts">
  import { overlays } from '../nav/overlays';
  import { trapTab } from './focus';
  let { open, title, body, actions, onClose }: { open: boolean; title: string; body?: string; actions: DialogAction[]; onClose: () => void } = $props();
  const uid = $props.id();
  // svelte-ignore non_reactive_update
  let box: HTMLDivElement | undefined;

  $effect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const unregister = overlays.push(() => onClose());
    box?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { unregister(); previous?.focus?.(); };
  });
</script>

{#if open}
  <div class="scrim" aria-hidden="true" onclick={onClose}></div>
  <div class="dialog" role="alertdialog" aria-modal="true" tabindex="-1" aria-labelledby="{uid}-title" aria-describedby={body ? `${uid}-body` : undefined}
    bind:this={box} onkeydown={(e) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } else if (box) trapTab(e, box); }}>
    <h2 id="{uid}-title">{title}</h2>
    {#if body}<p id="{uid}-body">{body}</p>{/if}
    <div class="actions">
      {#each actions as a (a.label)}
        <button class:primary={a.primary} class:destructive={a.destructive} onclick={a.onClick}>{a.label}</button>
      {/each}
    </div>
  </div>
{/if}

<style>
  .scrim { position: fixed; inset: 0; background: color-mix(in srgb, var(--md-scrim) 40%, transparent); z-index: 20; }
  .dialog { position: fixed; z-index: 21; inset-inline: 24px; top: 50%; transform: translateY(-50%); max-width: 400px; margin-inline: auto;
    background: var(--md-surface-container-high); border-radius: 28px; padding: 24px; max-height: calc(100% - 48px); overflow: auto; outline: none; }
  h2 { margin: 0 0 12px; font-size: 1.5rem; font-weight: 400; }
  p { margin: 0 0 20px; color: var(--md-on-surface-variant); }
  .actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
  button { all: unset; display: inline-grid; place-items: center; min-height: var(--tap); min-width: var(--tap); padding: 0 12px; box-sizing: border-box; border-radius: 24px; color: var(--md-primary); font-weight: 500; cursor: pointer; text-align: center; }
  button.primary { background: var(--md-primary); color: var(--md-on-primary); padding: 0 24px; }
  button.destructive { color: var(--md-error); }
</style>
