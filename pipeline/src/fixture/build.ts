import { join } from 'node:path';
import { normalizeKey } from '@lexnur/core';
import { buildPackage, describeBuild, type BuildOptions } from '../build.ts';
import { loadEditorial } from '../catalog/editorial.ts';
import { buildPublishedCatalog, type Releases } from '../catalog/publish.ts';
import { readJson, writeJson } from '../json.ts';
import { FIXTURES } from '../paths.ts';
import type { EntryRow } from '../rows.ts';

export const FIXTURE_IDS = ['oewn-2025', 'wiktionary-ar-en', 'wiktionary-en'] as const;
export const FIXTURE_GENERATED_AT = '2026-01-01T00:00:00Z';
// wiktionary-en is compacted to schema 2 (templates and zstd bodies) so the app's tests run both readers.
export const FIXTURE_COMPACT: Record<string, Pick<BuildOptions, 'compact' | 'schema'>> = {
  'oewn-2025': { compact: false },
  'wiktionary-ar-en': { compact: false },
  'wiktionary-en': { compact: { minTemplateUses: 2 }, schema: 2 },
};

export function fixtureFilter(id: string, lemmas: string[]): (row: EntryRow) => boolean {
  if (id === 'wiktionary-ar-en') {
    const keys = new Set(lemmas.map(normalizeKey));
    return (row) => keys.has(row.search_key);
  }
  const headwords = new Set(lemmas);
  return (row) => headwords.has(row.headword);
}

export async function buildFixtures(): Promise<void> {
  const lemmas = readJson<Record<string, string[]>>(join(FIXTURES, 'lemmas.json'));
  const releases: Releases = {};
  for (const id of FIXTURE_IDS) {
    const result = await buildPackage(id, {
      outDir: join(FIXTURES, 'packages'),
      fileStem: id,
      version: 'fixture',
      accept: fixtureFilter(id, lemmas[id] ?? []),
      ...FIXTURE_COMPACT[id],
    });
    console.log(describeBuild(result));
    const { version, entry_count, size_bytes, installed_size_bytes, sha256, source_date, schema_version } = result.record;
    releases[id] = { version, entry_count, size_bytes, installed_size_bytes, sha256, source_date, ...(schema_version ? { schema_version } : {}) };
  }
  writeJson(
    join(FIXTURES, 'catalog.json'),
    buildPublishedCatalog(loadEditorial(), releases, (id) => `packages/${id}.sqlite.zst`, FIXTURE_GENERATED_AT, 2),
  );
}
