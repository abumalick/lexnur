import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { readReleases } from './catalog/publish.ts';
import { readJson, writeJson } from './json.ts';
import { compressPackage, type BuildRecord } from './package/compress.ts';
import { describeFinish, finishPackage, type FinishResult } from './package/finish.ts';
import { metaOf } from './package/verify.ts';
import { nextVersion, takenVersions } from './package/version.ts';
import { BUILD, CATALOG } from './paths.ts';
import { download, type LiveDictionary } from './refilter.ts';

export interface CompactCommandResult {
  id: string;
  from: string;
  record: BuildRecord;
  finish: FinishResult;
}

// Republishes the live package's content, unchanged, in the compact layout.
export async function compactCommand(id: string): Promise<CompactCommandResult> {
  const live = readJson<{ dictionaries: (LiveDictionary & { schema_version: number })[] }>(CATALOG.publishedV2).dictionaries.find((d) => d.id === id);
  if (!live) throw new Error(`catalog/v2.json has no dictionary "${id}"`);
  const outDir = join(BUILD, 'packages', id);
  mkdirSync(outDir, { recursive: true });
  const version = nextVersion(new Date(), takenVersions(id, BUILD, readReleases()));
  const sqlitePath = join(outDir, `${version}.sqlite`);
  const plainPath = `${sqlitePath}.plain`;
  try {
    await download(live, plainPath);
    const db = new DatabaseSync(plainPath);
    const meta = metaOf(db);
    db.prepare("UPDATE meta SET value = ? WHERE key = 'version'").run(version);
    db.close();
    const finish = await finishPackage(plainPath, sqlitePath);
    const sizes = await compressPackage(sqlitePath, `${sqlitePath}.zst`);
    const record: BuildRecord = {
      id, version, entry_count: Number(meta.entry_count), ...sizes, source_date: meta.source_date!,
      ...(finish.schema_version === 2 ? { schema_version: 2 as const } : {}),
    };
    writeJson(join(outDir, `${version}.json`), record);
    return { id, from: live.version, record, finish };
  } catch (error) {
    for (const path of [sqlitePath, plainPath]) for (const suffix of ['', '-journal', '.download.zst', '.zst']) rmSync(path + suffix, { force: true });
    throw error;
  }
}

export function describeCompact(r: CompactCommandResult): string {
  return [
    `compacted ${r.id} ${r.from} → ${r.record.version}`,
    describeFinish(r.finish, join(BUILD, 'packages', r.id, `${r.record.version}.sqlite`)),
    `sha256 ${r.record.sha256}`,
    `zst ${r.record.size_bytes} bytes, sqlite ${r.record.installed_size_bytes} bytes`,
  ].join('\n');
}
