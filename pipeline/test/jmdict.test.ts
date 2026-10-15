import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizeKey } from '@lexnur/core';
import { describe, expect, it } from 'vitest';
import { newStats, type EntryRow } from '../src/rows.ts';
import { jmdictRows } from '../src/sources/jmdict.ts';
import { tempDir } from './tmp.ts';

const SAMPLE = new URL('./data/jmdict-sample.xml', import.meta.url).pathname;

async function rowsOf(path: string, limit = Infinity) {
  const stats = newStats();
  const rows: EntryRow[] = [];
  for await (const row of jmdictRows(path, { limit, stats })) rows.push(row);
  return { rows, stats };
}

const byHeadword = (rows: EntryRow[], headword: string) => rows.filter((r) => r.headword === headword);

describe('jmdictRows', () => {
  it('maps an entry to a primary row on the first kanji form with labels from the DTD', async () => {
    const { rows } = await rowsOf(SAMPLE);
    const [primary] = byHeadword(rows, '食べる');
    expect(primary).toEqual<EntryRow>({
      headword: '食べる',
      search_key: normalizeKey('食べる'),
      pos: 'Ichidan verb',
      root: null,
      gloss: 'to eat',
      sort_order: 0,
      body: {
        v: 1,
        transliteration: 'たべる',
        senses: [
          { gloss: 'to eat', labels: ['transitive verb'] },
          { gloss: 'to live on (e.g. a salary); to live off; to subsist on' },
        ],
      },
    });
  });

  it('adds alias rows for the other kanji forms and every reading, search-only forms included', async () => {
    const { rows } = await rowsOf(SAMPLE);
    const taberu = byHeadword(rows, '食べる');
    expect(taberu.map((r) => [r.search_key, r.sort_order])).toEqual([
      ['食べる', 0],
      ['喰べる', 1],
      ['たべる', 1],
    ]);
    const [primary, ...aliases] = taberu;
    for (const alias of aliases) expect(alias).toEqual({ ...primary, search_key: alias.search_key, sort_order: 1, alias: true });
    expect(primary).not.toHaveProperty('alias');
  });

  it('lists the other displayable kanji and readings as forms', async () => {
    const { rows } = await rowsOf(SAMPLE);
    expect(byHeadword(rows, '食べる')[0]?.body.forms).toBeUndefined();
    expect(byHeadword(rows, '食べ過ぎ')[0]?.body.forms).toEqual([{ label: 'kanji', form: '食べすぎ' }]);
    const nihon = byHeadword(rows, '日本');
    expect(nihon[0]?.body.transliteration).toBe('にほん');
    expect(nihon[0]?.body.forms).toEqual([{ label: 'reading', form: 'にっぽん' }]);
    expect(nihon.map((r) => r.search_key)).toEqual(['日本', 'にほん', 'にっぽん']);
  });

  it('heads a kana-only entry with its first reading and gives it no alias for that reading', async () => {
    const { rows } = await rowsOf(SAMPLE);
    const rowsOfEntry = byHeadword(rows, 'おしゃぶり');
    expect(rowsOfEntry.map((r) => [r.search_key, r.sort_order])).toEqual([['おしゃぶり', 0]]);
    expect(rowsOfEntry[0]?.body.transliteration).toBe('おしゃぶり');
  });

  it('heads an entry whose only kanji form is search-only with its reading, keeping the kanji as a key', async () => {
    const { rows } = await rowsOf(SAMPLE);
    const kochira = byHeadword(rows, 'こちらこそ');
    expect(kochira.map((r) => [r.search_key, r.sort_order])).toEqual([
      ['こちらこそ', 0],
      ['此方こそ', 1],
    ]);
    expect(kochira[0]?.body.forms).toBeUndefined();
  });

  it('heads an entry whose senses are all usually written in kana with its first reading', async () => {
    const { rows } = await rowsOf(SAMPLE);
    const arigatou = byHeadword(rows, 'ありがとう');
    expect(arigatou.map((r) => [r.search_key, r.sort_order])).toEqual([
      ['ありがとう', 0],
      ['有難う', 1],
      ['有り難う', 1],
      ['有りがとう', 1],
    ]);
    expect(arigatou[0]?.pos).toBe('interjection');
    expect(arigatou[0]?.body.forms).toEqual([
      { label: 'kanji', form: '有難う' },
      { label: 'kanji', form: '有り難う' },
    ]);
  });

  it('drops the romanized Japanese term from pos and label texts', async () => {
    const { rows } = await rowsOf(SAMPLE);
    const [nihon] = byHeadword(rows, '日本');
    expect(nihon?.pos).toBe('noun (common)');
    expect(nihon?.body.senses[0]?.labels).toBeUndefined();
  });

  it('checks slang, colloquial and euphemistic senses against the classical term list', async () => {
    const path = join(tempDir(), 'sample.xml');
    const sense = (misc: string, gloss: string) => ['<sense>', '<pos>&n;</pos>', misc, `<gloss>${gloss}</gloss>`, '</sense>'];
    writeFileSync(
      path,
      [
        '<!DOCTYPE JMdict [',
        '<!ENTITY n "noun (common) (futsuumeishi)">',
        '<!ENTITY sl "slang">',
        '<!ENTITY col "colloquial">',
        '<!ENTITY euph "euphemistic">',
        ']>',
        '<JMdict>',
        '<entry>',
        '<r_ele>',
        '<reb>あれ</reb>',
        '</r_ele>',
        ...sense('<misc>&sl;</misc>', 'orgy'),
        ...sense('<misc>&col;</misc>', 'threesome'),
        ...sense('<misc>&euph;</misc>', 'copulation'),
        ...sense('', 'orgy (wild party)'),
        '</entry>',
        '</JMdict>',
      ].join('\n'),
    );
    const { rows, stats } = await rowsOf(path);
    expect(rows[0]?.body.senses.map((s) => s.gloss)).toEqual(['orgy (wild party)']);
    expect(stats.droppedByReason).toEqual({ 'term:orgy': 1, 'term:threesome': 1, 'term:copulation': 1 });
  });

  it('drops vulgar and derogatory senses, then entries left without senses, and counts both', async () => {
    const { rows, stats } = await rowsOf(SAMPLE);
    expect(byHeadword(rows, 'おしゃぶり')[0]?.body.senses).toEqual([
      { gloss: 'teething ring; pacifier; dummy' },
    ]);
    expect(byHeadword(rows, 'ジャップ')).toEqual([]);
    expect(stats.droppedByReason).toEqual({ 'misc:vulg': 1, 'misc:derog': 1 });
    expect(stats.droppedSenses).toBe(2);
    expect(stats.droppedEntries).toBe(1);
  });

  it('labels a sense with its parts of speech only when they change from the previous kept sense', async () => {
    const path = join(tempDir(), 'sample.xml');
    const sense = (pos: string[], gloss: string, misc = '') => ['<sense>', ...pos.map((p) => `<pos>&${p};</pos>`), misc, `<gloss>${gloss}</gloss>`, '</sense>'];
    writeFileSync(
      path,
      [
        '<!DOCTYPE JMdict [',
        '<!ENTITY n "noun (common) (futsuumeishi)">',
        '<!ENTITY adv "adverb (fukushi)">',
        '<!ENTITY vulg "vulgar expression or word">',
        '<!ENTITY col "colloquial">',
        ']>',
        '<JMdict>',
        '<entry>',
        '<r_ele>',
        '<reb>あれ</reb>',
        '</r_ele>',
        ...sense(['adv', 'n'], 'one'),
        ...sense(['adv', 'n'], 'two', '<misc>&col;</misc>'),
        ...sense(['n'], 'dropped', '<misc>&vulg;</misc>'),
        ...sense(['adv'], 'three'),
        ...sense(['n'], 'four'),
        '</entry>',
        '</JMdict>',
      ].join('\n'),
    );
    const { rows } = await rowsOf(path);
    expect(rows[0]?.pos).toBe('adverb');
    expect(rows[0]?.body.senses).toEqual([
      { gloss: 'one', labels: ['noun (common)'] },
      { gloss: 'two', labels: ['colloquial'] },
      { gloss: 'three', labels: ['adverb'] },
      { gloss: 'four', labels: ['noun (common)'] },
    ]);
  });

  it('drops glosses with blocked terms, decodes XML entities and stops at the entry limit', async () => {
    const dir = tempDir();
    const path = join(dir, 'sample.xml');
    writeFileSync(
      path,
      [
        '<!DOCTYPE JMdict [',
        '<!ENTITY n "noun (common) (futsuumeishi)">',
        '<!ENTITY X "rude or X-rated term (not displayed in educational software)">',
        ']>',
        '<JMdict>',
        '<entry>',
        '<ent_seq>1</ent_seq>',
        '<r_ele>',
        '<reb>くそ</reb>',
        '</r_ele>',
        '<sense>',
        '<pos>&n;</pos>',
        '<gloss>shit</gloss>',
        '</sense>',
        '<sense>',
        '<pos>&n;</pos>',
        '<misc>&X;</misc>',
        '<gloss>rude</gloss>',
        '</sense>',
        '<sense>',
        '<pos>&n;</pos>',
        '<gloss>R&amp;D &lt;x&gt;</gloss>',
        '</sense>',
        '</entry>',
        '<entry>',
        '<ent_seq>2</ent_seq>',
        '<r_ele>',
        '<reb>あ</reb>',
        '</r_ele>',
        '<sense>',
        '<pos>&n;</pos>',
        '<gloss>ah</gloss>',
        '</sense>',
        '</entry>',
        '</JMdict>',
      ].join('\n'),
    );
    const { rows, stats } = await rowsOf(path, 1);
    expect(rows.map((r) => r.headword)).toEqual(['くそ']);
    expect(rows[0]?.body.senses).toEqual([{ gloss: 'R&D <x>' }]);
    expect(stats.droppedByReason).toEqual({ 'term:shit': 1, 'misc:X': 1 });
  });

  it('keeps kana voicing distinct in search keys', () => {
    expect(normalizeKey('がっこう')).not.toBe(normalizeKey('かっこう'));
  });
});
