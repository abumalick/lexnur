<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import type { Script } from '@lexnur/core';
  import { dirOfLanguage, scriptsOfLanguage, type Scope } from '../data/dictionary-store';
  import { useApp } from '../app-context';
  import { useRouter, type Route } from '../nav/router.svelte';
  import { formatBytes, formatPercent } from '../data/format';
  import { isolate } from '../i18n';
  import SuggestionRow from './SuggestionRow.svelte';
  import ScopeSheet from './ScopeSheet.svelte';
  import DownloadStrip from './DownloadStrip.svelte';
  import { reinstallNotice } from './job-label';
  import EmptyState from '../ui/EmptyState.svelte';
  import Icon from '../ui/Icon.svelte';
  import Sheet from '../ui/Sheet.svelte';

  let { route: _route }: { route: Route } = $props();
  const { catalog, store, settings, recents, installer, platform, i18n, toasts, search } = useApp();
  const router = useRouter();
  let input: HTMLInputElement | undefined = $state();
  let scopeOpen = $state(false);
  let menuOpen = $state(false);

  const installed = $derived.by(() => { void $catalog; void $store; return store.installed(); });
  const scope = $derived.by<Scope>(() => {
    const s = $settings.lastScope;
    if (s?.kind === 'one' && installed.some((d) => d.id === s.id)) return s;
    if (s?.kind === 'all' || installed.length !== 1) return { kind: 'all' };
    return { kind: 'one', id: installed[0].id };
  });
  const scopeTitle = $derived(scope.kind === 'one' ? (installed.find((d) => d.id === scope.id)?.title ?? '') : $i18n.t('search.scope_all'));
  const waiting = $derived([...$installer.values()].find((j) => j.state !== 'failed'));
  const placeholder = $derived(
    !installed.length && waiting
      ? $i18n.t('search.placeholder_waiting', { title: isolate(catalog.find(waiting.id)?.title ?? ''), percent: formatPercent(waiting.bytesDownloaded / Math.max(1, waiting.totalBytes), $i18n.lang) })
      : scope.kind === 'one' ? $i18n.t('search.placeholder_one', { title: isolate(scopeTitle) }) : $i18n.t('search.placeholder_all'));
  // dir="auto" ignores the placeholder and resolves an empty field to LTR, so the placeholder follows the UI instead.
  const fieldDir = $derived($search.query ? 'auto' : $i18n.dir);
  const broken = $derived.by(() => { void $store; return $catalog.installed.filter((r) => store.broken.has(r.id)); });
  const titleOf = (id: string) => catalog.installedRecord(id)?.title ?? id;
  const toGet = (script: Script) => $catalog.available.find((d) => scriptsOfLanguage(d.from).includes(script) && !catalog.installedRecord(d.id));

  const scopeKey = $derived(scope.kind === 'one' ? scope.id : 'all');
  $effect(() => { void scopeKey; untrack(() => search.rerun(scope)); });

  onMount(async () => {
    await platform.setKeyboardAccessoryBar(false);
    if (settings.current.openKeyboardOnLaunch && !(await platform.isScreenReaderOn())) input?.focus();
  });

  const onInput = (e: Event) => search.setQuery((e.currentTarget as HTMLInputElement).value, scope);
  function clear() { search.setQuery('', scope); input?.focus(); }
  const open = (dictionaryId: string, entryId: number) => router.push({ name: 'entry', dictionaryId, entryId });
  function settled(query: string): Promise<void> {
    return new Promise((done) => {
      const stop = search.subscribe((v) => {
        if (v.query !== query || !v.loading) queueMicrotask(() => { stop(); done(); });
      });
    });
  }
  async function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      await tick();
      const query = search.current.query;
      if (!query.trim()) return;
      if (search.current.result?.query !== query || search.current.loading) {
        if (!search.current.loading) search.rerun(scope);
        await settled(query);
      }
      const view = search.current;
      const first = view.query === query && view.result?.query === query ? view.result.items[0] : undefined;
      if (first) open(first.dictionaryId, first.entryId);
    }
    if (e.key === 'Escape' && $search.query) { e.preventDefault(); clear(); }
  }
  async function setScope(s: Scope) { scopeOpen = false; await settings.update({ lastScope: s }); }
  async function removeRecent(dictionaryId: string, entryId: number) {
    await platform.haptic();
    await recents.remove(dictionaryId, entryId);
    toasts.show($i18n.t('search.recent_removed'));
  }
  async function reinstall(id: string) {
    const title = catalog.installedRecord(id)?.title ?? id;
    const notice = reinstallNotice(await installer.reinstall(id), isolate(title), $i18n.t, $i18n.lang);
    if (notice) toasts.show(notice);
  }

  // Long-press removes a recent entry; the click that ends a long press must not open it.
  function longPress(node: HTMLElement, run: () => void) {
    let timer: ReturnType<typeof setTimeout> | undefined; let fired = false;
    const start = () => { fired = false; timer = setTimeout(() => { fired = true; run(); }, 500); };
    const stop = () => clearTimeout(timer);
    const click = (e: Event) => { if (fired) { e.preventDefault(); e.stopImmediatePropagation(); } };
    node.addEventListener('pointerdown', start); node.addEventListener('pointerup', stop);
    node.addEventListener('pointerleave', stop); node.addEventListener('pointercancel', stop);
    node.addEventListener('click', click, true);
    node.addEventListener('contextmenu', (e) => e.preventDefault());
    return { destroy: stop };
  }
</script>

<div class="search">
  <header class="top">
    <div class="field">
      <Icon name="search" />
      <input bind:this={input} type="text" inputmode="text" enterkeyhint="search" autocapitalize="off" autocorrect="off"
        spellcheck="false" autocomplete="off" dir={fieldDir} aria-label={placeholder} {placeholder}
        value={$search.query} oninput={onInput} onkeydown={onKey} />
      {#if $search.query}<button class="icon" onclick={clear} aria-label={$i18n.t('search.clear')}><Icon name="close" /></button>{/if}
      <button class="icon" onclick={() => (menuOpen = true)} aria-label={$i18n.t('common.more')}><Icon name="more" /></button>
    </div>
    {#if installed.length}
      <button class="scope" onclick={() => (scopeOpen = true)} aria-label={$i18n.t('a11y.scope', { scope: scopeTitle })}>
        {scopeTitle}<Icon name="expand" size={18} />
      </button>
    {/if}
  </header>

  <DownloadStrip />

  {#each broken as rec (rec.id)}
    <div class="banner" role="alert">
      <span>{$i18n.t('broken.title', { title: isolate(rec.title) })}</span>
      <button class="text" onclick={() => reinstall(rec.id)}>{$i18n.t('common.reinstall')}</button>
    </div>
  {/each}

  <main>
    {#if !installed.length && !waiting}
      <EmptyState title={$i18n.t('empty.no_dicts_title')} body={$i18n.t('empty.no_dicts_body')} action={$i18n.t('empty.get')} onAction={() => router.push({ name: 'library' })} />
    {:else if !$search.query.trim()}
      {#if $recents.length}
        <h2 class="hdr">{$i18n.t('search.recent')}</h2>
        <ul class="list">
          {#each $recents as r (r.dictionaryId + ':' + r.entryId)}
            {@const from = catalog.installedRecord(r.dictionaryId)?.from}
            <li class="recent-item">
              <button class="recent" use:longPress={() => removeRecent(r.dictionaryId, r.entryId)} onclick={() => open(r.dictionaryId, r.entryId)}
                onkeydown={(e) => { if (e.key === 'Delete') void removeRecent(r.dictionaryId, r.entryId); }}>
                <Icon name="history" size={20} />
                <span class="hw headword" lang={from} dir={from ? dirOfLanguage(from) : 'auto'}>{r.headword}</span>
                <span class="badge" dir="auto">{titleOf(r.dictionaryId)}</span>
              </button>
              <button class="icon" onclick={() => removeRecent(r.dictionaryId, r.entryId)} aria-label={$i18n.t('search.recent_remove')}><Icon name="close" size={20} /></button>
            </li>
          {/each}
        </ul>
      {/if}
    {:else if $search.result}
      {@const r = $search.result}
      {#if r.mode === 'root'}<h2 class="hdr">{$i18n.t('search.root_header', { root: isolate(r.root ?? '') })}</h2>{/if}
      {#if r.scriptFallback}
        {#if r.scriptFallback.dictionaryIds.length}
          {@const target = r.scriptFallback.dictionaryIds[0]}
          <div class="hint">
            <span>{$i18n.t('search.results_from', { title: r.scriptFallback.dictionaryIds.map((id) => isolate(titleOf(id))).join(', ') })}</span>
            <button class="text" onclick={() => setScope({ kind: 'one', id: target })}>{$i18n.t('search.switch')}</button>
          </div>
        {:else}
          {@const get = toGet(r.scriptFallback.script)}
          <EmptyState title={$i18n.t(`search.no_script_title_${r.scriptFallback.script}`)}
            body={get ? $i18n.t('search.no_script_body', { title: isolate(get.title), size: formatBytes(get.size_bytes, $i18n.lang) }) : undefined}
            action={get ? $i18n.t('search.get', { title: isolate(get.title) }) : undefined} onAction={() => router.push({ name: 'library' })} />
        {/if}
      {/if}
      {#if r.items.length}
        <ul class="list">
          {#each r.items as s (s.dictionaryId + ':' + s.entryId)}
            <li><SuggestionRow suggestion={s} showBadge={scope.kind === 'all' || !!r.scriptFallback} onOpen={() => open(s.dictionaryId, s.entryId)} /></li>
          {/each}
        </ul>
      {:else if !r.scriptFallback}
        {#if r.elsewhere?.length}
          {@const other = r.elsewhere[0]}
          <EmptyState title={$i18n.t('search.not_in', { title: isolate(scopeTitle) })} body={$i18n.t('search.found_elsewhere', { count: r.elsewhere.length })}
            action={$i18n.t('search.show_from', { title: isolate(titleOf(other)) })} onAction={() => setScope({ kind: 'one', id: other })} />
        {:else}
          <EmptyState title={$i18n.t('search.no_results_title', { query: isolate(r.query.trim()) })} body={$i18n.t('search.no_results_body')}
            action={$i18n.t('search.get_more')} onAction={() => router.push({ name: 'library' })} />
        {/if}
      {/if}
    {/if}
  </main>
</div>

<ScopeSheet open={scopeOpen} {scope} onSelect={setScope} onClose={() => (scopeOpen = false)}
  onManage={() => { scopeOpen = false; router.push({ name: 'library' }); }} />
<Sheet open={menuOpen} label={$i18n.t('common.more')} onClose={() => (menuOpen = false)}>
  <button class="item" onclick={() => { menuOpen = false; router.push({ name: 'library' }); }}>{$i18n.t('settings.dictionaries')}</button>
  <button class="item" onclick={() => { menuOpen = false; router.push({ name: 'settings' }); }}>{$i18n.t('settings.title')}</button>
</Sheet>

<style>
  .top { position: sticky; top: 0; z-index: 2; background: var(--md-surface); padding: calc(var(--safe-top) + 8px) 16px 8px; }
  .field { display: flex; align-items: center; gap: 8px; min-height: 56px; padding-inline: 16px 4px; border-radius: 28px; background: var(--md-surface-container-high); }
  .field:has(input:focus) { box-shadow: inset 0 0 0 2px var(--md-primary); }
  input { flex: 1; min-width: 0; border: 0; background: transparent; font-size: 17px; color: var(--md-on-surface); }
  /* The bar draws the ring; :focus-visible is needed to outrank the global focus rule. Without :has() the bar
     cannot ring, so the input keeps the global outline. */
  @supports selector(:has(*)) { input:focus-visible { outline: none !important; } }
  input::placeholder { color: var(--md-on-surface-variant); }
  .icon { all: unset; display: grid; place-items: center; width: var(--tap); height: var(--tap); border-radius: 50%; cursor: pointer; }
  .scope { all: unset; display: inline-flex; align-items: center; gap: 4px; margin-top: 8px; position: relative; min-height: 36px; padding: 0 12px;
    border: 1px solid var(--md-outline); border-radius: 8px; font-size: 0.875rem; cursor: pointer; }
  .scope::after { content: ''; position: absolute; inset-inline: 0; inset-block: calc((36px - var(--tap)) / 2); }
  .banner, .hint { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 4px 16px; padding: 8px 12px; border-radius: var(--radius); font-size: 0.875rem; }
  .banner { background: var(--md-error-container); color: var(--md-on-error-container); }
  .hint { background: var(--md-surface-container); }
  .hdr { margin: 12px 16px 4px; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--md-on-surface-variant); }
  .list { list-style: none; margin: 0; padding: 0 0 calc(16px + var(--safe-bottom)); }
  /* The headword column grows to its full width first; the label gets what is left (at least 3rem) and ends in an ellipsis. */
  .recent { all: unset; box-sizing: border-box; flex: 1; min-width: 0; display: grid; grid-template-columns: auto minmax(0, max-content) minmax(3rem, 1fr);
    align-items: center; gap: 16px; width: 100%; min-height: 56px; padding: 0 16px; cursor: pointer; }
  .recent-item { display: flex; align-items: center; padding-inline-end: 4px; }
  .recent .hw { font-size: 1.0625rem; overflow-wrap: anywhere; }
  .recent .hw[lang="ar"] { font-size: 1.375rem; line-height: 1.8; }
  .badge { justify-self: end; max-width: 100%; overflow: hidden; text-overflow: ellipsis; border: 1px solid var(--md-outline-variant); border-radius: 4px; padding: 0 4px; font-size: 0.6875rem; white-space: nowrap; color: var(--md-on-surface-variant); }
  button.text { all: unset; min-height: var(--tap); padding: 0 12px; color: var(--md-primary); font-weight: 500; cursor: pointer; display: grid; place-items: center; }
  .item { all: unset; display: flex; align-items: center; min-height: var(--tap); padding: 0 24px; width: 100%; box-sizing: border-box; cursor: pointer; }
</style>