import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { normalizeKey, type Sense } from '@lexnur/core';
import { blockedOewnReason, blockedTermReason } from '../filter/content.ts';
import { countDrop, truncateGloss, type BuildStats, type EntryRow } from '../rows.ts';
import { lemmaParts, type OewnEntries, type OewnSynsets } from './oewn.ts';

export interface Awn4 {
  lemmas: Map<string, string[]>;
  ili: Map<string, string>;
}

export interface Awn4Join {
  lemmas: Map<string, string[]>;
  synsets: number;
  byIli: number;
  byId: number;
  missed: number;
  merged: number;
  sharedIli: number;
}

const ENTITIES: Record<string, string> = { quot: '"', amp: '&', lt: '<', gt: '>', apos: "'" };
const unescape = (s: string) => s.replace(/&(quot|amp|lt|gt|apos);/g, (_, e: string) => ENTITIES[e] as string);
const attr = (tag: string, name: string) => {
  const v = new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
  return v === undefined ? undefined : unescape(v);
};
const synsetId = (id: string) => id.replace(/^awn4-/, '');

export function readAwn4(path: string): string {
  return gunzipSync(readFileSync(path)).toString('utf8');
}

export function parseAwn4(xml: string): Awn4 {
  const lemmas = new Map<string, string[]>();
  for (const [, entry] of xml.matchAll(/<LexicalEntry\b[^>]*>([\s\S]*?)<\/LexicalEntry>/g)) {
    const lemma = attr(/<Lemma\b[^>]*>/.exec(entry as string)?.[0] ?? '', 'writtenForm');
    if (!lemma) continue;
    for (const [sense] of (entry as string).matchAll(/<Sense\b[^>]*>/g)) {
      const synset = attr(sense, 'synset');
      if (!synset) continue;
      const list = lemmas.get(synsetId(synset)) ?? [];
      if (!list.includes(lemma)) list.push(lemma);
      lemmas.set(synsetId(synset), list);
    }
  }
  const ili = new Map<string, string>();
  for (const [tag] of xml.matchAll(/<Synset\b[^>]*>/g)) {
    const id = attr(tag, 'id');
    if (id) ili.set(synsetId(id), attr(tag, 'ili') ?? '');
  }
  return { lemmas, ili };
}

const realIli = (ili: string | undefined) => (ili && ili !== 'in' ? ili : undefined);

export function loadAwn4(awn: Awn4, oewn: OewnSynsets): Awn4Join {
  const byIliId = new Map<string, string>();
  let sharedIli = 0;
  for (const [id, s] of Object.entries(oewn)) {
    const ili = realIli(s.ili);
    if (!ili) continue;
    if (byIliId.has(ili)) sharedIli++;
    else byIliId.set(ili, id);
  }
  const join: Awn4Join = { lemmas: new Map(), synsets: awn.ili.size, byIli: 0, byId: 0, missed: 0, merged: 0, sharedIli };
  for (const [id, ili] of awn.ili) {
    let target = realIli(ili) && byIliId.get(ili);
    if (target) join.byIli++;
    else if (!realIli(ili) && oewn[id] && !realIli(oewn[id].ili)) {
      target = id;
      join.byId++;
    } else join.missed++;
    const lemmas = awn.lemmas.get(id);
    if (!target || !lemmas?.length) continue;
    const existing = join.lemmas.get(target);
    if (existing) join.merged++;
    join.lemmas.set(target, [...new Set([...(existing ?? []), ...lemmas])]);
  }
  return join;
}

export function describeJoin(j: Awn4Join): string {
  const pct = ((100 * j.missed) / j.synsets).toFixed(1);
  return `awn4: ${j.synsets} synsets, ${j.byIli} joined on ILI, ${j.byId} on synset id (no ILI), ${j.missed} missed (${pct}%), ${j.merged} merged into an OEWN synset already joined, ${j.sharedIli} OEWN synsets share an ILI with another`;
}

export function* awn4Rows(
  data: { entries: OewnEntries; synsets: OewnSynsets },
  arabic: Map<string, string[]>,
  stats: BuildStats,
  limit = Infinity,
): Generator<EntryRow> {
  let n = 0;
  for (const [lemma, pos, parts] of lemmaParts(data.entries)) {
    const senses: Sense[] = [];
    const seen = new Set<string>();
    let filtered = false;
    for (const sense of parts.flatMap((p) => p.sense)) {
      const synset = data.synsets[sense.synset];
      const words = arabic.get(sense.synset);
      if (!synset || !words || seen.has(sense.synset)) continue;
      seen.add(sense.synset);
      const definition = synset.definition.join('; ');
      const gloss = words.join('، ');
      const reason = blockedOewnReason(sense, synset) ?? blockedTermReason(definition) ?? blockedTermReason(gloss);
      if (reason) {
        countDrop(stats, reason);
        filtered = true;
        continue;
      }
      senses.push({ gloss, parents: [definition], links: words.map((w) => [w, w]) });
    }
    if (senses.length === 0) {
      if (filtered) stats.droppedEntries++;
      else stats.noGlossEntries++;
      continue;
    }
    yield {
      headword: lemma,
      search_key: normalizeKey(lemma),
      pos,
      root: null,
      gloss: truncateGloss((senses[0] as Sense).gloss),
      sort_order: 0,
      body: { v: 1, senses },
    };
    if (++n >= limit) return;
  }
}
