import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { newStats } from '../src/rows.ts';
import { laneRows } from '../src/sources/lane.ts';
import { perseusToArabic } from '../src/sources/perseus-translit.ts';

const sample = readFileSync(new URL('./data/lane-sample.xml', import.meta.url), 'utf8');
const ar = (s: string) => perseusToArabic(s);

function build(...files: string[]) {
  const stats = newStats();
  const counts = new Map<string, number>();
  const rows = [...laneRows(files.length ? files : [sample], stats, Infinity, counts)];
  return { rows, stats, counts };
}

const wrap = (n: string, entries: string) => `<div2 n="${n}" type="root">${entries}</div2>`;

describe('laneRows', () => {
  const { rows } = build();

  it('makes rows for the main entries, untyped entries included, then one per arrow word', () => {
    expect(rows.map((r) => [r.headword, r.sort_order])).toEqual([
      [ar('kamaHa Ald~aAb~apa'), 0],
      [ar('A^akomaHa'), 0],
      [ar('kawomaHN'), 0],
      [ar('A^akomaHahaA'), 1],
    ]);
    expect(new Set(rows.map((r) => r.root))).toEqual(new Set(['ك م ح']));
  });

  it('labels a verb with its form and splits the text at the section markers', () => {
    const iv = rows[1]!;
    expect(iv.pos).toBe('verb');
    expect(iv.body.senses.map((s) => s.gloss)).toEqual([
      'See 1.',
      `${ar('AkmH Alkaromu')} The grape-vine became in a state of commotion preparatory to its putting forth its leaves. (S, K.)`,
      `${ar('AkmHt Alz~amaEapu')} The gem, or knot, in the place whence a bunch of grapes was about to grow forth became white, and what resembled cotton came forth upon it. (Az, on the authority of Et-Táïfee.)`,
      `See also ${ar('Akmx')} and ${ar('A^uqomiHa')}.`,
    ]);
    expect(iv.body.senses[0]!.labels).toEqual(['form IV']);
    expect(iv.gloss).toBe('See 1.');
  });

  it('drops the headword form and converts Arabic inline', () => {
    const [main] = rows;
    expect(main!.pos).toBe('verb');
    expect(main!.body.senses).toHaveLength(1);
    const gloss = main!.body.senses[0]!.gloss;
    expect(gloss.startsWith(`[aor. ـَ,] (inf. n. ${ar('kamoHN')}; M) and ↓ ${ar('A^akomaHahaA')}; i. q.`)).toBe(true);
    expect(gloss).toContain('signifies He pulled in the horse, or the like, by the bridle and bit');
    expect(gloss).not.toMatch(/[*]|ذ,/);
  });

  it('gives the first sentence of the first sense as the gloss', () => {
    expect(rows[2]!.gloss).toBe(`(and ${ar('kuwmaHN')}, L) A man (S) having large buttocks.`);
    expect(rows[2]!.pos).toBeNull();
  });

  it('gives an arrow word the sections it appears in and a link to its entry', () => {
    const arrow = rows[3]!;
    expect(arrow.body.senses).toEqual([{ gloss: rows[0]!.body.senses[0]!.gloss }]);
    expect(arrow.body.relations).toEqual([{ kind: 'related', words: [ar('kamaHa Ald~aAb~apa')] }]);
  });

  it('merges an arrow word repeated in one root and skips arrow phrases', () => {
    const xml = wrap(
      'ktb',
      '<entryFree key="a" type="main"><form><orth lang="ar">kataba</orth></form>He wrote; and ↓ <orth type="arrow" lang="ar">Akttb</orth>. ― -b2- He sewed; and ↓ <orth type="arrow" lang="ar">Akttb</orth>, and ↓ <orth type="arrow" lang="ar">rajulN kaAtibN</orth>.</entryFree>' +
        '<entryFree key="b" type="main"><form><orth lang="ar">kitaAbN</orth></form>A book; and ↓ <orth type="arrow" lang="ar">Akttb</orth>.</entryFree>',
    );
    const { rows: out, counts } = build(xml);
    const arrows = out.filter((r) => r.sort_order === 1);
    expect(arrows).toHaveLength(1);
    expect(arrows[0]!.body.senses.map((s) => s.gloss)).toEqual([`He wrote; and ↓ ${ar('Akttb')}.`, `He sewed; and ↓ ${ar('Akttb')}, and ↓ ${ar('rajulN kaAtibN')}.`, `A book; and ↓ ${ar('Akttb')}.`]);
    expect(arrows[0]!.body.relations).toEqual([{ kind: 'related', words: [ar('kataba'), ar('kitaAbN')] }]);
    expect(counts.get('arrow:phrase-skipped')).toBe(1);
  });

  it('drops a section with a blocked term and keeps the rest, with its arrows', () => {
    const xml = wrap(
      'ktb',
      '<entryFree key="a" type="main"><form><orth lang="ar">kataba</orth></form>He closed. -A2- He closed the vulva of a she-camel, ↓ <orth type="arrow" lang="ar">Akttb</orth>.</entryFree>',
    );
    const { rows: out, stats } = build(xml);
    expect(out.map((r) => r.body.senses.map((s) => s.gloss))).toEqual([['He closed.']]);
    expect(stats.droppedByReason).toEqual({ 'term:vulva': 1 });
  });

  it('keeps hi text and drops Latin passages', () => {
    const xml = wrap('ktb', '<entryFree key="a" type="main"><form><orth lang="ar">kataba</orth></form><hi rend="ital">He wrote</hi> <foreign lang="la">scripsit</foreign> it.</entryFree>');
    const { rows: out, counts } = build(xml);
    expect(out[0]!.body.senses[0]!.gloss).toBe('He wrote it.');
    expect(counts.get('latin:dropped')).toBe(1);
  });

  it('shows the aorist vowel as Lane prints it', () => {
    const xml = wrap('ktb', '<entryFree key="a" type="main"><form><orth lang="ar">kataba</orth></form>, aor. <form n="infl"><orth orig="Bu" lang="ar">katuba</orth></form>, He wrote.</entryFree>');
    expect(build(xml).rows[0]!.body.senses[0]!.gloss).toBe('aor. ـُ, He wrote.');
  });

  it('fills radical placeholders from the root and drops the stem-vowel placeholder', () => {
    const xml = wrap(
      '$b',
      '<entryFree><form><itype>5</itype><orth lang="ar">ta$ab~a3a</orth></form>see 1; and <foreign lang="ar">1a2u3a</foreign>.</entryFree>' +
        '<entryFree><form><itype>1</itype><orth lang="ar">$abVba</orth></form>It clung.</entryFree>',
    );
    const { rows: out, counts } = build(xml);
    expect(out.map((r) => r.headword)).toEqual([ar('ta$ab~aba'), ar('$abba')]);
    expect(out[0]!.body.senses[0]!.gloss).toBe(`see 1; and ${ar('$abuba')}.`);
    expect(counts.get('radical:filled')).toBe(4);
    expect(counts.get('V:dropped')).toBe(1);
  });

  it('drops an entry whose headword keeps a placeholder', () => {
    const xml = wrap('$Sw and $SY', '<entryFree><form><itype>2</itype><orth lang="ar">1a2~a3a</orth></form>see 1.</entryFree>');
    const { rows: out, counts } = build(xml);
    expect(out).toEqual([]);
    expect(counts.get('placeholder:dropped-entry')).toBe(1);
  });

  it('reads the root from the div2, past a Quasi prefix, and gives none for several roots', () => {
    const entry = '<entryFree key="a" type="main"><form><orth lang="ar">kataba</orth></form>He wrote.</entryFree>';
    expect(build(wrap('Quasi ktb', entry)).rows[0]!.root).toBe('ك ت ب');
    expect(build(wrap('ktE ktf ktl', entry)).rows[0]!.root).toBeNull();
  });

  it('spells out a doubled root, which Lane names by two letters', () => {
    const entry = '<entryFree key="a" type="main"><form><orth lang="ar">wad~a</orth></form>He loved.</entryFree>';
    expect(build(wrap('wd', entry)).rows[0]!.root).toBe('و د د');
    expect(build(wrap('*A', '<entryFree key="a" type="main"><form><orth lang="ar">*aA</orth></form>This.</entryFree>')).rows[0]!.root).toBe('ذ ا');
    expect(build(wrap(' wd ', entry)).rows[0]!.root).toBe('و د د');
  });

  it('glosses an entry with its first English meaning, without the citations', () => {
    expect(rows[0]!.gloss).toBe('He pulled in the horse, or the like, by the bridle and bit, in order that it might stop, and not run');
    const xml = wrap('ktb', '<entryFree key="a" type="main"><form><orth lang="ar">kataba</orth></form>, aor. <form n="infl"><orth orig="Bu" lang="ar">katuba</orth></form>, inf. n. <foreign lang="ar">katobN</foreign>; He wrote. (S.)</entryFree>');
    expect(build(xml).rows[0]!.gloss).toBe('He wrote.');
  });

  it('puts a hamza on an alif that carries a vowel', () => {
    const xml = wrap(
      'Abq',
      '<entryFree><form><itype>5</itype><orth lang="ar">taAab~aqa</orth></form>see <foreign lang="ar">Aab~ara</foreign> and <foreign lang="ar">AlAaHadi</foreign> and <foreign lang="ar">Aal~a*iY</foreign> and <foreign lang="ar">ziyAadapN</foreign>.</entryFree>' +
        '<entryFree><form><itype>1</itype><orth lang="ar">AaAraxa</orth></form>Dated.</entryFree>' +
        '<entryFree><form><itype>5</itype><orth lang="ar">ta1ab~a3a</orth></form>Fled.</entryFree>',
    );
    const { rows: out } = build(xml);
    expect(out.map((r) => r.headword)).toEqual(['تَأَبَّقَ', 'آرَخَ', 'تَأَبَّقَ'].map((w) => w.normalize('NFC')));
    expect(out[0]!.body.senses[0]!.gloss).toBe(`see ${'أَبَّرَ'.normalize('NFC')} and ${'الأَحَدِ'.normalize('NFC')} and ${ar('Aal~a*iY')} and ${'زِيَادَةٌ'.normalize('NFC')}.`);
  });

  it('gives no arrow row to a word that is a main entry of the root', () => {
    const xml = wrap('ktb', '<entryFree key="a" type="main"><form><orth lang="ar">kataba</orth></form>He wrote; and ↓ <orth type="arrow" lang="ar">kitaAbN</orth>.</entryFree><entryFree key="b" type="main"><form><orth lang="ar">kitaAbN</orth></form>A book.</entryFree>');
    const { rows: out, counts } = build(xml);
    expect(out.filter((r) => r.sort_order === 1)).toEqual([]);
    expect(counts.get('arrow:main-duplicate')).toBe(1);
  });

  it('drops a headword left with Latin letters and a root its headword does not carry', () => {
    const xml = wrap('ktb', '<entryFree key="a" type="main"><form><orth lang="ar">kaO</orth></form>x.</entryFree><entryFree key="b" type="main"><form><orth lang="ar">xawox</orth></form>A peach.</entryFree>');
    const { rows: out, counts } = build(xml);
    expect(out.map((r) => [r.headword, r.root])).toEqual([[ar('xawox'), null]]);
    expect(counts.get('latin:dropped-entry')).toBe(1);
    expect(counts.get('root:nulled')).toBe(1);
  });

  it('seats a hamza after a sukun and after a damma, and moves the vowel of a long alif', () => {
    const xml = wrap(
      '*Al',
      '<entryFree><form><itype>4</itype><orth lang="ar">A^a*oAala</orth></form>see <foreign lang="ar">waToAatuhu</foreign> and <foreign lang="ar">buruAapN</foreign> and <foreign lang="ar">fAadiHapN</foreign> and <foreign lang="ar">huzAalN</foreign>.</entryFree>',
    );
    const [row] = build(xml).rows;
    expect(row!.headword).toBe('أَذْأَلَ'.normalize('NFC'));
    expect(row!.body.senses[0]!.gloss).toBe(`see ${['وَطْأَتُهُ', 'بُرُؤَةٌ', 'فَادِحَةٌ', 'هُزَالٌ'].map((w) => w.normalize('NFC')).join(' and ')}.`);
  });

  it('drops arrow rows left with Latin letters, a question mark or a lone letter', () => {
    const xml = wrap(
      'jbA',
      '<entryFree key="a" type="main"><form><orth lang="ar">jab~a</orth></form>He cut; ↓ <orth type="arrow" lang="ar">jub~aA=\'N?</orth>, ↓ <orth type="arrow" lang="ar">p</orth>, ↓ <orth type="arrow" lang="ar">jib~apN</orth>.</entryFree>',
    );
    const { rows: out, counts } = build(xml);
    expect(out.filter((r) => r.sort_order === 1).map((r) => r.headword)).toEqual([ar('jib~apN')]);
    expect(counts.get('arrow:junk-dropped')).toBe(2);
  });
});
