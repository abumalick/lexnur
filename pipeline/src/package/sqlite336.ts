import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ENTRY_SQL, isSupportedSchema, prefixSql } from '@lexnur/core';
import { REPO } from '../paths.ts';

// iOS 15's system SQLite is 3.36, the oldest engine that opens our packages. This gate opens a package
// with a 3.36 shell built from the official amalgamation and checks that it answers the app's queries
// exactly as the current SQLite does, evaluating every generated column on the way.
const ZIP_URL = 'https://www.sqlite.org/2021/sqlite-amalgamation-3360000.zip';
const ZIP_SHA256 = '999826fe4c871f18919fdb8ed7ec9dd8217180854dd1fe21eea96aed36186729';
const DIR = join(REPO, '.tmp', 'sqlite336');
const SHELL = join(DIR, 'sqlite3');

function ensureShell(): string {
  if (existsSync(SHELL)) return SHELL;
  mkdirSync(DIR, { recursive: true });
  const zip = join(DIR, 'amalgamation.zip');
  execFileSync('curl', ['-sfL', ZIP_URL, '-o', zip]);
  const sha = execFileSync('sha256sum', [zip], { encoding: 'utf8' }).split(' ')[0];
  if (sha !== ZIP_SHA256) throw new Error(`${ZIP_URL}: sha256 ${sha}`);
  execFileSync('unzip', ['-oq', zip, '-d', DIR]);
  const src = join(DIR, 'sqlite-amalgamation-3360000');
  execFileSync('cc', ['-O2', '-DSQLITE_THREADSAFE=0', join(src, 'shell.c'), join(src, 'sqlite3.c'), '-o', SHELL, '-ldl', '-lm']);
  return SHELL;
}

const lit = (v: string | number) => (typeof v === 'number' ? String(v) : `'${v.replaceAll("'", "''")}'`);
const bind = (sql: string, params: (string | number)[]) => {
  let i = 0;
  return sql.replace(/\?/g, () => lit(params[i++]!));
};

export function checkSqlite336(path: string, keys = ['a', 'ma', 'the', 'w', 'zz']): { queries: number } {
  const db = new DatabaseSync(path, { readOnly: true });
  const schema = Number((db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string }).value);
  if (!isSupportedSchema(schema)) throw new Error(`${path}: schema_version ${schema}`);
  const ids = (db.prepare('SELECT id FROM entry ORDER BY random() LIMIT 20').all() as { id: number }[]).map((r) => r.id);
  const queries = [
    'SELECT count(*) AS n, sum(length(headword)) AS h, sum(length(gloss)) AS g, sum(length(body)) AS b, sum(length(search_key)) AS k FROM entry',
    "SELECT value FROM meta WHERE key = 'schema_version'",
    ...keys.map((k) => bind(prefixSql(20), [k, `${k}\u{10FFFF}`])),
    ...ids.map((id) => bind(ENTRY_SQL[schema], [id])),
  ];
  const shell = ensureShell();
  for (const sql of queries) {
    const want = db.prepare(sql).all();
    const out = execFileSync(shell, ['-readonly', '-json', path, sql], { encoding: 'utf8', maxBuffer: 1 << 26 });
    const got = out.trim() ? JSON.parse(out) : [];
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      throw new Error(`${path}: SQLite 3.36 answers differently to ${sql.slice(0, 120)}: ${JSON.stringify(got).slice(0, 300)} vs ${JSON.stringify(want).slice(0, 300)}`);
    }
  }
  db.close();
  return { queries: queries.length };
}
