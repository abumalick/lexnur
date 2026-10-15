import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { kaikkiRows, mapKaikkiGroup, type KaikkiEntry, type KaikkiMapOptions } from '../src/sources/kaikki.ts';
import { FRENCH_FR } from '../src/sources/kaikki-fr.ts';
import { newStats, type BuildStats, type EntryRow } from '../src/rows.ts';

const SAMPLE = join(import.meta.dirname, 'data', 'kaikki-frfr-sample.jsonl');
const FR: KaikkiMapOptions = { lang: 'fr', maxSenses: 20, tables: true, edition: FRENCH_FR };

async function rows(stats: BuildStats = newStats()): Promise<EntryRow[]> {
  const out: EntryRow[] = [];
  for await (const row of kaikkiRows(SAMPLE, FR, { limit: Infinity, stats })) out.push(row);
  return out;
}

const find = async (key: string, pos: string) => (await rows()).find((r) => r.search_key === key && r.pos === pos);

describe('French-edition Kaikki (fr→fr)', () => {
  it('maps the verb lire with a conjugation table of simple tenses', async () => {
    const lire = await find('lire', 'verb');
    expect(lire).toMatchObject({ headword: 'lire', root: null, sort_order: 0 });
    expect(lire?.gloss).toMatch(/^Interpréter des informations écrites/);
    expect(lire?.body.ipa).toEqual(['/liʁ/']);
    expect(lire?.body.forms).toBeUndefined();
    const table = lire?.body.tables?.[0];
    expect(table?.title).toBe('conjugation');
    expect(table?.rows).toHaveLength(49);
    expect(table?.rows).toContainEqual({ label: 'indicative present', form: 'nous lisons' });
    expect(table?.rows).toContainEqual({ label: 'subjunctive present', form: 'que je lise' });
    expect(table?.rows.map((r) => r.form)).not.toContain('j’ai lu');
    expect(lire?.body.senses[0]?.examples?.[0]?.text).toMatch(/^On lit ce livre/);
  });

  it('labels a noun with its gender and keeps its plural', async () => {
    const lire = await find('lire', 'noun');
    expect(lire?.body.senses[0]).toMatchObject({ gloss: expect.stringMatching(/^Monnaie utilisée en Italie/), labels: ['feminine'] });
    expect(lire?.body.senses[1]?.labels).toBeUndefined();
    expect(lire?.body.forms).toEqual([{ label: 'plural', form: 'lires' }]);
  });

  it('folds accents in the search key and keeps only the phonemic IPA', async () => {
    const ete = await find('ete', 'noun');
    expect(ete).toMatchObject({ headword: 'été', sort_order: 0 });
    expect(ete?.body.senses[0]?.labels).toEqual(['masculine']);
    expect(ete?.body.ipa).toEqual(['/e.te/']);
  });

  it('puts inflected forms after lemmas, without their own conjugation lines or quotations', async () => {
    const ete = await find('ete', 'verb');
    expect(ete).toMatchObject({ headword: 'été', sort_order: 1 });
    expect(ete?.body.senses[0]?.formOf).toBe('être');
    const lisons = await find('lisons', 'verb');
    expect(lisons).toMatchObject({ sort_order: 1, gloss: 'Première personne du pluriel de l’indicatif présent de lire.' });
    expect(lisons?.body.forms).toBeUndefined();
    expect(lisons?.body.senses[0]?.examples).toBeUndefined();
    expect(ete?.body.senses[0]?.examples).toBeUndefined();
  });

  it('drops a slur and an entry in the sexuality lexicon, counted per reason', async () => {
    const stats = newStats();
    const keys = (await rows(stats)).map((r) => r.search_key);
    expect(keys).not.toContain('bougnoule');
    expect(keys).not.toContain('fellatrice');
    expect(stats.droppedByReason).toEqual({ 'tag:offensive': 1, 'entry-category:sexualité': 1 });
    expect(stats.droppedEntries).toBe(2);
  });

  it('keeps one copy of the forms and conjugation rows that adjacent homonyms repeat', () => {
    const line = (gloss: string): KaikkiEntry => ({
      word: 'revoler',
      lang_code: 'fr',
      pos: 'verb',
      senses: [{ glosses: [gloss] }],
      forms: [
        { form: 'revolé', tags: ['plural'] },
        { form: 'je revole', tags: ['indicative', 'present'], source: 'Conjugaison:français/revoler' },
      ],
    });
    const row = mapKaikkiGroup([line('Voler à nouveau.'), line('Dérober à nouveau.')].map(FRENCH_FR.adapt), FR, newStats());
    expect(row?.body.forms).toEqual([{ label: 'plural', form: 'revolé' }]);
    expect(row?.body.tables).toEqual([{ title: 'conjugation', rows: [{ label: 'indicative present', form: 'je revole' }] }]);
  });
});
