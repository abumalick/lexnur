import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { parsePublishedCatalog, type PublishedCatalog, type PublishedDictionary } from '@lexnur/core';
import { readJson, writeJson } from '../json.ts';
import { CATALOG } from '../paths.ts';
import { loadEditorial, type EditorialDictionary } from './editorial.ts';

export interface ReleaseRecord {
  version: string;
  entry_count: number;
  size_bytes: number;
  installed_size_bytes: number;
  sha256: string;
  source_date: string;
  schema_version?: 1 | 2;
  published_at?: string;
}
export type Releases = Record<string, ReleaseRecord>;

// catalog/v1.json is what app 1.0.0 reads. It is frozen at the last schema-1 releases and never
// regenerated or re-uploaded: newer packages only reach v2.json, and every package it lists stays on R2.
export const FROZEN_V1_SHA256 = '83177d95b2c56bb904b3f55487f1736a813ebe108f56825a7593e8ea11867d29';

export function assertFrozenV1(path: string = CATALOG.published): Buffer {
  const bytes = readFileSync(path);
  const sha = createHash('sha256').update(bytes).digest('hex');
  if (sha !== FROZEN_V1_SHA256) throw new Error(`${path} changed (sha256 ${sha}); it is frozen for app 1.0.0 and must stay byte-identical`);
  return bytes;
}

// The first app release that reads schema-2 packages.
export const SCHEMA_2_MIN_APP_VERSION = '1.1.0';

const semver = (v: string) => v.split('.').map(Number);
const newerVersion = (a: string, b: string) => {
  const [x, y] = [semver(a), semver(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return (x[i] ?? 0) > (y[i] ?? 0) ? a : b;
  return a;
};

export const PACKAGE_BASE_URL = 'https://dl.lexnur.com/packages';

export function packageUrl(id: string, version: string): string {
  return `${PACKAGE_BASE_URL}/${id}/${version}.sqlite.zst`;
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function published(d: EditorialDictionary, r: ReleaseRecord, url: string): PublishedDictionary {
  if (!d.license_url || !d.attribution || !d.summary) {
    throw new Error(`catalog/catalog.json: ${d.id} needs license_url, attribution and summary before it can be published`);
  }
  const out: PublishedDictionary = {
    id: d.id,
    title: d.title,
    from: d.from,
    to: d.to,
    kind: d.kind,
    rank: d.rank,
    difficulty: d.difficulty,
    license: d.license,
    license_url: d.license_url,
    attribution: d.attribution,
    source_date: r.source_date,
    summary: d.summary,
    ai_generated: d.ai_generated ?? false,
    schema_version: r.schema_version ?? 1,
    version: r.version,
    entry_count: r.entry_count,
    size_bytes: r.size_bytes,
    installed_size_bytes: r.installed_size_bytes,
    sha256: r.sha256,
    url,
  };
  const minApp = out.schema_version === 2 ? newerVersion(d.min_app_version ?? SCHEMA_2_MIN_APP_VERSION, SCHEMA_2_MIN_APP_VERSION) : d.min_app_version;
  if (minApp) out.min_app_version = minApp;
  if (d.availability) out.availability = d.availability;
  return out;
}

function releaseTime(r: ReleaseRecord): string | undefined {
  if (r.published_at) return r.published_at;
  const day = /^(\d{4})(\d{2})(\d{2})\./.exec(r.version);
  return day ? `${day[1]}-${day[2]}-${day[3]}T00:00:00Z` : undefined;
}

export function buildPublishedCatalog(
  editorial: EditorialDictionary[],
  releases: Releases,
  urlFor: (id: string, version: string) => string = packageUrl,
  generatedAt?: string,
  format: 1 | 2 = 1,
): PublishedCatalog {
  const listed = editorial.filter((d) => d.distribution === 'open' && releases[d.id] && (format === 2 || (!d.min_app_version && (releases[d.id]!.schema_version ?? 1) === 1)));
  const dictionaries = listed
    .map((d) => {
      const r = releases[d.id] as ReleaseRecord;
      return published(d, r, urlFor(d.id, r.version));
    })
    .sort((a, b) => cmp(a.from, b.from) || cmp(a.to, b.to) || a.rank - b.rank || cmp(a.id, b.id));
  const latest = listed
    .map((d) => releaseTime(releases[d.id] as ReleaseRecord))
    .filter((t) => t !== undefined)
    .sort()
    .at(-1);
  return { format, generated_at: generatedAt ?? latest ?? '1970-01-01T00:00:00Z', dictionaries };
}

export function readReleases(): Releases {
  return existsSync(CATALOG.releases) ? readJson<Releases>(CATALOG.releases) : {};
}

export function writeReleases(releases: Releases, path: string = CATALOG.releases): void {
  const sorted = Object.fromEntries(Object.entries(releases).sort(([a], [b]) => cmp(a, b)));
  writeJson(path, sorted);
}

export function writeCatalog(): { v1: PublishedCatalog; v2: PublishedCatalog } {
  const v1 = parsePublishedCatalog(JSON.parse(assertFrozenV1().toString('utf8')), { strict: true });
  const v2 = buildPublishedCatalog(loadEditorial(), readReleases(), undefined, undefined, 2);
  parsePublishedCatalog(v2, { strict: true });
  writeJson(CATALOG.publishedV2, v2);
  return { v1, v2 };
}
