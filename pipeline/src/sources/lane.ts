import { normalizeKey, normalizeRoot, type Body, type Sense } from '@lexnur/core';
import { blockedTermReason } from '../filter/content.ts';
import { countDrop, truncateGloss, type BuildStats, type EntryRow } from '../rows.ts';
import { parseXml, perseusEntries, perseusRoot, rootFor, textContent, tidy, type XmlNode } from './perseus.ts';
import { perseusToArabic, seatHamza } from './perseus-translit.ts';

// Lane starts a new sense at "-A2-" and at "― -b2-"; the markers themselves are not text.
const SECTION = /―?\s*-[Ab]\d+-/g;
const RADICAL = /[AwyY][\^_=]|./g;
const VOWEL_SIGN: Record<string, string> = { Ba: 'ـَ', Bi: 'ـِ', Bu: 'ـُ' };
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'];

const bump = (counts: Map<string, number>, key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);
const clean = (node: XmlNode | string) => tidy(textContent(node));

interface Arrow {
  headword: string;
  senses: Sense[];
  mains: string[];
  gloss: string;
}

const CITATION = /\s*\((?:[A-Z][A-Za-z' ]*[.,:;]?\s*)+\)/g;
const GRAMMAR = /^\[?(?:aor\.|inf\. n\.|pl\.|fem\.)[^,;:]*[,;:]\s*\]?\s*/;

// Lane drops the hamza sign on an alif that carries a vowel: initially (Aab~ara, but not the
// article in Aal~a*iY or Aall~`hu), after the article (AlAaHadi), and after a vowel or a
// sukun (taAab~aqa, A^a*oAala), seated by the stronger vowel around it; AaA is a madda.
// After a bare consonant the alif is long and its vowel was typed after it (fAadiHapN).
export function laneHamza(translit: string, count: (kind: string) => void): string {
  return translit
    .replace(/(^|\s)AaA/g, (_, pre: string) => {
      count('madda');
      return `${pre}A=`;
    })
    .replace(/(^|\s)Aa(?!l[l~o`])/g, (_, pre: string) => {
      count('initial');
      return `${pre}A^a`;
    })
    .replace(/(?<=Al)A(?=[au])/g, () => {
      count('article');
      return 'A^';
    })
    .replace(/(?<=[aiuo])A(?=[aiu])/g, (_, at: number, all: string) => {
      count('medial');
      const around = all[at - 1]! + all[at + 1]!;
      return around.includes('i') ? 'y^' : around.includes('u') ? 'w^' : 'A^';
    })
    .replace(/(?<=[btvjHxd*rzs$SDTZEgfqklmnhwyp'])Aa/g, () => {
      count('long-alif');
      return 'aA';
    });
}

// The English meaning starts at Lane's first capitalised italic and runs to its clause end;
// without one, the leading grammar (aor. …, inf. n. …) is skipped.
function meaningOf(section: string, italic: string | undefined): string {
  const from = italic && /^.*?(?=[:;]|\.(?:\s|$))/.exec(tidy(italic.replace(CITATION, '')))?.[0].replace(/,$/, '');
  if (from) return from;
  let rest = section;
  for (let m = GRAMMAR.exec(rest); m && m[0]; m = GRAMMAR.exec(rest)) rest = rest.slice(m[0].length);
  return firstSentence(rest || section);
}

// Lane prints the aorist as its vowel alone; the encoders spelled it as a verb (katuba).
function aorist(form: XmlNode): string | undefined {
  const orth = form.children.find((c): c is XmlNode => typeof c !== 'string' && c.tag === 'orth');
  return orth && VOWEL_SIGN[orth.attrs.orig ?? ''];
}

function firstSentence(text: string): string {
  return /^.*?[.!?](?=\s+[A-Z(]|$)/.exec(text)?.[0] ?? text;
}

function formLabel(itype: string): { label: string; verb: boolean } {
  const n = Number(itype);
  if (ROMAN[n]) return { label: `form ${ROMAN[n]}`, verb: true };
  return { label: itype, verb: /^(R\. )?Q\.( Q\.)? \d+$/.test(itype) };
}

export function* laneRows(files: Iterable<string>, stats: BuildStats, limit = Infinity, counts = new Map<string, number>()): Generator<EntryRow> {
  const unknown = new Map<string, number>();
  let radicals: string[] = [];
  let where = 'body';
  // Lane's encoders wrote 1, 2, 3 for the root's radicals and V for an unknown stem vowel.
  const toTranslit = (translit: string) => {
    const filled = translit.replace(/[1-4]/g, (d) => {
      const r = radicals[Number(d) - 1];
      if (r) bump(counts, 'radical:filled');
      return r === 'A' ? 'A^' : (r ?? d);
    });
    if (filled.includes('V')) bump(counts, 'V:dropped');
    return laneHamza(filled.replace(/V/g, ''), (kind) => bump(counts, `hamza:${where}-${kind}`));
  };
  const arabic = (translit: string) => {
    const t = toTranslit(translit);
    return perseusToArabic(seatHamza(t) ?? t, unknown);
  };
  let n = 0;
  let root: string | null | undefined;
  let rootKey: string | null = null;
  let arrows = new Map<string, Arrow>();
  let mainKeys = new Set<string>();
  const guard = (headword: string) => {
    const r = rootFor(rootKey, headword);
    if (rootKey && !r) bump(counts, 'root:nulled');
    return r;
  };
  function* flush(): Generator<EntryRow> {
    for (const [key, a] of arrows) {
      if (mainKeys.has(key)) {
        bump(counts, 'arrow:main-duplicate');
        continue;
      }
      if (/[A-Za-z?@]/.test(a.headword) || key.length < 2) {
        bump(counts, 'arrow:junk-dropped');
        continue;
      }
      yield {
        headword: a.headword,
        search_key: key,
        pos: null,
        root: guard(a.headword),
        gloss: truncateGloss(a.gloss),
        sort_order: 1,
        body: { v: 1, senses: a.senses, relations: [{ kind: 'related', words: a.mains }] },
      };
    }
    arrows = new Map();
    mainKeys = new Set();
  }
  done: for (const file of files) {
    for (const entry of perseusEntries(file)) {
      stats.lines++;
      if (entry.root !== root) {
        for (const row of flush()) {
          yield row;
          if (++n >= limit) break done;
        }
        root = entry.root;
        // Lane names a doubled root by two letters (wd for wdd).
        const letters = perseusRoot(root) ? (root!.replace(/^Quasi /, '').match(RADICAL) ?? []) : [];
        radicals = letters.length === 2 && !/^[AY]/.test(letters[1]!) ? [...letters, letters[1]!] : letters;
        rootKey = radicals.length ? normalizeRoot(perseusToArabic(radicals.join(''))) : null;
      }
      const node = parseXml(entry.xml).children[0] as XmlNode;
      const head = node.children.find((c): c is XmlNode => typeof c !== 'string' && c.tag === 'form');
      const orth = head?.children.find((c): c is XmlNode => typeof c !== 'string' && c.tag === 'orth' && clean(c) !== '*');
      if (!head || !orth || !clean(orth)) {
        bump(counts, 'no-headword');
        continue;
      }
      where = 'head';
      const headTranslit = seatHamza(toTranslit(clean(orth)));
      where = 'body';
      if (headTranslit === null) {
        bump(counts, 'hamza:dropped-entry');
        continue;
      }
      const headword = perseusToArabic(headTranslit, unknown);
      if (/[0-9]/.test(headword)) {
        bump(counts, 'placeholder:dropped-entry');
        continue;
      }
      if (/[A-Za-z?@]/.test(headword)) {
        bump(counts, 'latin:dropped-entry');
        continue;
      }
      const itype = head.children.find((c): c is XmlNode => typeof c !== 'string' && c.tag === 'itype');
      const form = itype ? formLabel(clean(itype)) : null;

      let text = '';
      const found: { translit: string; at: number }[] = [];
      const italics: number[] = [];
      const render = (c: XmlNode | string) => {
        if (typeof c === 'string') text += c;
        else if (c === head || c.tag === 'pb') text += ' ';
        else if (c.tag === 'form' && c.attrs.n === 'infl' && aorist(c)) text += ` ${aorist(c)} `;
        else if (c.attrs.lang === 'la') bump(counts, 'latin:dropped');
        else if (c.attrs.lang === 'ar') {
          if (c.attrs.type === 'arrow') found.push({ translit: clean(c), at: text.length });
          text += ` ${arabic(clean(c))} `;
        } else {
          text += ' ';
          if (c.tag === 'hi') italics.push(text.length);
          c.children.forEach(render);
          text += ' ';
        }
      };
      node.children.forEach(render);

      const bounds = [0, ...[...text.matchAll(SECTION)].flatMap((m) => [m.index, m.index + m[0].length]), text.length];
      const senses: Sense[] = [];
      const meanings: string[] = [];
      let filtered = false;
      for (let i = 0; i < bounds.length; i += 2) {
        const [start, end] = [bounds[i]!, bounds[i + 1]!];
        const gloss = tidy(text.slice(start, end)).replace(/^[,;:.]\s*/, '');
        if (!gloss) continue;
        const reason = blockedTermReason(gloss, 'classical');
        if (reason) {
          countDrop(stats, reason);
          filtered = true;
          continue;
        }
        const italic = italics.find((at) => at >= start && at < end && /^\s*[A-Z]/.test(text.slice(at, at + 3)));
        const meaning = meaningOf(gloss, italic === undefined ? undefined : text.slice(italic, end));
        senses.push({ gloss });
        meanings.push(meaning);
        for (const f of found.filter((x) => x.at >= start && x.at < end)) {
          if (/\s/.test(f.translit)) {
            bump(counts, 'arrow:phrase-skipped');
            continue;
          }
          const word = arabic(f.translit);
          const key = normalizeKey(word);
          const a = arrows.get(key) ?? { headword: word, senses: [], mains: [], gloss: meaning };
          arrows.set(key, a);
          if (!a.senses.some((s) => s.gloss === gloss)) a.senses.push({ gloss });
          if (!a.mains.includes(headword)) a.mains.push(headword);
        }
      }
      if (!senses.length) {
        if (filtered) stats.droppedEntries++;
        else stats.noGlossEntries++;
        continue;
      }
      if (form) senses[0] = { ...senses[0]!, labels: [form.label] };
      const body: Body = { v: 1, senses };
      mainKeys.add(normalizeKey(headword));
      yield {
        headword,
        search_key: normalizeKey(headword),
        pos: form?.verb ? 'verb' : null,
        root: guard(headword),
        gloss: truncateGloss(meanings[0]!),
        sort_order: 0,
        body,
      };
      if (++n >= limit) break done;
    }
  }
  if (n < limit) {
    for (const row of flush()) {
      yield row;
      if (++n >= limit) break;
    }
  }
  for (const [ch, k] of unknown) counts.set(`unknown:${ch}`, k);
}
