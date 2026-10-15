import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';
import {
  normalizeKey,
  normalizeRoot,
  type Body,
  type Example,
  type Form,
  type InflectionTable,
  type Relation,
  type RelationKind,
  type Sense,
} from '@lexnur/core';
import { blockedKaikkiReason, blockedTermReason, categoryName, type TermSet } from '../filter/content.ts';
import { countDrop, truncateGloss, type BuildStats, type EntryRow } from '../rows.ts';

export interface KaikkiForm {
  form: string;
  tags?: string[];
  source?: string;
  roman?: string;
}
export interface KaikkiSense {
  glosses?: string[];
  tags?: string[];
  categories?: unknown[];
  topics?: string[];
  examples?: { text?: string; english?: string; translation?: string; type?: string }[];
  form_of?: { word: string }[];
  alt_of?: { word: string }[];
  links?: unknown[];
  synonyms?: { word?: string }[];
}
export interface KaikkiEntry {
  word: string;
  lang_code: string;
  pos?: string;
  forms?: KaikkiForm[];
  senses?: KaikkiSense[];
  sounds?: { ipa?: string }[];
  etymology_text?: string;
  etymology_texts?: string[];
  etymology_links?: unknown[];
  etymology_templates?: { name: string; args?: Record<string, string> }[];
  head_templates?: { name: string; args?: Record<string, string> }[];
  tags?: string[];
  raw_tags?: string[];
  categories?: unknown[];
  synonyms?: { word?: string }[];
  antonyms?: { word?: string }[];
  derived?: { word?: string }[];
  related?: { word?: string }[];
}
export interface KaikkiMapOptions {
  lang: 'ar' | 'en' | 'fr';
  maxSenses: number;
  tables: boolean;
  // Opt-in so ids built before the gloss term list existed (ar-en, en) keep their output.
  terms?: TermSet;
  edition?: KaikkiEdition;
}
export interface KaikkiEdition {
  adapt(e: KaikkiEntry): KaikkiEntry;
  blocked(s: KaikkiSense): string | null;
  blockedEntry?(e: KaikkiEntry): string | null;
  merge?(group: KaikkiEntry[]): KaikkiEntry[];
}

const INTERNAL_TAGS = new Set(['form-of', 'alt-of', 'no-gloss', 'table-tags', 'inflection-template', 'canonical', 'romanization']);
const FORM_SKIP_TAGS = new Set(['canonical', 'romanization', 'table-tags', 'inflection-template']);
const IPA = /[\u0250-\u02FF]/;
const TABLE_SOURCES: Record<string, InflectionTable['title']> = { conjugation: 'conjugation', declension: 'declension', inflection: 'inflection' };

export async function* readKaikki(path: string, langs: readonly string[], stats: BuildStats): AsyncGenerator<KaikkiEntry> {
  const needles = langs.flatMap((lang) => [`"lang_code": "${lang}"`, `"lang_code":"${lang}"`]);
  const file = createReadStream(path);
  const input: Readable = path.endsWith('.gz') ? file.pipe(createGunzip()) : file;
  file.on('error', (err) => input.destroy(err));
  const lines = createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    stats.lines++;
    if (!needles.some((needle) => line.includes(needle))) continue;
    let entry: KaikkiEntry;
    try {
      entry = JSON.parse(line) as KaikkiEntry;
    } catch {
      stats.malformed++;
      continue;
    }
    if (!langs.includes(entry.lang_code) || typeof entry.word !== 'string') continue;
    yield entry;
  }
}

export function headwordOf(e: KaikkiEntry): string {
  if (e.lang_code === 'ar') {
    const canonical = e.forms?.find((f) => f.tags?.includes('canonical'));
    if (canonical?.form) return canonical.form;
  }
  return e.word;
}

export async function* groupAdjacent(entries: AsyncIterable<KaikkiEntry>): AsyncGenerator<KaikkiEntry[]> {
  let group: KaikkiEntry[] = [];
  let key = '';
  for await (const entry of entries) {
    const k = `${entry.lang_code}\u0000${headwordOf(entry)}\u0000${entry.pos ?? ''}`;
    if (group.length > 0 && k !== key) {
      yield group;
      group = [];
    }
    key = k;
    group.push(entry);
  }
  if (group.length > 0) yield group;
}

const ROOT_SHAPE = /^\S( \S){2,3}$/;
const ROOT_CATEGORY = /^Arabic terms belonging to the root (.+)$/;

function validRoot(raw: string | undefined): string | null {
  if (!raw) return null;
  const root = normalizeRoot(raw.replace(/<[^>]*>/g, ''));
  return ROOT_SHAPE.test(root) ? root : null;
}

function rootOf(e: KaikkiEntry): string | null {
  for (const t of [...(e.etymology_templates ?? []), ...(e.head_templates ?? [])]) {
    const args = t.args ?? {};
    if (t.name === 'ar-rootbox' || t.name === 'ar-root') {
      const root = validRoot(args['1']);
      if (root) return root;
    }
    for (const [k, v] of Object.entries(args)) {
      if (v !== ':root') continue;
      const root = validRoot(args[String(Number(k) + 1)]);
      if (root) return root;
    }
  }
  for (const link of e.etymology_links ?? []) {
    const text = Array.isArray(link) ? link[0] : undefined;
    const root = typeof text === 'string' && ROOT_SHAPE.test(text) ? validRoot(text) : null;
    if (root) return root;
  }
  for (const category of [...(e.categories ?? []), ...(e.senses ?? []).flatMap((s) => s.categories ?? [])]) {
    const root = validRoot(ROOT_CATEGORY.exec(categoryName(category) ?? '')?.[1]);
    if (root) return root;
  }
  return null;
}

// French pages repeat the conjugation table for pronominal uses (s'être, s'en être): keep the first, without
// periphrastic placeholders ("avoir + past participle"), the stray IPA cells the parser emits as forms, and repeated cells.
function frenchForms(forms: KaikkiForm[]): KaikkiForm[] {
  const second = forms.filter((f) => f.tags?.includes('table-tags'))[1];
  const end = second ? forms.indexOf(second) : forms.length;
  const seen = new Set<string>();
  return forms.filter((f, i) => {
    if (!f.source) return true;
    const key = `${f.form}\u0000${(f.tags ?? []).join(' ')}`;
    if (i >= end || f.tags?.includes('multiword-construction') || IPA.test(f.form) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function isFormOf(s: KaikkiSense): boolean {
  return Boolean(s.form_of?.length || s.alt_of?.length) || (s.tags ?? []).includes('form-of');
}

function mapSense(s: KaikkiSense): Sense | null {
  const glosses = (s.glosses ?? []).filter((g) => g.trim() !== '');
  const last = glosses.at(-1);
  if (last === undefined) return null;
  const out: Sense = { gloss: last };
  if (glosses.length > 1) out.parents = glosses.slice(0, -1);
  const labels = (s.tags ?? []).filter((t) => !INTERNAL_TAGS.has(t));
  if (labels.length) out.labels = labels;
  const examples: Example[] = (s.examples ?? [])
    .filter((x) => x.type !== 'quotation' && x.text)
    .slice(0, 2)
    .map((x) => {
      const example: Example = { text: x.text as string };
      const translation = x.english ?? x.translation;
      if (translation) example.translation = translation;
      return example;
    });
  if (examples.length) out.examples = examples;
  const formOf = s.form_of?.[0]?.word ?? s.alt_of?.[0]?.word;
  if (formOf) out.formOf = formOf;
  const links = (s.links ?? [])
    .filter((l): l is [string, string] => Array.isArray(l) && typeof l[0] === 'string' && typeof l[1] === 'string')
    .map(([text, target]) => [text, target.replace(/#.*$/, '')] as [string, string]);
  if (links.length) out.links = links;
  return out;
}

function termReason(s: KaikkiSense, terms: TermSet | undefined): string | null {
  if (!terms) return null;
  for (const g of s.glosses ?? []) {
    const reason = blockedTermReason(g, terms);
    if (reason) return reason;
  }
  return null;
}

const words = (items: { word?: string }[] | undefined) => (items ?? []).map((x) => x.word).filter((w): w is string => Boolean(w));
const unique = <T>(items: T[]) => [...new Set(items)];

export function mapKaikkiGroup(lines: KaikkiEntry[], opts: KaikkiMapOptions, stats: BuildStats): EntryRow | null {
  const group = opts.edition?.merge?.(lines) ?? lines;
  const first = group[0];
  if (!first) return null;
  const headword = headwordOf(first);
  const blocked = opts.edition?.blocked ?? blockedKaikkiReason;
  const senses: Sense[] = [];
  const senseSynonyms: string[] = [];
  let allFormOf = true;
  let filtered = false;
  for (const entry of group) {
    const entryReason = opts.edition?.blockedEntry?.(entry) ?? null;
    for (const s of entry.senses ?? []) {
      const reason = entryReason ?? blocked(s) ?? termReason(s, opts.terms);
      if (reason) {
        countDrop(stats, reason);
        filtered = true;
        continue;
      }
      const mapped = mapSense(s);
      if (!mapped) continue;
      if (!isFormOf(s)) allFormOf = false;
      senses.push(mapped);
      senseSynonyms.push(...words(s.synonyms));
    }
  }
  if (senses.length === 0) {
    if (filtered) stats.droppedEntries++;
    else stats.noGlossEntries++;
    return null;
  }
  const kept = senses.slice(0, opts.maxSenses);
  const body: Body = { v: 1, senses: kept };

  const transliteration = first.forms?.find((f) => f.tags?.includes('romanization'))?.form;
  if (transliteration) body.transliteration = transliteration;
  const ipa = unique(group.flatMap((e) => (e.sounds ?? []).map((s) => s.ipa).filter((x): x is string => Boolean(x)))).slice(0, 2);
  if (ipa.length) body.ipa = ipa;

  const rawForms = group.flatMap((e) => e.forms ?? []);
  const allForms = (opts.lang === 'fr' ? frenchForms(rawForms) : rawForms).filter((f) => f.form && !(f.tags ?? []).some((t) => FORM_SKIP_TAGS.has(t)));
  const forms: Form[] = allForms
    .filter((f) => !f.source)
    .slice(0, 30)
    .map((f) => (f.roman ? { label: (f.tags ?? []).join(' '), form: f.form, roman: f.roman } : { label: (f.tags ?? []).join(' '), form: f.form }));
  if (forms.length) body.forms = forms;

  if (opts.tables) {
    const tables: InflectionTable[] = [];
    for (const [source, title] of Object.entries(TABLE_SOURCES)) {
      const rows = allForms
        .filter((f) => f.source === source)
        .slice(0, 60)
        .map((f) => (f.roman ? { label: (f.tags ?? []).join(' '), form: f.form, roman: f.roman } : { label: (f.tags ?? []).join(' '), form: f.form }));
      if (rows.length) tables.push({ title, rows });
    }
    if (tables.length) body.tables = tables;
  }

  const relationSources: [RelationKind, string[]][] = [
    ['synonyms', [...group.flatMap((e) => words(e.synonyms)), ...senseSynonyms]],
    ['antonyms', group.flatMap((e) => words(e.antonyms))],
    ['derived', group.flatMap((e) => words(e.derived))],
    ['related', group.flatMap((e) => words(e.related))],
  ];
  const relations: Relation[] = relationSources
    .map(([kind, list]) => ({ kind, words: unique(list).slice(0, 20) }))
    .filter((r) => r.words.length > 0);
  if (relations.length) body.relations = relations;

  const etymology = group.map((e) => e.etymology_text).find((t) => t && t.trim() !== '');
  if (etymology) body.etymology = etymology;

  const lead = kept.find((s) => !s.formOf) ?? (kept[0] as Sense);
  return {
    headword,
    search_key: normalizeKey(headword),
    pos: first.pos ?? null,
    root: opts.lang === 'ar' ? (group.map(rootOf).find((r) => r !== null) ?? null) : null,
    gloss: truncateGloss(lead.gloss),
    sort_order: allFormOf ? 1 : 0,
    body,
  };
}

export async function* kaikkiRows(
  path: string,
  opts: KaikkiMapOptions,
  o: { limit: number; stats: BuildStats },
): AsyncGenerator<EntryRow> {
  let n = 0;
  const entries = readKaikki(path, [opts.lang], o.stats);
  for await (const group of groupAdjacent(opts.edition ? adapted(entries, opts.edition) : entries)) {
    const row = mapKaikkiGroup(group, opts, o.stats);
    if (!row) continue;
    yield row;
    if (++n >= o.limit) return;
  }
}

async function* adapted(entries: AsyncIterable<KaikkiEntry>, edition: KaikkiEdition): AsyncGenerator<KaikkiEntry> {
  for await (const e of entries) yield edition.adapt(e);
}
