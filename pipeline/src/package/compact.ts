import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Worker } from 'node:worker_threads';

// Rewrites a finished schema-1 package into its compact installed layout. Must run after every
// filter and revision pass: the plain columns those passes edit no longer exist afterwards.
//
// - headword, gloss and (form-of) body are VIRTUAL generated columns over smaller stored columns.
// - Form-of rows that fit one of the most common templates store a template id, the lemma and a tail.
// - Rows are written in (search_key, sort_order) order with 16 KB pages, so a prefix lands on few pages.
// - compress: every other body is a magicless zstd frame against a dictionary trained on the
//   package's own bodies (schema 2); rows with an identical body point at the first one (zref).

export interface CompactOptions {
  compress: boolean;
  templates: boolean;
  cluster: boolean;
  dedupe: boolean;
  pageSize: number;
  dictBytes: number;
  level: number;
  minTemplateUses: number;
  version?: string;
}

export const COMPACT_DEFAULTS: CompactOptions = {
  compress: true,
  templates: true,
  cluster: true,
  dedupe: true,
  pageSize: 16384,
  dictBytes: 256 * 1024,
  level: 19,
  minTemplateUses: 8,
};

export interface CompactResult {
  rows: number;
  templated: number;
  templates: number;
  compressed: number;
  deduped: number;
  rawBodyBytes: number;
  frameBytes: number;
  dictBytes: number;
}

// A placeholder for the lemma inside a template; never present in package text (checked per row).
const X = '';
const MAX_TEMPLATES = 256;
const TRAIN_SAMPLES = 60000;

interface SourceRow {
  id: number;
  headword: string;
  search_key: string;
  pos: string | null;
  root: string | null;
  gloss: string | null;
  sort_order: number;
  body: string;
}

interface FormOf {
  key: string;
  gloss: string | null;
  head: string;
  lemma: string;
  tail: string | null;
}

// A form-of row whose body is {"v":…,"senses":[…]} plus an optional tail, every sense pointing at one
// lemma, splits into a template (gloss and body head with the lemma replaced by X), the lemma and the tail.
function splitFormOf(r: SourceRow): FormOf | null {
  if (r.sort_order !== 1 || r.root !== null || r.body.includes(X) || r.gloss?.includes(X)) return null;
  const b = JSON.parse(r.body) as { v?: unknown; senses?: { formOf?: string }[] };
  const keys = Object.keys(b);
  if (keys[0] !== 'v' || keys[1] !== 'senses' || !Array.isArray(b.senses)) return null;
  const lemmas = new Set(b.senses.map((s) => s.formOf));
  if (lemmas.size !== 1) return null;
  const lemma = [...lemmas][0];
  if (!lemma) return null;
  const head = JSON.stringify({ v: b.v, senses: b.senses }).slice(0, -1);
  if (!r.body.startsWith(head)) return null;
  const tail = r.body.slice(head.length);
  const headT = head.replaceAll(lemma, X);
  const glossT = r.gloss === null ? null : r.gloss.replaceAll(lemma, X);
  if (headT.replaceAll(X, lemma) !== head || (glossT !== null && glossT.replaceAll(X, lemma) !== r.gloss)) return null;
  return { key: JSON.stringify([glossT, headT]), gloss: glossT, head: headT, lemma, tail: tail === '}' ? null : tail };
}

const sqlString = (s: string | null) => (s === null ? 'NULL' : `'${s.replaceAll("'", "''")}'`);

function schema(templates: { gloss: string | null; head: string }[], compress: boolean): string {
  const caseOf = (pick: (t: { gloss: string | null; head: string }) => string | null) =>
    `CASE tpl ${templates.map((t, i) => `WHEN ${i + 1} THEN ${sqlString(pick(t))}`).join(' ')} END`;
  const lemmaOf = (expr: string) => `replace(${expr}, char(57344), lemma)`;
  const gloss = templates.length ? `CASE WHEN tpl IS NULL THEN g ELSE ${lemmaOf(caseOf((t) => t.gloss))} END` : 'g';
  const plainBody = compress ? 'NULL' : 'z';
  const body = templates.length ? `CASE WHEN tpl IS NULL THEN ${plainBody} ELSE ${lemmaOf(caseOf((t) => t.head))} || coalesce(tail, '}') END` : plainBody;
  return `
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE entry(
  id INTEGER PRIMARY KEY,
  search_key TEXT NOT NULL,
  pos TEXT,
  root TEXT,
  sort_order INTEGER NOT NULL,
  hw TEXT,
  g TEXT,
  tpl INTEGER,
  lemma TEXT,
  tail TEXT,
  z ${compress ? 'BLOB' : 'TEXT'},
  zref INTEGER,
  headword TEXT GENERATED ALWAYS AS (coalesce(hw, search_key)) VIRTUAL,
  gloss TEXT GENERATED ALWAYS AS (${gloss}) VIRTUAL,
  body TEXT GENERATED ALWAYS AS (${body}) VIRTUAL
);${compress ? '\nCREATE TABLE body_dict(id INTEGER PRIMARY KEY, data BLOB NOT NULL);' : ''}`;
}

function trainDictionary(samples: string[], maxBytes: number, workDir: string): Buffer {
  const dir = join(workDir, 'samples');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  samples.forEach((s, i) => writeFileSync(join(dir, String(i)), s));
  const out = join(workDir, 'dict');
  try {
    execFileSync('zstd', ['--train', '-r', dir, `--maxdict=${maxBytes}`, '-19', '-q', '-f', '-o', out], { stdio: ['ignore', 'ignore', 'pipe'] });
    return readFileSync(out);
  } catch (error) {
    throw new Error(`zstd --train failed (the zstd CLI must be installed): ${(error as { stderr?: Buffer }).stderr?.toString().trim() || (error as Error).message}`);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

const WORKER = `
const { parentPort, workerData } = require('node:worker_threads');
const z = require('node:zlib');
const params = { [z.constants.ZSTD_c_compressionLevel]: workerData.level, [z.constants.ZSTD_c_checksumFlag]: 0,
  [z.constants.ZSTD_c_dictIDFlag]: 0, [z.constants.ZSTD_c_contentSizeFlag]: 1 };
parentPort.on('message', ({ job, bodies }) => {
  parentPort.postMessage({ job, frames: bodies.map((b) => z.zstdCompressSync(Buffer.from(b), { dictionary: workerData.dict, params }).subarray(4)) });
});`;

class CompressorPool {
  private readonly workers: Worker[];
  private readonly pending = new Map<number, (frames: Uint8Array[]) => void>();
  private next = 0;

  constructor(dict: Buffer, level: number) {
    const n = Math.max(1, Math.min(16, availableParallelism() - 1));
    this.workers = Array.from({ length: n }, () => {
      const w = new Worker(WORKER, { eval: true, workerData: { dict, level } });
      w.on('message', ({ job, frames }: { job: number; frames: Uint8Array[] }) => {
        this.pending.get(job)?.(frames);
        this.pending.delete(job);
      });
      w.on('error', (e) => {
        throw e;
      });
      return w;
    });
  }

  get size(): number {
    return this.workers.length;
  }

  compress(bodies: string[]): Promise<Uint8Array[]> {
    const job = this.next++;
    return new Promise((resolve) => {
      this.pending.set(job, resolve);
      this.workers[job % this.workers.length]!.postMessage({ job, bodies });
    });
  }

  close(): Promise<number[]> {
    return Promise.all(this.workers.map((w) => w.terminate()));
  }
}

function sample<T>(items: T[], n: number): T[] {
  let seed = 1;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x80000000);
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy.slice(0, n);
}

const COLS = 'id, headword, search_key, pos, root, gloss, sort_order, body';
const BATCH = 2000;

export async function compactPackage(srcPath: string, dstPath: string, options: Partial<CompactOptions> = {}): Promise<CompactResult> {
  const o = { ...COMPACT_DEFAULTS, ...options };
  const src = new DatabaseSync(srcPath, { readOnly: true });
  const srcSchema = (src.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string }).value;
  if (srcSchema !== '1' || src.prepare("SELECT 1 FROM pragma_table_info('entry') WHERE name = 'tpl'").get()) {
    throw new Error(`${srcPath}: only a plain schema-1 package can be compacted`);
  }
  const order = o.cluster ? 'ORDER BY search_key, sort_order, id' : 'ORDER BY id';

  // Pass 1: template counts, and the bodies that will be compressed (for training).
  const counts = new Map<string, { n: number; gloss: string | null; head: string }>();
  const plainBodies: string[] = [];
  const seen = new Set<string>();
  const digest = (s: string) => createHash('sha1').update(s).digest('base64');
  for (const r of src.prepare(`SELECT ${COLS} FROM entry`).iterate() as Iterable<SourceRow>) {
    const f = o.templates ? splitFormOf(r) : null;
    if (f) {
      const c = counts.get(f.key);
      if (c) c.n++;
      else counts.set(f.key, { n: 1, gloss: f.gloss, head: f.head });
    } else if (o.compress) {
      const h = digest(r.body);
      if (!o.dedupe || !seen.has(h)) plainBodies.push(r.body);
      if (o.dedupe) seen.add(h);
    }
  }
  seen.clear();
  const top = [...counts.entries()]
    .filter(([, c]) => c.n >= o.minTemplateUses)
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, MAX_TEMPLATES);
  const tplId = new Map(top.map(([key], i) => [key, i + 1]));
  const templates = top.map(([, c]) => ({ gloss: c.gloss, head: c.head }));

  const rawBodyBytes = plainBodies.reduce((a, b) => a + Buffer.byteLength(b), 0);
  // Small packages get a smaller dictionary: it is stored once and must earn its bytes.
  const dictBytes = Math.min(o.dictBytes, Math.max(16 * 1024, Math.floor(rawBodyBytes / 40)));
  const dict = o.compress ? trainDictionary(sample(plainBodies, TRAIN_SAMPLES), dictBytes, `${dstPath}.train`) : null;
  plainBodies.length = 0;

  mkdirSync(dirname(dstPath), { recursive: true });
  for (const suffix of ['', '-journal']) rmSync(dstPath + suffix, { force: true });
  const dst = new DatabaseSync(dstPath);
  dst.exec(`PRAGMA page_size = ${o.pageSize}; PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF;`);
  dst.exec(schema(templates, o.compress));
  dst.exec('BEGIN');
  const putMeta = dst.prepare('INSERT INTO meta(key, value) VALUES (?, ?)');
  for (const m of src.prepare('SELECT key, value FROM meta ORDER BY key').all() as { key: string; value: string }[]) {
    const value = m.key === 'schema_version' ? (o.compress ? '2' : '1') : m.key === 'version' && o.version ? o.version : m.value;
    putMeta.run(m.key, value);
  }
  if (dict) dst.prepare('INSERT INTO body_dict(id, data) VALUES (1, ?)').run(dict);
  const insert = dst.prepare('INSERT INTO entry(id, search_key, pos, root, sort_order, hw, g, tpl, lemma, tail, z, zref) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');

  const pool = dict ? new CompressorPool(dict, o.level) : null;
  const firstWithBody = new Map<string, number>();
  const result: CompactResult = { rows: 0, templated: 0, templates: templates.length, compressed: 0, deduped: 0, rawBodyBytes, frameBytes: 0, dictBytes: dict?.length ?? 0 };
  type Out = { id: number; r: SourceRow; f: FormOf | null; tpl?: number; zref?: number; z?: Uint8Array | string };
  let buffer: Out[] = [];

  const flush = async () => {
    const toCompress = buffer.filter((x) => x.tpl === undefined && x.zref === undefined);
    if (pool) {
      const chunks: Out[][] = [];
      const per = Math.ceil(toCompress.length / pool.size);
      for (let i = 0; i < toCompress.length; i += per) chunks.push(toCompress.slice(i, i + per));
      const framed = await Promise.all(chunks.map((c) => pool.compress(c.map((x) => x.r.body))));
      chunks.forEach((c, i) => c.forEach((x, j) => (x.z = framed[i]![j]!)));
    } else {
      for (const x of toCompress) x.z = x.r.body;
    }
    for (const x of buffer) {
      const { r, f } = x;
      const hw = r.headword === r.search_key ? null : r.headword;
      if (x.tpl !== undefined) insert.run(x.id, r.search_key, r.pos, r.root, r.sort_order, hw, null, x.tpl, f!.lemma, f!.tail, null, null);
      else insert.run(x.id, r.search_key, r.pos, r.root, r.sort_order, hw, r.gloss, null, null, null, x.z ?? null, x.zref ?? null);
      if (pool && x.z instanceof Uint8Array) {
        result.compressed++;
        result.frameBytes += x.z.length;
      }
    }
    buffer = [];
  };

  let id = 0;
  for (const r of src.prepare(`SELECT ${COLS} FROM entry ${order}`).iterate() as Iterable<SourceRow>) {
    const out: Out = { id: o.cluster ? ++id : r.id, r, f: null };
    const f = o.templates ? splitFormOf(r) : null;
    const t = f ? tplId.get(f.key) : undefined;
    if (f && t !== undefined) {
      out.f = f;
      out.tpl = t;
      result.templated++;
    } else if (pool && o.dedupe) {
      const h = digest(r.body);
      const first = firstWithBody.get(h);
      if (first !== undefined) {
        out.zref = first;
        result.deduped++;
      } else firstWithBody.set(h, out.id);
    }
    buffer.push(out);
    result.rows++;
    if (buffer.length >= BATCH * (pool?.size ?? 1)) await flush();
  }
  await flush();
  await pool?.close();
  src.close();

  dst.exec('COMMIT');
  dst.exec('CREATE INDEX entry_key ON entry(search_key, sort_order); CREATE INDEX entry_root ON entry(root) WHERE root IS NOT NULL;');
  dst.exec('PRAGMA journal_mode = DELETE');
  dst.exec('VACUUM');
  dst.close();
  return result;
}
