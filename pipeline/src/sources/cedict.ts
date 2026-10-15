import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
import { normalizeKey, type Body, type Sense } from '@lexnur/core';
import { blockedTermReason } from '../filter/content.ts';
import { countDrop, truncateGloss, type BuildStats, type EntryRow } from '../rows.ts';

const LINE = /^(\S+) (\S+) \[([^\]]*)\] \/(.*)\/$/;
const SYLLABLE = /^([A-Za-züÜ:]+?)([1-5])$/;
const LEADING_LABEL = /^\(([^)]*)\)\s*(.*)$/;
const PARENTHETICAL = /\(([^)]*)\)/g;
const SLANG_LABEL = /\((?:[^)]*\b)?(?:slang|euphemis\w*)\b/i;
const BLOCKED_LABEL = /\b(vulgar|offensive|derogatory|derog|coarse|pejorative|taboo|insulting|rude|disparaging|contemptuous|abusive|curse word)\b/;
const LABELS = new Set([
  'literary', 'idiom', 'bound form', 'dialect', 'slang', 'old', 'loanword', 'computing', 'medicine', 'archaic',
  'sports', 'physics', 'name', 'chemistry', 'botany', 'anatomy', 'military', 'finance', 'linguistics', 'law',
  'music', 'astronomy', 'formal', 'of a person', 'zoology', 'geology', 'neologism', 'biology', 'polite',
  'historical', 'euphemism', 'colloquial', 'honorific', 'humble', 'abbreviation', 'onomatopoeia', 'internet slang',
  'tw', 'hk', 'prc', 'taiwan', 'cantonese', 'coll.', 'tw, hk',
]);
const TONE_MARK = ['', '\u0304', '\u0301', '\u030C', '\u0300'];

const normalizeUmlaut = (s: string) => s.replace(/u:/g, 'ü').replace(/U:/g, 'Ü');

function markSyllable(syllable: string): string {
  const m = SYLLABLE.exec(syllable);
  if (!m) return syllable;
  const letters = normalizeUmlaut(m[1] as string);
  const tone = Number(m[2]);
  if (tone === 5) return letters;
  const lower = letters.toLowerCase();
  let at = lower.search(/[ae]/);
  if (at < 0) at = lower.includes('ou') ? lower.indexOf('ou') : lower.search(/[aeiouü](?=[^aeiouü]*$)/);
  if (at < 0) return letters;
  return (letters.slice(0, at + 1) + TONE_MARK[tone] + letters.slice(at + 1)).normalize('NFC');
}

export const pinyinToMarks = (pinyin: string): string => pinyin.split(' ').map(markSyllable).join(' ');

export function pinyinKeys(pinyin: string): string[] {
  const spaced = normalizeKey(normalizeUmlaut(pinyin).replace(/[1-5](?=\s|$)/g, '').replace(/ü/gi, 'u'));
  return [...new Set([spaced, spaced.replace(/ /g, '')])];
}

function measureWords(gloss: string): string | null {
  const words = gloss
    .slice(3)
    .split(',')
    .map((item) => {
      const m = /^(?:[^|[]+\|)?([^[]+)\[([^\]]*)\]$/.exec(item.trim());
      return m ? `${m[1]} (${pinyinToMarks(m[2] as string)})` : null;
    });
  return words.length && words.every(Boolean) ? `Measure words: ${words.join(', ')}` : null;
}

function blockedLabel(gloss: string): string | null {
  for (const m of gloss.matchAll(PARENTHETICAL)) {
    const hit = BLOCKED_LABEL.exec((m[1] as string).toLowerCase());
    if (hit) return hit[1] === 'derog' ? 'derogatory' : (hit[1] as string);
  }
  return null;
}

function senseOf(raw: string, stats: BuildStats): Sense | null {
  let gloss = raw.trim();
  const label = blockedLabel(gloss);
  if (label) {
    countDrop(stats, `label:${label}`);
    return null;
  }
  const reason = blockedTermReason(gloss, SLANG_LABEL.test(gloss) ? 'classical' : 'universal');
  if (reason) {
    countDrop(stats, reason);
    return null;
  }
  const labels: string[] = [];
  for (let m = LEADING_LABEL.exec(gloss); m?.[2] && LABELS.has((m[1] as string).toLowerCase()); m = LEADING_LABEL.exec(gloss)) {
    labels.push(m[1] as string);
    gloss = m[2];
  }
  return labels.length ? { gloss, labels } : { gloss };
}

export function cedictRow(line: string, stats: BuildStats): EntryRow[] {
  const m = LINE.exec(line);
  if (!m) {
    stats.malformed++;
    return [];
  }
  const [, traditional, simplified, pinyin, glosses] = m as unknown as [string, string, string, string, string];
  const senses: Sense[] = [];
  const notes: string[] = [];
  let filtered = false;
  for (const part of glosses.split('/')) {
    if (part.startsWith('CL:')) {
      const note = measureWords(part);
      if (note) notes.push(note);
      else senses.push({ gloss: part });
      continue;
    }
    const sense = senseOf(part, stats);
    if (sense) senses.push(sense);
    else filtered = true;
  }
  if (senses.length === 0) {
    if (filtered) stats.droppedEntries++;
    else stats.noGlossEntries++;
    return [];
  }
  const body: Body = { v: 1, transliteration: pinyinToMarks(pinyin), senses };
  if (traditional !== simplified) body.forms = [{ label: 'traditional', form: traditional }];
  if (notes.length) body.notes = notes;
  const primary = normalizeKey(simplified);
  const seen = new Set([primary]);
  const gloss = truncateGloss((senses[0] as Sense).gloss);
  const row = (search_key: string, sort_order: number): EntryRow => ({
    headword: simplified,
    search_key,
    pos: null,
    root: null,
    gloss,
    sort_order,
    ...(sort_order ? { alias: true as const } : {}),
    body,
  });
  const out = [row(primary, 0)];
  for (const key of [normalizeKey(traditional), ...pinyinKeys(pinyin)]) {
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    out.push(row(key, 1));
  }
  return out;
}

export async function* cedictRows(
  lines: AsyncIterable<string> | Iterable<string>,
  stats: BuildStats,
  limit = Infinity,
): AsyncGenerator<EntryRow> {
  let n = 0;
  for await (const line of lines) {
    if (line.startsWith('#') || line.trim() === '') continue;
    stats.lines++;
    const rows = cedictRow(line, stats);
    if (rows.length === 0) continue;
    yield* rows;
    if (++n >= limit) return;
  }
}

export function cedictFileRows(path: string, o: { limit: number; stats: BuildStats }): AsyncGenerator<EntryRow> {
  const lines = createInterface({ input: createReadStream(path).pipe(createGunzip()), crlfDelay: Infinity });
  return cedictRows(lines, o.stats, o.limit);
}
