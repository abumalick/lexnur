import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { newStats, type EntryRow } from '../src/rows.ts';
import { perseusToArabic } from '../src/sources/perseus-translit.ts';
import { resolvePlaceholders, salmoneRows } from '../src/sources/salmone.ts';

const sample = readFileSync(new URL('./data/salmone-sample.xml', import.meta.url), 'utf8');
const ar = (s: string) => perseusToArabic(s);

function build(xml = sample) {
  const stats = newStats();
  const counts = new Map<string, number>();
  const rows = [...salmoneRows(xml, stats, Infinity, counts)];
  return { rows, stats, counts };
}

const byKey = (rows: EntryRow[], translit: string) => rows.filter((r) => r.headword === ar(translit));

describe('salmoneRows', () => {
  const { rows, counts } = build();

  it('makes one row per entryFree with the orth converted to Arabic script', () => {
    expect(rows).toHaveLength(22);
    expect(rows[0]).toMatchObject({ headword: 'أَبَّ', search_key: 'اب', root: 'ا ب ب', pos: 'verb', sort_order: 0 });
  });

  it('keeps the aorist vowels and the masdars of a form I verb', () => {
    const [row] = byKey(rows, 'A^ab~a');
    expect(row!.body.senses).toEqual([
      { gloss: '[لِـ], Prepared, got ready to, for.', labels: ['aorist i, u'] },
      { gloss: '[إِلَى], Yearned for, longed to see (home).' },
    ]);
    expect(row!.body.forms).toEqual(['A^ab~', 'A^abaAob', 'A^abaAobap', 'A^abiyob'].map((t) => ({ label: 'verbal noun', form: ar(t) })));
    expect(row!.gloss).toBe('[لِـ], Prepared, got ready to, for.');
  });

  it('labels a derived form with its conjugation', () => {
    const [x] = byKey(rows, 'A_isotaA^obaba');
    expect(x).toMatchObject({ headword: 'اِسْتَأْبَبَ', pos: 'verb', root: 'ا ب ب' });
    expect(x!.body.senses).toEqual([{ gloss: 'Adopted as father.', labels: ['form X'] }]);
    const [viii] = byKey(rows, 'A_iwotadana');
    expect(viii!.body.senses[0]).toEqual({ gloss: 'see I (a).', labels: ['form VIII'] });
  });

  it('marks nouns and keeps cross-references as text with their Arabic converted', () => {
    const [noun] = byKey(rows, 'A^ab~');
    expect(noun).toMatchObject({ pos: 'noun', gloss: 'Herbage, pasture.' });
    const [father] = byKey(rows, 'A^ab');
    expect(father).toMatchObject({ pos: null, gloss: `Father (see ${ar('A^abawa')}).` });
  });

  it('converts Arabic inside senses and drops Salmoné pattern numbers', () => {
    const [row] = byKey(rows, 'wadana');
    expect(row!.body.senses[0]!.gloss).toBe(`[${ar('yadinu')}] (n. ac. ${ar('wadon')}, ${ar('widaAon')}), Wetted, soaked.`);
  });

  it('substitutes the placeholder 4 in a plural with the last consonant of the singular', () => {
    const [row] = byKey(rows, 'A^aronab');
    expect(row!.body.forms).toEqual([{ label: 'plural', form: 'أَرَانِبُ' }]);
    expect(counts.get('4:substituted')).toBe(1);
  });

  it('drops a V passive participle of a root with a weak radical', () => {
    expect(byKey(rows, 'mawoduwon')).toEqual([]);
    expect(counts.get('V:weak-dropped')).toBe(1);
  });

  it('reconstructs the form I passive participle of a sound root that Salmoné writes with a V', () => {
    const xml = `<div2 n="'mr" type="root"><entryFree key="A^amVra" type="main"><form><mood>N. P.</mood><form><orth lang="ar">A^amVra</orth><itype type="conj">I</itype></form>,</form><sense n="a">Official.</sense></entryFree></div2>`;
    const { rows: out, counts: c } = build(xml);
    expect(out[0]).toMatchObject({ headword: 'مَأْمُوْر', root: 'ا م ر', pos: null, gloss: 'Official.' });
    expect(out[0]!.body.senses[0]!.labels).toEqual(['passive participle', 'form I']);
    expect(c.get('V:participle')).toBe(1);
  });

  it('writes the prepositions of a construction in Arabic', () => {
    const xml = `<div2 n="ktb" type="root"><entryFree key="kataba" type="main"><form><orth lang="ar">kataba</orth></form><sense n="a"><dictScrap>[<gramGrp><subc>Bi</subc><lbl>or</lbl><subc>'Ala</subc></gramGrp>], Wrote.</dictScrap></sense><sense n="b"><dictScrap>[<gramGrp><subc>Fī</subc></gramGrp>], [<subc>'An</subc>], [<subc>Min</subc>], [<subc>Bain</subc>], [<subc>Ila</subc>].</dictScrap></sense></entryFree></div2>`;
    const [row] = build(xml).rows;
    expect(row!.body.senses.map((s) => s.gloss)).toEqual(['[بِـ or عَلَى], Wrote.', '[فِي], [عَنْ], [مِنْ], [بَيْنَ], [إِلَى].']);
    const mistagged = `<div2 n="jmE" type="root"><entryFree key="A_ijotamaEa" type="main"><form><orth lang="ar">A_ijotamaEa</orth></form><sense n="d"><dictScrap>[<def>'Ala</def>], Agreed upon.</dictScrap></sense><sense n="e"><dictScrap><foreign lang="xlar">[Bi]</foreign>, Heeded.</dictScrap></sense></entryFree></div2>`;
    expect(build(mistagged).rows[0]!.body.senses.map((s) => s.gloss)).toEqual(['[عَلَى], Agreed upon.', '[بِـ], Heeded.']);
  });

  it('turns a conjugation or aorist vowel at the start of a sense into a label', () => {
    const xml = `<div2 n="jml" type="root"><entryFree key="mujomal" type="main"><form><orth lang="ar">mujomal</orth>[<mood>N. P.</mood></form><sense n="a">IV], Total, sum.</sense></entryFree><entryFree key="A^abada" type="main"><form><orth lang="ar">A^abada</orth><itype type="vowel">I</itype></form><sense n="a">Endured.</sense><sense n="c"><dictScrap><form><itype type="vowel">U</itype>(<form><mood>n. ac.</mood><form type="n"><orth lang="ar">A^ubuwod</orth><itype>27</itype></form></form></form>), Was enraged.</dictScrap></sense></entryFree></div2>`;
    const [noun, verb] = build(xml).rows;
    expect(noun!.body.senses).toEqual([{ gloss: 'Total, sum.', labels: ['form IV'] }]);
    expect(verb!.body.senses[1]).toEqual({ gloss: `(n. ac. ${ar('A^ubuwod')}), Was enraged.`, labels: ['aorist u'] });
  });

  it.each([
    ['IV] Administration.', 'Administration.', 'form IV'],
    ['IV]. Councillor.', 'Councillor.', 'form IV'],
    ['I]), Generous.', 'Generous.', 'form I'],
    ['II] [coll.], Rude.', '[coll.], Rude.', 'form II'],
  ])('labels the form number in "%s"', (text, gloss, label) => {
    const xml = `<div2 n="ktb" type="root"><entryFree key="k" type="main"><form><orth lang="ar">kataba</orth></form><sense n="a">${text}</sense></entryFree></div2>`;
    expect(build(xml).rows[0]!.body.senses[0]).toEqual({ gloss, labels: [label] });
  });

  it('drops empty brackets and maps prepositions joined by &', () => {
    const xml = `<div2 n="ktb" type="root"><entryFree key="k" type="main"><form><orth lang="ar">kataba</orth></form><sense n="a">[<gramGrp></gramGrp>], Wrote.</sense><sense n="b">[<def>Ila &amp; Bi</def>], Sent.</sense></entryFree></div2>`;
    expect(build(xml).rows[0]!.body.senses.map((s) => s.gloss)).toEqual(['Wrote.', '[إِلَى & بِـ], Sent.']);
  });

  it('seats a floating hamza in a headword, or drops the entry', () => {
    const xml = `<div2 n="'lf" type="root"><entryFree key="ta^oliyof" type="main"><form><orth lang="ar">ta^oliyof</orth></form><sense n="a">Composition.</sense></entryFree><entryFree key="s" type="main"><form><orth lang="ar">suw~^al</orth></form><sense n="a">Question.</sense></entryFree></div2>`;
    const { rows: out, counts: c } = build(xml);
    expect(out.map((r) => [r.headword, r.search_key])).toEqual([['تَأْلِيْف', 'تاليف']]);
    expect(c.get('hamza:dropped-entry')).toBe(1);
  });

  it('keeps the first of the alternative vowels Salmoné stacks on a letter', () => {
    const xml = `<div2 n="Sbe" type="root"><entryFree key="A^u_iSobauiE" type="main"><form><orth lang="ar">A^u_iSobauiE</orth></form><sense n="a">Finger.</sense></entryFree><entryFree key="A^a_inojiyol" type="main"><form><orth lang="ar">A^a_inojiyol</orth></form><sense n="a">Gospel.</sense></entryFree></div2>`;
    expect(build(xml).rows.map((r) => r.headword)).toEqual(['أُصْبَع', 'أَنْجِيْل'].map((w) => w.normalize('NFC')));
  });

  it('drops a headword left with Latin letters', () => {
    const xml = `<div2 n="Hrw" type="root"><entryFree key="HaraAwaO" type="main"><form><orth lang="ar">HaraAwaO</orth></form><sense n="a">x.</sense></entryFree></div2>`;
    const { rows: out, counts: c } = build(xml);
    expect(out).toEqual([]);
    expect(c.get('latin:dropped-entry')).toBe(1);
  });

  it('gives no root when a strong root letter is missing from the headword', () => {
    const xml = `<div2 n="xwt" type="root"><entryFree key="xawox" type="main"><form><orth lang="ar">xawox</orth></form><sense n="a">Peach.</sense></entryFree><entryFree key="xaAta" type="main"><form><orth lang="ar">xaAta</orth></form><sense n="a">Dived.</sense></entryFree></div2>`;
    const { rows: out, counts: c } = build(xml);
    expect(out.map((r) => r.root)).toEqual([null, 'خ و ت']);
    expect(c.get('root:nulled')).toBe(1);
  });

  it('labels a passive participle given as its verb', () => {
    const rows2 = byKey(rows, 'A^awodana');
    expect(rows2.map((r) => r.body.senses[0]!.labels)).toEqual([['form IV'], ['passive participle', 'form IV']]);
  });

  it('keeps alternative spellings as variants', () => {
    const xml = `<div2 n="'bt" type="root"><entryFree key="A^abata" type="main"><form><form><orth lang="ar">A^abata</orth><itype type="vowel">U</itype></form><form><orth orig="Bi" lang="ar">A^abita</orth><itype type="vowel">A</itype></form></form><sense n="a">Was warm.</sense></entryFree></div2>`;
    const [row] = build(xml).rows;
    expect(row!.body.forms).toEqual([{ label: 'variant', form: 'أَبِتَ' }]);
    expect(row!.body.senses[0]!.labels).toEqual(['aorist u']);
  });

  it('drops senses with a blocked term and entries left without senses', () => {
    const xml = `<div2 n="qwd" type="root"><entryFree key="qaw~aAod" type="main"><form><orth lang="ar">qaw~aAod</orth></form><sense n="a">Pimp.</sense><sense n="b">Leader.</sense></entryFree><entryFree key="x" type="main"><form><orth lang="ar">x</orth></form><sense n="a">Fornication.</sense></entryFree></div2>`;
    const { rows: out, stats } = build(xml);
    expect(out.map((r) => r.body.senses.map((s) => s.gloss))).toEqual([['Leader.']]);
    expect(stats.droppedByReason).toEqual({ 'term:pimp': 1, 'term:fornication': 1 });
    expect(stats.droppedEntries).toBe(1);
  });

  it('reads a capital L as the l it stands for', () => {
    const xml = `<div2 n="HTl" type="root"><entryFree key="HiTol" type="main"><form><orth lang="ar">HiToL</orth></form><sense n="a">Bit (<foreign lang="ar">qunoHaL</foreign>).</sense></entryFree></div2>`;
    const [row] = build(xml).rows;
    expect(row).toMatchObject({ headword: ar('HiTol'), gloss: `Bit (${ar('qunoHal')}).` });
  });

  it('gives no root when the div2 n is not 2 to 4 letters', () => {
    const xml = `<div2 n="A" type="root"><entryFree key="A" type="main"><form><orth lang="ar">A^a</orth></form><sense n="a">Hie!</sense></entryFree></div2>`;
    expect(build(xml).rows[0]!.root).toBeNull();
  });

  it('drops an entry whose headword is a digit placeholder template', () => {
    const xml = `<div2 n="rqm" type="root"><entryFree key="10" type="main"><form><orth lang="ar">10</orth></form><sense n="a">10, 9.</sense></entryFree></div2>`;
    const { rows: out, counts: c } = build(xml);
    expect(out).toEqual([]);
    expect(c.get('placeholder:dropped-entry')).toBe(1);
  });
});

describe('resolvePlaceholders', () => {
  it.each([
    ['A^araAoni4u', 'A^aronab', 'bdr', 'A^araAonibu'],
    ['bayaAodi4u', 'bayodar', 'byd', 'bayaAodiru'],
    ['jaraAobiyo4u', 'jurovuwomap', 'jrb', 'jaraAobiyomu'],
    ['duxolu4', 'duxolu4', 'dxl', 'duxolul'],
    ['daqaAoriyo4u', 'diqoraAo4', 'dqr', 'daqaAoriyoru'],
    ['jaholaAo4', 'jaAohil', 'jhl', "jaholaAo'"],
  ])('%s (key %s, root %s) → %s', (form, key, root, out) => {
    expect(resolvePlaceholders(form, key, root)).toBe(out);
  });

  it('gives null when a placeholder has no substitute', () => {
    expect(resolvePlaceholders('4', '10', 'rqm')).toBeNull();
    expect(resolvePlaceholders('la2V3a', 'n', 'n')).toBeNull();
  });

  it('converts to the expected Arabic', () => {
    expect(ar(resolvePlaceholders('A^araAoni4u', 'A^aronab', "'rn")!)).toBe('أَرَانِبُ');
    expect(ar(resolvePlaceholders('bayaAodi4u', 'bayodar', 'byd')!)).toBe('بَيَادِرُ');
  });
});
