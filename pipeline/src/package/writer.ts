import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { META_KEYS, PACKAGE_SCHEMA_VERSION } from '@lexnur/core';
import type { EntryRow } from '../rows.ts';

export interface PackageMeta {
  id: string;
  title: string;
  from: string;
  to: string;
  version: string;
  license: string;
  attribution: string;
  source_date: string;
  availability?: string;
}

const SCHEMA = `
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE entry(
  id INTEGER PRIMARY KEY,
  headword TEXT NOT NULL,
  search_key TEXT NOT NULL,
  pos TEXT,
  root TEXT,
  gloss TEXT,
  sort_order INTEGER NOT NULL,
  body TEXT NOT NULL
);`;

export class PackageWriter {
  readonly path: string;
  private readonly meta: PackageMeta;
  private readonly db: DatabaseSync;
  private readonly insert: StatementSync;
  private readonly aliasIds: number[] = [];
  skippedEmptyKey = 0;

  constructor(path: string, meta: PackageMeta) {
    this.path = path;
    this.meta = meta;
    mkdirSync(dirname(path), { recursive: true });
    for (const suffix of ['', '-journal', '-wal', '-shm']) rmSync(path + suffix, { force: true });
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA page_size = 4096; PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF;');
    this.db.exec(SCHEMA);
    this.db.exec('BEGIN');
    this.insert = this.db.prepare(
      'INSERT INTO entry(headword, search_key, pos, root, gloss, sort_order, body) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
  }

  get hasAliases(): boolean {
    return this.aliasIds.length > 0;
  }

  add(row: EntryRow): boolean {
    if (row.search_key === '') {
      this.skippedEmptyKey++;
      return false;
    }
    const { lastInsertRowid } = this.insert.run(row.headword, row.search_key, row.pos, row.root, row.gloss, row.sort_order, JSON.stringify(row.body));
    if (row.alias) this.aliasIds.push(Number(lastInsertRowid));
    return true;
  }

  finish(filter?: (db: DatabaseSync) => void): number {
    this.db.exec('COMMIT');
    filter?.(this.db);
    const count = this.entryCount();
    this.db.exec(
      'CREATE INDEX entry_key ON entry(search_key, sort_order); CREATE INDEX entry_root ON entry(root) WHERE root IS NOT NULL;',
    );
    const values: Record<(typeof META_KEYS)[number], string> = {
      ...this.meta,
      entry_count: String(count),
      schema_version: String(PACKAGE_SCHEMA_VERSION),
    };
    const put = this.db.prepare('INSERT INTO meta(key, value) VALUES (?, ?)');
    for (const key of META_KEYS) put.run(key, values[key]);
    if (this.meta.availability) put.run('availability', this.meta.availability);
    this.db.exec('PRAGMA journal_mode = DELETE');
    this.db.exec('VACUUM');
    this.db.close();
    return count;
  }

  private entryCount(): number {
    const total = (this.db.prepare('SELECT count(*) AS n FROM entry').get() as { n: number }).n;
    const alias = this.db.prepare('SELECT 1 FROM entry WHERE id = ?');
    return total - this.aliasIds.filter((id) => alias.get(id)).length;
  }
}
