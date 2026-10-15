import { statSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { normalizeKey, parsePublishedCatalog } from '@lexnur/core';
import { FIXTURE_IDS } from '../src/fixture/build.ts';
import { readJson } from '../src/json.ts';
import { sha256File } from '../src/package/compress.ts';
import { FIXTURES } from '../src/paths.ts';
import { queryPackage } from '../src/query.ts';

const pkg = (id: string) => join(FIXTURES, 'packages', `${id}.sqlite`);
const ENGLISH = ['write', 'writer', 'writing', 'written', 'wrote', 'book', 'bank', 'light', 'go', 'went', 'run', 'serendipity'];
const OEWN = ['write', 'writer', 'writing', 'written', 'book', 'bank', 'light', 'go', 'run'];
const ARABIC = ['كَتَبَ', 'كِتَاب', 'كَاتِب', 'مَكْتَب', 'مَكْتَبَة', 'كِتَابَة', 'مَكْتُوب', 'أَكَلَ', 'إِسْلَام', 'آمَنَ', 'مُسْتَشْفًى', 'مَدْرَسَة', 'قَرَأَ', 'عِلْم'];

describe('fixtures/catalog.json', () => {
  const catalog = parsePublishedCatalog(readJson(join(FIXTURES, 'catalog.json')), { strict: true });

  it('lists the three fixtures with relative urls, matching sizes and sha256', async () => {
    expect(catalog.dictionaries.map((d) => d.id).sort()).toEqual([...FIXTURE_IDS].sort());
    for (const d of catalog.dictionaries) {
      expect(d.version).toBe('fixture');
      expect(d.source_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(d.url).toBe(`packages/${d.id}.sqlite.zst`);
      const zst = join(FIXTURES, d.url);
      expect(statSync(zst).size).toBe(d.size_bytes);
      expect(statSync(pkg(d.id)).size).toBe(d.installed_size_bytes);
      expect(await sha256File(zst)).toBe(d.sha256);
    }
  });

  it('has entry counts near the contract sizes', () => {
    const count = (id: string) => catalog.dictionaries.find((d) => d.id === id)?.entry_count ?? 0;
    expect(count('oewn-2025')).toBeGreaterThanOrEqual(60);
    expect(count('oewn-2025')).toBeLessThanOrEqual(160);
    expect(count('wiktionary-ar-en')).toBeGreaterThanOrEqual(50);
    expect(count('wiktionary-ar-en')).toBeLessThanOrEqual(200);
    expect(count('wiktionary-en')).toBeGreaterThanOrEqual(25);
    expect(count('wiktionary-en')).toBeLessThanOrEqual(150);
  });
});

describe('fixture packages', () => {
  it.each(FIXTURE_IDS)('%s has meta.version fixture', (id) => {
    const db = new DatabaseSync(pkg(id), { readOnly: true });
    expect(db.prepare("SELECT value FROM meta WHERE key = 'version'").get()).toEqual({ value: 'fixture' });
    db.close();
  });

  it.each(ENGLISH)('wiktionary-en has %s', (word) => {
    expect(queryPackage(pkg('wiktionary-en'), word, 50).some((h) => h.headword === word)).toBe(true);
  });

  it.each(OEWN)('oewn-2025 has %s', (word) => {
    expect(queryPackage(pkg('oewn-2025'), word, 50).some((h) => h.headword === word)).toBe(true);
  });

  it('oewn-2025 does not have serendipity', () => {
    expect(queryPackage(pkg('oewn-2025'), 'serendipity', 5)).toEqual([]);
  });

  it.each(ARABIC)('wiktionary-ar-en resolves %s through its normalized key', (word) => {
    expect(queryPackage(pkg('wiktionary-ar-en'), word, 50).some((h) => normalizeKey(h.headword) === normalizeKey(word))).toBe(true);
  });

  it.each(ARABIC)('wiktionary-ar-en has the exact headword %s', (word) => {
    expect(queryPackage(pkg('wiktionary-ar-en'), word, 50).some((h) => h.headword === word)).toBe(true);
  });

  it('has كَتَبَ as a verb with root ك ت ب', () => {
    expect(queryPackage(pkg('wiktionary-ar-en'), 'كتب', 50)).toContainEqual(expect.objectContaining({ headword: 'كَتَبَ', pos: 'verb', root: 'ك ت ب' }));
  });

  it('answers the root query ك ت ب with several words', () => {
    expect(queryPackage(pkg('wiktionary-ar-en'), 'ك ت ب', 50).length).toBeGreaterThanOrEqual(3);
  });

  it('answers a hamza root query typed with ء or أ', () => {
    for (const q of ['ء م ن', 'أ م ن']) {
      expect(queryPackage(pkg('wiktionary-ar-en'), q, 50)).toContainEqual(expect.objectContaining({ headword: 'آمَنَ', root: 'ا م ن' }));
    }
  });
});
