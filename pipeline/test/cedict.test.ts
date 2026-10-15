import { describe, expect, it } from 'vitest';
import { cedictRows, pinyinKeys, pinyinToMarks } from '../src/sources/cedict.ts';
import { newStats, type EntryRow } from '../src/rows.ts';

const collect = async (it: AsyncIterable<EntryRow>) => {
  const out: EntryRow[] = [];
  for await (const r of it) out.push(r);
  return out;
};
const rows = async (lines: string[]) => {
  const stats = newStats();
  return { out: await collect(cedictRows(lines, stats)), stats };
};

describe('pinyinToMarks', () => {
  it('places tone marks on a/e, on o of ou, else on the last vowel', () => {
    expect(pinyinToMarks('ni3 hao3')).toBe('nǐ hǎo');
    expect(pinyinToMarks('xue2 xiao4')).toBe('xué xiào');
    expect(pinyinToMarks('gou3 lei4')).toBe('gǒu lèi');
    expect(pinyinToMarks('liu2 gui4')).toBe('liú guì');
    expect(pinyinToMarks('lu:4 e4 nu:3')).toBe('lǜ è nǚ');
    expect(pinyinToMarks('lu:e4')).toBe('lüè');
  });
  it('leaves the neutral tone, capitals and non-pinyin tokens alone', () => {
    expect(pinyinToMarks('ma5')).toBe('ma');
    expect(pinyinToMarks('Zhong1 guo2')).toBe('Zhōng guó');
    expect(pinyinToMarks('san1 P')).toBe('sān P');
    expect(pinyinToMarks('r5')).toBe('r');
  });
});

describe('pinyinKeys', () => {
  it('gives toneless keys with and without spaces, u: as u', () => {
    expect(pinyinKeys('ni3 hao3')).toEqual(['ni hao', 'nihao']);
    expect(pinyinKeys('nu:3')).toEqual(['nu']);
    expect(pinyinKeys('Zhong1 guo2')).toEqual(['zhong guo', 'zhongguo']);
  });
});

describe('cedictRows', () => {
  it('builds the primary row and alias rows', async () => {
    const { out } = await rows(['# comment', '學校 学校 [xue2 xiao4] /school/CL:所[suo3],個|个[ge4]/']);
    expect(out.map((r) => [r.headword, r.search_key, r.sort_order])).toEqual([
      ['学校', '学校', 0],
      ['学校', '學校', 1],
      ['学校', 'xue xiao', 1],
      ['学校', 'xuexiao', 1],
    ]);
    const body = out[0]!.body;
    expect(out.every((r) => r.body === body)).toBe(true);
    expect(body.transliteration).toBe('xué xiào');
    expect(body.forms).toEqual([{ label: 'traditional', form: '學校' }]);
    expect(body.senses).toEqual([{ gloss: 'school' }]);
    expect(body.notes).toEqual(['Measure words: 所 (suǒ), 个 (gè)']);
    expect(out[0]!.gloss).toBe('school');
  });
  it('skips the traditional alias and forms when identical, and duplicate pinyin keys', async () => {
    const { out } = await rows(['好 好 [hao3] /good/well/', '你好 你好 [ni3 hao3] /hello/hi/']);
    expect(out.map((r) => r.search_key)).toEqual(['好', 'hao', '你好', 'ni hao', 'nihao']);
    expect(out[0]!.body.forms).toBeUndefined();
    expect(out[0]!.body.senses.map((s) => s.gloss)).toEqual(['good', 'well']);
  });
  it('keys u: as u and shows ü', async () => {
    const { out } = await rows(['綠 绿 [lu:4] /green/']);
    expect(out.map((r) => r.search_key)).toEqual(['绿', '綠', 'lu']);
    expect(out[0]!.body.transliteration).toBe('lǜ');
  });
  it('turns leading usage labels into sense labels', async () => {
    const { out } = await rows(['書 书 [shu1] /(literary) book/(bound form) writing/']);
    expect(out[0]!.body.senses).toEqual([
      { gloss: 'book', labels: ['literary'] },
      { gloss: 'writing', labels: ['bound form'] },
    ]);
  });
  it('drops labelled senses and counts them', async () => {
    const { out, stats } = await rows([
      'X1 X1 [a1] /(vulgar) rude one/fine one/',
      'X2 X2 [b1] /(offensive) bad/(derogatory term for people) worse/(coarse) coarse/',
      'X3 X3 [c1] /(vulgar, offensive) both/',
      'X5 X5 [e1] /(derog.) abbreviated/(curse word) oath/',
      'X4 X4 [d1] /a shit thing/okay/',
    ]);
    expect(out.map((r) => r.headword)).toEqual(['X1', 'X1', 'X4', 'X4']);
    expect(out[0]!.body.senses.map((s) => s.gloss)).toEqual(['fine one']);
    expect(out[2]!.body.senses.map((s) => s.gloss)).toEqual(['okay']);
    expect(stats.droppedByReason).toEqual({
      'label:vulgar': 2,
      'label:offensive': 1,
      'label:derogatory': 2,
      'label:curse word': 1,
      'label:coarse': 1,
      'term:shit': 1,
    });
    expect(stats.droppedEntries).toBe(3);
  });
  it('drops blocked labels anywhere in the gloss and after other labels', () => {
    return rows([
      'A A [a1] /(Tw) (vulgar) what the hell?/fine/',
      'B B [b1] /(old) (derog.) Japanese person/',
      'C C [c1] /soldier (derog.)/soldier/',
      'D D [d1] /to scold (usually derog.)/',
    ]).then(({ out, stats }) => {
      expect(out.map((r) => r.headword)).toEqual(['A', 'C']);
      expect(stats.droppedByReason).toEqual({ 'label:vulgar': 1, 'label:derogatory': 3 });
    });
  });
  it('turns region labels into labels', async () => {
    const { out } = await rows(['E E [e1] /(Tw) (coll.) hi/']);
    expect(out[0]!.body.senses).toEqual([{ gloss: 'hi', labels: ['Tw', 'coll.'] }]);
  });
  it('checks slang and euphemism senses against the classical term set', async () => {
    const { out, stats } = await rows([
      '3P 3P [san1 P] /(slang) threesome/',
      'F F [f1] /(Internet slang) porn video/',
      'G G [g1] /threesome in a band name/',
    ]);
    expect(out.map((r) => r.headword)).toEqual(['G']);
    expect(stats.droppedByReason).toEqual({ 'term:threesome': 1, 'term:porn': 1 });
  });
  it('marks alias rows', async () => {
    const { out } = await rows(['學校 学校 [xue2 xiao4] /school/']);
    expect(out.map((r) => r.alias)).toEqual([undefined, true, true, true]);
  });
  it('counts malformed lines', async () => {
    const { out, stats } = await rows(['not a line', '']);
    expect(out).toEqual([]);
    expect(stats.malformed).toBe(1);
  });
  it('respects the limit on entries', async () => {
    const stats = newStats();
    const out = await collect(cedictRows(['A A [a1] /a/', 'B B [b1] /b/'], stats, 1));
    expect(out.map((r) => r.headword)).toEqual(['A']);
  });
});
