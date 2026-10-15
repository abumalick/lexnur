import { normalizeKey } from '@lexnur/core';

const KAIKKI_TAGS = new Set(['vulgar', 'offensive', 'derogatory', 'slur', 'pejorative']);
const KAIKKI_CATEGORY = /^[A-Z][a-z]+ (vulgarities|offensive terms|derogatory terms|ethnic slurs|religious slurs)$/;
const KAIKKI_TOPICS = new Set(['en:Sex', 'en:Sex positions']);
const KAIKKI_FR_CATEGORY = /^(Termes vulgaires|Termes péjoratifs|Insultes) en /;
const KAIKKI_FR_TOPICS = new Set(['sexuality', 'pornography', 'eroticism']);
const KAIKKI_FR_RAW_TAGS = new Set(['Vulgaire', 'Injurieux', 'Péjoratif', 'Grossier', 'Raciste', 'Emploi à manier avec précaution']);
const KAIKKI_FR_ENTRY_CATEGORY = /^Lexique en .+? (?:de la |de l’|du )(sexualité|pornographie|érotisme|fétichisme sexuel)/;
const OEWN_SYNSET_DOMAINS: Record<string, string> = {
  '06730109-n': 'oewn:disparagement',
  '07139048-n': 'oewn:obscenity',
  '06731706-n': 'oewn:ethnic-slur',
  '06731387-n': 'oewn:slur',
};
const OEWN_SENSE_DOMAINS: Record<string, string> = {
  'derogation%1:10:00::': 'oewn:derogation',
  'obscenity%1:10:00::': 'oewn:obscenity',
  'slur%1:10:00::': 'oewn:slur',
  'ethnic_slur%1:10:00::': 'oewn:ethnic-slur',
};

// Term lists for glosses of sources without usage tags; examples are not checked.
// UNIVERSAL (vulgarities and slurs) applies to every such source. CLASSICAL adds the
// sexual and anatomical vocabulary, Latin euphemisms and phrase euphemisms of Lane
// and Salmoné. Words that are innocent there (cock, chink, dyke, bitch, bastard,
// prick, rape: a rooster, a crack, a dam, a female dog, an illegitimate child, a
// puncture, a turnip) are left out, and intercourse is only blocked when qualified,
// as these dictionaries mostly mean social intercourse.
const UNIVERSAL_TERMS = [
  'fuck',
  'fucked',
  'fucker',
  'fucking',
  'motherfucker',
  'shit',
  'shitty',
  'bullshit',
  'cunt',
  'twat',
  'wank',
  'wanker',
  'asshole',
  'arsehole',
  'bollocks',
  'cocksucker',
  'dickhead',
  'piss',
  'pissed',
  'whore',
  'whores',
  'slut',
  'sluts',
  'nigger',
  'niggers',
  'nigga',
  'kike',
  'kikes',
  'spic',
  'spics',
  'wetback',
  'gook',
  'gooks',
  'wop',
  'dago',
  'raghead',
  'towelhead',
  'faggot',
  'faggots',
  'tranny',
  'paki',
  'yid',
  'darkie',
  'honky',
  'trollop',
  'trollops',
  'hussy',
  'hussies',
];
const CLASSICAL_TERMS = [
  'sexual intercourse',
  'venereal intercourse',
  'conjugal intercourse',
  'carnal intercourse',
  'illicit intercourse',
  'copulation',
  'copulate',
  'copulated',
  'copulates',
  'copulating',
  'coition',
  'coitus',
  'fornication',
  'fornicate',
  'fornicated',
  'fornicates',
  'fornicating',
  'fornicator',
  'fornicators',
  'fornicatress',
  'threesome',
  'orgy',
  'porn',
  'pornography',
  'pornographic',
  'penis',
  'vagina',
  'vulva',
  'pudendum',
  'pudenda',
  'genitals',
  'genitalia',
  'testicle',
  'testicles',
  'scrotum',
  'clitoris',
  'semen',
  'sperm',
  'sodomy',
  'sodomite',
  'sodomites',
  'masturbation',
  'masturbate',
  'orgasm',
  'catamite',
  'catamites',
  'pederast',
  'pederasty',
  'harlot',
  'harlots',
  'prostitute',
  'prostitutes',
  'prostituted',
  'prostitution',
  'strumpet',
  'strumpets',
  'brothel',
  'brothels',
  'pimp',
  'pimps',
  'sluttish',
  'inivit',
  'coivit',
  'coitu',
  'penem',
  'vulvam',
  'membrum',
  'compressed her',
  'lay with her',
];

function termPattern(terms: string[]): RegExp {
  return new RegExp(`(?<![\\w-])(?:${terms.map((t) => t.replace(/ /g, '\\s+')).join('|')})(?![\\w-])`, 'i');
}
const TERM_PATTERNS = {
  universal: termPattern(UNIVERSAL_TERMS),
  classical: termPattern([...UNIVERSAL_TERMS, ...CLASSICAL_TERMS]),
};

export type TermSet = keyof typeof TERM_PATTERNS;

export function blockedTermReason(text: string, set: TermSet = 'universal'): string | null {
  const match = TERM_PATTERNS[set].exec(text);
  return match ? `term:${match[0].toLowerCase().replace(/\s+/g, ' ')}` : null;
}

export interface KaikkiSenseLike {
  tags?: string[];
  categories?: unknown[];
  topics?: string[];
  raw_tags?: string[];
}

export function categoryName(category: unknown): string | undefined {
  if (typeof category === 'string') return category;
  if (typeof category === 'object' && category !== null && 'name' in category) {
    const name = (category as { name: unknown }).name;
    return typeof name === 'string' ? name : undefined;
  }
  return undefined;
}

export function blockedKaikkiReason(sense: KaikkiSenseLike): string | null {
  const tag = sense.tags?.find((t) => KAIKKI_TAGS.has(t));
  if (tag) return `tag:${tag}`;
  for (const category of sense.categories ?? []) {
    const name = categoryName(category);
    if (name === undefined) continue;
    const kind = KAIKKI_CATEGORY.exec(name)?.[1];
    if (kind) return `category:${kind}`;
    if (KAIKKI_TOPICS.has(name)) return `topic:${name}`;
  }
  return null;
}

export function blockedOewnReason(sense: { exemplifies?: string[] }, synset: { exemplifies?: string[] }): string | null {
  for (const id of sense.exemplifies ?? []) if (OEWN_SENSE_DOMAINS[id]) return OEWN_SENSE_DOMAINS[id] as string;
  for (const id of synset.exemplifies ?? []) if (OEWN_SYNSET_DOMAINS[id]) return OEWN_SYNSET_DOMAINS[id] as string;
  return null;
}

export function blockedKaikkiFrReason(sense: KaikkiSenseLike): string | null {
  const tag = sense.tags?.find((t) => KAIKKI_TAGS.has(t));
  if (tag) return `tag:${tag}`;
  const rawTag = sense.raw_tags?.find((t) => KAIKKI_FR_RAW_TAGS.has(t));
  if (rawTag) return `raw-tag:${rawTag}`;
  for (const category of sense.categories ?? []) {
    const kind = KAIKKI_FR_CATEGORY.exec(categoryName(category) ?? '')?.[1];
    if (kind) return `category:${kind}`;
  }
  const topic = sense.topics?.find((t) => KAIKKI_FR_TOPICS.has(t));
  return topic ? `topic:${topic}` : null;
}

export function blockedKaikkiFrEntryReason(entry: { categories?: unknown[] }): string | null {
  for (const category of entry.categories ?? []) {
    const kind = KAIKKI_FR_ENTRY_CATEGORY.exec(categoryName(category) ?? '')?.[1];
    if (kind) return `entry-category:${kind}`;
  }
  return null;
}

const JMDICT_MISC = new Set(['vulg', 'X', 'derog']);
const JMDICT_CLASSICAL_MISC = new Set(['sl', 'col', 'euph']);

export function blockedJmdictReason(misc: string[], gloss: string): string | null {
  const tag = misc.find((m) => JMDICT_MISC.has(m));
  if (tag) return `misc:${tag}`;
  return blockedTermReason(gloss, misc.some((m) => JMDICT_CLASSICAL_MISC.has(m)) ? 'classical' : 'universal');
}

const FRENCH_TERMS =
  /(?<!\p{L})(relations? sexuelles?|rapports? sexuels?|actes? sexuels?|coït|copuler|copulation|forniquer|sodomiser|sodomie|masturber|masturbation|prostituées?|putains?|putes?|bordels?|maisons? closes?|maisons? de passe)(?!\p{L})/iu;

// French translation headers, matched on whole words: sexual acts and vulgar words.
export function blockedFrenchTermReason(text: string): string | null {
  const term = FRENCH_TERMS.exec(text)?.[1];
  return term ? `term:${term.toLowerCase()}` : null;
}

// Compared after core's Arabic fold (marks and tatweel dropped, ة→ه, alef forms→ا, ى→ي) on both sides.
const ARABIC_VULGAR = new Set(['ناك', 'ينيك', 'نيك', 'منيوك', 'متناك', 'قحبة', 'شرموطة', 'زب', 'كس', 'طيز'].map(normalizeKey));
const ARABIC_LETTERS = /[ء-يٮ-ۓۺ-ۿ]+/g;

// Whole Arabic words only: هُنَاكَ "there" contains ناك.
export function blockedArabicTerm(word: string): string | null {
  const runs = normalizeKey(word.normalize('NFKC')).match(ARABIC_LETTERS) ?? [];
  return runs.some((w) => ARABIC_VULGAR.has(w)) ? 'term:ar-vulgar' : null;
}

// Slurs whose tagged senses were dropped but whose other senses still carry the slur
// meaning without a usage tag (nigger: "a fellow black person"; darky: "dark-skinned
// person"); each pattern matches the gloss or the context of the senses to drop.
const SLUR_SENSES = new Map<string, RegExp>([
  ['nigger', /./],
  ['niggers', /./],
  ['darky', /dark-skinned person/],
  ['Wop', /./],
  ['Wops', /./],
  ['Yid', /^A Jew\.$/],
  ['paki', /^Alternative letter-case form of Paki\b/],
  ['Pakis', /^plural of Paki$/],
  ['bicot', /^wog\b/],
  ['wog', /offensive term/],
]);

export function isSlurSense(headword: string, sense: { gloss: string; parents?: string[] }): boolean {
  const pattern = SLUR_SENSES.get(headword);
  return Boolean(pattern) && [sense.gloss, ...(sense.parents ?? [])].some((text) => pattern!.test(text));
}
