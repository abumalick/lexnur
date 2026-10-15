import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { kaikkiRows, mapKaikkiGroup, type KaikkiEntry, type KaikkiMapOptions } from '../src/sources/kaikki.ts';
import { FRENCH } from '../src/sources/kaikki-fr.ts';
import { newStats, type BuildStats, type EntryRow } from '../src/rows.ts';

const SAMPLE = join(import.meta.dirname, 'data', 'kaikki-fr-sample.jsonl');
const FR: KaikkiMapOptions = { lang: 'ar', maxSenses: 30, tables: false, edition: FRENCH };

async function rows(stats: BuildStats = newStats()): Promise<EntryRow[]> {
  const out: EntryRow[] = [];
  for await (const row of kaikkiRows(SAMPLE, FR, { limit: Infinity, stats })) out.push(row);
  return out;
}

const map = (entry: Partial<KaikkiEntry>) =>
  mapKaikkiGroup([FRENCH.adapt({ word: 'سيارة', lang_code: 'ar', pos: 'noun', senses: [{ glosses: ['Voiture.'] }], ...entry })], FR, newStats());

describe('French-edition Kaikki (ar→fr)', () => {
  it('maps the verb كَتَبَ with its root, transliteration, IPA, etymology and French glosses', async () => {
    const ktb = (await rows()).find((r) => r.pos === 'verb');
    expect(ktb).toMatchObject({ headword: 'كَتَبَ', search_key: 'كتب', root: 'ك ت ب', gloss: 'écrire (absolument).', sort_order: 0 });
    expect(ktb?.body.transliteration).toBe('kataba');
    expect(ktb?.body.ipa).toEqual(['/ka.ta.ba/']);
    expect(ktb?.body.etymology).toMatch(/^Application du schème زَرَزَ/);
    expect(ktb?.body.senses).toHaveLength(11);
    expect(ktb?.body.senses[0]?.examples).toEqual([{ text: 'كَتَبَ كِتَابًا نَفَسًا', translation: 'Il a écrit une longue lettre.' }]);
    expect(ktb?.body.senses[2]).toMatchObject({ gloss: 'écrire quelque chose (+ب) à quelqu\'un (+إلى)', parents: ['écrire quelque chose (avec accusatif).'] });
  });

  it('splits the homographs شعر into two rows under their vowelled headwords', async () => {
    const [shir, shar] = (await rows()).filter((r) => r.search_key === 'شعر');
    expect(shir).toMatchObject({ headword: 'شِعْر', root: 'ش ع ر', gloss: 'Poésie.' });
    expect(shir?.body.relations).toEqual([{ kind: 'related', words: ['أَشْعار'] }]);
    expect(shar).toMatchObject({ headword: 'شَعْر', root: 'ش ع ر', gloss: 'Cheveu.' });
    expect(shar?.body.senses[0]?.examples).toEqual([{ text: 'رَجُلٌ رَجَلُ ٱلشَّعْرِ', translation: 'Un homme aux cheveux ondulés.' }]);
  });

  it('drops the offensive sense of عبد and counts it', async () => {
    const stats = newStats();
    const abd = (await rows(stats)).find((r) => r.search_key === 'عبد');
    expect(abd).toMatchObject({ headword: 'عَبْد', root: 'ع ب د', gloss: 'Esclave, serf.' });
    expect(abd?.body.senses.map((s) => s.gloss)).toEqual(['Esclave, serf.', 'Serviteur.', 'serviteur de Dieu.']);
    expect(stats.droppedByReason).toMatchObject({ 'tag:offensive': 1 });
  });

  it('drops the whole entry عُسَيْلَةٌ for its entry-level sexuality category and counts each sense', async () => {
    const stats = newStats();
    expect((await rows(stats)).find((r) => r.search_key === 'عسيله')).toBeUndefined();
    expect(stats.droppedByReason).toEqual({ 'tag:offensive': 1, 'entry-category:sexualité': 3 });
    expect(stats.droppedEntries).toBe(1);
  });

  it('keeps an entry whose page-level category is only Termes péjoratifs', () => {
    expect(map({ categories: ['Termes péjoratifs en arabe'] })?.body.senses).toHaveLength(1);
  });

  it.each([
    ['Termes vulgaires en arabe', 'category:Termes vulgaires'],
    ['Insultes en arabe', 'category:Insultes'],
    ['Termes péjoratifs en arabe', 'category:Termes péjoratifs'],
  ])('drops a sense in the category %s', (category, reason) => {
    const stats = newStats();
    const row = mapKaikkiGroup([FRENCH.adapt({ word: 'x', lang_code: 'ar', pos: 'noun', senses: [{ glosses: ['a'], categories: [category] }, { glosses: ['b'] }] })], FR, stats);
    expect(row?.body.senses.map((s) => s.gloss)).toEqual(['b']);
    expect(stats.droppedByReason).toEqual({ [reason]: 1 });
  });

  it('reads a Latin-only header as the transliteration', () => {
    expect(map({ raw_tags: ['sayyāratun', 'سيارة'] })?.body.transliteration).toBe('sayyāratun');
  });

  it('ignores header parts that are not a transliteration or do not match the word', () => {
    const row = map({ word: '٩', raw_tags: ['٩, 9 \\tis.ʕa.tun\\'] });
    expect(row).toMatchObject({ headword: '٩' });
    expect(row?.body.transliteration).toBeUndefined();
    expect(row?.body.ipa).toEqual(['/tis.ʕa.tun/']);
    expect(map({ raw_tags: ['genre à préciser : {{m}}, {{f}}, {{mf}}, {{n}} ?'] })?.body.transliteration).toBeUndefined();
    expect(map({ raw_tags: ['كِتَابٌ, kitābun \\ki.taː.bun\\'] })).toMatchObject({ headword: 'سيارة', body: { senses: [{ gloss: 'Voiture.' }] } });
    expect(map({ raw_tags: ['كِتَابٌ, kitābun \\ki.taː.bun\\'] })?.body).not.toHaveProperty('transliteration');
  });

  it('takes a root only from a spaced etymology link, not from a linked word', () => {
    expect(map({ etymology_links: [['أَلْـ', 'أَلْـ#ar'], ['لَعْنَةٌ', 'لَعْنَةٌ#ar'], ['لَعَنَ', 'لَعَنَ#ar']] })?.root).toBeNull();
    expect(map({ etymology_links: [['لَعَنَ', 'لَعَنَ#ar'], ['ل ع ن', 'ل ع ن#ar']] })?.root).toBe('ل ع ن');
  });

  it('keeps one IPA when the header and a sound give the same transcription', () => {
    expect(map({ raw_tags: ['سيارة, sayyāra \\maː.ʔun\\'], sounds: [{ ipa: '[maː.ʔun]' }, { ipa: '\\maː.ʔun\\' }, { ipa: '[maːʔ]' }] })?.body.ipa).toEqual(['/maː.ʔun/', '[maːʔ]']);
  });

  it('writes sound IPA between slashes', () => {
    expect(map({ sounds: [{ ipa: '\\xar.ʃuf\\' }] })?.body.ipa).toEqual(['/xar.ʃuf/']);
  });
});
