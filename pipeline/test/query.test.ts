import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeKey } from '@lexnur/core';
import { PackageWriter } from '../src/package/writer.ts';
import { queryPackage } from '../src/query.ts';
import type { EntryRow } from '../src/rows.ts';
import { tempDir } from './tmp.ts';

const row = (headword: string, root: string | null, sort_order = 0): EntryRow => ({
  headword,
  search_key: normalizeKey(headword),
  pos: 'noun',
  root,
  gloss: headword,
  sort_order,
  body: { v: 1, senses: [{ gloss: headword }] },
});

describe('queryPackage', () => {
  const path = join(tempDir(), 'q.sqlite');
  const writer = new PackageWriter(path, { id: 't', title: 't', from: 'ar', to: 'en', version: '20261011.1', license: 'x', attribution: 'x', source_date: '2026-10-10' });
  for (const r of [row('كَتَبَ', 'ك ت ب'), row('كُتُب', 'ك ت ب', 1), row('كَاتِب', 'ك ت ب'), row('أَكَلَ', 'ا ك ل')]) writer.add(r);
  writer.finish();

  it('finds unvowelled and vowelled prefixes, lemmas first', () => {
    expect(queryPackage(path, 'كتب').map((h) => h.headword)).toEqual(['كَتَبَ', 'كُتُب']);
    expect(queryPackage(path, 'كَتَ').map((h) => h.headword)).toEqual(['كَتَبَ', 'كُتُب']);
  });

  it('folds alef forms in the query', () => {
    expect(queryPackage(path, 'اكل').map((h) => h.headword)).toEqual(['أَكَلَ']);
  });

  it('answers a root query from entry_root', () => {
    expect(queryPackage(path, 'ك ت ب').map((h) => h.headword).sort()).toEqual(['كَاتِب', 'كَتَبَ', 'كُتُب'].sort());
  });
});
