<script lang="ts">
  import type { Body } from '@lexnur/core';
  import { useApp } from '../app-context';
  import Collapsible from '../ui/Collapsible.svelte';
  import Chip from '../ui/Chip.svelte';
  import LinkedText from './LinkedText.svelte';
  import { dirOfLanguage } from '../data/dictionary-store';
  import { isolate } from '../i18n';
  let { body, from, to, onLink }: { body: Body; from: string; to: string; onLink: (word: string) => void } = $props();
  const { i18n } = useApp();
  const fromDir = $derived(dirOfLanguage(from));
  const toDir = $derived(dirOfLanguage(to));
  const contextOf = (parents: string[]) => parents.join(' › ').replace(/[\s.:;,]+$/, '');
  const visibleRelations = $derived((body.relations ?? []).filter((r) => r.kind === 'synonyms' || r.kind === 'antonyms'));
  const foldedRelations = $derived((body.relations ?? []).filter((r) => r.kind !== 'synonyms' && r.kind !== 'antonyms'));
</script>

<div class="body">
  <ol class="senses" lang={to} dir={toDir}>
    {#each body.senses as sense, i (i)}
      <li>
        {#if sense.labels?.length}<span class="labels">{#each sense.labels as l, k (k)}<Chip>{l}</Chip>{/each}</span>{/if}
        {#if sense.parents?.length}
          {#if toDir === 'rtl'}<div class="parents" dir="auto">{contextOf(sense.parents)}</div>{:else}<span class="parents"><bdi dir="auto">{contextOf(sense.parents)}</bdi>: </span>{/if}
        {/if}
        <LinkedText text={sense.gloss} links={sense.links} lang={to} dir={toDir} {onLink} />
        {#if sense.formOf}
          <span class="formof">· <button class="link" lang={$i18n.lang} dir={$i18n.dir} onclick={() => onLink(sense.formOf!)}>{$i18n.t('entry.form_of', { lemma: isolate(sense.formOf) })}</button></span>
        {/if}
        {#each sense.examples ?? [] as ex, j (j)}
          <span class="example">
            <span class="ex" lang={from} dir={fromDir}>{ex.text}</span>
            {#if ex.translation}<span class="tr" lang={to} dir={toDir}>{ex.translation}</span>{/if}
          </span>
        {/each}
      </li>
    {/each}
  </ol>

  {#if body.forms?.length}
    <h2>{$i18n.t('entry.forms')}</h2>
    <dl class="forms">
      {#each body.forms as f, i (i)}
        <dt lang={to} dir={toDir}>{f.label}</dt><dd><button class="link formlink" lang={from} dir={fromDir} onclick={() => onLink(f.form)}>{f.form}</button>{#if f.roman}{' '}<bdi class="roman" dir="ltr">({f.roman})</bdi>{/if}</dd>
      {/each}
    </dl>
  {/if}

  {#each visibleRelations as r (r.kind)}
    <h2>{$i18n.t(`entry.rel.${r.kind}`)}</h2>
    <div class="chips">{#each r.words as w (w)}<Chip lang={from} onClick={() => onLink(w)}>{w}</Chip>{/each}</div>
  {/each}

  {#each body.tables ?? [] as table, i (i)}
    <Collapsible title={$i18n.t(`entry.table.${table.title}`)}>
      <div class="tablewrap" dir="ltr">
        <table>
          <tbody>
            {#each table.rows as row, j (j)}
              <tr><th scope="row" lang={to} dir={toDir}>{row.label}</th><td lang={from} dir={fromDir}>{row.form}</td>{#if row.roman}<td class="roman" dir="ltr">{row.roman}</td>{/if}</tr>
            {/each}
          </tbody>
        </table>
      </div>
    </Collapsible>
  {/each}

  {#each foldedRelations as r (r.kind)}
    <Collapsible title={$i18n.t(`entry.rel.${r.kind}`)}>
      <div class="chips">{#each r.words as w (w)}<Chip lang={from} onClick={() => onLink(w)}>{w}</Chip>{/each}</div>
    </Collapsible>
  {/each}

  {#if body.etymology}<Collapsible title={$i18n.t('entry.etymology')}><p lang={to} dir={toDir}>{body.etymology}</p></Collapsible>{/if}
  {#if body.notes?.length}<h2>{$i18n.t('entry.notes')}</h2>{#each body.notes as n, i (i)}<p lang={to} dir={toDir}>{n}</p>{/each}{/if}
</div>

<style>
  .body { font-size: calc(1rem * var(--entry-scale)); }
  .senses { padding-inline-start: 2em; margin: 8px 0; }
  .senses li { margin-bottom: 12px; }
  .labels { display: inline-flex; flex-wrap: wrap; margin-inline-end: 4px; vertical-align: middle; }
  .parents { color: var(--md-on-surface-variant); }
  .example { display: block; margin-top: 4px; padding-inline-start: 12px; border-inline-start: 2px solid var(--md-outline-variant); color: var(--md-on-surface-variant); }
  .example .ex { display: block; }
  .example .tr { display: block; font-size: 0.9em; }
  h2 { font-size: 0.8125rem; text-transform: uppercase; letter-spacing: 0.04em; margin: 20px 0 6px; padding-bottom: 4px; border-bottom: 1px solid var(--md-outline-variant); color: var(--md-on-surface-variant); }
  .forms { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; margin: 0; align-items: center; }
  dt { color: var(--md-on-surface-variant); font-size: 0.9em; }
  dd { margin: 0; }
  .chips { display: flex; flex-wrap: wrap; }
  .tablewrap { overflow-x: auto; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid var(--md-outline-variant); padding: 4px 8px; white-space: nowrap; text-align: start; font-weight: normal; }
  th { color: var(--md-on-surface-variant); font-size: 0.875em; white-space: normal; min-width: 7em; max-width: 11em; }
  .roman { color: var(--md-on-surface-variant); font-size: 0.875em; }
  .link { all: unset; text-decoration: underline; text-underline-offset: 3px; color: var(--md-primary); cursor: pointer; }
  .formlink { display: inline-flex; align-items: center; min-height: var(--tap); }
</style>
