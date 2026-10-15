import { normalizeKey, type Body, type Form, type Sense } from '@lexnur/core';
import { blockedTermReason } from '../filter/content.ts';
import { countDrop, truncateGloss, type BuildStats, type EntryRow } from '../rows.ts';
import { parseXml, perseusEntries, perseusRoot, rootFor, textContent, tidy, type XmlNode } from './perseus.ts';
import { perseusToArabic, seatHamza } from './perseus-translit.ts';

const C = "[btvjHxd*rzs$SDTZEgfqklmnhwy']";
const CONSONANT = new RegExp(`[AwyY][\\^_=]|${C}`, 'g');
const V_TEMPLATE = new RegExp(`^(A\\^|${C})a(${C}\\^?)V(${C}\\^?)a$`);
const SOUND = "(?:[btvjHxd*rzs$SDTZEgfqklmnh']|[Awy]\\^)";
const V_PARTICIPLE = new RegExp(`^(${SOUND})a(${SOUND})V(${SOUND})a$`);

const PREPOSITIONS: Record<string, string> = {
  bi: 'بِـ',
  ala: 'عَلَى',
  fī: 'فِي',
  fi: 'فِي',
  an: 'عَنْ',
  la: 'لِـ',
  ila: 'إِلَى',
  min: 'مِنْ',
  bain: 'بَيْنَ',
};

const LABELS: Record<string, string> = {
  'n.ac.': 'verbal noun',
  'n.acc.': 'verbal noun',
  'n.p.': 'passive participle',
  'n.ag.': 'active participle',
  'pl.': 'plural',
  'du.': 'dual',
};

const label = (text: string) => LABELS[text.replace(/\s+/g, '').toLowerCase()] ?? tidy(text);
const bump = (counts: Map<string, number>, key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);

// Salmoné sometimes types l as L, and stacks alternative vowels on one letter (A^u_iSobauiE
// for أُصْبُع or إِصْبِع); the first is kept.
const spelling = (translit: string) =>
  translit.replace(/L/g, 'l').replace(/A\^([au])_i/g, 'A^$1').replace(/([aiu])[aiu]+/g, '$1');

function lastConsonant(word: string): string | null {
  const last = word.replace(/DolarR/g, '$').match(CONSONANT)?.at(-1);
  return last && last.length === 1 ? last : null;
}

// Salmoné prints "4" for the singular's last radical in plurals (A^aronab, pl. A^araAoni4u),
// and for the repeated last radical in a headword (duxolu4), which the root gives. After a
// long alif in a fuʿalāʾ plural (jaAohil, pl. jaholaAo4) it is the final hamza. Other
// digits and V are pattern placeholders with no substitute.
export function resolvePlaceholders(form: string, key: string, root: string | null): string | null {
  let out = form;
  if (out.includes('4')) {
    if (!key.includes('4') && /aAo4$/.test(out)) out = `${out.slice(0, -1)}'`;
    else {
      const sub = key.includes('4') ? lastConsonant(root ?? '') : lastConsonant(key);
      if (!sub) return null;
      out = out.replaceAll('4', sub);
    }
  }
  return /[0-9V]/.test(out) ? null : out;
}

interface Head {
  orth: string;
  label?: string;
  labels: string[];
  pos: string | null;
  forms: { label: string; translit: string }[];
}

const clean = (node: XmlNode | string) => tidy(textContent(node));

function readHead(form: XmlNode): Head | null {
  let head: { orth: XmlNode; label?: string; parent: XmlNode } | undefined;
  const forms: Head['forms'] = [];
  const visit = (node: XmlNode, inherited?: string) => {
    let current = inherited;
    for (const child of node.children) {
      if (typeof child === 'string') continue;
      if (child.tag === 'mood' || child.tag === 'number') current = label(clean(child));
      else if (child.tag !== 'orth') visit(child, current);
      else if (!head) head = { orth: child, label: current, parent: node };
      else forms.push({ label: current ?? 'variant', translit: clean(child) });
    }
  };
  visit(form);
  if (!head || !clean(head.orth)) return null;
  const itypes = head.parent.children.filter((c): c is XmlNode => typeof c !== 'string' && c.tag === 'itype');
  const conj = itypes.filter((t) => t.attrs.type === 'conj').map((t) => `form ${clean(t)}`);
  const vowels = itypes.filter((t) => t.attrs.type === 'vowel').map((t) => clean(t).toLowerCase());
  const labels = [...(head.label ? [head.label] : []), ...conj, ...(vowels.length ? [`aorist ${vowels.join(', ')}`] : [])];
  const pos = head.parent.attrs.type === 'n' ? 'noun' : !head.label && (conj.length || vowels.length) ? 'verb' : null;
  return { orth: clean(head.orth), label: head.label, labels, pos, forms };
}

// A preposition is sometimes tagged as a definition or as transliteration instead of subc.
const BRACKETED_PREPOSITION = /(?<=\[|\bor |& )'?(?:Bi|Ala|Fī|Fi|An|La|Ila|Min|Bain)(?=\]| or | &)/g;

function render(node: XmlNode | string, arabic: (translit: string) => string, vowels: string[]): string {
  if (typeof node === 'string') return node.replace(/_ast;/g, '');
  if (node.attrs.lang === 'ar') return ` ${arabic(clean(node))} `;
  if (node.tag === 'subc') return ` ${PREPOSITIONS[clean(node).replace(/^'/, '').toLowerCase()] ?? clean(node)} `;
  if (node.tag === 'itype' && node.attrs.type === 'vowel') {
    vowels.push(clean(node).toLowerCase());
    return ' ';
  }
  if (node.tag === 'pb' || (node.tag === 'itype' && /\d/.test(clean(node)))) return ' ';
  return ` ${node.children.map((c) => render(c, arabic, vowels)).join('')} `;
}

// A sense can open with the rest of a head bracket ("IV], …") or an aorist vowel ("U (n. ac. …)").
function senseOf(node: XmlNode, arabic: (translit: string) => string): Sense | null {
  const vowels: string[] = [];
  let gloss = tidy(
    tidy(render(node, arabic, vowels))
      .replace(BRACKETED_PREPOSITION, (p) => PREPOSITIONS[p.replace(/^'/, '').toLowerCase()]!)
      .replace(/\[\]/g, ''),
  ).replace(/^[,;.]\s*/, '');
  const labels: string[] = [];
  const conj = /^([IVX]+)\][.,)]*\s*/.exec(gloss);
  if (conj) {
    labels.push(`form ${conj[1]}`);
    gloss = gloss.slice(conj[0].length);
  }
  if (vowels.length) labels.push(`aorist ${vowels.join(', ')}`);
  if (!gloss) return null;
  return labels.length ? { gloss, labels } : { gloss };
}

export function* salmoneRows(xml: string, stats: BuildStats, limit = Infinity, counts = new Map<string, number>()): Generator<EntryRow> {
  const unknown = new Map<string, number>();
  let n = 0;
  for (const entry of perseusEntries(xml)) {
    stats.lines++;
    const node = parseXml(entry.xml).children[0] as XmlNode;
    const elements = node.children.filter((c): c is XmlNode => typeof c !== 'string');
    const formNode = elements.find((c) => c.tag === 'form');
    const head = formNode && readHead(formNode);
    if (!head) {
      bump(counts, 'no-headword');
      continue;
    }
    const resolve = (translit: string) => {
      const out = resolvePlaceholders(spelling(translit), entry.key, entry.root);
      if (out !== null && translit.includes('4')) bump(counts, '4:substituted');
      return out && (seatHamza(out) ?? out);
    };
    let orth = head.orth;
    const participle = head.label === 'passive participle' ? V_PARTICIPLE.exec(orth) : null;
    if (participle) {
      orth = `ma${participle[1]}o${participle[2]}uwo${participle[3]}`;
      bump(counts, 'V:participle');
    } else if (head.label === 'passive participle' && V_TEMPLATE.test(orth)) {
      bump(counts, 'V:weak-dropped');
      continue;
    }
    const resolved = resolvePlaceholders(spelling(orth), entry.key, entry.root);
    if (resolved === null) {
      bump(counts, 'placeholder:dropped-entry');
      continue;
    }
    if (orth.includes('4')) bump(counts, '4:substituted');
    const headTranslit = seatHamza(resolved);
    if (headTranslit === null) {
      bump(counts, 'hamza:dropped-entry');
      continue;
    }
    const headword = perseusToArabic(headTranslit, unknown);
    if (/[A-Za-z?@]/.test(headword)) {
      bump(counts, 'latin:dropped-entry');
      continue;
    }
    const forms: Form[] = [];
    for (const f of head.forms) {
      const t = f.translit && resolve(f.translit);
      if (!t) {
        if (f.translit) bump(counts, 'placeholder:dropped-form');
        continue;
      }
      const form = perseusToArabic(t, unknown);
      if (!forms.some((x) => x.label === f.label && x.form === form)) forms.push({ label: f.label, form });
    }
    const arabic = (translit: string) => {
      const t = resolve(translit);
      if (t === null) bump(counts, 'placeholder:dropped-inline');
      return t === null ? '' : perseusToArabic(t, unknown);
    };
    const senses: Sense[] = [];
    let filtered = false;
    for (const s of elements.filter((c) => c.tag === 'sense')) {
      const sense = senseOf(s, arabic);
      if (!sense) continue;
      const reason = blockedTermReason(sense.gloss, 'classical');
      if (reason) {
        countDrop(stats, reason);
        filtered = true;
      } else senses.push(sense);
    }
    if (!senses.length) {
      if (filtered) stats.droppedEntries++;
      else stats.noGlossEntries++;
      continue;
    }
    const labels = [...new Set([...head.labels, ...(senses[0]!.labels ?? [])])];
    if (labels.length) senses[0]!.labels = labels;
    const body: Body = { v: 1, senses };
    const root = rootFor(perseusRoot(entry.root), headword);
    if (perseusRoot(entry.root) && !root) bump(counts, 'root:nulled');
    if (forms.length) body.forms = forms;
    yield {
      headword,
      search_key: normalizeKey(headword),
      pos: head.pos,
      root,
      gloss: truncateGloss(senses[0]!.gloss),
      sort_order: 0,
      body,
    };
    if (++n >= limit) break;
  }
  for (const [ch, k] of unknown) counts.set(`unknown:${ch}`, k);
}
