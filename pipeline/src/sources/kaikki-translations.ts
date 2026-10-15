import { normalizeKey, type Body, type Sense } from '@lexnur/core';
import { blockedArabicTerm, blockedFrenchTermReason, blockedKaikkiFrEntryReason, blockedKaikkiFrReason, blockedKaikkiReason, blockedTermReason, type KaikkiSenseLike } from '../filter/content.ts';
import { countDrop, countSkip, truncateGloss, type BuildStats, type EntryRow } from '../rows.ts';
import { groupAdjacent, isFormOf, readKaikki, type KaikkiEntry, type KaikkiSense } from './kaikki.ts';
import { FRENCH_FR } from './kaikki-fr.ts';

export interface KaikkiTranslation {
  code?: string;
  lang?: string;
  word?: string;
  raw_tags?: string[];
  sense?: string;
  tags?: string[];
  roman?: string;
  alt?: string;
  lang_code?: string;
  sense_index?: number;
}
export type TranslatedEntry = KaikkiEntry & { translations?: KaikkiTranslation[] };

export interface TranslationEdition {
  lang: string;
  adapt?(e: TranslatedEntry): TranslatedEntry;
  blocked(s: KaikkiSenseLike): string | null;
  blockedEntry?(e: KaikkiEntry): string | null;
  blockedHeader(header: string): string | null;
  regional?(item: KaikkiTranslation): string | undefined;
  stopwords?: Set<string>;
}

const ENGLISH: TranslationEdition = { lang: 'en', blocked: blockedKaikkiReason, blockedHeader: (h) => blockedTermReason(h) };

const STOPWORDS = new Set(
  'a an the or and of to in on for with by as at from into its it is be who etc slang informal colloquial see also someone somebody something one person persons people man men woman women thing'.split(' '),
);

function tokens(text: string, extra?: Set<string>): Set<string> {
  const words = text.toLowerCase().replace(/\s+—\s+see also\b.*$/, '').match(/\p{L}+/gu) ?? [];
  return new Set(words.filter((w) => !STOPWORDS.has(w) && !extra?.has(w)));
}

// The package is Modern Standard Arabic: items in a dialect, a region's usage or a
// colloquial or childish register are left out. Classical, literary and formal stay.
const DIALECT_TAGS = new Set(['colloquial', 'dialectal', 'regional', 'childish', 'Al-Andalus', 'Egypt', 'Iraq', 'Morocco', 'Palestine', 'Yemen']);
const dialectTag = (tags: string[] = []) => tags.find((t) => DIALECT_TAGS.has(t) || (t.endsWith('-Arabic') && t !== 'Modern-Standard-Arabic'));

// Wiktextract leaves Latin-script markers inside some words ("X or Y", "X m Y",
// "Hijazi Arabic X"); they separate the actual translations, and a dialect name
// marks the word after it as dialectal.
function arabicWords(word: string): { words: string[]; dialects: string[] } {
  const parts = word.split(/((?:^|\s+)[A-Za-z]+(?:\s+[A-Za-z]+)*(?=\s+|$))/);
  const words: string[] = [];
  const dialects: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const w = (parts[i] as string).trim();
    if (!w) continue;
    const marker = parts[i - 1]?.trim() ?? '';
    if (/\bArabic$/.test(marker) && !/Standard|Classical/.test(marker)) dialects.push(marker.replace(/\s+/g, '-'));
    else words.push(w);
  }
  return { words, dialects };
}
const ARABIC = /\p{Script=Arabic}/u;
export type TargetLang = 'ar' | 'fr' | 'ja' | 'zh';

interface Rendered {
  text: string;
  link: [string, string];
}

interface Target {
  accepts(item: KaikkiTranslation): boolean;
  render(item: KaikkiTranslation): { words: Rendered[]; dialects: string[] };
  dialect?(item: KaikkiTranslation): string | undefined;
  blockedWord?(text: string): string | null;
  separator: string;
}

const plain = (word: string): Rendered => ({ text: word, link: [word, word] });

const FRENCH_GENDER: Record<string, string> = { masculine: 'm', feminine: 'f', neuter: 'n' };
const NOT_REGIONS = new Set(['Anglicism', 'French']);

// "eau (f pl, Quebec)": the grammatical gender, number and regional variety Kaikki
// tags each French word with.
function frenchNote(tags: string[] = []): string {
  const gender = tags.flatMap((t) => FRENCH_GENDER[t] ?? []).join('/');
  const number = tags.includes('plural') ? 'pl' : '';
  const regions = tags.filter((t) => /^[A-Z]/.test(t) && !NOT_REGIONS.has(t)).map((t) => t.replace(/-/g, ' '));
  return [[gender, number].filter(Boolean).join(' '), ...regions].filter(Boolean).join(', ');
}

const KANA = /^[\p{sc=Hiragana}\p{sc=Katakana}ー・\s]+$/u;
const JAPANESE = /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}]/u;
const HAN = /\p{sc=Han}/u;

// "犬 (いぬ)": the reading comes from the kana in `alt`, else the romaji in `roman`.
function japanese(item: KaikkiTranslation): Rendered[] {
  const word = item.word?.trim() ?? '';
  if (!JAPANESE.test(word)) return [];
  if (KANA.test(word)) return [plain(word)];
  const kana = (item.alt ?? '')
    .split(/[,、]\s*/)
    .map((k) => k.trim())
    .filter((k) => k && KANA.test(k) && k !== word);
  const reading = kana.length ? kana.join('、') : item.roman?.trim();
  return [{ text: reading ? `${word} (${reading})` : word, link: [word, word] }];
}

// Kaikki writes Chinese as "traditional /simplified", or a single form when they
// agree. "猫 / 貓 (māo)": simplified first, traditional only when it differs.
function chinese(item: KaikkiTranslation): Rendered[] {
  const forms = (item.word ?? '').split(/\s*\/\s*/).map((f) => f.trim()).filter((f) => HAN.test(f));
  const simplified = forms.at(-1);
  if (!simplified) return [];
  const traditional = forms.length > 1 && forms[0] !== simplified ? ` / ${forms[0]}` : '';
  const pinyin = item.roman?.trim();
  return [{ text: `${simplified}${traditional}${pinyin ? ` (${pinyin})` : ''}`, link: [simplified, simplified] }];
}

const TARGETS: Record<TargetLang, Target> = {
  ar: {
    accepts: (t) => t.code === 'ar',
    render: (t) => {
      const { words, dialects } = arabicWords(t.word ?? '');
      return { words: words.filter((w) => ARABIC.test(w)).map(plain), dialects };
    },
    dialect: (t) => dialectTag(t.tags),
    blockedWord: blockedArabicTerm,
    separator: '، ',
  },
  fr: {
    accepts: (t) => t.code === 'fr',
    render: (t) => {
      const word = t.word?.trim();
      if (!word) return { words: [], dialects: [] };
      const note = frenchNote(t.tags);
      return { words: [{ text: note ? `${word} (${note})` : word, link: [word, word] }], dialects: [] };
    },
    separator: ', ',
  },
  ja: { accepts: (t) => t.code === 'ja', render: (t) => ({ words: japanese(t), dialects: [] }), separator: ', ' },
  // Mandarin only: under the generic zh code, other varieties carry a variety tag
  // (Hokkien, Dungan) or a raw tag (Southern Min).
  zh: {
    accepts: (t) =>
      t.code === 'cmn' ||
      (t.code === 'zh' && (t.lang === 'Chinese Mandarin' || (t.lang === 'Chinese' && !t.tags?.length && !t.raw_tags?.length))),
    render: (t) => ({ words: chinese(t), dialects: [] }),
    separator: ', ',
  },
};

// Kaikki names an untitled translation table "Translations"; that is no sense header.
const headerOf = (item: KaikkiTranslation) => (item.sense && !/^\s*translations\s*$/i.test(item.sense) ? item.sense : undefined);
const bare = (text: string) => text.trim().replace(/[\s.]+$/, '');
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const containsWords = (text: string, part: string) =>
  part !== '' && new RegExp(`(?<![\\p{L}\\p{N}])${escape(part)}(?![\\p{L}\\p{N}])`, 'iu').test(text);
const ownGloss = (s: KaikkiSense) => (s.glosses ?? []).filter((g) => g.trim() !== '').at(-1);

interface EnglishSense {
  gloss: string;
  blocked: boolean;
  tokens: Set<string>;
}

// Translation headers paraphrase the English sense rather than quote it, so a header
// is matched to the English gloss sharing the largest share of its words. It is
// blocked when that best match (or a tie for it) is a blocked sense sharing more than
// half of its words.
function headerBlocked(header: string, senses: EnglishSense[], stopwords?: Set<string>): boolean {
  const ht = tokens(header, stopwords);
  if (ht.size === 0) return false;
  const h = bare(header);
  if (senses.some((s) => s.blocked && (containsWords(s.gloss, h) || containsWords(h, bare(s.gloss))))) return true;
  let blocked = 0;
  let kept = 0;
  for (const s of senses) {
    let shared = 0;
    for (const t of ht) if (s.tokens.has(t)) shared++;
    const score = shared / ht.size;
    if (s.blocked) blocked = Math.max(blocked, score);
    else kept = Math.max(kept, score);
  }
  return blocked > 0.5 && blocked >= kept;
}

// The French edition numbers the sense a translation table belongs to.
const indexBlocked = (item: KaikkiTranslation, entry: TranslatedEntry, edition: TranslationEdition) => {
  const sense = item.sense_index === undefined ? undefined : entry.senses?.[item.sense_index - 1];
  return sense !== undefined && edition.blocked(sense) !== null;
};

export function mapTranslationGroup(group: TranslatedEntry[], lang: TargetLang, stats: BuildStats, edition = ENGLISH): EntryRow | null {
  const target = TARGETS[lang];
  const first = group[0];
  if (!first) return null;
  const items = group.flatMap((e) => (e.translations ?? []).filter((t) => target.accepts(t)).map((item) => ({ item, entry: e })));
  if (items.length === 0) return null;
  const entryReason = group.map((e) => edition.blockedEntry?.(e) ?? null).find((r) => r !== null);
  if (entryReason) {
    items.forEach(() => countDrop(stats, entryReason));
    stats.droppedEntries++;
    return null;
  }

  const english: EnglishSense[] = [];
  let lead: EnglishSense | undefined;
  for (const s of group.flatMap((e) => e.senses ?? [])) {
    const gloss = ownGloss(s);
    if (gloss === undefined) continue;
    const sense = { gloss, blocked: edition.blocked(s) !== null, tokens: tokens(gloss, edition.stopwords) };
    english.push(sense);
    if (!lead && !isFormOf(s)) lead = sense;
  }

  const allBlocked = english.length > 0 && english.every((s) => s.blocked);
  const byHeader = new Map<string, { header: string; words: Rendered[] }>();
  let filtered = false;
  for (const { item, entry } of items) {
    const { words: found, dialects } = target.render(item);
    const heading = headerOf(item);
    if (found.length === 0 && dialects.length === 0) continue;
    const reason =
      edition.blocked({ tags: item.tags, raw_tags: item.raw_tags }) ??
      (heading ? edition.blockedHeader(heading) : null) ??
      (allBlocked || indexBlocked(item, entry, edition) || (heading ? headerBlocked(heading, english, edition.stopwords) : lead?.blocked) ? 'sense:blocked' : null);
    if (reason) {
      countDrop(stats, reason);
      filtered = true;
      continue;
    }
    const dialect = target.dialect?.(item) ?? edition.regional?.(item);
    if (dialect) {
      countSkip(stats, `dialect:${dialect}`);
      continue;
    }
    for (const d of dialects) countSkip(stats, `dialect:${d}`);
    const kept = found.filter((w) => {
      const blocked = target.blockedWord?.(w.text);
      if (blocked) countDrop(stats, blocked);
      return !blocked;
    });
    if (kept.length < found.length) filtered = true;
    if (kept.length === 0) continue;
    const header = heading ?? lead?.gloss ?? '';
    const key = header.replace(/[\s\p{P}]+$/u, '');
    const bucket = byHeader.get(key) ?? { header, words: [] };
    const { words } = bucket;
    for (const w of kept) if (!words.some((x) => x.text === w.text)) words.push(w);
    byHeader.set(key, bucket);
  }
  if (byHeader.size === 0) {
    if (filtered) stats.droppedEntries++;
    return null;
  }

  const senses: Sense[] = [...byHeader.values()].map(({ header, words }) => {
    const sense: Sense = { gloss: words.map((w) => w.text).join(target.separator) };
    if (header) sense.parents = [header];
    sense.links = words.map((w) => w.link);
    return sense;
  });
  const body: Body = { v: 1, senses };
  const ipa = [...new Set(group.flatMap((e) => (e.sounds ?? []).map((s) => s.ipa).filter((x): x is string => Boolean(x))))].slice(0, 2);
  if (ipa.length) body.ipa = ipa;

  return {
    headword: first.word,
    search_key: normalizeKey(first.word),
    pos: first.pos ?? null,
    root: null,
    gloss: truncateGloss((senses[0] as Sense).gloss),
    sort_order: 0,
    body,
  };
}

export async function* kaikkiTranslationRows(
  path: string,
  lang: TargetLang,
  o: { limit: number; stats: BuildStats },
  edition = ENGLISH,
): AsyncGenerator<EntryRow> {
  let n = 0;
  for await (const lines of groupAdjacent(readKaikki(path, [edition.lang], o.stats))) {
    const group = lines as TranslatedEntry[];
    const row = mapTranslationGroup(edition.adapt ? group.map(edition.adapt) : group, lang, o.stats, edition);
    if (!row) continue;
    yield row;
    if (++n >= o.limit) return;
  }
}

const ARAB_COUNTRIES = /Algérie|Arabie|Bahreïn|Égypte|Émirats|Irak|Jordanie|Koweït|Liban|Libye|Maroc|Mauritanie|Oman|Palestine|Qatar|Soudan|Syrie|Tunisie|Yémen/;
const FRENCH_STOPWORDS = new Set('le la les l un une des de du d à au aux en et ou par pour sur dans avec qui que qu se sa son ses ce cette comme est être quelqu quelque chose personne'.split(' '));

// French Wiktionary: lang_code instead of code, French content labels, and a region
// named in raw_tags for usage local to one Arab country.
export const FRENCH_TRANSLATIONS: TranslationEdition = {
  lang: 'fr',
  adapt: (e) => ({ ...FRENCH_FR.adapt(e), translations: e.translations?.map((t) => ({ ...t, code: t.code ?? t.lang_code })) }),
  blocked: blockedKaikkiFrReason,
  blockedEntry: blockedKaikkiFrEntryReason,
  blockedHeader: blockedFrenchTermReason,
  regional: (t) => t.raw_tags?.find((r) => ARAB_COUNTRIES.test(r)),
  stopwords: FRENCH_STOPWORDS,
};
