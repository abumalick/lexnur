import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FRENCH_TRANSLATIONS, kaikkiTranslationRows, mapTranslationGroup, type TranslatedEntry } from '../src/sources/kaikki-translations.ts';
import { newStats, type BuildStats, type EntryRow } from '../src/rows.ts';

const SAMPLE = join(import.meta.dirname, 'data', 'kaikki-frar-translations-sample.jsonl');

async function rows(stats: BuildStats = newStats()): Promise<EntryRow[]> {
  const out: EntryRow[] = [];
  for await (const row of kaikkiTranslationRows(SAMPLE, 'ar', { limit: Infinity, stats }, FRENCH_TRANSLATIONS)) out.push(row);
  return out;
}

const map = (entry: Partial<TranslatedEntry>, stats = newStats()) =>
  mapTranslationGroup([{ word: 'mot', lang_code: 'fr', pos: 'noun', senses: [{ glosses: ['Sens.'] }], ...entry }].map((e) => FRENCH_TRANSLATIONS.adapt!(e)), 'ar', stats, FRENCH_TRANSLATIONS);

describe('kaikkiTranslationRows (French edition → Arabic)', () => {
  it('maps eau to one sense per French sense header with Arabic glosses and links, and phonemic IPA', async () => {
    const eau = (await rows()).find((r) => r.headword === 'eau');
    expect(eau).toMatchObject({ search_key: 'eau', pos: 'noun', root: null, sort_order: 0, gloss: 'ماء' });
    expect(eau?.body.senses).toEqual([
      { gloss: 'ماء', parents: ['Liquide transparent'], links: [['ماء', 'ماء']] },
      { gloss: 'مَطَر', parents: ['Pluie'], links: [['مَطَر', 'مَطَر']] },
      { gloss: 'لعم، لعاب', parents: ['Salive'], links: [['لعم', 'لعم'], ['لعاب', 'لعاب']] },
      { gloss: 'عَرَق', parents: ['Sueur'], links: [['عَرَق', 'عَرَق']] },
    ]);
    expect(eau?.body.ipa).toEqual(['/o/']);
  });

  it('keeps the domestic cat of chat although another French sense is vulgar', async () => {
    const stats = newStats();
    const chat = (await rows(stats)).find((r) => r.headword === 'chat');
    expect(chat?.body.senses).toEqual([{ gloss: 'قط، قطة، هر', parents: ['Chat domestique'], links: [['قط', 'قط'], ['قطة', 'قطة'], ['هر', 'هر']] }]);
  });

  it('puts a headerless item under the first French gloss (système)', async () => {
    const systeme = (await rows()).find((r) => r.headword === 'système');
    expect(systeme?.body.senses).toEqual([
      { gloss: 'نظام', parents: ['Ensemble d’éléments, de concepts reliés, organisés en une structure.'], links: [['نظام', 'نظام']] },
    ]);
  });

  it('drops fornication for its entry-level sexuality lexicon and counts each item', async () => {
    const stats = newStats();
    expect((await rows(stats)).map((r) => r.headword)).not.toContain('fornication');
    expect(stats.droppedByReason).toEqual({ 'entry-category:sexualité': 3 });
    expect(stats.droppedEntries).toBe(1);
  });

  it('drops an item whose sense_index names a blocked French sense', () => {
    const stats = newStats();
    const row = map(
      {
        senses: [{ glosses: ['Animal.'] }, { glosses: ['Personne méprisable.'], tags: ['pejorative'] }],
        translations: [
          { lang_code: 'ar', word: 'حيوان', sense: 'Animal', sense_index: 1 },
          { lang_code: 'ar', word: 'وغد', sense: 'Injure', sense_index: 2 },
        ],
      },
      stats,
    );
    expect(row?.body.senses.map((s) => s.gloss)).toEqual(['حيوان']);
    expect(stats.droppedByReason).toEqual({ 'sense:blocked': 1 });
  });

  it('ignores French function words when matching a header to a blocked gloss (viande de mouton)', () => {
    const row = map({
      senses: [{ glosses: ['Mammifère ruminant.'] }, { glosses: ['Personne grégaire, de caractère docile comme un mouton.'], tags: ['pejorative'] }],
      translations: [{ lang_code: 'ar', word: 'لحم الخروف', sense: 'viande de mouton' }],
    });
    expect(row?.body.senses.map((s) => s.gloss)).toEqual(['لحم الخروف']);
  });

  it('groups a headerless item and a header that differ only by the final period, showing the first (beau)', () => {
    const row = map({
      word: 'beau',
      pos: 'adj',
      senses: [{ glosses: ['D’aspect agréable à l’œil ou à l’oreille.'] }],
      translations: [
        { lang_code: 'ar', word: 'جَمِيل' },
        { lang_code: 'ar', word: 'جميل', sense: 'D’aspect agréable à l’œil ou à l’oreille', sense_index: 1 },
      ],
    });
    expect(row?.body.senses).toEqual([
      { gloss: 'جَمِيل، جميل', parents: ['D’aspect agréable à l’œil ou à l’oreille.'], links: [['جَمِيل', 'جَمِيل'], ['جميل', 'جميل']] },
    ]);
  });

  it('drops the sexual sense of baiser by its French header and keeps the kiss', () => {
    const stats = newStats();
    const row = map(
      {
        word: 'baiser',
        pos: 'verb',
        senses: [
          { glosses: ['Appliquer sa bouche sur le visage, sur les lèvres, sur la main de quelqu’un.'], tags: ['transitive'] },
          { glosses: ['Mettre vit au con, piner, tringler, troncher.'], tags: ['euphemism', 'intransitive', 'vulgar'] },
        ],
        translations: [
          { lang_code: 'ar', word: 'قَبَّلَ', sense: 'Donner un baiser' },
          { lang_code: 'ar', word: 'ينيك', sense: 'Avoir des relations sexuelles' },
          { lang_code: 'ar', word: 'ناك', sense: 'Avoir des relations sexuelles' },
        ],
      },
      stats,
    );
    expect(row?.body.senses.map((s) => s.gloss)).toEqual(['قَبَّلَ']);
    expect(stats.droppedByReason).toEqual({ 'term:relations sexuelles': 2 });
  });

  it('drops an item whose Arabic word is vulgar even under a neutral header', () => {
    const stats = newStats();
    const row = map({ translations: [{ lang_code: 'ar', word: 'ناك', sense: 'Sens' }, { lang_code: 'ar', word: 'سيارة', sense: 'Sens' }] }, stats);
    expect(row?.body.senses.map((s) => s.gloss)).toEqual(['سيارة']);
    expect(stats.droppedByReason).toEqual({ 'term:ar-vulgar': 1 });
  });

  it('keeps هُنَاكَ, which contains ناك', () => {
    expect(map({ translations: [{ lang_code: 'ar', word: 'هُنَاكَ', sense: 'À cet endroit' }] })?.body.senses).toEqual([
      { gloss: 'هُنَاكَ', parents: ['À cet endroit'], links: [['هُنَاكَ', 'هُنَاكَ']] },
    ]);
  });

  it('drops only the vulgar word of a gloss (دَاعِرَة، قَحْبَة keeps دَاعِرَة)', () => {
    const stats = newStats();
    const row = map({ translations: [{ lang_code: 'ar', word: 'دَاعِرَة', sense: 'Femme' }, { lang_code: 'ar', word: 'قَحْبَة', sense: 'Femme' }] }, stats);
    expect(row?.body.senses).toEqual([{ gloss: 'دَاعِرَة', parents: ['Femme'], links: [['دَاعِرَة', 'دَاعِرَة']] }]);
    expect(stats.droppedByReason).toEqual({ 'term:ar-vulgar': 1 });
  });

  it('leaves out a word with no Arabic letter (nègre: abid)', () => {
    expect(map({ translations: [{ lang_code: 'ar', word: "'abid", sense: 'Esclave noir' }] })).toBeNull();
    expect(map({ translations: [{ lang_code: 'ar', word: "'abid" }, { lang_code: 'ar', word: 'عبد' }] })?.body.senses.map((s) => s.gloss)).toEqual(['عبد']);
  });

  it('skips an item marked with an Arab country as regional usage', () => {
    const stats = newStats();
    const row = map({ translations: [{ lang_code: 'ar', word: 'خنفسة', raw_tags: ['Égypte, Koweït'] }, { lang_code: 'ar', word: 'سيارة' }] }, stats);
    expect(row?.body.senses.map((s) => s.gloss)).toEqual(['سيارة']);
    expect(stats.skippedByReason).toEqual({ 'dialect:Égypte, Koweït': 1 });
  });
});
