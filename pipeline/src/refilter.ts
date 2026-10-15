import { createReadStream, createWriteStream, mkdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createZstdDecompress } from 'node:zlib';
import { readReleases } from './catalog/publish.ts';
import { PACKAGE_FILTERS } from './dictionaries.ts';
import { filterPackageDb, type PackageFilterResult } from './filter/package.ts';
import { readJson, writeJson } from './json.ts';
import { compressPackage, sha256File, type BuildRecord } from './package/compress.ts';
import { describeFinish, finishPackage, type FinishResult } from './package/finish.ts';
import { expandPackage, isCompacted } from './package/verify.ts';
import { nextVersion, takenVersions } from './package/version.ts';
import { BUILD, CATALOG } from './paths.ts';

export interface RefilterResult extends PackageFilterResult {
  before: number;
  after: number;
}

const count = (db: DatabaseSync) => (db.prepare('SELECT count(*) AS n FROM entry').get() as { n: number }).n;
const metaValue = (db: DatabaseSync, key: string) => (db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string }).value;

export function refilterFile(path: string, version: string): RefilterResult {
  const db = new DatabaseSync(path);
  const before = count(db);
  const entryCount = Number(metaValue(db, 'entry_count'));
  if (before !== entryCount) {
    db.close();
    throw new Error(`${path}: ${before} rows but entry_count ${entryCount}; packages with alias rows are not supported`);
  }
  const result = filterPackageDb(db, { ...PACKAGE_FILTERS[metaValue(db, 'id')], from: metaValue(db, 'from'), to: metaValue(db, 'to') });
  const after = count(db);
  const put = db.prepare('UPDATE meta SET value = ? WHERE key = ?');
  put.run(String(after), 'entry_count');
  put.run(version, 'version');
  db.exec('VACUUM');
  db.close();
  return { ...result, before, after };
}

export interface LiveDictionary {
  id: string;
  version: string;
  url: string;
  sha256: string;
}

export async function download(live: LiveDictionary, sqlitePath: string): Promise<void> {
  const zst = `${sqlitePath}.download.zst`;
  const res = await fetch(live.url);
  if (!res.ok || !res.body) throw new Error(`${live.url}: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(zst));
  const sha = await sha256File(zst);
  if (sha !== live.sha256) throw new Error(`${live.url}: sha256 ${sha}, catalog/v2.json says ${live.sha256}`);
  await pipeline(createReadStream(zst), createZstdDecompress(), createWriteStream(sqlitePath));
  rmSync(zst);
}

export interface RefilterCommandResult extends RefilterResult {
  id: string;
  from: string;
  record?: BuildRecord;
  finish?: FinishResult;
}

export async function refilterCommand(id: string, dryRun = false): Promise<RefilterCommandResult> {
  const live = readJson<{ dictionaries: LiveDictionary[] }>(CATALOG.publishedV2).dictionaries.find((d) => d.id === id);
  if (!live) throw new Error(`catalog/v2.json has no dictionary "${id}"`);
  const outDir = join(BUILD, 'packages', id);
  mkdirSync(outDir, { recursive: true });
  const version = nextVersion(new Date(), takenVersions(id, BUILD, readReleases()));
  const sqlitePath = join(outDir, dryRun ? 'dry-run.sqlite' : `${version}.sqlite`);
  const livePath = `${sqlitePath}.live`;
  const plainPath = `${sqlitePath}.plain`;
  const cleanup = () => {
    for (const path of [sqlitePath, livePath, plainPath]) for (const suffix of ['', '-journal', '.download.zst', '.zst']) rmSync(path + suffix, { force: true });
  };
  try {
    // A compacted live package is expanded to the plain layout the filters edit, then compacted again.
    await download(live, livePath);
    const live_db = new DatabaseSync(livePath, { readOnly: true });
    const compacted = isCompacted(live_db);
    live_db.close();
    if (compacted) {
      await expandPackage(livePath, plainPath);
      rmSync(livePath);
    } else renameSync(livePath, plainPath);
    const result = refilterFile(plainPath, version);
    if (dryRun) {
      cleanup();
      return { ...result, id, from: live.version };
    }
    const db = new DatabaseSync(plainPath, { readOnly: true });
    const source_date = metaValue(db, 'source_date');
    db.close();
    const finish = await finishPackage(plainPath, sqlitePath);
    const sizes = await compressPackage(sqlitePath, `${sqlitePath}.zst`);
    const record: BuildRecord = { id, version, entry_count: result.after, ...sizes, source_date, ...(finish.schema_version === 2 ? { schema_version: 2 as const } : {}) };
    writeJson(join(outDir, `${version}.json`), record);
    return { ...result, id, from: live.version, record, finish };
  } catch (error) {
    cleanup();
    throw error;
  }
}

function sample<T>(items: T[], n: number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy.slice(0, n);
}

export function describeRefilter(r: RefilterCommandResult): string {
  const lines = [
    `refiltered ${r.id} ${r.from} → ${r.record?.version ?? 'dry run'}: ${r.before} → ${r.after} rows`,
    `form-of rows ${r.formOfRows}, dangling dropped ${r.droppedRows['formof:dangling']?.length ?? 0}; rows with words removed ${r.editedRows}; headword marks stripped ${r.cleanedHeadwords}; rekeyed ${r.rekeyed}`,
  ];
  if (r.rekeyed) lines.push(`  ${sample(r.rekeySamples, 30).join(' · ')}`);
  if (r.rewrites.length) lines.push(`modernised ${r.rewrites.length} glosses`, ...r.rewrites.map((x) => `  ${x}`));
  if (r.labelled.length) lines.push(`labelled dated, offensive: ${r.labelled.join(' · ')}`);
  for (const [reason, n] of Object.entries(r.droppedSenses)) {
    lines.push(`removed ${reason}: ${n}`, ...sample(r.senseSamples[reason] ?? [], 20).map((x) => `  ${x.slice(0, 120)}`));
  }
  for (const [reason, headwords] of Object.entries(r.droppedRows).sort(([, a], [, b]) => b.length - a.length)) {
    lines.push(`rows dropped ${reason}: ${headwords.length}`, `  ${sample(headwords, 30).join(' · ')}`);
  }
  if (r.finish && r.record) lines.push(describeFinish(r.finish, join(BUILD, 'packages', r.id, `${r.record.version}.sqlite`)));
  if (r.record) lines.push(`sha256 ${r.record.sha256}`, `zst ${r.record.size_bytes} bytes, sqlite ${r.record.installed_size_bytes} bytes`);
  return lines.join('\n');
}
