<script lang="ts">
  import { onMount } from 'svelte';
  import type { Entry } from '../data/dictionary-store';
  import { useApp } from '../app-context';
  import { useRouter, type Route } from '../nav/router.svelte';
  import { isolate, labelOrRaw } from '../i18n';
  import { dirOfLanguage } from '../data/dictionary-store';
  import TopBar from '../ui/TopBar.svelte';
  import Icon from '../ui/Icon.svelte';
  import Sheet from '../ui/Sheet.svelte';
  import Chip from '../ui/Chip.svelte';
  import EmptyState from '../ui/EmptyState.svelte';
  import EntryBody from './EntryBody.svelte';
  import SourceSheet from './SourceSheet.svelte';
  import { firstGloss, shareText } from './entry-model';

  let { route }: { route: Extract<Route, { name: 'entry' }> } = $props();
  const { store, catalog, recents, platform, i18n, toasts, settings, search } = useApp();
  const router = useRouter();

  let entry = $state<Entry | null>(null);
  let failed = $state(false);
  let loadSeq = 0;
  let tabs = $state<{ dictionaryId: string; entryId: number; title: string }[]>([]);
  let menuOpen = $state(false);
  let sourceOpen = $state(false);
  let sizeOpen = $state(false);

  const ROOT_MARK = '\u0001';

  const rec = $derived(entry ? catalog.installedRecord(entry.dictionaryId) : undefined);
  const from = $derived(rec?.from ?? 'en');
  const to = $derived(rec?.to ?? 'en');
  const subParts = $derived.by(() => {
    if (!entry) return [];
    const parts: { text: string; cls: string; lang?: string; dir?: 'ltr' }[] = [];
    if ($settings.showTransliteration && entry.body.transliteration) parts.push({ text: entry.body.transliteration, cls: 'translit', lang: `${from}-Latn`, dir: 'ltr' });
    if (entry.pos) parts.push({ text: labelOrRaw($i18n.t, 'pos', entry.pos), cls: 'pos' });
    if (entry.body.ipa?.length) parts.push({ text: entry.body.ipa.join(' · '), cls: 'ipa', lang: 'und-fonipa', dir: 'ltr' });
    return parts;
  });

  async function load(dictionaryId: string, entryId: number) {
    const seq = ++loadSeq;
    let loaded: Entry | null = null;
    try { loaded = await store.entry(dictionaryId, entryId); } catch (e) { console.warn('entry load failed', e); }
    if (seq !== loadSeq) return;
    entry = loaded;
    failed = !loaded;
    if (loaded) await recents.add({ dictionaryId, entryId, headword: loaded.headword, gloss: firstGloss(loaded.body) });
  }

  onMount(async () => {
    await load(route.dictionaryId, route.entryId);
    if (!entry) return;
    const others = store.installed().map((d) => d.id).filter((id) => id !== entry!.dictionaryId);
    const same = await store.sameHeadword(entry.headword, others);
    if (same.length) {
      tabs = [{ dictionaryId: entry.dictionaryId, entryId: entry.entryId }, ...same]
        .map((s) => ({ dictionaryId: s.dictionaryId, entryId: s.entryId, title: catalog.installedRecord(s.dictionaryId)?.title ?? s.dictionaryId }));
    }
  });

  async function follow(word: string) {
    let hit = null;
    try { hit = entry ? await store.lookupLinked(word, entry.dictionaryId) : null; } catch (e) { console.warn('linked lookup failed', e); }
    if (hit) router.push({ name: 'entry', dictionaryId: hit.dictionaryId, entryId: hit.entryId });
    else toasts.show($i18n.t('entry.not_found', { word: isolate(word) }));
  }

  function searchRoot(root: string, dictionaryId: string) {
    search.setQuery(root, { kind: 'one', id: dictionaryId });
    router.reset({ name: 'search' });
  }

  async function copyWord() {
    menuOpen = false;
    if (!entry) return;
    try { await platform.copy(entry.headword); toasts.show($i18n.t('entry.copied')); } catch (e) { console.warn('copy failed', e); toasts.show($i18n.t('entry.copy_failed')); }
  }
  async function share() {
    menuOpen = false;
    if (!entry) return;
    try { await platform.share({ title: entry.headword, text: shareText(entry.headword, entry.body, rec?.title ?? '', rec?.license ?? '') }); } catch { /* a cancelled share sheet rejects */ }
  }
  const scale = (d: number) => settings.update({ entryTextScale: Math.min(2, Math.max(0.85, Math.round((settings.current.entryTextScale + d) * 100) / 100)) });
</script>

<TopBar onBack={() => router.back()}>
  {#snippet actions()}
    <button class="icon" onclick={() => (sizeOpen = true)} aria-label={$i18n.t('entry.text_size')}><Icon name="text" /></button>
    <button class="icon" onclick={() => (menuOpen = true)} aria-label={$i18n.t('common.more')}><Icon name="more" /></button>
  {/snippet}
</TopBar>

{#if failed}
  <EmptyState error title={$i18n.t('entry.unavailable_title')} body={$i18n.t('entry.unavailable_body')} action={$i18n.t('common.back')} onAction={() => router.back()} />
{:else if entry}
  {#if tabs.length > 1}
    <div class="tabs" role="tablist">
      {#each tabs as t (t.dictionaryId)}
        <button role="tab" dir="auto" aria-selected={t.dictionaryId === entry.dictionaryId} onclick={() => load(t.dictionaryId, t.entryId)}>{t.title}</button>
      {/each}
    </div>
  {/if}
  <article class="entry">
    <header>
      <h1 class="headword" lang={from} dir={dirOfLanguage(from)}>{entry.headword}</h1>
      {#if subParts.length}<p class="sub" dir={dirOfLanguage(from)}>{#each subParts as part, i (i)}{#if i > 0}{' · '}{/if}<bdi class={part.cls} lang={part.lang} dir={part.dir}>{part.text}</bdi>{/each}</p>{/if}
      {#if entry.root}
        {@const [before, after] = $i18n.t('entry.root', { root: ROOT_MARK }).split(ROOT_MARK)}
        <Chip onClick={() => searchRoot(entry!.root!, entry!.dictionaryId)} label={$i18n.t('entry.root_search', { root: entry.root })}>{before}<bdi lang="ar" dir="rtl">{entry.root}</bdi>{after}</Chip>
      {/if}
      {#if rec?.ai_generated}<p class="ai">{$i18n.t('entry.ai')}</p>{/if}
    </header>
    <EntryBody body={entry.body} {from} {to} onLink={follow} />
    <footer class="attr">
      <span>{$i18n.t('entry.source', { title: isolate(rec?.title ?? ''), license: isolate(rec?.license ?? '') })}</span>
      <button class="text" onclick={() => (sourceOpen = true)}>{$i18n.t('common.details')}</button>
    </footer>
  </article>
{/if}

<Sheet open={menuOpen} label={$i18n.t('common.more')} onClose={() => (menuOpen = false)}>
  <button class="item" onclick={copyWord}><Icon name="copy" />{$i18n.t('entry.copy')}</button>
  <button class="item" onclick={share}><Icon name="share" />{$i18n.t('entry.share')}</button>
  <button class="item" onclick={() => { menuOpen = false; sourceOpen = true; }}><Icon name="info" />{$i18n.t('entry.info')}</button>
</Sheet>
<Sheet open={sizeOpen} label={$i18n.t('entry.text_size')} onClose={() => (sizeOpen = false)}>
  <div class="size">
    <button class="item" onclick={() => scale(-0.15)} disabled={$settings.entryTextScale <= 0.85}>A− {$i18n.t('entry.text_smaller')}</button>
    <button class="item" onclick={() => scale(0.15)} disabled={$settings.entryTextScale >= 2}>A+ {$i18n.t('entry.text_larger')}</button>
  </div>
</Sheet>
<SourceSheet {rec} open={sourceOpen} onClose={() => (sourceOpen = false)} />

<style>
  .icon { all: unset; display: grid; place-items: center; width: var(--tap); height: var(--tap); border-radius: 50%; cursor: pointer; }
  .tabs { display: flex; gap: 4px; padding: 0 12px; border-bottom: 1px solid var(--md-outline-variant); overflow-x: auto; }
  .tabs button { all: unset; min-height: var(--tap); padding: 0 12px; cursor: pointer; border-bottom: 2px solid transparent; white-space: nowrap; }
  .tabs button[aria-selected="true"] { border-bottom-color: var(--md-primary); color: var(--md-primary); font-weight: 600; }
  .entry { padding: 8px 16px calc(24px + var(--safe-bottom)); }
  h1 { margin: 0; font-size: calc(2.125rem * var(--entry-scale)); line-height: 1.3; overflow-wrap: anywhere; }
  h1[lang="ar"] { font-size: calc(2.5rem * var(--entry-scale)); line-height: 1.8; }
  .sub { margin: 4px 0; color: var(--md-on-surface-variant); }
  .ai { display: inline-block; margin: 4px 0; padding: 2px 10px; border-radius: 6px; font-size: 0.8125rem; background: var(--md-surface-container-high); color: var(--md-on-surface-variant); }
  .attr { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; margin-top: 24px; padding-top: 12px;
    border-top: 1px solid var(--md-outline-variant); font-size: 0.8125rem; color: var(--md-on-surface-variant); }
  button.text { all: unset; min-height: var(--tap); padding: 0 12px; color: var(--md-primary); cursor: pointer; display: grid; place-items: center; }
  .item { all: unset; display: flex; align-items: center; gap: 16px; min-height: var(--tap); padding: 0 24px; width: 100%; box-sizing: border-box; cursor: pointer; }
  .item:disabled { opacity: 0.38; }
</style>
