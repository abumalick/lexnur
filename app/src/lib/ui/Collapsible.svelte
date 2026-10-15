<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  let { title, open = false, children }: { title: string; open?: boolean; children: Snippet } = $props();
  // svelte-ignore state_referenced_locally
  let expanded = $state(open);
  const id = `c-${Math.random().toString(36).slice(2)}`;
</script>

<section class="collapsible">
  <h3><button aria-expanded={expanded} aria-controls={id} onclick={() => (expanded = !expanded)}>
    <span>{title}</span><span class="chev" class:up={expanded}><Icon name="expand" /></span>
  </button></h3>
  <div {id} hidden={!expanded}>{@render children()}</div>
</section>

<style>
  .collapsible { border: 1px solid var(--md-outline-variant); border-radius: var(--radius); margin: 12px 0; }
  h3 { margin: 0; font-size: 1rem; }
  button { all: unset; display: flex; justify-content: space-between; align-items: center; width: 100%; min-height: var(--tap); padding: 0 12px; box-sizing: border-box; cursor: pointer; }
  .chev { display: grid; transition: transform 150ms; }
  .chev.up { transform: rotate(180deg); }
  div { padding: 0 12px 12px; }
</style>
