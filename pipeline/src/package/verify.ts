import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { BODY_DICT_SQL, bodyDecoder, ENTRY_SQL, entryBodyText, hexToBytes, isSupportedSchema } from '@lexnur/core';

export interface PlainRow {
  id: number;
  headword: string;
  search_key: string;
  pos: string | null;
  root: string | null;
  gloss: string | null;
  sort_order: number;
  body: string;
}

const FIELDS = ['headword', 'search_key', 'pos', 'root', 'gloss', 'sort_order', 'body'] as const;

export const metaOf = (db: DatabaseSync): Record<string, string> =>
  Object.fromEntries((db.prepare('SELECT key, value FROM meta').all() as { key: string; value: string }[]).map((m) => [m.key, m.value]));

export const isCompacted = (db: DatabaseSync): boolean => !!db.prepare("SELECT 1 FROM pragma_table_info('entry') WHERE name = 'tpl'").get();

// Reads any package row by row in (search_key, sort_order, id) order, each body through the app's own
// SQL and decoder.
export async function* readPackage(db: DatabaseSync): AsyncGenerator<PlainRow> {
  const schema = Number(metaOf(db).schema_version);
  if (!isSupportedSchema(schema)) throw new Error(`schema_version ${schema}`);
  const decoder = schema === 2 ? await bodyDecoder(hexToBytes((db.prepare(BODY_DICT_SQL).get() as { data: string }).data)) : null;
  const entry = db.prepare(ENTRY_SQL[schema]);
  const listed = db.prepare('SELECT search_key, sort_order, gloss FROM entry WHERE id = ?');
  for (const { id } of db.prepare('SELECT id FROM entry ORDER BY search_key, sort_order, id').iterate() as Iterable<{ id: number }>) {
    const e = entry.get(id) as Record<string, unknown>;
    yield { ...(e as unknown as PlainRow), ...(listed.get(id) as object), body: entryBodyText(e, decoder) };
  }
}

// Round-trip gate: every row of the compacted package must equal the plain source row it came from.
// Compaction renumbers ids, so rows are matched in (search_key, sort_order, source id) order, the order
// compaction writes them in.
export async function verifyCompacted(srcPath: string, dstPath: string): Promise<{ rows: number }> {
  const src = new DatabaseSync(srcPath, { readOnly: true });
  const dst = new DatabaseSync(dstPath, { readOnly: true });
  try {
    const a = metaOf(src);
    const b = metaOf(dst);
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (key !== 'schema_version' && key !== 'version' && a[key] !== b[key]) throw new Error(`${dstPath}: meta ${key} ${JSON.stringify(b[key])}, source has ${JSON.stringify(a[key])}`);
    }
    const it = readPackage(dst);
    let n = 0;
    for (const want of src.prepare('SELECT headword, search_key, pos, root, gloss, sort_order, body FROM entry ORDER BY search_key, sort_order, id').iterate() as Iterable<PlainRow>) {
      const next = await it.next();
      if (next.done) throw new Error(`${dstPath}: ${n} rows, the source has more`);
      for (const f of FIELDS) {
        if (next.value[f] !== want[f]) throw new Error(`${dstPath}: row ${n} (${want.search_key}) ${f} differs: ${JSON.stringify(next.value[f])?.slice(0, 200)} vs ${JSON.stringify(want[f])?.slice(0, 200)}`);
      }
      n++;
    }
    if (!(await it.next()).done) throw new Error(`${dstPath}: more rows than the source`);
    return { rows: n };
  } finally {
    src.close();
    dst.close();
  }
}

// The inverse of compaction: a plain schema-1 package, so filters can run on a published compacted package.
export async function expandPackage(srcPath: string, dstPath: string): Promise<void> {
  const src = new DatabaseSync(srcPath, { readOnly: true });
  mkdirSync(dirname(dstPath), { recursive: true });
  for (const suffix of ['', '-journal']) rmSync(dstPath + suffix, { force: true });
  const dst = new DatabaseSync(dstPath);
  dst.exec(`PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF;
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE entry(id INTEGER PRIMARY KEY, headword TEXT NOT NULL, search_key TEXT NOT NULL, pos TEXT, root TEXT, gloss TEXT, sort_order INTEGER NOT NULL, body TEXT NOT NULL);
BEGIN;`);
  const meta = dst.prepare('INSERT INTO meta(key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(metaOf(src))) meta.run(k, k === 'schema_version' ? '1' : v);
  const insert = dst.prepare('INSERT INTO entry(id, headword, search_key, pos, root, gloss, sort_order, body) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  for await (const r of readPackage(src)) insert.run(r.id, r.headword, r.search_key, r.pos, r.root, r.gloss, r.sort_order, r.body);
  dst.exec('COMMIT');
  dst.exec('CREATE INDEX entry_key ON entry(search_key, sort_order); CREATE INDEX entry_root ON entry(root) WHERE root IS NOT NULL;');
  dst.exec('PRAGMA journal_mode = DELETE');
  dst.exec('VACUUM');
  src.close();
  dst.close();
}
