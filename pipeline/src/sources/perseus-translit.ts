// Perseus Arabic texts use a Buckwalter variant: ^ and _ put a hamza above or
// below the preceding letter, = is a madda, A@ is alif wasla, Y^ a yaa seat and
// YB a dotted yaa; Lane adds Persian letters and "DolarR" is a corrupted $.
// Salmoné marks long alif with a sukun ("Ao"), which Arabic script does not write.
// "4" stands for a radical the reader takes from the headword; it is left for the caller.
const MULTI: Record<string, string> = {
  DolarR: 'ش',
  'A@': 'ٱ',
  Ao: 'ا',
  'Y^': 'ئ',
  YB: 'ي',
};

const SINGLE: Record<string, string> = {
  "'": 'ء',
  A: 'ا',
  b: 'ب',
  t: 'ت',
  v: 'ث',
  j: 'ج',
  H: 'ح',
  x: 'خ',
  d: 'د',
  '*': 'ذ',
  r: 'ر',
  z: 'ز',
  s: 'س',
  $: 'ش',
  S: 'ص',
  D: 'ض',
  T: 'ط',
  Z: 'ظ',
  E: 'ع',
  g: 'غ',
  f: 'ف',
  q: 'ق',
  k: 'ك',
  l: 'ل',
  m: 'م',
  n: 'ن',
  h: 'ه',
  w: 'و',
  y: 'ي',
  Y: 'ى',
  p: 'ة',
  P: 'پ',
  J: 'چ',
  C: 'ژ',
  G: 'گ',
  a: '\u064E',
  u: '\u064F',
  i: '\u0650',
  o: '\u0652',
  '~': '\u0651',
  F: '\u064B',
  N: '\u064C',
  K: '\u064D',
  '`': '\u0670',
  '^': '\u0654',
  _: '\u0655',
  '=': '\u0653',
};

const C = "(?:[btvjHxd*rzs$SDTZEgfqklmnhwyY']\\^?|A\\^)";
const STEM = `(?:a${C}a${C}|i${C}aA=?${C})`;
// Forms VII–XII and quadriliteral III–IV (perfect, or masdar for VII–X), VIII of
// hamzated roots (Salmoné writes A_ay^ota… for A_iy^ota…), and the nouns ibn, ism, imraʾ, ithnān, ist.
const WASLA = new RegExp(
  [
    `ino${C}${STEM}`,
    `i${C}o[tdT]${STEM}`,
    `i${C}~${STEM}`,
    `i${C}o${C}a${C}~a`,
    `i${C}o${C}i${C}aA=?${C}`,
    `isota${C}o${C}a${C}`,
    `isoti${C}o${C}aA=?${C}`,
    `i${C}o${C}aA${C}~a`,
    `i${C}o${C}awo${C}a${C}`,
    `i${C}o${C}a${C}a${C}~a`,
    `i${C}o${C}ano${C}a${C}`,
    `[ai]y\\^ota`,
    'ibon(?!aA)',
    'isom(?!aA|`)',
    'imor(?!aA(?!\\^))',
    'ivon(?:aAn|ataAn|ayon|atayon)',
    'isot[aiuNFK]?$',
  ]
    .map((p) => `^A_(?:${p})`)
    .join('|'),
);

// Salmoné writes hamzat wasl like a hamza below; those words get a bare alif.
// Other A_ is hamza below, or above before u and a.
export function alifUnderscore(word: string): string {
  if (WASLA.test(word.replace(/DolarR/g, '$').replace(/Ao/g, 'A'))) return 'ا';
  return /^A_[ua]/.test(word) ? 'أ' : 'إ';
}

const TOKEN = /DolarR|A[@o_]|Y\^|YB|[\s\S]/gu;
const PASS = /^[\s\p{P}\p{Script=Arabic}]$/u;

const SEATLESS = "[btvjHxd*rzs$SDTZEgfqklmnhp']";
const FLOATING = new RegExp(`(?<=[aiuo~FNK]|${SEATLESS})\\^`, 'g');

// A ^ after a vowel sign or a seatless letter has lost its seat. The seat follows the
// stronger of the vowels around the hamza (i, then u, then a); a final hamza after a
// sukun stands on the line. After a long vowel or a shadda the seat cannot be told.
export function seatHamza(word: string): string | null {
  let unresolved = false;
  const out = word.replace(FLOATING, (_, at: number) => {
    const x = word[at - 1]!;
    let prev = 'o';
    if (/[aiuo]/.test(x)) {
      if (!new RegExp(SEATLESS).test(word[at - 2] ?? '')) unresolved = true;
      prev = x;
    } else if (!new RegExp(SEATLESS).test(x)) unresolved = true;
    const next = word[at + 1] ?? '';
    const own = /[aiuo]/.test(next) ? next : /[\s\p{P}]|^$/u.test(next) ? 'end' : 'o';
    if (own === 'end') return { o: "'", a: 'A^', u: 'w^', i: 'y^' }[prev]!;
    if (prev === 'i' || own === 'i') return 'y^';
    if (prev === 'u' || own === 'u') return 'w^';
    return 'A^';
  });
  return unresolved ? null : out;
}

export function perseusToArabic(translit: string, unknown?: Map<string, number>): string {
  translit = translit.replace(/A_ay\^ota/g, 'A_iy^ota').replace(/(?<!a)AFA/g, 'FA');
  return translit
    .replace(TOKEN, (token, offset: number) => {
      if (token === 'A_') return alifUnderscore(/^\S*/.exec(translit.slice(offset))![0]);
      const arabic = MULTI[token] ?? SINGLE[token];
      if (arabic !== undefined) return arabic;
      if (!PASS.test(token) && unknown) unknown.set(token, (unknown.get(token) ?? 0) + 1);
      return token;
    })
    .normalize('NFC');
}
