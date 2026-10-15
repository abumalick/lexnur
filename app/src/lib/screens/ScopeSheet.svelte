<script lang="ts">
  import type { Scope } from '../data/dictionary-store';
  import Sheet from '../ui/Sheet.svelte';
  import { useApp } from '../app-context';
  let { open, scope, onSelect, onManage, onClose }: { open: boolean; scope: Scope; onSelect: (s: Scope) => void; onManage: () => void; onClose: () => void } = $props();
  const { store, i18n, catalog } = useApp();
  const installed = $derived.by(() => { void $catalog; void $store; return store.installed(); });
  const pairs = $derived([...new Set(installed.map((d) => `${d.from}-${d.to}`))]);
  const isOne = (id: string) => scope.kind === 'one' && scope.id === id;
</script>

<Sheet {open} {onClose} label={$i18n.t('search.scope_title')}>
  <div class="scope" role="radiogroup" aria-label={$i18n.t('search.scope_title')}>
    <h2>{$i18n.t('search.scope_title')}</h2>
    <label class="opt"><input type="radio" name="scope" checked={scope.kind === 'all'} onchange={() => onSelect({ kind: 'all' })} />
      {$i18n.t('search.scope_all_count', { count: installed.length })}</label>
    {#each pairs as p (p)}
      {@const [from, to] = p.split('-')}
      <h3>{$i18n.t('pair', { from: $i18n.t(`lang.${from}`), to: $i18n.t(`lang.${to}`) })}</h3>
      {#each installed.filter((d) => `${d.from}-${d.to}` === p) as d (d.id)}
        <label class="opt"><input type="radio" name="scope" checked={isOne(d.id)} onchange={() => onSelect({ kind: 'one', id: d.id })} />{d.title}</label>
      {/each}
    {/each}
    <button class="manage" onclick={onManage}>{$i18n.t('search.manage')}</button>
  </div>
</Sheet>

<style>
  .scope { padding: 0 8px; }
  h2 { margin: 0 16px 8px; font-size: 1rem; }
  h3 { margin: 12px 16px 4px; font-size: 0.8125rem; color: var(--md-primary); }
  .opt { display: flex; align-items: center; gap: 12px; min-height: var(--tap); padding: 0 16px; cursor: pointer; }
  input { width: 20px; height: 20px; accent-color: var(--md-primary); }
  .manage { all: unset; display: flex; align-items: center; min-height: var(--tap); padding: 0 16px; color: var(--md-primary); cursor: pointer; }
</style>
