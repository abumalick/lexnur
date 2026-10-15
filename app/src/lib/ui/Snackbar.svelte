<script lang="ts">
  import { useApp } from '../app-context';
  const { toasts } = useApp();
</script>

<div class="host" role="status" aria-live="polite">{#if $toasts}<div class="snack">{$toasts}</div>{/if}</div>

<style>
  .host { position: fixed; inset-inline: 12px; bottom: calc(12px + var(--safe-bottom)); z-index: 30; pointer-events: none; }
  .snack { background: var(--md-inverse-surface); color: var(--md-inverse-on-surface); padding: 14px 16px; border-radius: 4px; max-width: 560px; margin: 0 auto; }
</style>
