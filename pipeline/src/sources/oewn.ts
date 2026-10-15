import { execFileSync } from 'node:child_process';
import { normalizeKey, type Body, type Relation, type Sense } from '@lexnur/core';
import { blockedOewnReason } from '../filter/content.ts';
import { countDrop, truncateGloss, type BuildStats, type EntryRow } from '../rows.ts';

export interface OewnSense {
  id: string;
  synset: string;
  exemplifies?: string[];
}
export interface OewnEntry {
  sense: OewnSense[];
  pronunciation?: { value: string }[];
  form?: string[];
}
export interface OewnSynset {
  definition: string[];
  example?: string[];
  members: string[];
  partOfSpeech: string;
  hypernym?: string[];
  exemplifies?: string[];
  ili?: string;
}
export type OewnEntries = Record<string, Record<string, OewnEntry>>;
export type OewnSynsets = Record<string, OewnSynset>;

const POS: Record<string, string> = { n: 'noun', v: 'verb', a: 'adjective', s: 'adjective', r: 'adverb' };

function readZipJson<T>(zip: string, name: string): T {
  return JSON.parse(execFileSync('unzip', ['-p', zip, name], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })) as T;
}

export function loadOewn(zip: string): { entries: OewnEntries; synsets: OewnSynsets } {
  const names = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).split('\n').filter(Boolean);
  const entries: OewnEntries = {};
  const synsets: OewnSynsets = {};
  for (const name of names) {
    if (!name.endsWith('.json') || name === 'frames.json') continue;
    if (name.startsWith('entries-')) Object.assign(entries, readZipJson<OewnEntries>(zip, name));
    else Object.assign(synsets, readZipJson<OewnSynsets>(zip, name));
  }
  return { entries, synsets };
}

const unique = <T>(items: T[]) => [...new Set(items)];

export function oewnRow(lemma: string, pos: string, parts: OewnEntry[], synsets: OewnSynsets, stats: BuildStats): EntryRow | null {
  const senses: Sense[] = [];
  const synonyms: string[] = [];
  const hypernyms: string[] = [];
  let filtered = false;
  for (const part of parts) {
    for (const sense of part.sense) {
      const synset = synsets[sense.synset];
      if (!synset) continue;
      const reason = blockedOewnReason(sense, synset);
      if (reason) {
        countDrop(stats, reason);
        filtered = true;
        continue;
      }
      const out: Sense = { gloss: synset.definition.join('; ') };
      const examples = (synset.example ?? []).slice(0, 2).map((text) => ({ text }));
      if (examples.length) out.examples = examples;
      senses.push(out);
      synonyms.push(...synset.members.filter((m) => m !== lemma));
      for (const id of synset.hypernym ?? []) hypernyms.push(...(synsets[id]?.members ?? []));
    }
  }
  if (senses.length === 0) {
    if (filtered) stats.droppedEntries++;
    else stats.noGlossEntries++;
    return null;
  }
  const body: Body = { v: 1, senses };
  const ipa = unique(parts.flatMap((p) => (p.pronunciation ?? []).map((x) => `/${x.value}/`)));
  if (ipa.length) body.ipa = ipa;
  const forms = unique(parts.flatMap((p) => p.form ?? [])).map((form) => ({ label: 'form', form }));
  if (forms.length) body.forms = forms;
  const relations: Relation[] = [];
  const syn = unique(synonyms).slice(0, 20);
  const hyper = unique(hypernyms).slice(0, 10);
  if (syn.length) relations.push({ kind: 'synonyms', words: syn });
  if (hyper.length) relations.push({ kind: 'hypernyms', words: hyper });
  if (relations.length) body.relations = relations;
  return {
    headword: lemma,
    search_key: normalizeKey(lemma),
    pos,
    root: null,
    gloss: truncateGloss((senses[0] as Sense).gloss),
    sort_order: 0,
    body,
  };
}

export function* oewnRows(
  data: { entries: OewnEntries; synsets: OewnSynsets },
  stats: BuildStats,
  limit = Infinity,
): Generator<EntryRow> {
  let n = 0;
  for (const [lemma, pos, parts] of lemmaParts(data.entries)) {
    const row = oewnRow(lemma, pos, parts, data.synsets, stats);
    if (!row) continue;
    yield row;
    if (++n >= limit) return;
  }
}

export function* lemmaParts(entries: OewnEntries): Generator<[lemma: string, pos: string, parts: OewnEntry[]]> {
  for (const [lemma, byCode] of Object.entries(entries)) {
    const byPos = new Map<string, OewnEntry[]>();
    for (const [code, entry] of Object.entries(byCode)) {
      const pos = POS[code.replace(/-\d+$/, '')];
      if (pos) byPos.set(pos, [...(byPos.get(pos) ?? []), entry]);
    }
    for (const [pos, parts] of byPos) yield [lemma, pos, parts];
  }
}
