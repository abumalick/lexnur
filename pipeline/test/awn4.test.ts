import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { awn4Rows, describeJoin, loadAwn4, parseAwn4, readAwn4 } from '../src/sources/awn4.ts';
import { loadOewn, type OewnEntries, type OewnSynsets } from '../src/sources/oewn.ts';
import { SOURCES } from '../src/paths.ts';
import { newStats, type EntryRow } from '../src/rows.ts';

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<LexicalResource>
  <Lexicon id="awn4" language="arb">
    <LexicalEntry id="awn4-e1">
      <Lemma writtenForm="كَتَبَ" partOfSpeech="v" script="Arab"/>
      <Sense id="awn4-s1" synset="awn4-01702148-v"/>
    </LexicalEntry>
    <LexicalEntry id="awn4-e2">
      <Lemma writtenForm="أَلَّفَ" partOfSpeech="v" script="Arab"/>
      <Sense id="awn4-s2" synset="awn4-01702148-v" n="1"/>
      <Sense id="awn4-s3" synset="awn4-00000009-v" n="2"/>
    </LexicalEntry>
    <LexicalEntry id="awn4-e3">
      <Lemma writtenForm="خَفِيف" partOfSpeech="a" script="Arab"/>
      <Sense id="awn4-s4" synset="awn4-00000002-a"/>
    </LexicalEntry>
    <LexicalEntry id="awn4-e4">
      <Lemma writtenForm="سَاطِع" partOfSpeech="s" script="Arab"/>
      <Sense id="awn4-s5" synset="awn4-00000001-s"/>
    </LexicalEntry>
    <LexicalEntry id="awn4-e5">
      <Lemma writtenForm="كَلِمَة &quot;بَذِيئَة&quot;" partOfSpeech="n" script="Arab"/>
      <Sense id="awn4-s6" synset="awn4-99999999-n"/>
    </LexicalEntry>
    <Synset id="awn4-01702148-v" ili="i100" partOfSpeech="v"><Definition>إنتاج عمل أدبي</Definition></Synset>
    <Synset id="awn4-00000009-v" ili="i999" partOfSpeech="v"><Definition>محذوف</Definition></Synset>
    <Synset id="awn4-00000002-a" ili="i200" partOfSpeech="a"><Definition>غير ثقيل</Definition></Synset>
    <Synset id="awn4-00000001-s" ili="" partOfSpeech="s"><Definition>لامع</Definition></Synset>
    <Synset id="awn4-99999999-n" ili="i300" partOfSpeech="n"><Definition>كلمة</Definition></Synset>
  </Lexicon>
</LexicalResource>`;

const synsets: OewnSynsets = {
  '01702148-v': { definition: ['produce a literary work'], members: ['write', 'compose'], partOfSpeech: 'v', ili: 'i100' },
  '00000002-a': { definition: ['not heavy'], members: ['light'], partOfSpeech: 'a', ili: 'i200' },
  '00000001-s': { definition: ['bright'], members: ['light', 'bright'], partOfSpeech: 's', ili: 'in' },
  '99999999-n': { definition: ['an offensive word'], members: ['badword'], partOfSpeech: 'n', ili: 'i300', exemplifies: ['07139048-n'] },
  '00000005-n': { definition: ['a written work'], members: ['write'], partOfSpeech: 'n', ili: 'i400' },
};
const entries: OewnEntries = {
  write: {
    v: { sense: [{ id: 'write%2:36:00::', synset: '01702148-v' }] },
    n: { sense: [{ id: 'write%1:10:00::', synset: '00000005-n' }] },
  },
  compose: { v: { sense: [{ id: 'compose%2:36:00::', synset: '01702148-v' }] } },
  light: {
    a: { sense: [{ id: 'light%3:00:00::', synset: '00000002-a' }] },
    s: { sense: [{ id: 'light%5:00:00::', synset: '00000001-s' }] },
  },
  badword: { n: { sense: [{ id: 'badword%1:10:00::', synset: '99999999-n' }] } },
};

describe('parseAwn4', () => {
  it('collects Arabic lemmas per synset in file order, with the ILI', () => {
    const { lemmas, ili } = parseAwn4(xml);
    expect(lemmas.get('01702148-v')).toEqual(['كَتَبَ', 'أَلَّفَ']);
    expect(lemmas.get('99999999-n')).toEqual(['كَلِمَة "بَذِيئَة"']);
    expect(ili.get('01702148-v')).toBe('i100');
    expect(ili.get('00000001-s')).toBe('');
  });
});

describe('awn4Rows', () => {
  const run = () => {
    const stats = newStats();
    const join = loadAwn4(parseAwn4(xml), synsets);
    return { rows: [...awn4Rows({ entries, synsets }, join.lemmas, stats)], join, stats };
  };

  it('maps an English lemma and part of speech to Arabic lemmas through the ILI', () => {
    const write = run().rows.find((r) => r.headword === 'write');
    expect(write).toEqual<EntryRow>({
      headword: 'write',
      search_key: 'write',
      pos: 'verb',
      root: null,
      gloss: 'كَتَبَ، أَلَّفَ',
      sort_order: 0,
      body: {
        v: 1,
        senses: [
          {
            gloss: 'كَتَبَ، أَلَّفَ',
            parents: ['produce a literary work'],
            links: [
              ['كَتَبَ', 'كَتَبَ'],
              ['أَلَّفَ', 'أَلَّفَ'],
            ],
          },
        ],
      },
    });
  });

  it('gives every member of the synset its own row', () => {
    expect(run().rows.find((r) => r.headword === 'compose')?.gloss).toBe('كَتَبَ، أَلَّفَ');
  });

  it('joins a synset without an ILI on its id and merges satellite adjectives', () => {
    const light = run().rows.filter((r) => r.headword === 'light');
    expect(light).toHaveLength(1);
    expect(light[0]?.pos).toBe('adjective');
    expect(light[0]?.body.senses.map((s) => [s.gloss, s.parents])).toEqual([
      ['خَفِيف', ['not heavy']],
      ['سَاطِع', ['bright']],
    ]);
  });

  it('skips synsets without Arabic lemmas and counts the empty entry', () => {
    const { rows, stats } = run();
    expect(rows.some((r) => r.headword === 'write' && r.pos === 'noun')).toBe(false);
    expect(stats.noGlossEntries).toBe(1);
  });

  it('drops senses in the offensive usage domains', () => {
    const { rows, stats } = run();
    expect(rows.some((r) => r.headword === 'badword')).toBe(false);
    expect(stats).toMatchObject({ droppedSenses: 1, droppedEntries: 1, droppedByReason: { 'oewn:obscenity': 1 } });
  });

  it('reports the join counts', () => {
    expect(run().join).toMatchObject({ synsets: 5, byIli: 3, byId: 1, missed: 1 });
  });

  it('stops at the limit', () => {
    const join = loadAwn4(parseAwn4(xml), synsets);
    expect([...awn4Rows({ entries, synsets }, join.lemmas, newStats(), 1)]).toHaveLength(1);
  });
});

describe.skipIf(!existsSync(SOURCES.awn4) || !existsSync(SOURCES.oewnZip))('AWN4 source', () => {
  it('joins most AWN4 synsets to OEWN 2025 and builds over 100k rows', { timeout: 120_000 }, () => {
    const oewn = loadOewn(SOURCES.oewnZip);
    const join = loadAwn4(parseAwn4(readAwn4(SOURCES.awn4)), oewn.synsets);
    expect(join.missed / join.synsets).toBeLessThan(0.15);
    const rows = [...awn4Rows(oewn, join.lemmas, newStats())];
    expect(rows.length).toBeGreaterThan(100_000);
    const write = rows.find((r) => r.headword === 'write' && r.pos === 'verb');
    expect(write?.body.senses.some((s) => s.parents?.includes('produce a literary work'))).toBe(true);
  });
});

describe('awn4 join collisions and filters', () => {
  const awn = (entries: [string, string][], synsets: [string, string][]) =>
    `<LexicalResource>${entries
      .map(([lemma, synset], i) => `<LexicalEntry id="e${i}"><Lemma writtenForm="${lemma}" partOfSpeech="n"/><Sense id="s${i}" synset="awn4-${synset}"/></LexicalEntry>`)
      .join('')}${synsets.map(([id, ili]) => `<Synset id="awn4-${id}" ili="${ili}" partOfSpeech="n"></Synset>`).join('')}</LexicalResource>`;

  it('merges the Arabic lemmas of AWN4 synsets that reach the same OEWN synset', () => {
    const xml = awn(
      [
        ['بَيْت', '00000001-n'],
        ['مَنْزِل', '00000002-n'],
        ['بَيْت', '00000002-n'],
      ],
      [
        ['00000001-n', 'i1'],
        ['00000002-n', 'i1'],
      ],
    );
    const oewn: OewnSynsets = { '00000001-n': { definition: ['a dwelling'], members: ['house'], partOfSpeech: 'n', ili: 'i1' } };
    const join = loadAwn4(parseAwn4(xml), oewn);
    expect(join.lemmas.get('00000001-n')).toEqual(['بَيْت', 'مَنْزِل']);
    expect(join.merged).toBe(1);
    expect(describeJoin(join)).toContain('1 merged into an OEWN synset already joined');
  });

  it('counts OEWN synsets that share an ILI', () => {
    const oewn: OewnSynsets = {
      '00000001-n': { definition: ['a'], members: ['a'], partOfSpeech: 'n', ili: 'i1' },
      '00000002-n': { definition: ['b'], members: ['b'], partOfSpeech: 'n', ili: 'i1' },
    };
    const join = loadAwn4(parseAwn4(awn([['أ', '00000001-n']], [['00000001-n', 'i1']])), oewn);
    expect(join.sharedIli).toBe(1);
    expect(describeJoin(join)).toContain('1 OEWN synsets share an ILI with another');
  });

  it('drops senses whose definition or Arabic gloss holds a blocked term, and counts them', () => {
    const oewn: OewnSynsets = {
      '00000001-n': { definition: ['a dwelling'], members: ['house'], partOfSpeech: 'n' },
      '00000002-n': { definition: ['a shitty house'], members: ['house'], partOfSpeech: 'n' },
      '00000003-n': { definition: ['a hut'], members: ['house'], partOfSpeech: 'n' },
    };
    const arabic = new Map([
      ['00000001-n', ['بَيْت']],
      ['00000002-n', ['كوخ']],
      ['00000003-n', ['whore']],
    ]);
    const entries: OewnEntries = {
      house: { n: { sense: ['00000001-n', '00000002-n', '00000003-n'].map((synset, i) => ({ id: `house%${i}`, synset })) } },
    };
    const stats = newStats();
    const rows = [...awn4Rows({ entries, synsets: oewn }, arabic, stats)];
    expect(rows[0]?.body.senses.map((s) => s.gloss)).toEqual(['بَيْت']);
    expect(stats.droppedByReason).toEqual({ 'term:shitty': 1, 'term:whore': 1 });
  });

  it('keeps one sense per synset within an entry', () => {
    const oewn: OewnSynsets = { '00000001-n': { definition: ['a dwelling'], members: ['house'], partOfSpeech: 'n' } };
    const entries: OewnEntries = {
      house: {
        'n-1': { sense: [{ id: 'house%1', synset: '00000001-n' }] },
        'n-2': { sense: [{ id: 'house%2', synset: '00000001-n' }] },
      },
    };
    const rows = [...awn4Rows({ entries, synsets: oewn }, new Map([['00000001-n', ['بَيْت']]]), newStats())];
    expect(rows[0]?.body.senses).toHaveLength(1);
  });
});
