import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { normalizeKey, prefixUpperBound } from '@lexnur/core';
import { PackageWriter, type PackageMeta } from '../src/package/writer.ts';
import type { EntryRow } from '../src/rows.ts';
import { tempDir } from './tmp.ts';

const META: PackageMeta = {
  id: 'test-dict',
  title: 'Test',
  from: 'en',
  to: 'en',
  version: '20261011.1',
  license: 'CC BY 4.0',
  attribution: 'Test attribution',
  source_date: '2026-10-10',
};

const row = (headword: string, sort_order = 0): EntryRow => ({
  headword,
  search_key: normalizeKey(headword),
  pos: 'noun',
  root: null,
  gloss: `gloss of ${headword}`,
  sort_order,
  body: { v: 1, senses: [{ gloss: `gloss of ${headword}` }] },
});

describe('PackageWriter', () => {
  it('stores alias rows without counting them as entries', () => {
    const path = join(tempDir(), 'a.sqlite');
    const writer = new PackageWriter(path, META);
    writer.add(row('学校'));
    writer.add({ ...row('學校', 1), alias: true });
    expect(writer.finish()).toBe(1);
    const db = new DatabaseSync(path, { readOnly: true });
    expect(db.prepare("SELECT value FROM meta WHERE key = 'entry_count'").get()).toEqual({ value: '1' });
    expect(db.prepare('SELECT count(*) AS n FROM entry').get()).toEqual({ n: 2 });
    db.close();
  });

  it('writes a package that opens read-only, with meta, both indexes and prefix order', () => {
    const path = join(tempDir(), 'p.sqlite');
    const writer = new PackageWriter(path, META);
    for (const r of [row('writing'), row('write'), row('Write', 1), row('book')]) writer.add(r);
    expect(writer.add({ ...row('x'), search_key: '' })).toBe(false);
    expect(writer.finish()).toBe(4);
    expect(writer.skippedEmptyKey).toBe(1);
    expect(existsSync(`${path}-wal`)).toBe(false);
    expect(existsSync(`${path}-journal`)).toBe(false);

    const db = new DatabaseSync(path, { readOnly: true });
    expect(db.prepare('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'delete' });
    expect(db.prepare('PRAGMA page_size').get()).toEqual({ page_size: 4096 });
    const meta = Object.fromEntries(db.prepare('SELECT key, value FROM meta').all().map((r) => [r.key, r.value]));
    expect(meta).toEqual({ ...META, entry_count: '4', schema_version: '1' });
    const indexes = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all()
      .map((r) => r.name);
    expect(indexes).toEqual(['entry_key', 'entry_root']);
    const q = normalizeKey('writ');
    const hits = db
      .prepare('SELECT headword FROM entry WHERE search_key >= ? AND search_key < ? ORDER BY search_key, sort_order LIMIT 20')
      .all(q, prefixUpperBound(q))
      .map((r) => r.headword);
    expect(hits).toEqual(['write', 'Write', 'writing']);
    const body = db.prepare("SELECT body FROM entry WHERE headword = 'book'").get();
    expect(JSON.parse(String(body?.body))).toEqual({ v: 1, senses: [{ gloss: 'gloss of book' }] });
    db.close();
  });

  it('writes an availability statement to meta only when given', () => {
    const path = join(tempDir(), 'p.sqlite');
    const writer = new PackageWriter(path, { ...META, availability: 'Leave this statement intact.' });
    writer.add(row('book'));
    writer.finish();
    const db = new DatabaseSync(path, { readOnly: true });
    expect(db.prepare("SELECT value FROM meta WHERE key = 'availability'").get()).toEqual({ value: 'Leave this statement intact.' });
    db.close();
  });

  it('replaces a previous file at the same path', () => {
    const path = join(tempDir(), 'p.sqlite');
    const first = new PackageWriter(path, META);
    first.add(row('old'));
    first.finish();
    const second = new PackageWriter(path, META);
    second.add(row('new'));
    second.finish();
    const db = new DatabaseSync(path, { readOnly: true });
    expect(db.prepare('SELECT headword FROM entry').all().map((r) => r.headword)).toEqual(['new']);
    db.close();
  });
});
