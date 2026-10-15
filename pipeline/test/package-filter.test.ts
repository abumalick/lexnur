import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { normalizeKey, type Sense } from '@lexnur/core';
import { filterPackageDb, isDanglingFormOf, stripArabicTerms } from '../src/filter/package.ts';
import { PackageWriter, type PackageMeta } from '../src/package/writer.ts';
import { PACKAGE_FILTERS } from '../src/dictionaries.ts';
import { refilterFile } from '../src/refilter.ts';
import type { EntryRow } from '../src/rows.ts';
import { tempDir } from './tmp.ts';

const row = (headword: string, senses: Sense[], alias?: true): EntryRow => ({
  headword,
  search_key: normalizeKey(headword),
  pos: 'noun',
  root: null,
  gloss: senses[0]?.gloss ?? null,
  sort_order: alias ? 1 : 0,
  ...(alias ? { alias } : {}),
  body: { v: 1, senses },
});

const meta = (from: string, to: string): PackageMeta => ({
  id: 'test-dict',
  title: 'Test',
  from,
  to,
  version: '20261011.1',
  license: 'CC BY 4.0',
  attribution: 'Test attribution',
  source_date: '2026-10-10',
});

function write(from: string, to: string, rows: EntryRow[], filter = false): string {
  const path = join(tempDir(), 'p.sqlite');
  const writer = new PackageWriter(path, meta(from, to));
  for (const r of rows) writer.add(r);
  writer.finish(filter ? (db) => filterPackageDb(db, { from, to }) : undefined);
  return path;
}

const headwords = (path: string) =>
  (new DatabaseSync(path, { readOnly: true }).prepare('SELECT headword FROM entry ORDER BY id').all() as { headword: string }[]).map((r) => r.headword);
const metaValue = (path: string, key: string) =>
  (new DatabaseSync(path, { readOnly: true }).prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string }).value;

describe('isDanglingFormOf', () => {
  const keys = new Set(['كتاب', 'ترجمان', 'go']);

  it('is dangling when every sense points to a missing lemma', () => {
    expect(isDanglingFormOf('شَرَامِيط', [{ gloss: 'plural of شَرْمُوطَة', formOf: 'شَرْمُوطَة' }], keys)).toBe(true);
  });

  it('matches the lemma by normalized key, not by spelling', () => {
    expect(isDanglingFormOf('كُتُب', [{ gloss: 'plural of كِتَاب', formOf: 'كِتَابٌ' }], keys)).toBe(false);
  });

  it('accepts any of the slash-separated alternatives', () => {
    expect(isDanglingFormOf('تَرَاجِمَة', [{ gloss: 'plural', formOf: 'تُرْجُمَان /تَرْجَمَان' }], keys)).toBe(false);
  });

  it('ignores Latin gender marks after the lemma', () => {
    expect(isDanglingFormOf('خَلَايَا', [{ gloss: 'plural of خَلِيَّة f', formOf: 'خَلِيَّة f' }], new Set(['خليه']))).toBe(false);
  });

  it('reads presentation forms as their letters and skips scriptless headwords', () => {
    expect(isDanglingFormOf('هٰ', [{ gloss: 'x', formOf: '\uFEE9' }], new Set(['ه']))).toBe(false);
    expect(isDanglingFormOf('ـَى', [{ gloss: 'x', formOf: 'ʾalif maqṣūra' }], new Set())).toBe(false);
  });

  it('keeps rows with a sense of their own', () => {
    expect(isDanglingFormOf('x', [{ gloss: 'plural', formOf: 'missing' }, { gloss: 'own meaning' }], keys)).toBe(false);
    expect(isDanglingFormOf('x', [], keys)).toBe(false);
  });

  it('ignores lemmas written in another script than the headword', () => {
    expect(isDanglingFormOf('ﺘ', [{ gloss: 'forme de tâ', formOf: "tâ'" }], keys)).toBe(false);
  });
});

describe('stripArabicTerms', () => {
  it('removes only the offending word and its link', () => {
    const sense: Sense = {
      gloss: 'دَاعِرَة، عَاهِرَة، قَحْبَة',
      parents: ['a person having sex for profit'],
      links: [
        ['دَاعِرَة', 'دَاعِرَة'],
        ['عَاهِرَة', 'عَاهِرَة'],
        ['قَحْبَة', 'قَحْبَة'],
      ],
    };
    expect(stripArabicTerms(sense)).toEqual({
      gloss: 'دَاعِرَة، عَاهِرَة',
      parents: ['a person having sex for profit'],
      links: [
        ['دَاعِرَة', 'دَاعِرَة'],
        ['عَاهِرَة', 'عَاهِرَة'],
      ],
    });
  });

  it('matches whole words only', () => {
    const sense: Sense = { gloss: 'هُنَاكَ، هُنَا' };
    expect(stripArabicTerms(sense)).toBe(sense);
  });

  it('drops a sense left with no words', () => {
    expect(stripArabicTerms({ gloss: 'نَيْك', links: [['نَيْك', 'نَيْك']] })).toBeNull();
  });
});

describe('filterPackageDb', () => {
  it('drops dangling form-of rows of a dropped lemma and keeps the rest', () => {
    const path = write(
      'ar',
      'en',
      [
        row('كِتَاب', [{ gloss: 'book' }]),
        row('كُتُب', [{ gloss: 'plural of كِتَاب', formOf: 'كِتَاب' }]),
        row('شَرَامِيط', [{ gloss: 'plural of شَرْمُوطَة', formOf: 'شَرْمُوطَة' }]),
      ],
      true,
    );
    expect(headwords(path)).toEqual(['كِتَاب', 'كُتُب']);
    expect(metaValue(path, 'entry_count')).toBe('2');
  });

  it('finds a lemma whose own headword carries Latin marks', () => {
    const path = write('ar', 'en', [row('وَاحَة f .', [{ gloss: 'oasis' }]), row('وَاحَات', [{ gloss: 'plural of وَاحَة', formOf: 'وَاحَة' }])], true);
    expect(headwords(path)).toEqual(['وَاحَة', 'وَاحَات']);
  });

  it('drops form-of chains whose end was dropped', () => {
    const db = new DatabaseSync(write('ar', 'en', [row('a', [{ gloss: 'x', formOf: 'b' }]), row('b', [{ gloss: 'y', formOf: 'c' }])]));
    const result = filterPackageDb(db, { from: 'ar', to: 'en' });
    expect(result.droppedRows['formof:dangling']).toEqual(['b', 'a']);
    expect(result.formOfRows).toBe(2);
  });

  it('drops English headwords on the universal list in English-to-other packages only', () => {
    const rows = [row('slut', [{ gloss: 'عاهرة، فاجرة' }]), row('trollop', [{ gloss: 'x' }]), row('honky-tonk', [{ gloss: 'y' }])];
    expect(headwords(write('en', 'ar', rows, true))).toEqual(['honky-tonk']);
    expect(headwords(write('fr', 'en', rows, true))).toEqual(['slut', 'trollop', 'honky-tonk']);
    expect(headwords(write('en', 'en', rows, true))).toEqual(['slut', 'trollop', 'honky-tonk']);
  });

  it('strips Arabic vulgar words in to-Arabic packages and recomputes the row gloss', () => {
    const path = write(
      'en',
      'ar',
      [
        row('prostitute', [{ gloss: 'عَاهِرَة، قَحْبَة', links: [['قَحْبَة', 'قَحْبَة']] }, { gloss: 'بَغِيّ' }]),
        row('fuck', [{ gloss: 'نَاكَ' }]),
        row('there', [{ gloss: 'هُنَاكَ' }]),
      ],
      true,
    );
    const db = new DatabaseSync(path, { readOnly: true });
    expect(db.prepare('SELECT headword, gloss, body FROM entry ORDER BY id').all()).toEqual([
      { headword: 'prostitute', gloss: 'عَاهِرَة', body: JSON.stringify({ v: 1, senses: [{ gloss: 'عَاهِرَة' }, { gloss: 'بَغِيّ' }] }) },
      { headword: 'there', gloss: 'هُنَاكَ', body: JSON.stringify({ v: 1, senses: [{ gloss: 'هُنَاكَ' }] }) },
    ]);
  });

  it('drops whole senses, not words, when the package is not to Arabic', () => {
    expect(headwords(write('fr', 'en', [row('x', [{ gloss: 'نَاكَ' }]), row('y', [{ gloss: 'un mot, puis نَاكَ' }, { gloss: 'autre' }])], true))).toEqual(['y']);
  });

  it('counts entries without alias rows', () => {
    const path = write('en', 'ar', [row('slut', [{ gloss: 'x' }]), row('a', [{ gloss: 'y' }]), row('b', [{ gloss: 'y' }], true)], true);
    expect(metaValue(path, 'entry_count')).toBe('1');
  });
});

describe('refilterFile', () => {
  it('filters a published package in place and bumps its version', () => {
    const path = write('ar', 'en', [row('كِتَاب', [{ gloss: 'book' }]), row('شَرَامِيط', [{ gloss: 'plural', formOf: 'شَرْمُوطَة' }])]);
    const result = refilterFile(path, '20261012.1');
    expect(result.before).toBe(2);
    expect(result.after).toBe(1);
    expect(result.droppedRows['formof:dangling']).toEqual(['شَرَامِيط']);
    expect(headwords(path)).toEqual(['كِتَاب']);
    expect(metaValue(path, 'entry_count')).toBe('1');
    expect(metaValue(path, 'version')).toBe('20261012.1');
  });

  it('refuses packages with alias rows, whose entry count it cannot recompute', () => {
    const path = write('ja', 'en', [row('学校', [{ gloss: 'school' }]), row('がっこう', [{ gloss: 'school' }], true)]);
    expect(() => refilterFile(path, '20261012.1')).toThrow(/alias/);
  });
});

describe('filterPackageDb on from-Arabic packages', () => {
  it('drops vulgar Arabic headwords, then the forms that pointed at them', () => {
    const path = write(
      'ar',
      'en',
      [
        row('شَرْمُوطَة', [{ gloss: 'rag' }]),
        row('شَرَامِيط', [{ gloss: 'plural of شَرْمُوطَة', formOf: 'شَرْمُوطَة' }]),
        row('هُنَاكَ', [{ gloss: 'there' }]),
      ],
      true,
    );
    expect(headwords(path)).toEqual(['هُنَاكَ']);
  });

  it('reports the reasons', () => {
    const db = new DatabaseSync(write('ar', 'en', [row('قَحْبَة', [{ gloss: 'cougher' }]), row('قِحَاب', [{ gloss: 'plural', formOf: 'قَحْبَة' }])]));
    expect(filterPackageDb(db, { from: 'ar', to: 'en' }).droppedRows).toEqual({ 'headword:ar-vulgar': ['قَحْبَة'], 'formof:dangling': ['قِحَاب'] });
  });

  it('strips a trailing gender, number or verb-form mark from the headword and its key', () => {
    const db = new DatabaseSync(
      write('ar', 'en', [row('وَاحَة f .', [{ gloss: 'oasis' }]), row('أَعْمَى IV .', [{ gloss: 'to blind' }]), row('أُمَّانِ du', [{ gloss: 'two mothers' }]), row('خَرِفَ I خَرَفَ', [{ gloss: 'x' }])]),
    );
    expect(filterPackageDb(db, { from: 'ar', to: 'en' }).cleanedHeadwords).toBe(3);
    expect(db.prepare('SELECT headword, search_key FROM entry ORDER BY id').all()).toEqual([
      { headword: 'وَاحَة', search_key: 'واحه' },
      { headword: 'أَعْمَى', search_key: 'اعمي' },
      { headword: 'أُمَّانِ', search_key: 'امان' },
      { headword: 'خَرِفَ I خَرَفَ', search_key: normalizeKey('خَرِفَ I خَرَفَ') },
    ]);
  });
});

describe('filterPackageDb on glosses quoting Arabic vulgar words', () => {
  it('drops the senses of other packages that quote a listed word, then rows left empty', () => {
    const db = new DatabaseSync(
      write('ar', 'fr', [
        row('أَزْبَابٌ', [{ gloss: 'pluriel de زُبٌّ (zubbũ)' }]),
        row('شَوْشَلَآءُ', [{ gloss: 'Initus; syn. نَيْكٌ' }, { gloss: 'a word of Abyssinian origin' }]),
        row('هُنَا', [{ gloss: 'ici, comme dans هُنَاكَ' }]),
      ]),
    );
    const result = filterPackageDb(db, { from: 'ar', to: 'fr' });
    expect(result.droppedRows['gloss:ar-vulgar']).toEqual(['أَزْبَابٌ']);
    expect(result.droppedSenses['gloss:ar-vulgar']).toBe(2);
    expect(result.senseSamples['gloss:ar-vulgar']).toEqual(['أَزْبَابٌ: pluriel de زُبٌّ (zubbũ)', 'شَوْشَلَآءُ: Initus; syn. نَيْكٌ']);
    expect(db.prepare('SELECT headword, gloss, body FROM entry ORDER BY id').all()).toEqual([
      { headword: 'شَوْشَلَآءُ', gloss: 'a word of Abyssinian origin', body: JSON.stringify({ v: 1, senses: [{ gloss: 'a word of Abyssinian origin' }] }) },
      { headword: 'هُنَا', gloss: 'ici, comme dans هُنَاكَ', body: JSON.stringify({ v: 1, senses: [{ gloss: 'ici, comme dans هُنَاكَ' }] }) },
    ]);
  });

  it('leaves words not on the list, such as زبر and نكح', () => {
    const db = new DatabaseSync(write('ar', 'en', [row('زَبْر', [{ gloss: 'verbal noun of زَبَرَ' }]), row('نِكَاح', [{ gloss: 'marriage; syn. نكح' }])]));
    expect(filterPackageDb(db, { from: 'ar', to: 'en' }).droppedRows).toEqual({});
  });
});

describe('the arabicGlosses option', () => {
  it('keeps prose senses quoting listed words but still drops blocked headwords', () => {
    const db = new DatabaseSync(write('ar', 'en', [row('فَقِهَ', [{ gloss: 'He understood; a citation with نَاكَ' }]), row('قَحْبَة', [{ gloss: 'x' }])]));
    expect(filterPackageDb(db, { from: 'ar', to: 'en', arabicGlosses: false }).droppedRows).toEqual({ 'headword:ar-vulgar': ['قَحْبَة'] });
    expect(headwords(db.location() as string)).toEqual(['فَقِهَ']);
  });

  it('is off for the Perseus dictionaries', () => {
    expect(PACKAGE_FILTERS['lane-lexicon']?.arabicGlosses).toBe(false);
    expect(PACKAGE_FILTERS['salmone-1889']?.arabicGlosses).toBe(false);
  });
});

describe('filterPackageDb on relations, forms and tables', () => {
  const body = (headword: string): EntryRow => ({
    ...row(headword, [{ gloss: 'pin' }]),
    body: {
      v: 1,
      senses: [{ gloss: 'pin' }],
      relations: [
        { kind: 'synonyms', words: ['إِبْرَة', 'زُبّ'] },
        { kind: 'related', words: ['كُسّ'] },
      ],
      forms: [
        { label: 'plural', form: 'دَبَابِيس' },
        { label: 'plural', form: 'زُبّ' },
      ],
      tables: [{ title: 'declension', rows: [{ label: 'a', form: 'دَبُّوس' }, { label: 'b', form: 'قَحْبَة' }] }],
    },
  });

  it('drops the matching relation word and form rows in from-Arabic packages', () => {
    const db = new DatabaseSync(write('ar', 'en', [body('دَبُّوس')]));
    const result = filterPackageDb(db, { from: 'ar', to: 'en' });
    expect(result.droppedSenses).toEqual({ 'relation:ar-vulgar': 2, 'form:ar-vulgar': 2 });
    expect(JSON.parse((db.prepare('SELECT body FROM entry').get() as { body: string }).body)).toEqual({
      v: 1,
      senses: [{ gloss: 'pin' }],
      relations: [{ kind: 'synonyms', words: ['إِبْرَة'] }],
      forms: [{ label: 'plural', form: 'دَبَابِيس' }],
      tables: [{ title: 'declension', rows: [{ label: 'a', form: 'دَبُّوس' }] }],
    });
  });

  it('only checks relations in packages from other languages', () => {
    const db = new DatabaseSync(write('fr', 'ar', [body('épingle')]));
    expect(filterPackageDb(db, { from: 'fr', to: 'ar' }).droppedSenses).toEqual({ 'relation:ar-vulgar': 2 });
  });

  it('leaves Perseus bodies alone', () => {
    const db = new DatabaseSync(write('ar', 'en', [body('دَبُّوس')]));
    expect(filterPackageDb(db, { from: 'ar', to: 'en', arabicGlosses: false }).droppedSenses).toEqual({});
  });
});

describe('rekeying', () => {
  const stale = (headword: string, search_key: string): EntryRow => ({ ...row(headword, [{ gloss: 'heart' }]), search_key });

  it('recomputes search keys that the current normalizer would write differently', () => {
    const db = new DatabaseSync(write('fr', 'en', [stale('cœur', 'cœur'), stale('chat', 'chat')]));
    expect(filterPackageDb(db, { from: 'fr', to: 'en' }).rekeyed).toBe(1);
    expect(db.prepare('SELECT headword, search_key FROM entry ORDER BY id').all()).toEqual([
      { headword: 'cœur', search_key: 'coeur' },
      { headword: 'chat', search_key: 'chat' },
    ]);
  });

  it('leaves keys alone when asked, as for packages with alias rows', () => {
    const db = new DatabaseSync(write('ja', 'en', [stale('学校', 'がっこう')]));
    expect(filterPackageDb(db, { from: 'ja', to: 'en', rekey: false }).rekeyed).toBe(0);
    expect(db.prepare('SELECT search_key FROM entry').get()).toEqual({ search_key: 'がっこう' });
  });

  it('knows when a package has alias rows', () => {
    const writer = new PackageWriter(join(tempDir(), 'a.sqlite'), meta('ja', 'en'));
    writer.add(row('学校', [{ gloss: 'school' }]));
    expect(writer.hasAliases).toBe(false);
    writer.add(row('がっこう', [{ gloss: 'school' }], true));
    expect(writer.hasAliases).toBe(true);
    writer.finish();
  });
});

describe('filterPackageDb revisions', () => {
  const glossOf = (path: string, headword: string) =>
    new DatabaseSync(path).prepare('SELECT gloss, body FROM entry WHERE headword = ?').get(headword) as { gloss: string; body: string };

  it('rewrites dated terms in place, keeping a row gloss that is not the first sense', () => {
    const lane: EntryRow = { ...row('حَامِىٌّ', [{ gloss: 'A black, or negro, boy or young man, (S, K,) or slave' }]), gloss: 'A black, or negro, boy' };
    const path = write('ar', 'en', [lane]);
    const result = filterPackageDb(new DatabaseSync(path), { from: 'ar', to: 'en', arabicGlosses: false, modernise: 'en' });
    expect(glossOf(path, 'حَامِىٌّ')).toEqual({ gloss: 'A Black boy', body: JSON.stringify({ v: 1, senses: [{ gloss: 'A Black boy or young man, (S, K,) or slave' }] }) });
    expect(result.rewrites).toEqual(['حَامِىٌّ: A black, or negro, boy or young man, (S, K,) or slave → A Black boy or young man, (S, K,) or slave']);
  });

  it('drops untagged slur senses and the rows they empty, and labels dated headwords', () => {
    const path = write('en', 'en', [
      row('nigger', [{ gloss: 'A friend.' }]),
      row('Yid', [{ gloss: 'A Jew.' }, { gloss: 'A Tottenham supporter.' }]),
      row('negro', [{ gloss: 'A slave.', labels: ['archaic'] }]),
    ]);
    const result = filterPackageDb(new DatabaseSync(path), { from: 'en', to: 'en' });
    expect(headwords(path)).toEqual(['Yid', 'negro']);
    expect(glossOf(path, 'Yid').gloss).toBe('A Tottenham supporter.');
    expect(JSON.parse(glossOf(path, 'negro').body).senses[0].labels).toEqual(['archaic', 'dated', 'offensive']);
    expect(result.droppedSenses['slur:untagged']).toBe(2);
    expect(result.droppedRows['slur:untagged']).toEqual(['nigger']);
    expect(result.labelled).toEqual(['negro']);
  });

  it('keeps the row gloss of an entry that is only labelled', () => {
    const path = write('en', 'en', [row('Nigra', [{ gloss: 'Alternative form of Negro.' }])]);
    filterPackageDb(new DatabaseSync(path), { from: 'en', to: 'en', modernise: 'en' });
    expect(glossOf(path, 'Nigra').gloss).toBe('Alternative form of Negro.');
    expect(JSON.parse(glossOf(path, 'Nigra').body).senses[0].labels).toEqual(['dated', 'offensive']);
  });

  it('modernises the Perseus dictionaries and the packages with descriptive uses', () => {
    for (const id of ['lane-lexicon', 'salmone-1889', 'oewn-2025', 'awn4-en-ar', 'wiktionary-en']) expect(PACKAGE_FILTERS[id]?.modernise).toBe('en');
    expect(PACKAGE_FILTERS['wiktionary-fr-ar']?.modernise).toBe('fr');
  });
});
