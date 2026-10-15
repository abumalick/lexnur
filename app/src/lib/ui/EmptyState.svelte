<script lang="ts">
  let { title, body, action, onAction, error = false }: { title: string; body?: string; action?: string; onAction?: () => void; error?: boolean } = $props();
</script>

<section class="empty" class:error>
  <h2>{title}</h2>
  {#if body}<p>{body}</p>{/if}
  {#if action && onAction}<button onclick={onAction}>{action}</button>{/if}
</section>

<style>
  .empty { padding: 32px 24px; text-align: center; }
  h2 { font-size: 1.125rem; margin: 0 0 8px; }
  .error h2 { color: var(--md-error); }
  p { margin: 0 0 16px; color: var(--md-on-surface-variant); }
  button { all: unset; min-height: var(--tap); padding: 0 24px; box-sizing: border-box; border-radius: 24px; background: var(--md-primary); color: var(--md-on-primary); cursor: pointer; display: inline-grid; place-items: center; }
</style>
