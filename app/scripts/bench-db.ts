// Usage: tsx scripts/bench-db.ts <wiktionary-en.sqlite> <wiktionary-ar-en.sqlite> <out.sqlite>
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { mulberry32 } from '../src/smoke/bench';

const [en, ar, out] = process.argv.slice(2);
if (!en || !ar || !out) throw new Error('usage: bench-db.ts <wiktionary-en.sqlite> <wiktionary-ar-en.sqlite> <out.sqlite>');
mkdirSync(dirname(out), { recursive: true });
rmSync(out, { force: true });
copyFileSync(en, out);

const db = new DatabaseSync(out);
db.exec('PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;');
const { enMax } = db.prepare('SELECT MAX(id) AS enMax FROM entry').get() as { enMax: number };
db.exec(`ATTACH '${ar.replaceAll("'", "''")}' AS ar`);
db.exec(`INSERT INTO entry(headword, search_key, pos, root, gloss, sort_order, body)
  SELECT headword, search_key, pos, root, gloss, sort_order, body FROM ar.entry ORDER BY id`);
db.exec('DETACH ar');

// sort_order 0 marks a lemma; inflected-form rows are demoted to 1.
const enLemmas = (db.prepare('SELECT headword FROM entry WHERE sort_order = 0 AND id <= ? ORDER BY id').all(enMax) as { headword: string }[])
  .map((r) => r.headword).filter((w) => /^[a-z]{4,10}$/.test(w));
const arKeys = (db.prepare('SELECT search_key FROM entry WHERE id > ? ORDER BY id').all(enMax) as { search_key: string }[])
  .map((r) => r.search_key).filter((k) => [...k].length >= 3 && [...k].length <= 7);

const rand = mulberry32(42);
const pick = (xs: string[], n: number) => Array.from({ length: n }, () => xs[Math.floor(rand() * xs.length)]);
const common = ['the', 'water', 'house', 'write', 'light', 'go', 'time', 'people', 'world', 'school', 'book', 'friend', 'family', 'money', 'music', 'night', 'question', 'answer', 'language', 'dictionary'];
const words = [...common, ...pick(enLemmas, 130), ...pick(arKeys, 30)];

db.exec('CREATE TABLE bench_word(word TEXT NOT NULL)');
const insert = db.prepare('INSERT INTO bench_word(word) VALUES (?)');
for (const w of words) insert.run(w);
db.exec('CREATE INDEX IF NOT EXISTS entry_key ON entry(search_key, sort_order)');
db.exec("UPDATE meta SET value = 'bench' WHERE key = 'id'; UPDATE meta SET value = (SELECT COUNT(*) FROM entry) WHERE key = 'entry_count'");
db.exec('PRAGMA journal_mode=DELETE; VACUUM;');
const { n } = db.prepare('SELECT COUNT(*) AS n FROM entry').get() as { n: number };
db.close();
console.log(JSON.stringify({ out, entries: n, words: words.length }));
