import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { kaikkiTranslationRows, mapTranslationGroup, type TranslatedEntry } from '../src/sources/kaikki-translations.ts';
import { newStats, type BuildStats, type EntryRow } from '../src/rows.ts';

const SAMPLE = join(import.meta.dirname, 'data', 'kaikki-en-ar-sample.jsonl');

async function rows(stats: BuildStats = newStats()): Promise<EntryRow[]> {
  const out: EntryRow[] = [];
  for await (const row of kaikkiTranslationRows(SAMPLE, 'ar', { limit: Infinity, stats })) out.push(row);
  return out;
}

const glossesOf = (row: EntryRow | undefined) => row?.body.senses.map((s) => s.parents?.[0]);

describe('kaikkiTranslationRows', () => {
  it('maps book to one sense per English sense header, in source order', async () => {
    const book = (await rows()).find((r) => r.headword === 'book');
    expect(book).toMatchObject({ search_key: 'book', pos: 'noun', root: null, sort_order: 0 });
    expect(glossesOf(book)).toEqual([
      'collection of sheets of paper bound together containing printed or written material',
      'record of betting',
      'major division of a published work, larger than a chapter',
      'usually in plural: records of the accounts of a business',
    ]);
    expect(book?.body.senses[0]).toEqual({
      gloss: 'كِتَاب، سِفْر',
      parents: ['collection of sheets of paper bound together containing printed or written material'],
      links: [
        ['كِتَاب', 'كِتَاب'],
        ['سِفْر', 'سِفْر'],
      ],
    });
    expect(book?.gloss).toBe('كِتَاب، سِفْر');
    expect(book?.body.ipa?.length).toBeGreaterThan(0);
  });

  it('keeps roman out of the gloss and drops dialect forms', async () => {
    const write = (await rows()).find((r) => r.headword === 'write');
    expect(write?.body.senses[0]?.gloss).toBe('كَتَبَ');
    expect(write?.body.ipa).toEqual(['/ɹaɪt/', '[ɹaɪt]']);
    expect(JSON.stringify(write?.body)).not.toContain('kataba');
  });

  it('keeps the innocent sense of a mixed word and drops the paraphrased vulgar one (bitch)', async () => {
    const bitch = (await rows()).find((r) => r.headword === 'bitch');
    expect(glossesOf(bitch)).toEqual(['female canine']);
    expect(bitch?.body.senses[0]?.gloss).toBe('ثَعْلَبَة، كَلْبَة');
    expect(JSON.stringify(bitch)).not.toContain('قَحْبَة');
  });

  it('drops dog’s insult sense, whose header paraphrases a derogatory gloss, and keeps the animal', async () => {
    const dog = (await rows()).find((r) => r.headword === 'dog');
    expect(glossesOf(dog)).toEqual(['animal']);
  });

  it('merges both ass etymologies, keeps the donkey and drops the buttocks', async () => {
    const ass = (await rows()).filter((r) => r.headword === 'ass');
    expect(ass).toHaveLength(1);
    expect(glossesOf(ass[0])).toEqual(['animal — see also donkey']);
    expect(JSON.stringify(ass)).not.toContain('طيز');
  });

  it('drops prick, whose only translations name a vulgar sense, and counts the drops', async () => {
    const stats = newStats();
    const all = await rows(stats);
    expect(all.find((r) => r.headword === 'prick')).toBeUndefined();
    expect(all.map((r) => r.headword)).toEqual(['book', 'dog', 'write', 'bitch', 'ass', 'water']);
    expect(stats.droppedEntries).toBe(1);
    expect(stats.droppedByReason).toEqual({ 'sense:blocked': 3 + 2 + 3 + 8 });
  });
});

describe('dialect filter', () => {
  it('keeps only the Modern Standard Arabic translations of water and counts the dialect ones apart', async () => {
    const stats = newStats();
    const water = (await rows(stats)).find((r) => r.headword === 'water');
    expect(water?.body.senses).toEqual([
      { gloss: 'مَاء', parents: ['inorganic compound H₂O'], links: [['مَاء', 'مَاء']] },
      { gloss: 'مِيَاه', parents: ['body of water, or specific part of it'], links: [['مِيَاه', 'مِيَاه']] },
    ]);
    expect(stats.skippedByReason).toMatchObject({
      'dialect:Egyptian-Arabic': expect.any(Number),
      'dialect:Gulf-Arabic': expect.any(Number),
      'dialect:Hijazi-Arabic': expect.any(Number),
      'dialect:Moroccan-Arabic': expect.any(Number),
      'dialect:North-Levantine-Arabic': expect.any(Number),
      'dialect:South-Levantine-Arabic': expect.any(Number),
    });
    expect(stats.droppedByReason).toEqual({ 'sense:blocked': 3 + 2 + 3 + 8 });
  });
});

describe('mapTranslationGroup', () => {
  const entry = (over: Partial<TranslatedEntry>): TranslatedEntry => ({
    word: 'lamp',
    lang_code: 'en',
    pos: 'noun',
    senses: [{ glosses: ['A device producing light.'] }, { glosses: ['A slang word for a fool.'], tags: ['vulgar'] }],
    ...over,
  });

  it('drops items with a blocked tag, a blocked term in the header, or a header that a blocked gloss contains', () => {
    const stats = newStats();
    const row = mapTranslationGroup(
      [
        entry({
          translations: [
            { code: 'ar', sense: 'light source', word: 'مِصْبَاح' },
            { code: 'ar', sense: 'light source', word: 'سِرَاج', tags: ['vulgar'] },
            { code: 'ar', sense: 'a shitty lamp', word: 'أ' },
            { code: 'ar', sense: 'slang word for a fool', word: 'ب' },
            { code: 'ar', sense: 'A SLANG WORD FOR A FOOL, IN SOME REGIONS', word: 'ج' },
            { code: 'fr', sense: 'light source', word: 'lampe' },
          ],
        }),
      ],
      'ar',
      stats,
    );
    expect(row?.body.senses).toEqual([{ gloss: 'مِصْبَاح', parents: ['light source'], links: [['مِصْبَاح', 'مِصْبَاح']] }]);
    expect(stats.droppedByReason).toEqual({ 'tag:vulgar': 1, 'term:shitty': 1, 'sense:blocked': 2 });
  });

  it('keeps a header when a blocked gloss shares no more than half its words (zebra, Guinea)', () => {
    const stats = newStats();
    const row = mapTranslationGroup(
      [
        entry({
          word: 'zebra',
          senses: [
            { glosses: ['Any of three species of Equus with black and white stripes, native to Africa.'] },
            { glosses: ['A country in West Africa. Official name: Republic of Guinea.'] },
            { glosses: ['A biracial person born to an African person and a white person.'], tags: ['derogatory'] },
            { glosses: ['Alternative letter-case form of guinea, an Italian.'], tags: ['derogatory'] },
          ],
          translations: [
            { code: 'ar', sense: 'African animal', word: 'حِمَار وَحْشِيّ' },
            { code: 'ar', sense: 'short form of the Republic of Guinea', word: 'غِينْيَا' },
          ],
        }),
      ],
      'ar',
      stats,
    );
    expect(row?.body.senses).toHaveLength(2);
    expect(stats.droppedSenses).toBe(0);
  });

  it('drops a header naming a generic person against a derogatory gloss (prick "unpleasant person")', () => {
    const stats = newStats();
    const row = mapTranslationGroup(
      [
        entry({
          word: 'prick',
          senses: [
            { glosses: ['A small hole or perforation, caused by piercing.'] },
            { glosses: ['Someone (especially a male) who is unpleasant, rude or annoying.'], tags: ['derogatory', 'slang'] },
          ],
          translations: [
            { code: 'ar', sense: 'small hole', word: 'ثَقْب' },
            { code: 'ar', sense: 'unpleasant person', word: 'أ' },
          ],
        }),
      ],
      'ar',
      stats,
    );
    expect(row?.body.senses.map((s) => s.parents?.[0])).toEqual(['small hole']);
    expect(stats.droppedByReason).toEqual({ 'sense:blocked': 1 });
  });

  it('drops every item when every English sense is blocked (twat "idiot")', () => {
    const stats = newStats();
    const row = mapTranslationGroup(
      [
        entry({
          word: 'twat',
          senses: [
            { glosses: ['The vulva.'], tags: ['vulgar'] },
            { glosses: ['A stupid person.'], tags: ['vulgar', 'derogatory'] },
          ],
          translations: [
            { code: 'ar', sense: 'idiot', word: 'أَحْمَق' },
            { code: 'ar', sense: 'idiot', word: 'غَبِيّ' },
          ],
        }),
      ],
      'ar',
      stats,
    );
    expect(row).toBeNull();
    expect(stats.droppedEntries).toBe(1);
    expect(stats.droppedByReason).toEqual({ 'sense:blocked': 2 });
  });

  it('matches a header and a blocked gloss on whole words only, and ignores headers without content words', () => {
    const stats = newStats();
    const row = mapTranslationGroup(
      [
        entry({
          word: 'x',
          senses: [
            { glosses: ['An adult male human.'] },
            { glosses: ['A woman of loose morals.'], tags: ['derogatory'] },
            { glosses: ['Ass.'], tags: ['vulgar'] },
            { glosses: ['Someone vile.'], tags: ['derogatory'] },
          ],
          translations: [
            { code: 'ar', sense: 'man', word: 'رَجُل' },
            { code: 'ar', sense: 'grass-covered area', word: 'عُشْب' },
            { code: 'ar', sense: 'someone', word: 'شَخْص' },
            { code: 'ar', sense: '.', word: 'شَيْء' },
          ],
        }),
      ],
      'ar',
      stats,
    );
    expect(row?.body.senses.map((s) => s.parents?.[0])).toEqual(['man', 'grass-covered area', 'someone', '.']);
    expect(stats.droppedSenses).toBe(0);
  });

  it('skips items whose word has no Arabic left, and emits no row when none has', () => {
    const stats = newStats();
    const none = mapTranslationGroup([entry({ translations: [{ code: 'ar', sense: 'light source', word: 'please add' }] })], 'ar', stats);
    expect(none).toBeNull();
    expect(stats.droppedEntries).toBe(0);
    const some = mapTranslationGroup(
      [
        entry({
          translations: [
            { code: 'ar', sense: 'light source', word: 'please add' },
            { code: 'ar', sense: 'oil lamp', word: 'سِرَاج' },
          ],
        }),
      ],
      'ar',
      newStats(),
    );
    expect(some?.body.senses).toEqual([{ gloss: 'سِرَاج', parents: ['oil lamp'], links: [['سِرَاج', 'سِرَاج']] }]);
  });

  it('drops items tagged with a dialect, region or colloquial register and keeps classical, literary and formal ones', () => {
    const stats = newStats();
    const tagged = (word: string, tags: string[]) => ({ code: 'ar', sense: 'light source', word, tags });
    const row = mapTranslationGroup(
      [
        entry({
          translations: [
            tagged('أ', ['Egyptian-Arabic']),
            tagged('ب', ['colloquial', 'masculine']),
            tagged('ت', ['dialectal']),
            tagged('ث', ['regional']),
            tagged('ج', ['childish', 'familiar']),
            tagged('ح', ['Palestine']),
            tagged('خ', ['Eastern', 'dialectal']),
            tagged('مِصْبَاح', ['Classical']),
            tagged('سِرَاج', ['literary', 'poetic']),
            tagged('قِنْدِيل', ['formal', 'masculine']),
          ],
        }),
      ],
      'ar',
      stats,
    );
    expect(row?.body.senses[0]?.gloss).toBe('مِصْبَاح، سِرَاج، قِنْدِيل');
    expect(stats.skippedByReason).toEqual({
      'dialect:Egyptian-Arabic': 1,
      'dialect:colloquial': 1,
      'dialect:dialectal': 2,
      'dialect:regional': 1,
      'dialect:childish': 1,
      'dialect:Palestine': 1,
    });
    expect(stats.droppedSenses).toBe(0);
  });

  it('emits no row and counts no dropped entry when every translation is dialectal', () => {
    const stats = newStats();
    const row = mapTranslationGroup([entry({ translations: [{ code: 'ar', sense: 'light source', word: 'أ', tags: ['Gulf-Arabic'] }] })], 'ar', stats);
    expect(row).toBeNull();
    expect(stats.droppedEntries).toBe(0);
  });

  it('dedupes words, splits at Latin-script markers ("X or Y", gender letters, dialect names), and skips items without a word', () => {
    const row = mapTranslationGroup(
      [
        entry({
          translations: [
            { code: 'ar', sense: 'light source', word: 'مِصْبَاح or سِرَاج', roman: 'miṣbāḥ' },
            { code: 'ar', sense: 'light source', word: 'سِرَاج', alt: 'سراج' },
            { code: 'ar', sense: 'light source' },
            { code: 'ar', sense: 'light source', word: 'قِنْدِيل f' },
            { code: 'ar', sense: 'light source', word: 'لَمْبَة m فَانُوس' },
            { code: 'ar', sense: 'light source', word: 'Hijazi Arabic أَبَاجُورَة' },
            { code: 'ar', sense: 'light source', word: 'نُور Egyptian Arabic نور' },
            { code: 'ar', sense: 'light source', word: 'ضَوْء خَافِت' },
          ],
        }),
      ],
      'ar',
      newStats(),
    );
    expect(row?.body.senses[0]?.gloss).toBe('مِصْبَاح، سِرَاج، قِنْدِيل، لَمْبَة، فَانُوس، نُور، ضَوْء خَافِت');
  });

  it('groups items without a sense under the first non-form-of English gloss', () => {
    const row = mapTranslationGroup(
      [
        entry({
          senses: [{ glosses: ['plural of lamb'], form_of: [{ word: 'lamb' }] }, { glosses: ['A device', 'A device producing light.'] }],
          translations: [{ code: 'ar', word: 'مِصْبَاح' }, { code: 'ar', sense: 'oil lamp', word: 'سِرَاج' }],
        }),
      ],
      'ar',
      newStats(),
    );
    expect(row?.body.senses.map((s) => s.parents)).toEqual([['A device producing light.'], ['oil lamp']]);
  });

  it('skips alternative spellings when choosing the lead English gloss', () => {
    const row = mapTranslationGroup(
      [
        entry({
          senses: [{ glosses: ['Alternative spelling of lamp'], alt_of: [{ word: 'lamp' }] }, { glosses: ['A device producing light.'] }],
          translations: [{ code: 'ar', word: 'مِصْبَاح' }],
        }),
      ],
      'ar',
      newStats(),
    );
    expect(row?.body.senses.map((s) => s.parents)).toEqual([['A device producing light.']]);
  });

  it('leaves parents off when there is no English gloss, and drops senseless items when the lead sense is blocked', () => {
    const bare = mapTranslationGroup([entry({ senses: [], translations: [{ code: 'ar', word: 'مِصْبَاح' }] })], 'ar', newStats());
    expect(bare?.body.senses).toEqual([{ gloss: 'مِصْبَاح', links: [['مِصْبَاح', 'مِصْبَاح']] }]);
    const stats = newStats();
    const blocked = mapTranslationGroup(
      [entry({ senses: [{ glosses: ['A fool.'], tags: ['vulgar'] }], translations: [{ code: 'ar', word: 'أ' }] })],
      'ar',
      stats,
    );
    expect(blocked).toBeNull();
    expect(stats.droppedEntries).toBe(1);
  });

  it('returns null without counting a drop when there are no Arabic translations', () => {
    const stats = newStats();
    expect(mapTranslationGroup([entry({ translations: [{ code: 'fr', sense: 'x', word: 'lampe' }] })], 'ar', stats)).toBeNull();
    expect(stats.droppedEntries).toBe(0);
  });
});

const XX_SAMPLE = join(import.meta.dirname, 'data', 'kaikki-en-xx-sample.jsonl');

async function xxRows(lang: 'fr' | 'ja' | 'zh', stats: BuildStats = newStats()): Promise<EntryRow[]> {
  const out: EntryRow[] = [];
  for await (const row of kaikkiTranslationRows(XX_SAMPLE, lang, { limit: Infinity, stats })) out.push(row);
  return out;
}
const senseOf = (rows: EntryRow[], word: string, header: string) =>
  rows.find((r) => r.headword === word)?.body.senses.find((s) => s.parents?.[0] === header);

describe('kaikkiTranslationRows (French)', () => {
  it('shows gender and number after each word and links the bare word', async () => {
    const fr = await xxRows('fr');
    expect(senseOf(fr, 'water', 'inorganic compound H₂O')).toEqual({ gloss: 'eau (f)', parents: ['inorganic compound H₂O'], links: [['eau', 'eau']] });
    expect(senseOf(fr, 'water', 'body of water, or specific part of it')?.gloss).toBe('eaux (f pl)');
    expect(senseOf(fr, 'cat', 'domestic species')?.gloss).toBe('chat (m), chatte (f)');
    expect(senseOf(fr, 'go', 'of a machine, to work')?.gloss).toBe('fonctionner, marcher');
  });

  it('labels regional varieties and leaves Middle French out', () => {
    const row = mapTranslationGroup(
      [
        {
          word: 'car',
          lang_code: 'en',
          pos: 'noun',
          senses: [{ glosses: ['A wheeled vehicle.'] }],
          translations: [
            { code: 'fr', sense: 'automobile', word: 'voiture', tags: ['feminine'] },
            { code: 'fr', sense: 'automobile', word: 'char', tags: ['masculine', 'Quebec'] },
            { code: 'fr', sense: 'automobile', word: 'auto', tags: ['feminine', 'New-England'] },
            { code: 'frm', sense: 'automobile', word: 'chariot', tags: ['masculine'] },
          ],
        },
      ],
      'fr',
      newStats(),
    );
    expect(row?.body.senses[0]?.gloss).toBe('voiture (f), char (m, Quebec), auto (f, New England)');
  });

  it('applies the content filter (bitch keeps only the female canine)', async () => {
    const stats = newStats();
    const fr = await xxRows('fr', stats);
    expect(fr.find((r) => r.headword === 'bitch')?.body.senses.map((s) => s.parents?.[0])).toEqual(['female canine']);
    expect(fr.find((r) => r.headword === 'dog')?.body.senses.map((s) => s.parents?.[0])).toEqual(['animal', 'male canine']);
    expect(stats.droppedByReason['sense:blocked']).toBeGreaterThan(0);
  });
});

describe('kaikkiTranslationRows (Japanese)', () => {
  it('shows the kana reading from alt, several readings, and romaji only without kana', async () => {
    const ja = await xxRows('ja');
    expect(senseOf(ja, 'dog', 'animal')).toEqual({ gloss: '犬 (いぬ), 狗 (いぬ)', parents: ['animal'], links: [['犬', '犬'], ['狗', '狗']] });
    expect(senseOf(ja, 'house', 'human abode')?.gloss).toMatch(/^家 \(いえ、うち\), 建物 \(たてもの\)/);
    expect(senseOf(ja, 'water', 'inorganic compound H₂O')?.gloss).toBe('水 (mizu)');
    expect(senseOf(ja, 'go', 'to become')?.gloss).toBe('なる');
  });

  it('drops items tagged vulgar like the other targets', async () => {
    const ja = await xxRows('ja');
    expect(senseOf(ja, 'eat', 'to ingest — see also consume, ingest')?.gloss).not.toContain('食う');
  });
});

describe('kaikkiTranslationRows (Chinese)', () => {
  it('shows simplified, then traditional when it differs, then pinyin, and links the simplified form', async () => {
    const zh = await xxRows('zh');
    expect(senseOf(zh, 'cat', 'domestic species')).toEqual({
      gloss: '猫 / 貓 (māo), 猫儿 / 貓兒 (māor)',
      parents: ['domestic species'],
      links: [
        ['猫', '猫'],
        ['猫儿', '猫儿'],
      ],
    });
    expect(senseOf(zh, 'dog', 'animal')?.gloss).toBe('狗 (gǒu), 犬 (quǎn)');
    expect(senseOf(zh, 'go', 'to move through space (especially from one place to another)')?.gloss).toBe('去 (qù)');
  });

  it('keeps Mandarin (cmn, or zh as Chinese Mandarin or untagged Chinese) and leaves other varieties out', async () => {
    const zh = await xxRows('zh');
    const water = senseOf(zh, 'water', 'inorganic compound H₂O');
    expect(water?.gloss).toBe('水 (shuǐ)');
    expect(JSON.stringify(zh)).not.toMatch(/chúi|фи|Hokkien/);
    const row = mapTranslationGroup(
      [
        {
          word: 'what',
          lang_code: 'en',
          pos: 'pron',
          senses: [{ glosses: ['Which thing.'] }],
          translations: [
            { code: 'zh', lang: 'Chinese', sense: 'interrogative', word: '什麼 /什么' },
            { code: 'zh', lang: 'Chinese', sense: 'interrogative', word: '甚麼', raw_tags: ['Southern Min'] },
            { code: 'yue', lang: 'Chinese Cantonese', sense: 'interrogative', word: '乜嘢', roman: 'mat1 je5' },
            { code: 'zh', lang: 'Chinese', sense: 'interrogative', word: 'cut' },
          ],
        },
      ],
      'zh',
      newStats(),
    );
    expect(row?.body.senses).toEqual([{ gloss: '什么 / 什麼', parents: ['interrogative'], links: [['什么', '什么']] }]);
  });
});

describe('placeholder translation headers', () => {
  it('treats a "Translations" sense like a missing one, for every target', () => {
    for (const [lang, code] of [['ar', 'ar'], ['fr', 'fr']] as const) {
      const row = mapTranslationGroup(
        [
          {
            word: 'lamp',
            lang_code: 'en',
            pos: 'noun',
            senses: [{ glosses: ['A device producing light.'] }],
            translations: [
              { code, sense: 'Translations', word: lang === 'ar' ? 'مِصْبَاح' : 'lampe' },
              { code, sense: ' translations ', word: lang === 'ar' ? 'سِرَاج' : 'lanterne' },
            ],
          },
        ],
        lang,
        newStats(),
      );
      expect(row?.body.senses).toHaveLength(1);
      expect(row?.body.senses[0]?.parents).toEqual(['A device producing light.']);
    }
  });
});
