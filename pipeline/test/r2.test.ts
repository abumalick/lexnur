import { copyFileSync, cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadEditorial } from '../src/catalog/editorial.ts';
import { buildPublishedCatalog, type ReleaseRecord } from '../src/catalog/publish.ts';
import { CATALOG_URL, CATALOG_V2_URL, publish, verifyRange, type PublishDeps, type PublishPaths } from '../src/publish/r2.ts';
import { CATALOG } from '../src/paths.ts';
import { tempDir } from './tmp.ts';

const CATALOG_LIVE = CATALOG_URL;
const BYTES = Buffer.from('zstd-bytes-of-a-test-package');
const SHA = createHash('sha256').update(BYTES).digest('hex');
const VERSION = '20261101.1';
const PKG_URL = `https://dl.lexnur.com/packages/oewn-2025/${VERSION}.sqlite.zst`;

function setup(): PublishPaths {
  const dir = tempDir();
  const build = join(dir, 'build');
  mkdirSync(join(build, 'packages', 'oewn-2025'), { recursive: true });
  writeFileSync(join(build, 'packages', 'oewn-2025', `${VERSION}.sqlite.zst`), BYTES);
  writeFileSync(
    join(build, 'packages', 'oewn-2025', `${VERSION}.json`),
    JSON.stringify({ id: 'oewn-2025', version: VERSION, entry_count: 7, size_bytes: BYTES.length, installed_size_bytes: 99, sha256: SHA, source_date: '2026-10-10' }),
  );
  const paths = { build, releases: join(dir, 'releases.json'), published: join(dir, 'v1.json'), publishedV2: join(dir, 'v2.json'), editorial: join(dir, 'catalog.json'), tmp: join(dir, 'tmp') };
  writeFileSync(paths.releases, '{}\n');
  copyFileSync(CATALOG.editorial, paths.editorial);
  copyFileSync(CATALOG.published, paths.published);
  return paths;
}

// What app 1.0.0 needs to stay live: the frozen catalog/v1.json and every package it lists.
const FROZEN_V1 = readFileSync(CATALOG.published);
const frozenV1Objects = (): Record<string, Buffer> => ({
  'catalog/v1.json': FROZEN_V1,
  ...Object.fromEntries(JSON.parse(FROZEN_V1.toString('utf8')).dictionaries.map((d: { url: string }) => [d.url.replace('https://dl.lexnur.com/', ''), Buffer.from('pkg')])),
});

function fakeR2(initial: Record<string, Buffer> = {}, headers: Record<string, string> = {}, canonical404s = 0) {
  const objects = new Map(Object.entries({ ...frozenV1Objects(), ...initial }).map(([k, v]) => [`https://dl.lexnur.com/${k}`, v]));
  const puts: { key: string; contentType: string; cacheControl?: string }[] = [];
  const fetches: string[] = [];
  const events: string[] = [];
  const sleeps: number[] = [];
  let remaining404s = canonical404s;
  const cached404 = new Set<string>();
  const deps: PublishDeps = {
    isAncestorOfHead: () => true,
    now: () => new Date('2026-10-11T01:02:03.456Z'),
    r2Put: (key, file, contentType, cacheControl) => {
      puts.push({ key, contentType, cacheControl });
      events.push(`put ${key}`);
      objects.set(`https://dl.lexnur.com/${key}`, readFileSync(file));
    },
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      fetches.push(String(input));
      const url = String(input).replace(/\?.*$/, '');
      events.push(`${init?.method ?? 'GET'} ${String(input)}`);
      if (String(input) === PKG_URL && remaining404s > 0) {
        remaining404s--;
        return new Response(null, { status: 404 });
      }
      const body = objects.get(url);
      if (cached404.has(String(input))) return new Response(null, { status: 404 });
      if (!body) {
        cached404.add(String(input));
        return new Response(null, { status: 404 });
      }
      if (init?.method === 'HEAD') return new Response(null, { status: 200 });
      const reqHeaders = new Headers(init?.headers);
      const cors: Record<string, string> = reqHeaders.get('origin') ? { 'access-control-allow-origin': reqHeaders.get('origin')! } : {};
      const range = reqHeaders.get('range');
      if (range === 'bytes=0-9') return new Response(body.subarray(0, 10), { status: 206, headers: { 'content-length': '10', ...headers } });
      return new Response(body, { status: 200, headers: { ...cors, ...headers } });
    }) as typeof fetch,
    log: () => {},
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  };
  return { deps, puts, objects, fetches, events, sleeps };
}

describe('publish', () => {
  it('uploads the package, records the release and uploads the catalog', async () => {
    const paths = setup();
    const { deps, puts } = fakeR2();
    await publish('oewn-2025', VERSION, deps, paths);
    expect(puts).toEqual([
      { key: `packages/oewn-2025/${VERSION}.sqlite.zst`, contentType: 'application/zstd', cacheControl: 'public, max-age=31536000, immutable' },
      { key: 'catalog/v2.json', contentType: 'application/json', cacheControl: 'public, max-age=300' },
    ]);
    expect(JSON.parse(readFileSync(paths.releases, 'utf8'))).toEqual({
      'oewn-2025': {
        version: VERSION,
        entry_count: 7,
        size_bytes: BYTES.length,
        installed_size_bytes: 99,
        sha256: SHA,
        source_date: '2026-10-10',
        published_at: '2026-10-11T01:02:03Z',
      },
    });
    expect(readFileSync(paths.published)).toEqual(FROZEN_V1);
    const v2 = JSON.parse(readFileSync(paths.publishedV2, 'utf8'));
    expect(v2.generated_at).toBe('2026-10-11T01:02:03Z');
    expect(v2.dictionaries[0]).toMatchObject({ id: 'oewn-2025', url: PKG_URL, sha256: SHA, source_date: '2026-10-10', schema_version: 1 });
  });

  it('publishes a dictionary that needs a newer app to v2 only', async () => {
    const paths = setup();
    const editorial = JSON.parse(readFileSync(paths.editorial, 'utf8'));
    editorial.dictionaries.find((d: { id: string }) => d.id === 'oewn-2025').min_app_version = '1.1.0';
    writeFileSync(paths.editorial, JSON.stringify(editorial));
    const { deps, puts } = fakeR2();
    await publish('oewn-2025', VERSION, deps, paths);
    expect(puts.map((p) => p.key)).toEqual([`packages/oewn-2025/${VERSION}.sqlite.zst`, 'catalog/v2.json']);
    expect(JSON.parse(readFileSync(paths.publishedV2, 'utf8')).dictionaries[0]).toMatchObject({ id: 'oewn-2025', min_app_version: '1.1.0' });
  });

  it('never requests the bare package URL before the object exists', async () => {
    const paths = setup();
    const { deps, events } = fakeR2();
    await publish('oewn-2025', VERSION, deps, paths);
    const upload = events.indexOf(`put packages/oewn-2025/${VERSION}.sqlite.zst`);
    const packageRequests = events.filter((e) => e.includes(PKG_URL));
    const beforeUpload = events.slice(0, upload).filter((e) => e.includes(PKG_URL));
    expect(upload).toBeGreaterThan(0);
    expect(beforeUpload.every((e) => e.includes(`${PKG_URL}?publish=`))).toBe(true);
    expect(beforeUpload).toHaveLength(1);
    expect(packageRequests.filter((e) => !e.includes('?'))).toHaveLength(1);
    expect(events.slice(upload).filter((e) => e.includes(PKG_URL)).slice(0, -1).every((e) => e.includes('?publish='))).toBe(true);
  });

  it('requests a URL that was never requested before for every probe', async () => {
    const paths = setup();
    const { deps, events } = fakeR2();
    await publish('oewn-2025', VERSION, deps, paths);
    const probes = events.filter((e) => e.includes(`${PKG_URL}?publish=`));
    expect(probes.length).toBeGreaterThanOrEqual(3);
    expect(new Set(probes.map((e) => e.split(' ')[1])).size).toBe(probes.length);
  });

  it('retries the canonical Range check until the edge stops answering 404', async () => {
    const paths = setup();
    const { deps, events, sleeps } = fakeR2({}, {}, 2);
    await publish('oewn-2025', VERSION, deps, paths);
    expect(events.filter((e) => e === `GET ${PKG_URL}`)).toHaveLength(3);
    expect(sleeps).toEqual([5000, 5000]);
  });

  it('warns instead of failing when the canonical URL keeps answering 404', async () => {
    const paths = setup();
    const { deps, events, sleeps } = fakeR2({}, {}, 100);
    const lines: string[] = [];
    await publish('oewn-2025', VERSION, { ...deps, log: (l) => lines.push(l) }, paths);
    expect(events.filter((e) => e === `GET ${PKG_URL}`)).toHaveLength(6);
    expect(sleeps).toHaveLength(5);
    expect(lines.some((l) => l.includes('negative cache'))).toBe(true);
  });

  it('fails when the canonical URL answers something other than 206 or 404', async () => {
    const paths = setup();
    const { deps } = fakeR2();
    const wrong: PublishDeps = {
      ...deps,
      fetch: (async (input: string | URL | Request, init?: RequestInit) =>
        String(input) === PKG_URL ? new Response(BYTES, { status: 200 }) : deps.fetch(input, init)) as typeof fetch,
    };
    await expect(publish('oewn-2025', VERSION, wrong, paths)).rejects.toThrow('expected 206');
  });

  it('refuses a branch without main', async () => {
    const paths = setup();
    const { deps, puts } = fakeR2();
    await expect(publish('oewn-2025', VERSION, { ...deps, isAncestorOfHead: () => false }, paths)).rejects.toThrow('does not contain main');
    expect(puts).toEqual([]);
  });

  it('refuses an existing key with a different sha256', async () => {
    const paths = setup();
    const { deps, puts } = fakeR2({ [`packages/oewn-2025/${VERSION}.sqlite.zst`]: Buffer.from('other bytes') });
    await expect(publish('oewn-2025', VERSION, deps, paths)).rejects.toThrow('different sha256');
    expect(puts).toEqual([]);
  });

  it('accepts an existing key with the same bytes and skips the upload', async () => {
    const paths = setup();
    const { deps, puts } = fakeR2({ [`packages/oewn-2025/${VERSION}.sqlite.zst`]: BYTES });
    await publish('oewn-2025', VERSION, deps, paths);
    expect(puts.map((p) => p.key)).toEqual(['catalog/v2.json']);
  });

  it('refuses a local package that does not match its build record, before any network call', async () => {
    const paths = setup();
    const record = join(paths.build, 'packages', 'oewn-2025', `${VERSION}.json`);
    writeFileSync(record, readFileSync(record, 'utf8').replace(SHA, 'f'.repeat(64)));
    const { deps, puts, fetches } = fakeR2();
    await expect(publish('oewn-2025', VERSION, deps, paths)).rejects.toThrow('does not match');
    expect(puts).toEqual([]);
    expect(fetches).toEqual([]);
  });

  it('refuses an id that would not appear in the catalog, before any upload', async () => {
    const paths = setup();
    cpSync(join(paths.build, 'packages', 'oewn-2025'), join(paths.build, 'packages', 'nope'), { recursive: true });
    const { deps, puts } = fakeR2();
    await expect(publish('nope', VERSION, deps, paths)).rejects.toThrow('would not appear in the catalog');
    expect(puts).toEqual([]);
  });

  it('refuses a malformed id or version', async () => {
    const paths = setup();
    const { deps, puts } = fakeR2();
    await expect(publish('../x', VERSION, deps, paths)).rejects.toThrow('invalid id');
    await expect(publish('oewn-2025', '1', deps, paths)).rejects.toThrow('invalid version');
    expect(puts).toEqual([]);
  });

  it('stops on an unexpected HEAD status without uploading', async () => {
    const paths = setup();
    const { deps, puts } = fakeR2();
    const failing: PublishDeps = {
      ...deps,
      fetch: (async (input: string | URL | Request, init?: RequestInit) =>
        String(input).startsWith(PKG_URL) ? new Response(null, { status: 500 }) : deps.fetch(input, init)) as typeof fetch,
    };
    await expect(publish('oewn-2025', VERSION, failing, paths)).rejects.toThrow('HEAD answered 500');
    expect(puts).toEqual([]);
  });

  it('keeps the releases of other dictionaries', async () => {
    const paths = setup();
    const other = { version: '20260101.1', entry_count: 1, size_bytes: 1, installed_size_bytes: 1, sha256: 'a'.repeat(64), source_date: '2026-01-01' };
    writeFileSync(paths.releases, JSON.stringify({ 'zz-other': other }));
    const { deps } = fakeR2();
    await publish('oewn-2025', VERSION, deps, paths);
    const releases = JSON.parse(readFileSync(paths.releases, 'utf8'));
    expect(Object.keys(releases)).toEqual(['oewn-2025', 'zz-other']);
    expect(releases['zz-other']).toEqual(other);
  });

  const liveCatalog = (releases: Record<string, ReleaseRecord>, format: 1 | 2 = 1) =>
    Buffer.from(JSON.stringify(buildPublishedCatalog(loadEditorial(CATALOG.editorial), releases, undefined, undefined, format)));
  const other: ReleaseRecord = { version: '20260101.1', entry_count: 1, size_bytes: 1, installed_size_bytes: 1, sha256: 'a'.repeat(64), source_date: '2026-01-01' };

  it('refuses, before any upload, when the live v2 catalog lists a release that releases.json does not have', async () => {
    const paths = setup();
    const { deps, puts } = fakeR2({ 'catalog/v2.json': liveCatalog({ 'wiktionary-en': other }, 2) });
    await expect(publish('oewn-2025', VERSION, deps, paths)).rejects.toThrow(
      'refusing to publish: the live catalog lists wiktionary-en 20260101.1, which catalog/releases.json does not have; merge main first',
    );
    expect(puts).toEqual([]);
  });

  it('publishes over a live catalog that lists the same other releases and an older version of this one', async () => {
    const paths = setup();
    writeFileSync(paths.releases, JSON.stringify({ 'wiktionary-en': other }));
    const { deps, puts } = fakeR2({ 'catalog/v2.json': liveCatalog({ 'wiktionary-en': other, 'oewn-2025': { ...other, version: '20250101.1' } }, 2) });
    await publish('oewn-2025', VERSION, deps, paths);
    expect(puts.map((p) => p.key)).toEqual([`packages/oewn-2025/${VERSION}.sqlite.zst`, 'catalog/v2.json']);
  });

  it('stops when the live catalog answers something other than 200 or 404', async () => {
    const paths = setup();
    const { deps, puts } = fakeR2();
    const failing: PublishDeps = {
      ...deps,
      fetch: (async (input: string | URL | Request, init?: RequestInit) =>
        String(input).startsWith(CATALOG_V2_URL) ? new Response(null, { status: 503 }) : deps.fetch(input, init)) as typeof fetch,
    };
    await expect(publish('oewn-2025', VERSION, failing, paths)).rejects.toThrow('answered 503');
    expect(puts).toEqual([]);
  });

  it.each(['catalog/v2.json'])('leaves releases.json and v2.json untouched when the %s upload fails', async (failingKey) => {
    const paths = setup();
    writeFileSync(paths.publishedV2, 'previous v2 catalog\n');
    const { deps } = fakeR2();
    const failing: PublishDeps = {
      ...deps,
      r2Put: (key, file, type, cache) => {
        if (key === failingKey) throw new Error('upload failed');
        deps.r2Put(key, file, type, cache);
      },
    };
    await expect(publish('oewn-2025', VERSION, failing, paths)).rejects.toThrow('upload failed');
    expect(readFileSync(paths.releases, 'utf8')).toBe('{}\n');
    expect(readFileSync(paths.publishedV2, 'utf8')).toBe('previous v2 catalog\n');
  });

  it.each([CATALOG_V2_URL])('asks %s with the app WebView origin after upload', async (url) => {
    const paths = setup();
    const { deps, events } = fakeR2();
    const seen: string[] = [];
    const spy: PublishDeps = {
      ...deps,
      fetch: (async (input: string | URL | Request, init?: RequestInit) => {
        if (String(input).startsWith(url) && new Headers(init?.headers).get('origin') === 'https://localhost') seen.push(String(input));
        return deps.fetch(input, init);
      }) as typeof fetch,
    };
    await publish('oewn-2025', VERSION, spy, paths);
    expect(seen).toHaveLength(1);
    expect(events.findIndex((e) => e.startsWith('put catalog/'))).toBeLessThan(events.indexOf(`GET ${seen[0]}`));
  });

  it.each([CATALOG_V2_URL])('fails when %s lacks CORS for the app origin', async (url) => {
    const paths = setup();
    const { deps } = fakeR2();
    const noCors: PublishDeps = {
      ...deps,
      fetch: (async (input: string | URL | Request, init?: RequestInit) => {
        const res = await deps.fetch(input, init);
        if (!String(input).startsWith(url) || !new Headers(init?.headers).get('origin')) return res;
        const headers = new Headers(res.headers);
        headers.delete('access-control-allow-origin');
        return new Response(await res.arrayBuffer(), { status: res.status, headers });
      }) as typeof fetch,
    };
    await expect(publish('oewn-2025', VERSION, noCors, paths)).rejects.toThrow(/CORS.*website\/r2-cors\.json.*docs\/HOSTING\.md/s);
  });

  it('accepts a wildcard allow-origin', async () => {
    const paths = setup();
    const { deps } = fakeR2();
    const wild: PublishDeps = {
      ...deps,
      fetch: (async (input: string | URL | Request, init?: RequestInit) => {
        const res = await deps.fetch(input, init);
        if (!new Headers(init?.headers).get('origin')) return res;
        const headers = new Headers(res.headers);
        headers.set('access-control-allow-origin', '*');
        return new Response(await res.arrayBuffer(), { status: res.status, headers });
      }) as typeof fetch,
    };
    await publish('oewn-2025', VERSION, wild, paths);
  });

  it.each([['catalog/v2.json', CATALOG_V2_URL]])('reports a missing live %s clearly', async (lostKey, lostUrl) => {
    const paths = setup();
    const { deps, objects } = fakeR2();
    const lossy: PublishDeps = {
      ...deps,
      r2Put: (key, file, type, cache) => {
        deps.r2Put(key, file, type, cache);
        if (key === lostKey) objects.delete(lostUrl);
      },
    };
    await expect(publish('oewn-2025', VERSION, lossy, paths)).rejects.toThrow(`${lostUrl} answered 404`);
  });
});

describe('frozen catalog/v1.json', () => {
  it('refuses to publish when the local v1.json is not the frozen file', async () => {
    const paths = setup();
    writeFileSync(paths.published, FROZEN_V1.toString('utf8').replace('"format": 1', '"format":1'));
    const { deps, puts } = fakeR2();
    await expect(publish('oewn-2025', VERSION, deps, paths)).rejects.toThrow('is frozen for app 1.0.0');
    expect(puts).toEqual([]);
  });

  it('refuses to publish when the live v1.json differs from the frozen file', async () => {
    const paths = setup();
    const { deps, puts } = fakeR2({ 'catalog/v1.json': Buffer.from('{}') });
    await expect(publish('oewn-2025', VERSION, deps, paths)).rejects.toThrow(`${CATALOG_LIVE} differs from the frozen`);
    expect(puts).toEqual([]);
  });

  it('refuses to publish when a package listed in v1.json is gone', async () => {
    const paths = setup();
    const { deps, puts, objects } = fakeR2();
    const gone = JSON.parse(FROZEN_V1.toString('utf8')).dictionaries[0].url;
    objects.delete(gone);
    await expect(publish('oewn-2025', VERSION, deps, paths)).rejects.toThrow(`${gone} (listed in the frozen catalog/v1.json) answered 404`);
    expect(puts).toEqual([]);
  });

  it('never uploads v1.json, even for a schema-2 package', async () => {
    const paths = setup();
    const record = join(paths.build, 'packages', 'oewn-2025', `${VERSION}.json`);
    writeFileSync(record, JSON.stringify({ ...JSON.parse(readFileSync(record, 'utf8')), schema_version: 2 }));
    const { deps, puts } = fakeR2();
    await publish('oewn-2025', VERSION, deps, paths);
    expect(puts.map((p) => p.key)).not.toContain('catalog/v1.json');
    expect(readFileSync(paths.published)).toEqual(FROZEN_V1);
    expect(JSON.parse(readFileSync(paths.publishedV2, 'utf8')).dictionaries[0]).toMatchObject({ id: 'oewn-2025', schema_version: 2, min_app_version: '1.1.0' });
    expect(JSON.parse(readFileSync(paths.releases, 'utf8'))['oewn-2025'].schema_version).toBe(2);
  });
});

describe('verifyRange', () => {
  it('rejects an answer that is not 206', async () => {
    const f = (async () => new Response(BYTES, { status: 200, headers: { 'content-length': '10' } })) as typeof fetch;
    await expect(verifyRange('https://dl.lexnur.com/x', f)).rejects.toThrow('expected 206');
  });

  it('rejects a Content-Length other than 10', async () => {
    const f = (async () => new Response(BYTES, { status: 206, headers: { 'content-length': '28' } })) as typeof fetch;
    await expect(verifyRange('https://dl.lexnur.com/x', f)).rejects.toThrow('Content-Length');
  });
  it('rejects a package served with Content-Encoding', async () => {
    const { deps } = fakeR2({ 'packages/x/1.sqlite.zst': BYTES }, { 'content-encoding': 'gzip' });
    await expect(verifyRange('https://dl.lexnur.com/packages/x/1.sqlite.zst', deps.fetch)).rejects.toThrow('Content-Encoding');
  });
});
