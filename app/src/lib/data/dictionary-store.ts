import {
  BODY_DICT_SQL, bodyDecoder, COLS, detectScript, ENTRY_SQL, entryBodyText, hexToBytes, isSupportedSchema, normalizeKey, parseRootQuery, prefixUpperBound, prefixSql,
  type Body, type BodyDecoder, type SchemaVersion, type Script,
} from '@lexnur/core';
import { Observable } from '../observable';
import type { Row, SqlConnection, SqlDriver } from '../sql/driver';

export interface InstalledDictionary { id: string; title: string; from: string; to: string; relativePath: string }
export type Scope = { kind: 'all' } | { kind: 'one'; id: string };
export interface Suggestion { dictionaryId: string; entryId: number; headword: string; pos: string | null; root: string | null; gloss: string | null; alsoIn: string[] }
export interface SuggestResult {
  query: string; mode: 'prefix' | 'root'; items: Suggestion[]; root?: string;
  scriptFallback?: { script: Exclude<Script, 'other'>; dictionaryIds: string[] }; elsewhere?: string[];
}
export interface Entry { dictionaryId: string; entryId: number; headword: string; pos: string | null; root: string | null; body: Body }

const ARABIC_SCRIPT_LANGS = new Set(['ar', 'fa', 'ur', 'ps']);
const LANGUAGE_SCRIPTS: Record<string, Script[]> = { ja: ['han', 'kana'], zh: ['han', 'latin'] };
export const scriptsOfLanguage = (lang: string): Script[] => (ARABIC_SCRIPT_LANGS.has(lang) ? ['arabic'] : LANGUAGE_SCRIPTS[lang] ?? ['latin']);
export const dirOfLanguage = (lang: string): 'rtl' | 'ltr' => (ARABIC_SCRIPT_LANGS.has(lang) ? 'rtl' : 'ltr');

type Hit = Suggestion & { key: string; sort: number; rank: number };
interface Open { dict: InstalledDictionary; conn: SqlConnection; schema: SchemaVersion; decoder?: Promise<BodyDecoder> }

const PREWARM_MS = 1500;
const str = (v: unknown) => (v === null || v === undefined ? null : String(v));

// The observable value is a version counter bumped after every setInstalled, so views re-read installed() and broken.
export class DictionaryStore extends Observable<number> {
  private conns = new Map<string, Open>();
  private order: InstalledDictionary[] = [];
  private brokenIds = new Set<string>();
  private lock: Promise<void> = Promise.resolve();
  private driver: SqlDriver;
  private resolvePath: (relativePath: string) => Promise<string>;

  constructor(driver: SqlDriver, resolvePath: (relativePath: string) => Promise<string>) {
    super(0);
    this.driver = driver;
    this.resolvePath = resolvePath;
  }

  get broken(): ReadonlySet<string> { return this.brokenIds; }
  installed(): InstalledDictionary[] { return [...this.order]; }

  setInstalled(list: InstalledDictionary[]): Promise<void> {
    const run = this.lock.then(() => this.apply(list));
    this.lock = run.catch(() => undefined);
    return run;
  }

  private async apply(list: InstalledDictionary[]): Promise<void> {
    for (const [id, c] of [...this.conns]) {
      const next = list.find((d) => d.id === id);
      if (!next || next.relativePath !== c.dict.relativePath) {
        this.conns.delete(id);
        await c.conn.close().catch(() => undefined);
      }
    }
    for (const id of [...this.brokenIds]) if (!list.some((d) => d.id === id)) this.brokenIds.delete(id);
    for (const d of list) {
      if (this.conns.has(d.id)) continue;
      let conn: SqlConnection | null = null;
      try {
        conn = await this.driver.open(await this.resolvePath(d.relativePath));
        const rows = await conn.query("SELECT value FROM meta WHERE key = 'schema_version'");
        const schema = Number(rows[0]?.value);
        if (!isSupportedSchema(schema)) throw new Error(`schema ${rows[0]?.value}`);
        const open: Open = { dict: d, conn, schema };
        this.conns.set(d.id, open);
        // Prepared shortly after opening, so the first entry opened does not wait for the decoder
        // and the first suggestions typed right after launch do not wait for it either.
        if (schema === 2) setTimeout(() => { if (this.conns.get(d.id) === open) this.decoder(open).catch(() => undefined); }, PREWARM_MS);
        this.brokenIds.delete(d.id);
      } catch {
        if (conn) await conn.close().catch(() => undefined);
        this.brokenIds.add(d.id);
      }
    }
    this.order = list.filter((d) => this.conns.has(d.id));
    this.set(this.value + 1);
  }

  private targets(scope: Scope): InstalledDictionary[] {
    return scope.kind === 'all' ? this.order : this.order.filter((d) => d.id === scope.id);
  }

  private async rows(d: InstalledDictionary, sql: string, params: (string | number)[]): Promise<Hit[]> {
    const c = this.conns.get(d.id);
    if (!c) return [];
    const rank = this.order.indexOf(d);
    return (await c.conn.query(sql, params)).map((r: Row) => ({
      dictionaryId: d.id, entryId: Number(r.id), headword: String(r.headword), pos: str(r.pos), root: str(r.root),
      gloss: str(r.gloss), alsoIn: [], key: String(r.search_key), sort: Number(r.sort_order), rank,
    }));
  }

  private prefix(d: InstalledDictionary, key: string, limit: number): Promise<Hit[]> {
    return this.rows(d, prefixSql(limit), [key, prefixUpperBound(key)]);
  }

  private static merge(lists: Hit[][], limit: number): Suggestion[] {
    const all = lists.flat().sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.sort - b.sort || a.rank - b.rank || a.entryId - b.entryId));
    const byHeadword = new Map<string, Suggestion[]>();
    let count = 0;
    for (const h of all) {
      const group = byHeadword.get(h.headword);
      const first = group?.[0];
      if (first && first.dictionaryId !== h.dictionaryId) { if (!first.alsoIn.includes(h.dictionaryId)) first.alsoIn.push(h.dictionaryId); continue; }
      if (group?.some((x) => x.pos === h.pos && (h.pos !== null || x.gloss === h.gloss)) || count >= limit) continue;
      const { key: _k, sort: _s, rank: _r, ...s } = h;
      if (group) group.push(s); else byHeadword.set(h.headword, [s]);
      count++;
    }
    return [...byHeadword.values()].flat();
  }

  async suggest(query: string, scope: Scope, limit = 20): Promise<SuggestResult> {
    const q = query.trim();
    const root = parseRootQuery(q);
    if (root) return { query, mode: 'root', root, items: await this.byRoot(root, scope) };
    const key = normalizeKey(q);
    if (!key) return { query, mode: 'prefix', items: [] };
    let targets = this.targets(scope);
    let scriptFallback: SuggestResult['scriptFallback'];
    const script = detectScript(q);
    if (scope.kind === 'one' && targets.length === 1 && script !== 'other' && !scriptsOfLanguage(targets[0].from).includes(script)) {
      targets = this.order.filter((d) => scriptsOfLanguage(d.from).includes(script));
      scriptFallback = { script, dictionaryIds: targets.map((d) => d.id) };
    }
    const lists = await Promise.all(targets.map((d) => this.prefix(d, key, limit)));
    const merged = DictionaryStore.merge(lists, limit);
    const items = [...merged.filter((s) => s.headword === q), ...merged.filter((s) => s.headword !== q)];
    let elsewhere: string[] | undefined;
    if (!items.length && scope.kind === 'one' && !scriptFallback) {
      const others = this.order.filter((d) => d.id !== scope.id);
      const hits = await Promise.all(others.map(async (d) => ((await this.prefix(d, key, 1)).length ? d.id : null)));
      elsewhere = hits.filter((x): x is string => x !== null);
    }
    return { query, mode: 'prefix', items, scriptFallback, elsewhere };
  }

  async byRoot(root: string, scope: Scope, limit = 100): Promise<Suggestion[]> {
    let targets = this.targets(scope).filter((d) => scriptsOfLanguage(d.from).includes('arabic'));
    if (!targets.length) targets = this.order.filter((d) => scriptsOfLanguage(d.from).includes('arabic'));
    const lists = await Promise.all(targets.map((d) =>
      this.rows(d, `SELECT ${COLS} FROM entry WHERE root = ? ORDER BY sort_order, search_key, id LIMIT ${Math.floor(limit)}`, [root])));
    return DictionaryStore.merge(lists, limit);
  }

  async entry(dictionaryId: string, entryId: number): Promise<Entry | null> {
    const c = this.conns.get(dictionaryId);
    if (!c) return null;
    const r = (await c.conn.query(ENTRY_SQL[c.schema], [entryId]))[0];
    if (!r) return null;
    const text = entryBodyText(r, c.schema === 2 ? await this.decoder(c) : null);
    return { dictionaryId, entryId: Number(r.id), headword: String(r.headword), pos: str(r.pos), root: str(r.root), body: JSON.parse(text) as Body };
  }

  // Schema 2 bodies are zstd frames against the package's dictionary, loaded on the first entry opened.
  private decoder(c: Open): Promise<BodyDecoder> {
    if (!c.decoder) {
      c.decoder = c.conn.query(BODY_DICT_SQL).then((rows) => bodyDecoder(hexToBytes(String(rows[0]?.data ?? ''))));
      c.decoder.catch(() => { c.decoder = undefined; });
    }
    return c.decoder;
  }

  async sameHeadword(headword: string, dictionaryIds: string[]): Promise<Suggestion[]> {
    const key = normalizeKey(headword);
    const lists = await Promise.all(this.order.filter((d) => dictionaryIds.includes(d.id)).map((d) =>
      this.rows(d, `SELECT ${COLS} FROM entry WHERE search_key = ? AND headword = ? ORDER BY sort_order, id LIMIT 1`, [key, headword])));
    return lists.flat().map(({ key: _k, sort: _s, rank: _r, ...s }) => s);
  }

  async lookupLinked(word: string, preferDictionaryId: string): Promise<Suggestion | null> {
    const key = normalizeKey(word);
    if (!key) return null;
    const ordered = [...this.order.filter((d) => d.id === preferDictionaryId), ...this.order.filter((d) => d.id !== preferDictionaryId)];
    for (const d of ordered) {
      const [hit] = await this.rows(d, `SELECT ${COLS} FROM entry WHERE search_key = ? ORDER BY (headword = ?) DESC, sort_order, id LIMIT 1`, [key, word]);
      if (hit) { const { key: _k, sort: _s, rank: _r, ...s } = hit; return s; }
    }
    return null;
  }

  async close(): Promise<void> { await this.setInstalled([]); }
}
