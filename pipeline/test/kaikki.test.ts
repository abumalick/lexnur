import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { groupAdjacent, kaikkiRows, mapKaikkiGroup, readKaikki, type KaikkiEntry, type KaikkiMapOptions } from '../src/sources/kaikki.ts';
import { newStats, type EntryRow } from '../src/rows.ts';
import { tempDir } from './tmp.ts';

const SAMPLE = join(import.meta.dirname, 'data', 'kaikki-sample.jsonl');
const AR: KaikkiMapOptions = { lang: 'ar', maxSenses: 30, tables: true };
const EN: KaikkiMapOptions = { lang: 'en', maxSenses: 20, tables: false };

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

async function rows(lang: 'ar' | 'en'): Promise<EntryRow[]> {
  return collect(kaikkiRows(SAMPLE, lang === 'ar' ? AR : EN, { limit: Infinity, stats: newStats() }));
}

describe('readKaikki', () => {
  it('reads only the requested language', async () => {
    const stats = newStats();
    expect((await collect(readKaikki(SAMPLE, ['ar'], stats))).map((e) => e.word)).toEqual(['كتب', 'كتاب']);
    expect(stats.lines).toBe(3);
    expect((await collect(readKaikki(SAMPLE, ['en'], newStats()))).map((e) => e.word)).toEqual(['write']);
  });

  it('skips and counts malformed lines, keeps a 5 MB line, and reads gzip', async () => {
    const huge = JSON.stringify({ word: 'طويل', lang_code: 'ar', pos: 'adj', senses: [{ glosses: ['x'.repeat(5_000_000)] }] });
    const lines = [
      JSON.stringify({ word: 'قلم', lang_code: 'ar', pos: 'noun', senses: [{ glosses: ['pen'] }] }),
      '{"word": "مكسور", "lang_code": "ar", "senses": [',
      huge,
      JSON.stringify({ word: 'pen', lang_code: 'en', pos: 'noun', senses: [{ glosses: ['a writing tool'] }] }),
    ];
    const path = join(tempDir(), 'mini.jsonl.gz');
    writeFileSync(path, gzipSync(`${lines.join('\n')}\n`));
    const stats = newStats();
    const got = await collect(readKaikki(path, ['ar'], stats));
    expect(got.map((e) => e.word)).toEqual(['قلم', 'طويل']);
    expect(stats.malformed).toBe(1);
    expect(stats.lines).toBe(4);
  });
});

describe('groupAdjacent', () => {
  it('merges adjacent lines with the same headword and part of speech only', async () => {
    const e = (word: string, pos: string): KaikkiEntry => ({ word, lang_code: 'en', pos, senses: [{ glosses: [word] }] });
    async function* source() {
      yield e('bank', 'noun');
      yield e('bank', 'noun');
      yield e('bank', 'verb');
      yield e('bank', 'noun');
    }
    expect((await collect(groupAdjacent(source()))).map((g) => g.length)).toEqual([2, 1, 1]);
  });
});

describe('mapKaikkiGroup (Arabic)', () => {
  it('maps the verb كتب with vowelled headword, root, transliteration, forms and a capped table', async () => {
    const ktb = (await rows('ar')).find((r) => r.pos === 'verb');
    expect(ktb).toMatchObject({ headword: 'كَتَبَ', search_key: 'كتب', root: 'ك ت ب', sort_order: 0, gloss: 'to draw (figures)' });
    expect(ktb?.body.transliteration).toBe('kataba');
    expect(ktb?.body.ipa).toEqual(['/ka.ta.ba/']);
    expect(ktb?.body.forms).toContainEqual({ label: 'non-past', form: 'يَكْتُبُ', roman: 'yaktubu' });
    expect(ktb?.body.tables?.[0]?.title).toBe('conjugation');
    expect(ktb?.body.tables?.[0]?.rows).toHaveLength(60);
    expect(ktb?.body.senses).toHaveLength(8);
    expect(ktb?.body.senses[0]).toMatchObject({
      gloss: 'to draw (figures)',
      parents: ['to mark (symbols, shapes, graphs, glyphs, letters, and the like) on a surface, to write, to inscribe'],
      labels: ['transitive'],
    });
    expect(ktb?.body.relations?.find((r) => r.kind === 'synonyms')?.words).toContain('رَسَمَ');
  });

  it('maps the noun كتاب with its etymon root, plural and leading non-form-of gloss', async () => {
    const kitab = (await rows('ar')).find((r) => r.pos === 'noun');
    expect(kitab).toMatchObject({ headword: 'كِتَاب', search_key: 'كتاب', root: 'ك ت ب', gloss: 'book', sort_order: 0 });
    expect(kitab?.body.senses[0]).toMatchObject({ formOf: 'كَتَبَ', labels: ['noun-from-verb', 'obsolete'] });
    expect(kitab?.body.forms).toEqual([{ label: 'plural', form: 'كُتُب', roman: 'kutub' }]);
    expect(kitab?.body.tables?.[0]).toMatchObject({ title: 'declension' });
    expect(kitab?.body.tables?.[0]?.rows).toHaveLength(36);
    expect(kitab?.body.ipa).toEqual(['/ki.taːb/', '[keˈtæːb]']);
    expect(kitab?.body.relations?.find((r) => r.kind === 'derived')?.words).toContain('كِتَابِيّ');
  });

  it('falls back to word when no canonical form', () => {
    const row = mapKaikkiGroup([{ word: 'قلم', lang_code: 'ar', pos: 'noun', senses: [{ glosses: ['pen'] }] }], AR, newStats());
    expect(row).toMatchObject({ headword: 'قلم', search_key: 'قلم', root: null, gloss: 'pen' });
  });

  it('reads the root from an ar-root template in etymology_templates', () => {
    const row = mapKaikkiGroup([{ word: 'خلف', lang_code: 'ar', pos: 'noun', senses: [{ glosses: ['back'] }], etymology_templates: [{ name: 'ar-root', args: { '1': 'خ ل ف' } }] }], AR, newStats());
    expect(row?.root).toBe('خ ل ف');
  });

  it('reads the root from an ar-root template in head_templates', () => {
    const row = mapKaikkiGroup([{ word: 'خلف', lang_code: 'ar', pos: 'noun', senses: [{ glosses: ['back'] }], head_templates: [{ name: 'ar-root', args: { '1': 'خ ل ف' } }] }], AR, newStats());
    expect(row?.root).toBe('خ ل ف');
  });

  it('ignores an ar-root with a junk value', () => {
    const row = mapKaikkiGroup([{ word: 'خلف', lang_code: 'ar', pos: 'noun', senses: [{ glosses: ['back'] }], etymology_templates: [{ name: 'ar-root', args: { '1': 'x' } }] }], AR, newStats());
    expect(row?.root).toBeNull();
  });

  const ROOT_CATEGORY = 'Arabic terms belonging to the root ك ت ب';
  it.each<[string, Partial<KaikkiEntry>]>([
    ['entry string', { categories: [ROOT_CATEGORY] }],
    ['entry object', { categories: [{ name: ROOT_CATEGORY, kind: 'other' }] }],
    ['sense string', { senses: [{ glosses: ['book'], categories: [ROOT_CATEGORY] }] }],
    ['sense object', { senses: [{ glosses: ['book'], categories: [{ name: ROOT_CATEGORY }] }] }],
  ])('reads the root from a root category (%s)', (_, extra) => {
    const row = mapKaikkiGroup([{ word: 'كتاب', lang_code: 'ar', pos: 'noun', senses: [{ glosses: ['book'] }], ...extra }], AR, newStats());
    expect(row?.root).toBe('ك ت ب');
  });

  it('reads the root of the real كتاب entry from its category alone', async () => {
    const [, kitab] = await collect(readKaikki(SAMPLE, ['ar'], newStats()));
    const bare = { ...(kitab as KaikkiEntry), etymology_templates: [], head_templates: [] };
    expect(mapKaikkiGroup([bare], AR, newStats())?.root).toBe('ك ت ب');
  });

  it.each([
    ['خ ل', null],
    ['خ ل ف', 'خ ل ف'],
    ['ط م ا ن', 'ط م ا ن'],
    ['ا ب ج د ه', null],
  ])('keeps only three- or four-letter roots: %s', (raw, root) => {
    const row = mapKaikkiGroup([{ word: 'خلف', lang_code: 'ar', pos: 'noun', senses: [{ glosses: ['back'] }], etymology_templates: [{ name: 'ar-root', args: { '1': raw } }] }], AR, newStats());
    expect(row?.root).toBe(root);
  });

  it('drops an entry whose senses are all offensive', () => {
    const stats = newStats();
    const row = mapKaikkiGroup(
      [{ word: 'x', lang_code: 'en', pos: 'noun', senses: [{ glosses: ['a'], tags: ['vulgar'] }, { glosses: ['b'], categories: ['English ethnic slurs'] }] }],
      EN,
      stats,
    );
    expect(row).toBeNull();
    expect(stats).toMatchObject({ droppedSenses: 2, droppedEntries: 1, noGlossEntries: 0 });
    expect(stats.droppedByReason).toEqual({ 'tag:vulgar': 1, 'category:ethnic slurs': 1 });
  });

  it('counts an entry without a usable gloss apart from the filter', () => {
    const stats = newStats();
    const row = mapKaikkiGroup([{ word: 'x', lang_code: 'en', pos: 'noun', senses: [{ glosses: [' '] }, { tags: ['no-gloss'] }] }], EN, stats);
    expect(row).toBeNull();
    expect(stats).toMatchObject({ droppedSenses: 0, droppedEntries: 0, noGlossEntries: 1 });
  });

  it('puts an entry made only of inflections after lemmas', () => {
    const row = mapKaikkiGroup(
      [{ word: 'went', lang_code: 'en', pos: 'verb', senses: [{ glosses: ['simple past of go'], tags: ['form-of', 'past'], form_of: [{ word: 'go' }] }] }],
      EN,
      newStats(),
    );
    expect(row).toMatchObject({ sort_order: 1, gloss: 'simple past of go' });
    expect(row?.body.senses[0]).toEqual({ gloss: 'simple past of go', labels: ['past'], formOf: 'go' });
  });

  it('puts an entry made only of alternative spellings after lemmas', () => {
    const row = mapKaikkiGroup(
      [{ word: 'colour', lang_code: 'en', pos: 'noun', senses: [{ glosses: ['Alternative spelling of color'], alt_of: [{ word: 'color' }] }] }],
      EN,
      newStats(),
    );
    expect(row?.sort_order).toBe(1);
  });

  it('points alternative spellings at their lemma', () => {
    const row = mapKaikkiGroup(
      [{ word: 'colour', lang_code: 'en', pos: 'noun', senses: [{ glosses: ['Alternative spelling of color'], tags: ['alt-of'], alt_of: [{ word: 'color' }] }] }],
      EN,
      newStats(),
    );
    expect(row?.body.senses[0]).toMatchObject({ gloss: 'Alternative spelling of color', formOf: 'color' });
  });
});

describe('mapKaikkiGroup (English)', () => {
  it('maps write without tables', async () => {
    const [write] = await rows('en');
    expect(write).toMatchObject({ headword: 'write', search_key: 'write', pos: 'verb', root: null });
    expect(write?.body.ipa).toEqual(['/ɹaɪt/', '[ɹaɪt]']);
    expect(write?.body.tables).toBeUndefined();
    expect(write?.body.senses).toHaveLength(13);
    expect(write?.body.senses[0]).toMatchObject({
      gloss: 'To form letters, words or symbols on a surface in order to communicate.',
      labels: ['ambitransitive'],
      examples: [{ text: 'The pupil wrote his name on the paper.' }, { text: 'Your son has been writing on the wall.' }],
    });
    expect(write?.body.relations?.find((r) => r.kind === 'synonyms')?.words).toContain('inscribe');
  });
});

describe('mapKaikkiGroup (French)', () => {
  const FR_SAMPLE = join(import.meta.dirname, 'data', 'kaikki-fr-en-sample.jsonl');
  const FR: KaikkiMapOptions = { lang: 'fr', maxSenses: 30, tables: true, terms: 'universal' };
  async function frRows(stats = newStats()): Promise<EntryRow[]> {
    return collect(kaikkiRows(FR_SAMPLE, FR, { limit: Infinity, stats }));
  }

  it('folds accents into the search key and keeps the past participle after the noun', async () => {
    const ete = (await frRows()).filter((r) => r.headword === 'été');
    expect(ete.map((r) => [r.pos, r.search_key, r.sort_order])).toEqual([
      ['noun', 'ete', 0],
      ['verb', 'ete', 1],
    ]);
    expect(ete[0]?.body.senses[0]).toMatchObject({ gloss: 'summer', labels: ['masculine'] });
    expect(ete[1]?.body.senses[0]?.formOf).toBe('être');
  });

  it('surfaces noun gender as a sense label', async () => {
    const etre = (await frRows()).find((r) => r.headword === 'être' && r.pos === 'noun');
    expect(etre?.body.senses[0]?.labels).toContain('masculine');
    expect(etre?.body.forms).toContainEqual({ label: 'plural', form: 'êtres' });
  });

  it('keeps one clean conjugation table without IPA or periphrastic placeholders', async () => {
    const all = await frRows();
    const manger = all.find((r) => r.headword === 'manger')?.body.tables?.[0];
    expect(manger?.title).toBe('conjugation');
    expect(manger?.rows).toContainEqual({ label: 'first-person indicative present singular', form: 'mange' });
    expect(manger?.rows).toContainEqual({ label: 'historic indicative past plural third-person', form: 'mangèrent' });
    expect(manger?.rows.some((r) => /[ɐ-˿]/.test(r.form) || r.form.includes('past participle'))).toBe(false);
    expect(manger?.rows).toHaveLength(48);
    const etre = all.find((r) => r.headword === 'être' && r.pos === 'verb')?.body.tables;
    expect(etre).toHaveLength(1);
    expect(etre?.[0]?.rows.some((r) => r.form.startsWith("s'") || r.form.startsWith('me '))).toBe(false);
    expect(etre?.[0]?.rows).toContainEqual({ label: 'first-person indicative present singular', form: 'suis' });
  });

  it('keeps a repeated conjugation cell once', () => {
    const cell = { form: 'aurai', tags: ['first-person', 'future', 'indicative', 'singular'], source: 'conjugation' };
    const row = mapKaikkiGroup([{ word: 'avoir', lang_code: 'fr', pos: 'verb', forms: [cell, { ...cell }], senses: [{ glosses: ['to have'] }] }], FR, newStats());
    expect(row?.body.tables?.[0]?.rows).toEqual([{ label: 'first-person future indicative singular', form: 'aurai' }]);
  });

  it('drops vulgar senses by tag', async () => {
    const stats = newStats();
    const all = await frRows(stats);
    expect(all.some((r) => r.headword === 'con')).toBe(false);
    expect(stats.droppedByReason['tag:vulgar']).toBe(3);
  });

  it('drops a sense whose gloss carries a universal blocked term, only when asked', () => {
    const entry: KaikkiEntry = { word: 'x', lang_code: 'fr', pos: 'noun', senses: [{ glosses: ['a fucking mess'] }, { glosses: ['mess'] }] };
    const stats = newStats();
    expect(mapKaikkiGroup([entry], FR, stats)?.body.senses.map((s) => s.gloss)).toEqual(['mess']);
    expect(stats.droppedByReason).toEqual({ 'term:fucking': 1 });
    expect(mapKaikkiGroup([{ ...entry, lang_code: 'en' }], EN, newStats())?.body.senses).toHaveLength(2);
  });
});
