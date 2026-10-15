import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';
import { createGunzip } from 'node:zlib';
import { normalizeKey, type Body, type Form, type Sense } from '@lexnur/core';
import { blockedJmdictReason } from '../filter/content.ts';
import { countDrop, truncateGloss, type BuildStats, type EntryRow } from '../rows.ts';

interface JmdictForm {
  text: string;
  searchOnly: boolean;
}

interface JmdictSense {
  pos: string[];
  misc: string[];
  field: string[];
  dial: string[];
  glosses: string[];
}

export interface JmdictEntry {
  kanji: JmdictForm[];
  readings: JmdictForm[];
  senses: JmdictSense[];
}

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const ENTITY_DECL = /^<!ENTITY ([\w-]+) "(.*)">$/;
const ELEMENT = /^<(\w+)(?: [^>]*)?>(.*)<\/\1>$/;
const ENTITY_REF = /&([\w-]+);/g;
// The DTD gives grammar terms in romanized Japanese too: "noun (common) (futsuumeishi)", "adverb (fukushi)".
const ROMANIZED_TERM = / \([a-z]+shi\)$/;

function decode(text: string): string {
  return text.replace(ENTITY_REF, (ref, name: string) => XML_ENTITIES[name] ?? ref);
}

function entityName(text: string): string {
  return text.replace(/^&([\w-]+);$/, '$1');
}

function lines(path: string): AsyncIterable<string> {
  let input: Readable = createReadStream(path);
  if (path.endsWith('.gz')) input = input.pipe(createGunzip());
  return createInterface({ input, crlfDelay: Infinity });
}

async function* readJmdict(path: string, labels: Map<string, string>, stats: BuildStats): AsyncGenerator<JmdictEntry> {
  let entry: JmdictEntry | null = null;
  let form: JmdictForm | null = null;
  let sense: JmdictSense | null = null;
  for await (const line of lines(path)) {
    stats.lines++;
    if (line === '<entry>') entry = { kanji: [], readings: [], senses: [] };
    else if (line === '<sense>') entry?.senses.push((sense = { pos: [], misc: [], field: [], dial: [], glosses: [] }));
    else if (line === '</entry>') {
      if (entry && entry.readings.length && entry.senses.length) yield entry;
      else stats.malformed++;
      entry = form = sense = null;
    } else if (!entry) {
      const decl = ENTITY_DECL.exec(line);
      if (decl) labels.set(decl[1] as string, (decl[2] as string).replace(ROMANIZED_TERM, ''));
    } else {
      const element = ELEMENT.exec(line);
      if (!element) continue;
      const [, tag, text = ''] = element;
      if (tag === 'keb') entry.kanji.push((form = { text: decode(text), searchOnly: false }));
      else if (tag === 'reb') entry.readings.push((form = { text: decode(text), searchOnly: false }));
      else if ((tag === 'ke_inf' || tag === 're_inf') && form) form.searchOnly ||= /^&s[kK];$/.test(text);
      else if (tag === 'gloss') sense?.glosses.push(decode(text));
      else if (sense && (tag === 'pos' || tag === 'misc' || tag === 'field' || tag === 'dial')) sense[tag].push(entityName(text));
    }
  }
}

export function jmdictEntryRows(entry: JmdictEntry, labels: Map<string, string>, stats: BuildStats): EntryRow[] {
  const senses: Sense[] = [];
  let pos: string | null = null;
  let filtered = false;
  let usuallyKana = true;
  let previousPos: string | null = null;
  const label = (n: string) => labels.get(n) ?? n;
  for (const s of entry.senses) {
    const gloss = s.glosses.join('; ');
    const reason = blockedJmdictReason(s.misc, gloss);
    if (reason) {
      countDrop(stats, reason);
      filtered = true;
      continue;
    }
    const posLabels = s.pos.map(label);
    const posKey = posLabels.join('\n');
    const shownPos = senses.length === 0 ? posLabels.slice(1) : posKey === previousPos ? [] : posLabels;
    previousPos = posKey;
    pos ??= posLabels[0] ?? null;
    const names = [...shownPos, ...[...s.field, ...s.misc, ...s.dial].map(label)];
    const out: Sense = { gloss };
    if (names.length) out.labels = names;
    usuallyKana &&= s.misc.includes('uk');
    senses.push(out);
  }
  if (senses.length === 0) {
    if (filtered) stats.droppedEntries++;
    else stats.noGlossEntries++;
    return [];
  }
  const first = (forms: JmdictForm[]) => forms.find((f) => !f.searchOnly);
  const head = (usuallyKana ? undefined : first(entry.kanji)) ?? first(entry.readings) ?? (entry.readings[0] as JmdictForm);
  const reading = first(entry.readings) ?? (entry.readings[0] as JmdictForm);
  const body: Body = { v: 1, transliteration: reading.text, senses };
  const forms: Form[] = [
    ...entry.kanji.filter((f) => f !== head && !f.searchOnly).map((f) => ({ label: 'kanji', form: f.text })),
    ...entry.readings.filter((f) => f !== head && f !== reading && !f.searchOnly).map((f) => ({ label: 'reading', form: f.text })),
  ];
  if (forms.length) body.forms = forms;
  const row = { headword: head.text, pos, root: null, gloss: truncateGloss((senses[0] as Sense).gloss), body };
  const keys = new Set<string>();
  const rows: EntryRow[] = [];
  for (const f of [head, ...entry.kanji, ...entry.readings]) {
    const key = normalizeKey(f.text);
    if (keys.has(key)) continue;
    keys.add(key);
    rows.push(rows.length ? { ...row, search_key: key, sort_order: 1, alias: true } : { ...row, search_key: key, sort_order: 0 });
  }
  return rows;
}

export async function* jmdictRows(path: string, o: { limit: number; stats: BuildStats }): AsyncGenerator<EntryRow> {
  const labels = new Map<string, string>();
  let n = 0;
  for await (const entry of readJmdict(path, labels, o.stats)) {
    const rows = jmdictEntryRows(entry, labels, o.stats);
    if (!rows.length) continue;
    yield* rows;
    if (++n >= o.limit) return;
  }
}
