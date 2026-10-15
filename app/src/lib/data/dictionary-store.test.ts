import { beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { SqlDriver } from '../sql/driver';
import { nodeDriver } from '../sql/node-driver';
import { fixtureInstalled, resolveFixture } from '../test/fixtures';
import { DictionaryStore, dirOfLanguage, scriptsOfLanguage } from './dictionary-store';

let store: DictionaryStore;
const ALL = { kind: 'all' } as const;
const one = (id: string) => ({ kind: 'one', id }) as const;

beforeEach(async () => {
  store = new DictionaryStore(nodeDriver, resolveFixture);
  await store.setInstalled(fixtureInstalled);
});

describe('DictionaryStore.suggest', () => {
  it('returns prefix matches with the exact key first', async () => {
    const r = await store.suggest('writ', one('oewn-2025'));
    expect(r.mode).toBe('prefix');
    expect(r.items.map((s) => s.headword)).toContain('write');
    expect(r.items[0].headword.startsWith('writ')).toBe(true);
    const exact = await store.suggest('write', one('oewn-2025'));
    expect(exact.items[0].headword).toBe('write');
  });

  it('ignores Arabic diacritics and shows the vowelled form', async () => {
    const r = await store.suggest('كتب', one('wiktionary-ar-en'));
    const hit = r.items.find((s) => s.headword === 'كَتَبَ');
    expect(hit).toBeDefined();
    expect(hit!.root).toBe('ك ت ب');
  });

  it('folds alef variants, ى and ة', async () => {
    expect((await store.suggest('اكل', ALL)).items.some((s) => s.headword === 'أَكَلَ')).toBe(true);
    expect((await store.suggest('مستشفي', ALL)).items.some((s) => s.headword === 'مُسْتَشْفًى')).toBe(true);
    expect((await store.suggest('مستشفى', ALL)).items.some((s) => s.headword === 'مُسْتَشْفًى')).toBe(true);
    expect((await store.suggest('مدرسه', ALL)).items.some((s) => s.headword === 'مَدْرَسَة')).toBe(true);
  });

  it('diacritics typed rank exact vowelled first', async () => {
    const r = await store.suggest('كَتَبَ', one('wiktionary-ar-en'));
    expect(r.items[0].headword).toBe('كَتَبَ');
  });

  it('mixed-script query uses first strong char', async () => {
    const r = await store.suggest('write كتب', one('wiktionary-ar-en'));
    expect(r.scriptFallback?.script).toBe('latin');
  });

  it('treats spaced Arabic letters as a root query', async () => {
    const r = await store.suggest('ك ت ب', ALL);
    expect(r.mode).toBe('root');
    expect(r.root).toBe('ك ت ب');
    expect(r.items.length).toBeGreaterThanOrEqual(3);
    expect(r.items.every((s) => s.root === 'ك ت ب')).toBe(true);
  });

  it('offers the matching-script dictionary when the scope does not fit', async () => {
    const r = await store.suggest('كتب', one('oewn-2025'));
    expect(r.scriptFallback).toEqual({ script: 'arabic', dictionaryIds: ['wiktionary-ar-en'] });
    expect(r.items.every((s) => s.dictionaryId === 'wiktionary-ar-en')).toBe(true);
  });

  it('groups the same headword across dictionaries in All scope', async () => {
    const r = await store.suggest('write', ALL);
    const rows = r.items.filter((s) => s.headword === 'write');
    expect(new Set(rows.map((x) => x.dictionaryId)).size).toBe(1);
    expect([rows[0].dictionaryId, ...rows[0].alsoIn].sort()).toEqual(['oewn-2025', 'wiktionary-en']);
  });

  it('reports other dictionaries when the scope has no match', async () => {
    const r = await store.suggest('serendipity', one('oewn-2025'));
    expect(r.items).toEqual([]);
    expect(r.elsewhere).toEqual(['wiktionary-en']);
  });

  it('caps results at the limit', async () => {
    expect((await store.suggest('b', ALL, 5)).items).toHaveLength(5);
  });

  it('does not throw on an Arabic presentation-form query', async () => {
    await expect(store.suggest('\uFEDB\uFE92\uFE90', ALL)).resolves.toMatchObject({ mode: 'prefix' });
  });

  it('returns nothing for blank or mark-only input', async () => {
    expect((await store.suggest('   ', ALL)).items).toEqual([]);
    expect((await store.suggest('َ', ALL)).items).toEqual([]);
  });
});

describe('DictionaryStore bridge calls', () => {
  it('makes exactly one driver query per dictionary per suggest call', async () => {
    let queries = 0;
    const counting: SqlDriver = {
      async open(location) {
        const conn = await nodeDriver.open(location);
        return { query: (sql, params) => { queries++; return conn.query(sql, params); }, close: () => conn.close() };
      },
    };
    const s = new DictionaryStore(counting, resolveFixture);
    await s.setInstalled(fixtureInstalled);
    queries = 0;
    await s.suggest('b', ALL, 5);
    expect(queries).toBe(fixtureInstalled.length);
  });
});

describe('DictionaryStore entries and links', () => {
  it('loads an entry with a version-1 body', async () => {
    const s = (await store.suggest('كَتَبَ', one('wiktionary-ar-en'))).items[0];
    const e = await store.entry(s.dictionaryId, s.entryId);
    expect(e?.headword).toBe('كَتَبَ');
    expect(e?.body.v).toBe(1);
    expect(e?.body.senses.length).toBeGreaterThan(0);
  });

  it('decodes a schema-2 entry whose body is a zstd frame', async () => {
    const s = (await store.suggest('serendipity', one('wiktionary-en'))).items[0];
    const e = await store.entry(s.dictionaryId, s.entryId);
    expect(e?.headword).toBe('serendipity');
    expect(e?.body.senses.length).toBeGreaterThan(0);
  });

  it('expands a schema-2 form-of entry stored as a template', async () => {
    const hits = (await store.suggest('gone', one('wiktionary-en'))).items.filter((x) => x.headword === 'gone');
    const entries = await Promise.all(hits.map((h) => store.entry(h.dictionaryId, h.entryId)));
    const formOf = entries.findIndex((e) => e?.body.senses.some((x) => x.formOf === 'go'));
    expect(formOf).toBeGreaterThanOrEqual(0);
    expect(hits[formOf]?.gloss).toContain('go');
  });

  it('finds the same headword in other dictionaries for entry tabs', async () => {
    const r = await store.sameHeadword('write', ['oewn-2025', 'wiktionary-en']);
    expect(r.map((s) => s.dictionaryId).sort()).toEqual(['oewn-2025', 'wiktionary-en']);
  });

  it('looks up a linked word in the same dictionary first, then all', async () => {
    expect((await store.lookupLinked('book', 'oewn-2025'))?.dictionaryId).toBe('oewn-2025');
    expect((await store.lookupLinked('serendipity', 'oewn-2025'))?.dictionaryId).toBe('wiktionary-en');
    expect(await store.lookupLinked('zzzqqq', 'oewn-2025')).toBeNull();
  });
});

describe('DictionaryStore health', () => {
  it('broken package is isolated', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lexnur-'));
    writeFileSync(join(dir, 'bad.sqlite'), 'this is not a database');
    const s = new DictionaryStore(nodeDriver, async (rel) => (rel === 'bad.sqlite' ? join(dir, rel) : resolveFixture(rel)));
    await s.setInstalled([...fixtureInstalled, { id: 'bad', title: 'Bad', from: 'en', to: 'en', relativePath: 'bad.sqlite' }]);
    expect([...s.broken]).toEqual(['bad']);
    expect((await s.suggest('write', { kind: 'all' })).items.length).toBeGreaterThan(0);
    expect(s.installed().map((d) => d.id)).not.toContain('bad');
  });

  it('keeps applying later lists after one setInstalled rejects', async () => {
    const s = new DictionaryStore(nodeDriver, resolveFixture);
    await expect(s.setInstalled(null as unknown as [])).rejects.toThrow();
    await s.setInstalled(fixtureInstalled);
    expect(s.installed().length).toBe(fixtureInstalled.length);
  });

  it('closes connections of dictionaries removed from the installed list', async () => {
    await store.setInstalled(fixtureInstalled.filter((d) => d.id !== 'oewn-2025'));
    expect(store.installed().map((d) => d.id)).not.toContain('oewn-2025');
    const r = await store.suggest('write', ALL);
    expect(r.items.every((s) => s.dictionaryId !== 'oewn-2025' && !s.alsoIn.includes('oewn-2025'))).toBe(true);
  });

  it('notifies subscribers once the installed list and broken set are applied', async () => {
    const seen: { installed: string[]; broken: string[] }[] = [];
    const s = new DictionaryStore(nodeDriver, async (rel) => resolveFixture(rel));
    s.subscribe(() => seen.push({ installed: s.installed().map((d) => d.id), broken: [...s.broken] }));
    await s.setInstalled(fixtureInstalled);
    expect(seen.length).toBe(2);
    expect(seen[1].installed.length).toBe(fixtureInstalled.length);
  });
});

describe('package schemas', () => {
  function tempFile(name: string) {
    const base = resolve(import.meta.dirname, '../../../../.tmp');
    mkdirSync(base, { recursive: true });
    return join(mkdtempSync(join(base, 'store-test-')), name);
  }

  it('reads a schema-2 alias row through the body it shares', async () => {
    const file = tempFile('alias.sqlite');
    const db = new DatabaseSync(file);
    db.exec(`ATTACH '${(await resolveFixture('wiktionary-en.sqlite')).replaceAll("'", "''")}' AS f;
      CREATE TABLE meta AS SELECT * FROM f.meta;
      CREATE TABLE body_dict AS SELECT * FROM f.body_dict;`);
    const ddl = (db.prepare("SELECT sql FROM f.sqlite_schema WHERE name = 'entry'").get() as { sql: string }).sql;
    db.exec(ddl.replace('CREATE TABLE entry', 'CREATE TABLE main.entry'));
    db.exec(`INSERT INTO main.entry(id, search_key, pos, root, sort_order, hw, g, tpl, lemma, tail, z, zref)
        SELECT id, search_key, pos, root, sort_order, hw, g, tpl, lemma, tail, z, zref FROM f.entry WHERE search_key = 'serendipity';
      INSERT INTO main.entry(id, search_key, pos, sort_order, hw, g, zref) SELECT 1000, 'serendipitous', pos, 1, 'serendipity', g, id FROM main.entry;`);
    db.close();
    const s = new DictionaryStore(nodeDriver, async () => file);
    await s.setInstalled([{ id: 'a', title: 'A', from: 'en', to: 'en', relativePath: 'alias.sqlite' }]);
    const [main, alias] = await Promise.all([1000, (await s.suggest('serendipity', one('a'))).items[0]!.entryId].map((id) => s.entry('a', id)));
    expect(alias?.body.senses.length).toBeGreaterThan(0);
    expect(main?.body).toEqual(alias?.body);
  });

  it('treats a package with an unknown schema as broken', async () => {
    const file = tempFile('future.sqlite');
    const db = new DatabaseSync(file);
    db.exec("CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT); INSERT INTO meta VALUES ('schema_version', '3');");
    db.close();
    const s = new DictionaryStore(nodeDriver, async () => file);
    await s.setInstalled([{ id: 'f', title: 'F', from: 'en', to: 'en', relativePath: 'future.sqlite' }]);
    expect([...s.broken]).toEqual(['f']);
  });
});

describe('homographs', () => {
  type R = [headword: string, key: string, pos: string | null, gloss: string, sort: number];
  async function storeWith(rows: R[]) {
    const base = resolve(import.meta.dirname, '../../../../.tmp');
    mkdirSync(base, { recursive: true });
    const file = join(mkdtempSync(join(base, 'store-test-')), 'h.sqlite');
    const db = new DatabaseSync(file);
    db.exec(`CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE entry(id INTEGER PRIMARY KEY, headword TEXT NOT NULL, search_key TEXT NOT NULL, pos TEXT, root TEXT, gloss TEXT, sort_order INTEGER NOT NULL, body TEXT NOT NULL);
      INSERT INTO meta VALUES ('schema_version', '1');`);
    const insert = db.prepare("INSERT INTO entry(headword, search_key, pos, gloss, sort_order, body) VALUES (?, ?, ?, ?, ?, '{}')");
    for (const r of rows) insert.run(...r);
    db.close();
    const s = new DictionaryStore(nodeDriver, async () => file);
    await s.setInstalled([{ id: 'h', title: 'H', from: 'zh', to: 'en', relativePath: 'h.sqlite' }]);
    return s;
  }

  it('keeps homographs of one dictionary apart and collapses identical alias rows', async () => {
    const s = await storeWith([
      ['bank', 'bank', 'noun', 'edge of a river', 0],
      ['bank', 'bank', 'verb', 'to tilt', 0],
      ['bank', 'bank', 'noun', 'a money institution', 0],
      ['bank', 'bank', 'noun', 'edge of a river', 1],
      ['你好', 'ni hao', null, 'hello', 1],
      ['你好', 'nihao', null, 'hello', 1],
      ['行', 'xing', null, 'to walk', 1],
      ['行', 'hang', null, 'row', 1],
    ]);
    const bank = (await s.suggest('bank', { kind: 'all' })).items;
    expect(bank.map((x) => [x.headword, x.pos, x.gloss])).toEqual([['bank', 'noun', 'edge of a river'], ['bank', 'verb', 'to tilt']]);
    expect((await s.suggest('ni', { kind: 'all' })).items.map((x) => x.headword)).toEqual(['你好']);
    expect((await s.suggest('xing', { kind: 'all' })).items.map((x) => x.gloss)).toEqual(['to walk']);
    expect((await s.suggest('行', { kind: 'all' })).items).toHaveLength(0);
    await s.close();
  });

  it('keeps null-pos homographs apart by gloss', async () => {
    const s = await storeWith([
      ['行', 'x', null, 'to walk', 0],
      ['行', 'x', null, 'row', 0],
      ['行', 'xing', null, 'to walk', 1],
    ]);
    expect((await s.suggest('x', { kind: 'all' })).items.map((x) => x.gloss)).toEqual(['to walk', 'row']);
    await s.close();
  });

  it('shows one row per part of speech for the first dictionary and lists the others in alsoIn', async () => {
    const r = await store.suggest('bank', ALL);
    const rows = r.items.filter((x) => x.headword === 'bank');
    expect(new Set(rows.map((x) => x.dictionaryId)).size).toBe(1);
    expect(rows.map((x) => x.pos)).toEqual(['noun', 'verb']);
    expect(rows[0].alsoIn).toHaveLength(1);
    expect(rows.slice(1).every((x) => x.alsoIn.length === 0)).toBe(true);
    expect(r.items[0].headword).toBe('bank');
  });
});

describe('CJK scripts', () => {
  const cjk = [
    ...fixtureInstalled,
    { id: 'jmdict-en', title: 'JMdict', from: 'ja', to: 'en', relativePath: 'oewn-2025.sqlite' },
    { id: 'cc-cedict', title: 'CC-CEDICT', from: 'zh', to: 'en', relativePath: 'oewn-2025.sqlite' },
  ];
  const latinIds = fixtureInstalled.filter((d) => d.from !== 'ar').map((d) => d.id);
  beforeEach(async () => { await store.setInstalled(cjk); });

  it('sends a Latin query in an Arabic scope to the Latin-input dictionaries, never to Japanese', async () => {
    const r = await store.suggest('write', one('wiktionary-ar-en'));
    expect(r.scriptFallback).toEqual({ script: 'latin', dictionaryIds: [...latinIds, 'cc-cedict'] });
  });

  it('keeps a pinyin query in the Chinese dictionary', async () => {
    expect((await store.suggest('nihao', one('cc-cedict'))).scriptFallback).toBeUndefined();
  });

  it('keeps kanji and kana queries in the Japanese dictionary', async () => {
    expect((await store.suggest('食べる', one('jmdict-en'))).scriptFallback).toBeUndefined();
    expect((await store.suggest('たべる', one('jmdict-en'))).scriptFallback).toBeUndefined();
  });

  it('sends a Han query to Japanese and Chinese, and a kana query to Japanese only', async () => {
    expect((await store.suggest('食べる', one('oewn-2025'))).scriptFallback).toEqual({ script: 'han', dictionaryIds: ['jmdict-en', 'cc-cedict'] });
    expect((await store.suggest('たべる', one('cc-cedict'))).scriptFallback).toEqual({ script: 'kana', dictionaryIds: ['jmdict-en'] });
  });
});

describe('scriptsOfLanguage', () => {
  it('lists the scripts a dictionary accepts as input', () => {
    expect(['ar', 'fa', 'ja', 'zh', 'en', 'fr'].map(scriptsOfLanguage)).toEqual([['arabic'], ['arabic'], ['han', 'kana'], ['han', 'latin'], ['latin'], ['latin']]);
  });
});

describe('dirOfLanguage', () => {
  it('is rtl for Arabic-script languages and ltr otherwise', () => {
    expect(['ar', 'fa', 'ur', 'en', 'fr'].map(dirOfLanguage)).toEqual(['rtl', 'rtl', 'rtl', 'ltr', 'ltr']);
  });
});
