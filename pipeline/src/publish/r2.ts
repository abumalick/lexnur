import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parsePublishedCatalog } from '@lexnur/core';
import { loadEditorial } from '../catalog/editorial.ts';
import { assertFrozenV1, buildPublishedCatalog, packageUrl, writeReleases, type Releases } from '../catalog/publish.ts';
import { readJson, writeJson } from '../json.ts';
import { sha256File, type BuildRecord } from '../package/compress.ts';
import { BUILD, CATALOG, REPO } from '../paths.ts';

export const CATALOG_URL = 'https://dl.lexnur.com/catalog/v1.json';
export const CATALOG_V2_URL = 'https://dl.lexnur.com/catalog/v2.json';

export interface PublishDeps {
  isAncestorOfHead(ref: string): boolean;
  now(): Date;
  r2Put(key: string, file: string, contentType: string, cacheControl?: string): void;
  fetch: typeof fetch;
  log(line: string): void;
  sleep(ms: number): Promise<void>;
}

const CANONICAL_ATTEMPTS = 6;
const CANONICAL_RETRY_MS = 5000;

export interface PublishPaths {
  build: string;
  releases: string;
  published: string;
  publishedV2: string;
  editorial: string;
  tmp: string;
}

export const realPaths: PublishPaths = {
  build: BUILD,
  releases: CATALOG.releases,
  published: CATALOG.published,
  publishedV2: CATALOG.publishedV2,
  editorial: CATALOG.editorial,
  tmp: join(REPO, '.tmp'),
};

export const realDeps: PublishDeps = {
  isAncestorOfHead(ref) {
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', ref, 'HEAD'], { cwd: REPO, stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  },
  now: () => new Date(),
  r2Put(key, file, contentType, cacheControl) {
    const args = ['--dir', join(REPO, 'website'), 'exec', 'wrangler', 'r2', 'object', 'put', `lexnur-packages/${key}`];
    args.push('--file', file, '--content-type', contentType, '--remote');
    if (cacheControl) args.push('--cache-control', cacheControl);
    execFileSync('pnpm', args, { stdio: 'inherit' });
  },
  fetch: (input, init) => fetch(input, init),
  log: (line) => console.log(line),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export async function verifyRange(url: string, f: typeof fetch): Promise<void> {
  const res = await f(url, { headers: { Range: 'bytes=0-9', 'Accept-Encoding': 'identity' } });
  await res.arrayBuffer();
  if (res.status !== 206) throw new Error(`${url}: Range request answered ${res.status}, expected 206`);
  const length = res.headers.get('content-length');
  if (length !== '10') throw new Error(`${url}: Content-Length ${length}, expected 10`);
  const encoding = res.headers.get('content-encoding');
  if (encoding) throw new Error(`${url}: served with Content-Encoding ${encoding}; packages must be stored without one`);
}

const WEBVIEW_ORIGIN = 'https://localhost';

export async function verifyCors(url: string, f: typeof fetch): Promise<void> {
  const res = await f(url, { headers: { Origin: WEBVIEW_ORIGIN } });
  await res.arrayBuffer();
  const allowed = res.headers.get('access-control-allow-origin');
  if (allowed !== WEBVIEW_ORIGIN && allowed !== '*') {
    throw new Error(`${url}: no CORS header for origin ${WEBVIEW_ORIGIN} (got ${allowed ?? 'none'}); the app WebView cannot refresh the catalog. Apply website/r2-cors.json, see docs/HOSTING.md`);
  }
}

async function verifyCanonical(url: string, deps: PublishDeps): Promise<void> {
  let last: Response | undefined;
  for (let attempt = 1; attempt <= CANONICAL_ATTEMPTS; attempt++) {
    if (attempt > 1) await deps.sleep(CANONICAL_RETRY_MS);
    last = await deps.fetch(url, { headers: { Range: 'bytes=0-9', 'Accept-Encoding': 'identity' } });
    await last.arrayBuffer();
    if (last.status === 206) return;
    if (last.status !== 404) break;
  }
  if (last?.status !== 404) throw new Error(`${url}: Range request answered ${last?.status}, expected 206`);
  const ray = last.headers.get('cf-ray');
  deps.log(`warning: canonical URL still answers 404 at some edges (negative cache); it clears when the cached 404 expires${ray ? ` (cf-ray ${ray})` : ''}`);
}

export async function downloadSha256(url: string, f: typeof fetch): Promise<string> {
  const res = await f(url, { headers: { 'Accept-Encoding': 'identity' } });
  if (!res.ok || !res.body) throw new Error(`${url}: download answered ${res.status}`);
  const hash = createHash('sha256');
  for await (const chunk of res.body) hash.update(chunk);
  return hash.digest('hex');
}

// App 1.0.0 reads catalog/v1.json: the live file must still be the frozen one, and every package it
// lists must still be served.
export async function verifyFrozenV1(path: string, deps: PublishDeps, bust: (u: string) => string): Promise<void> {
  const local = assertFrozenV1(path);
  const live = await deps.fetch(bust(CATALOG_URL));
  if (!live.ok) throw new Error(`${CATALOG_URL} answered ${live.status}`);
  if (!Buffer.from(await live.arrayBuffer()).equals(local)) throw new Error(`${CATALOG_URL} differs from the frozen ${path}`);
  for (const d of parsePublishedCatalog(JSON.parse(local.toString('utf8')), { strict: true }).dictionaries) {
    const head = await deps.fetch(bust(d.url), { method: 'HEAD' });
    if (head.status !== 200) throw new Error(`${d.url} (listed in the frozen catalog/v1.json) answered ${head.status}; app 1.0.0 needs it`);
  }
}

export async function publish(id: string, version: string, deps: PublishDeps = realDeps, paths: PublishPaths = realPaths): Promise<void> {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error(`invalid id ${JSON.stringify(id)}`);
  if (!/^\d{8}\.\d+$/.test(version)) throw new Error(`invalid version ${JSON.stringify(version)}`);
  if (!deps.isAncestorOfHead('main')) {
    throw new Error('refusing to publish: this branch does not contain main. Run `git merge main` first so catalog/releases.json has every release.');
  }
  const dir = join(paths.build, 'packages', id);
  const record = readJson<BuildRecord>(join(dir, `${version}.json`));
  const file = join(dir, `${version}.sqlite.zst`);
  if ((await sha256File(file)) !== record.sha256 || statSync(file).size !== record.size_bytes) {
    throw new Error(`refusing to publish: ${file} does not match its build record ${version}.json; rebuild it`);
  }
  const url = packageUrl(id, version);
  const stamp = Date.now();
  let probes = 0;
  const bust = (u: string) => `${u}?publish=${stamp}-${probes++}`;
  const probeUrl = () => bust(url);

  const releases: Releases = {
    ...readJson<Releases>(paths.releases),
    [id]: {
      version,
      entry_count: record.entry_count,
      size_bytes: record.size_bytes,
      installed_size_bytes: record.installed_size_bytes,
      sha256: record.sha256,
      source_date: record.source_date,
      ...(record.schema_version === 2 ? { schema_version: 2 as const } : {}),
      published_at: deps.now().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    },
  };
  const editorial = loadEditorial(paths.editorial);
  const catalogs = [
    { key: 'catalog/v2.json', url: CATALOG_V2_URL, local: paths.publishedV2, catalog: buildPublishedCatalog(editorial, releases, undefined, undefined, 2) },
  ];
  for (const c of catalogs) parsePublishedCatalog(c.catalog, { strict: true });
  if (!catalogs[0]!.catalog.dictionaries.some((d) => d.id === id && d.version === version)) {
    throw new Error(`refusing to publish: ${id} would not appear in the catalog (unknown id, not distribution open, or missing editorial fields)`);
  }

  await verifyFrozenV1(paths.published, deps, bust);
  for (const c of catalogs) {
    const before = await deps.fetch(bust(c.url));
    if (before.status === 200) {
      for (const d of parsePublishedCatalog(await before.json(), { strict: true }).dictionaries) {
        const local = releases[d.id];
        if (d.id !== id && (local?.version !== d.version || local.sha256 !== d.sha256)) {
          throw new Error(`refusing to publish: the live catalog lists ${d.id} ${d.version}, which catalog/releases.json does not have; merge main first`);
        }
      }
    } else if (before.status === 404) {
      await before.arrayBuffer();
    } else {
      throw new Error(`${c.url}: answered ${before.status} before upload`);
    }
  }

  const head = await deps.fetch(probeUrl(), { method: 'HEAD' });
  if (head.status === 200) {
    if ((await downloadSha256(probeUrl(), deps.fetch)) !== record.sha256) {
      throw new Error(`refusing to publish: ${url} already exists with a different sha256; build a new version instead`);
    }
    deps.log(`${url} is already uploaded with the same bytes`);
  } else if (head.status === 404) {
    deps.r2Put(`packages/${id}/${version}.sqlite.zst`, file, 'application/zstd', 'public, max-age=31536000, immutable');
  } else {
    throw new Error(`${url}: HEAD answered ${head.status}`);
  }
  await verifyRange(probeUrl(), deps.fetch);
  const served = await downloadSha256(probeUrl(), deps.fetch);
  if (served !== record.sha256) throw new Error(`${url}: served sha256 ${served} does not match the build (${record.sha256})`);
  await verifyCanonical(url, deps);

  for (const c of catalogs) {
    const upload = join(paths.tmp, 'publish', c.key.slice('catalog/'.length));
    writeJson(upload, c.catalog);
    deps.r2Put(c.key, upload, 'application/json', 'public, max-age=300');
  }
  writeReleases(releases, paths.releases);
  for (const c of catalogs) writeJson(c.local, c.catalog);

  for (const c of catalogs) {
    const liveRes = await deps.fetch(bust(c.url));
    if (!liveRes.ok) throw new Error(`${c.url} answered ${liveRes.status} after upload`);
    if ((await liveRes.text()) !== readFileSync(c.local, 'utf8')) throw new Error(`${c.url} differs from ${c.local} after upload`);
    await verifyCors(bust(c.url), deps.fetch);
  }
  deps.log(`published ${id} ${version}: ${url}\ncommit catalog/releases.json and catalog/v2.json`);
}
