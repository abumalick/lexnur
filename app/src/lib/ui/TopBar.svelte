<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  import { useApp } from '../app-context';
  let { title, onBack, actions }: { title?: string; onBack?: () => void; actions?: Snippet } = $props();
  const { i18n, platform } = useApp();
</script>

<header class="bar" class:ios={platform.os === 'ios'}>
  {#if onBack}<button class="icon" onclick={onBack} aria-label={$i18n.t('common.back')}><Icon name="back" /></button>{/if}
  {#if title}<h1>{title}</h1>{/if}
  <div class="actions">{@render actions?.()}</div>
</header>

<style>
  .bar { display: flex; align-items: center; gap: 4px; min-height: 56px; padding: var(--safe-top) 4px 0; background: var(--md-surface); position: sticky; top: 0; z-index: 2; }
  h1 { flex: 1; margin: 0 8px; font-size: 1.375rem; font-weight: 500; overflow-wrap: anywhere; }
  .ios h1 { text-align: center; font-size: 1.0625rem; font-weight: 600; }
  .actions { display: flex; margin-inline-start: auto; }
  .icon { all: unset; display: grid; place-items: center; width: var(--tap); height: var(--tap); border-radius: 50%; cursor: pointer; }
  .icon:active { background: var(--md-surface-container-high); }
</style>
