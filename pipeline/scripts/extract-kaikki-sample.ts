import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SOURCES } from '../src/paths.ts';
import { newStats } from '../src/rows.ts';
import { readKaikki, type KaikkiEntry } from '../src/sources/kaikki.ts';

const wanted: [lang: string, word: string, pos: string][] = [
  ['ar', 'كتب', 'verb'],
  ['ar', 'كتاب', 'noun'],
  ['en', 'write', 'verb'],
];
const found = new Map<string, KaikkiEntry>();
for await (const e of readKaikki(SOURCES.kaikki, ['ar', 'en'], newStats())) {
  const key = `${e.lang_code}|${e.word}|${e.pos}`;
  if (!found.has(key) && wanted.some(([l, w, p]) => `${l}|${w}|${p}` === key)) found.set(key, e);
  if (found.size === wanted.length) break;
}
const lines = wanted.map(([l, w, p]) => found.get(`${l}|${w}|${p}`)).filter(Boolean).map((e) => JSON.stringify(e));
writeFileSync(join(import.meta.dirname, '../test/data/kaikki-sample.jsonl'), `${lines.join('\n')}\n`);
console.log(`wrote ${lines.length} lines`);
