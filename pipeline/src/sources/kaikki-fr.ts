import { normalizeKey } from '@lexnur/core';
import { blockedKaikkiFrEntryReason, blockedKaikkiFrReason } from '../filter/content.ts';
import type { KaikkiEdition, KaikkiEntry, KaikkiForm, KaikkiSense } from './kaikki.ts';

type Example = NonNullable<KaikkiSense['examples']>[number];

const HEADER = /^([^,\\]+?)(?:, ([^\\]+?))?(?: \\(.+)\\)?$/;
const ARABIC = /\p{Script=Arabic}/u;
const ROMAN = /^[\p{Script=Latin}\p{M}ʿʾ'’ .-]+$/u;
// "كَتَبَ كِتَابًا ' ' (kataba kitâbã) : Il a écrit une lettre."
const INLINE_EXAMPLE = /^(.*?)\s*' '\s*\([^)]*\)\s*[:=]?\s*(.*)$/s;

// The French edition has no canonical/romanization forms: the page header "كَتَبَ, kataba \ka.ta.ba\" lands in raw_tags[0].
function header(e: KaikkiEntry): { head?: string; roman?: string; ipa?: string } {
  const [, first = '', second, ipa] = HEADER.exec(e.raw_tags?.[0] ?? '') ?? [];
  if (!ARABIC.test(first)) return !second && !ipa && ROMAN.test(first) ? { roman: first } : {};
  if (normalizeKey(first) !== normalizeKey(e.word)) return {};
  return { head: first, roman: second && ROMAN.test(second) ? second : undefined, ipa };
}

const slashed = (ipa: string) => ipa.replace(/^\\(.*)\\$/, '/$1/');
const bare = (ipa: string) => ipa.replace(/^[\\/[]|[\\/\]]$/g, '');

function adaptExample(x: Example): Example {
  const m = INLINE_EXAMPLE.exec(x.text ?? '');
  if (!m) return x;
  const [, text, rest] = m;
  return { ...x, text, translation: x.translation ?? (rest || undefined) };
}

function adapt(e: KaikkiEntry): KaikkiEntry {
  const { head, roman, ipa } = header(e);
  const forms: KaikkiForm[] = [...(e.forms ?? [])];
  if (head && !forms.some((f) => f.tags?.includes('canonical'))) forms.push({ form: head, tags: ['canonical'] });
  if (roman) forms.push({ form: roman, tags: ['romanization'] });
  const ipas = [ipa && `/${ipa}/`, ...(e.sounds ?? []).map((s) => s.ipa && slashed(s.ipa))].filter((x): x is string => Boolean(x));
  const unique = ipas.filter((x, i) => ipas.findIndex((y) => bare(y) === bare(x)) === i);
  return {
    ...e,
    forms,
    sounds: unique.map((x) => ({ ipa: x })),
    etymology_text: e.etymology_texts?.join(' '),
    senses: e.senses?.map((s) => (s.examples ? { ...s, examples: s.examples.map(adaptExample) } : s)),
  };
}

export const FRENCH: KaikkiEdition = { adapt, blocked: blockedKaikkiFrReason, blockedEntry: blockedKaikkiFrEntryReason };

const GENDERS = new Set(['masculine', 'feminine']);
const CONJUGATION = /^Conjugaison:/;
const COMPOUND_TAGS = new Set(['multiword-construction', 'pluperfect', 'anterior', 'perfect']);
// Compound tenses are the auxiliary plus the past participle; leaving them out keeps the simple tenses under the 60-row table cap.
const compound = (tags: string[]) =>
  tags.some((t) => COMPOUND_TAGS.has(t)) || (tags.includes('past') && !tags.includes('indicative') && !tags.includes('participle'));

function conjugation(forms: KaikkiForm[]): KaikkiForm[] {
  return forms
    .filter((f) => !(f.source && CONJUGATION.test(f.source) && compound(f.tags ?? [])))
    .map((f) => (f.source && CONJUGATION.test(f.source) ? { ...f, source: 'conjugation' } : f));
}

function adaptWord(e: KaikkiEntry): KaikkiEntry {
  const isFormOf = (s: KaikkiSense) => Boolean(s.form_of?.length || s.tags?.includes('form-of'));
  const inflection = (e.senses ?? []).every(isFormOf);
  const gender = (e.tags ?? []).filter((t) => GENDERS.has(t));
  const senses = (e.senses ?? []).map((s) => (isFormOf(s) ? { ...s, examples: undefined } : s));
  const [first, ...rest] = senses;
  const ipas = (e.sounds ?? []).map((s) => s.ipa).filter((x): x is string => Boolean(x && /^\\.+\\$/.test(x)));
  return {
    ...e,
    forms: inflection ? [] : conjugation(e.forms ?? []),
    senses: first && gender.length ? [{ ...first, tags: [...gender, ...(first.tags ?? [])] }, ...rest] : senses,
    sounds: [...new Set(ipas.map(slashed))].map((ipa) => ({ ipa })),
    etymology_text: e.etymology_texts?.join(' '),
  };
}

function withoutRepeatedForms(group: KaikkiEntry[]): KaikkiEntry[] {
  const seen = new Set<string>();
  return group.map((e) => ({
    ...e,
    forms: e.forms?.filter((f) => {
      const key = `${f.source ?? ''}|${(f.tags ?? []).join(' ')}|${f.form}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  }));
}

export const FRENCH_FR: KaikkiEdition = {
  adapt: adaptWord,
  blocked: blockedKaikkiFrReason,
  blockedEntry: blockedKaikkiFrEntryReason,
  merge: withoutRepeatedForms,
};
