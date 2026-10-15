import { join } from 'node:path';
import { editorialEntry } from './catalog/editorial.ts';
import { readReleases } from './catalog/publish.ts';
import { PACKAGE_FILTERS, ROW_SOURCES, SOURCE_FILES } from './dictionaries.ts';
import { writeJson } from './json.ts';
import type { CompactOptions } from './package/compact.ts';
import { compressPackage, type BuildRecord } from './package/compress.ts';
import { describeFinish, finishPackage, type FinishResult } from './package/finish.ts';
import { sourceDateFor } from './package/source-date.ts';
import { nextVersion, takenVersions } from './package/version.ts';
import { PackageWriter } from './package/writer.ts';
import { BUILD } from './paths.ts';
import { filterPackageDb } from './filter/package.ts';
import { countDrops, newStats, type BuildStats, type EntryRow } from './rows.ts';

export interface BuildOptions {
  outDir: string;
  fileStem: string;
  version: string;
  limit?: number;
  accept?: (row: EntryRow) => boolean;
  sourceDate?: string;
  // false keeps the plain schema-1 layout (fixtures that exercise the plain reader).
  compact?: Partial<CompactOptions> | false;
  schema?: 1 | 2;
}

export interface BuildResult {
  record: BuildRecord;
  sqlitePath: string;
  zstPath: string;
  stats: BuildStats;
  rewrites: string[];
  labelled: string[];
  finish?: FinishResult;
}

export async function buildPackage(id: string, o: BuildOptions): Promise<BuildResult> {
  const source = ROW_SOURCES[id];
  if (!source) throw new Error(`no row source for "${id}" (known: ${Object.keys(ROW_SOURCES).join(', ')})`);
  const d = editorialEntry(id);
  if (!d.attribution) throw new Error(`catalog/catalog.json: ${id} has no attribution`);
  const files = SOURCE_FILES[id];
  if (!files && !o.sourceDate) throw new Error(`no SOURCE_FILES entry for "${id}"`);
  const source_date = o.sourceDate ?? sourceDateFor(files!.source, files!.files);
  const sqlitePath = join(o.outDir, `${o.fileStem}.sqlite`);
  const zstPath = `${sqlitePath}.zst`;
  const plainPath = o.compact === false ? sqlitePath : join(o.outDir, `${o.fileStem}.plain.sqlite`);
  const writer = new PackageWriter(plainPath, {
    id,
    title: d.title,
    from: d.from,
    to: d.to,
    version: o.version,
    license: d.license,
    attribution: d.attribution,
    source_date,
    ...(d.availability ? { availability: d.availability } : {}),
  });
  const stats = newStats();
  let revisions = { rewrites: [] as string[], labelled: [] as string[] };
  for await (const row of source({ limit: o.limit ?? Infinity, stats })) {
    if (!o.accept || o.accept(row)) writer.add(row);
  }
  stats.skippedEmptyKey = writer.skippedEmptyKey;
  const entry_count = writer.finish((db) => {
    const result = filterPackageDb(db, { ...PACKAGE_FILTERS[id], from: d.from, to: d.to, rekey: !writer.hasAliases });
    revisions = result;
    for (const [reason, n] of Object.entries(result.droppedSenses)) countDrops(stats, reason, n);
    for (const [reason, headwords] of Object.entries(result.droppedRows)) {
      stats.droppedEntries += headwords.length;
      stats.droppedByReason[`rows ${reason}`] = headwords.length;
    }
  });
  const finish = o.compact === false ? undefined : await finishPackage(plainPath, sqlitePath, o.compact, o.schema);
  const sizes = await compressPackage(sqlitePath, zstPath);
  const record: BuildRecord = { id, version: o.version, entry_count, ...sizes, source_date, ...(finish?.schema_version === 2 ? { schema_version: 2 as const } : {}) };
  return { record, sqlitePath, zstPath, stats, rewrites: revisions.rewrites, labelled: revisions.labelled, finish };
}

const mb = (n: number) => `${(n / 1e6).toFixed(1)} MB`;

export function describeBuild(r: BuildResult): string {
  const { record: rec, stats: s } = r;
  const reasons = Object.entries(s.droppedByReason)
    .sort(([, a], [, b]) => b - a)
    .map(([reason, n]) => `  ${reason}: ${n}`);
  const skips = Object.entries(s.skippedByReason)
    .sort(([, a], [, b]) => b - a)
    .map(([reason, n]) => `  ${reason}: ${n}`);
  return [
    `built ${rec.id} ${rec.version}: ${rec.entry_count} entries, sqlite ${mb(rec.installed_size_bytes)}, zst ${mb(rec.size_bytes)}`,
    `sha256 ${rec.sha256}`,
    `source date ${rec.source_date}`,
    `filter: dropped ${s.droppedSenses} senses and ${s.droppedEntries} entries; skipped ${s.skippedEmptyKey} empty keys`,
    ...(reasons.length ? ['filter: dropped senses per reason', ...reasons] : []),
    ...(skips.length ? ['skipped per reason (not filtered content)', ...skips] : []),
    ...(r.rewrites.length ? [`modernised ${r.rewrites.length} glosses`, ...r.rewrites.map((x) => `  ${x}`)] : []),
    ...(r.labelled.length ? [`labelled dated, offensive: ${r.labelled.join(' · ')}`] : []),
    ...(r.finish ? [describeFinish(r.finish, r.sqlitePath)] : []),
    `source: ${s.lines} lines read, ${s.malformed} malformed; skipped ${s.noGlossEntries} entries without a gloss`,
    `files: ${r.sqlitePath} and ${r.zstPath}`,
  ].join('\n');
}

export async function buildCommand(id: string, limit?: number): Promise<BuildResult> {
  const version = nextVersion(new Date(), takenVersions(id, BUILD, readReleases()));
  const outDir = join(BUILD, 'packages', id);
  const result = await buildPackage(id, { outDir, fileStem: version, version, limit });
  writeJson(join(outDir, `${version}.json`), result.record);
  return result;
}
