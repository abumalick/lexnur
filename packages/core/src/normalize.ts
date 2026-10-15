const ARABIC_OR_NOT = /[\u0600-\u06FF]+|[^\u0600-\u06FF]+/g;
const STARTS_ARABIC = /^[\u0600-\u06FF]/;
const ARABIC_DROP = /[\u0640\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const ARABIC_FOLD_CHARS = /[\u0671\u0623\u0625\u0622\u0649\u0629]/g;
const ARABIC_FOLD: Record<string, string> = {
  '\u0671': '\u0627',
  '\u0623': '\u0627',
  '\u0625': '\u0627',
  '\u0622': '\u0627',
  '\u0649': '\u064A',
  '\u0629': '\u0647',
};
const ROOT_QUERY = /^[\u0621-\u064A](?:[\s-]+[\u0621-\u064A]){2,3}$/u;

function foldArabic(run: string): string {
  return run.replace(ARABIC_DROP, '').replace(ARABIC_FOLD_CHARS, (c) => ARABIC_FOLD[c] ?? c);
}

function foldOther(run: string): string {
  return run
    .normalize('NFD')
    .replace(/[^\P{M}゙゚]/gu, '')
    .normalize('NFC')
    .replace(/[\u30A1-\u30F6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae');
}

export function normalizeKey(text: string): string {
  return text
    .trim()
    .replace(/\s+/gu, ' ')
    .replace(ARABIC_OR_NOT, (run) => (STARTS_ARABIC.test(run) ? foldArabic(run) : foldOther(run)))
    .replace(/ {2,}/g, ' ')
    .trim();
}

export function normalizeRoot(root: string): string {
  return [...normalizeKey(root).replace(/[\s-]/g, '').replace(/\u0621/g, '\u0627')].join(' ');
}

export function parseRootQuery(query: string): string | null {
  const stripped = query.trim().replace(ARABIC_DROP, '');
  return ROOT_QUERY.test(stripped) ? normalizeRoot(stripped) : null;
}

export type Script = 'arabic' | 'latin' | 'han' | 'kana' | 'other';

export function detectScript(text: string): Script {
  for (const ch of text) {
    if (!/\p{L}/u.test(ch)) continue;
    if (/\p{Script=Arabic}/u.test(ch)) return 'arabic';
    if (/\p{Script=Latin}/u.test(ch)) return 'latin';
    if (/\p{Script=Han}/u.test(ch)) return 'han';
    if (/\p{scx=Hiragana}|\p{scx=Katakana}/u.test(ch)) return 'kana';
    return 'other';
  }
  return 'other';
}

export function prefixUpperBound(key: string): string {
  return `${key}\u{10FFFF}`;
}
