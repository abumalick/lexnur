import { describe, expect, it, vi } from 'vitest';
import type { PublishedCatalog } from '@lexnur/core';
import { MemoryKv } from './kv';
import { CatalogRepository } from './catalog-repository';
import { fixtureCatalog } from '../test/fixtures';

const URL_ = 'https://dl.lexnur.com/catalog/v1.json';
const okFetch = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;
const failFetch = vi.fn(async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
const load = (fetchImpl: typeof fetch, kv = new MemoryKv()) => CatalogRepository.load({ snapshot: fixtureCatalog, catalogUrl: URL_, fetch: fetchImpl, kv });

describe('CatalogRepository', () => {
  it('lists the bundled snapshot before any network', async () => {
    const r = await load(failFetch);
    expect(r.current.available.map((d) => d.id).sort()).toEqual(['oewn-2025', 'wiktionary-ar-en', 'wiktionary-en']);
  });

  it('resolves relative package URLs against the catalog URL', async () => {
    const r = await load(failFetch);
    expect(r.find('oewn-2025')!.url).toBe('https://dl.lexnur.com/catalog/packages/oewn-2025.sqlite.zst');
  });

  it('refresh caches a newer catalog and survives a restart offline', async () => {
    const kv = new MemoryKv();
    const newer: PublishedCatalog = {
      ...fixtureCatalog,
      generated_at: '2026-10-12T00:00:00Z',
      dictionaries: fixtureCatalog.dictionaries.map((d) => d.id === 'oewn-2025' ? { ...d, version: '20261012.1' } : d),
    };
    const r = await load(okFetch(newer), kv);
    expect(await r.refresh()).toBe('updated');
    expect(await r.refresh()).toBe('unchanged');
    const again = await load(failFetch, kv);
    expect(again.find('oewn-2025')!.version).toBe('20261012.1');
    expect(await again.refresh()).toBe('offline');
  });

  it('treats an installed list that is not an array as empty instead of failing to start', async () => {
    const kv = new MemoryKv();
    await kv.set('installed', '{"oewn-2025":true}');
    const r = await load(failFetch, kv);
    expect(r.current.installed).toEqual([]);
    expect(r.forStore()).toEqual([]);
  });

  it('rejects a malformed remote catalog and keeps the current one', async () => {
    const r = await load(okFetch({ format: 1, dictionaries: [{ id: 'x' }] }));
    expect(await r.refresh()).toBe('offline');
    expect(r.current.available).toHaveLength(3);
  });

  it('keeps refreshing when one remote entry is unreadable, skipping only that entry', async () => {
    const kv = new MemoryKv();
    const future = { ...fixtureCatalog.dictionaries[0], id: 'future-dict', schema_version: 3 };
    const r = await load(okFetch({ ...fixtureCatalog, generated_at: '2026-10-12T00:00:00Z', dictionaries: [...fixtureCatalog.dictionaries, future] }), kv);
    expect(await r.refresh()).toBe('updated');
    expect(r.current.available.map((d) => d.id).sort()).toEqual(['oewn-2025', 'wiktionary-ar-en', 'wiktionary-en']);
    expect((await load(failFetch, kv)).current.available).toHaveLength(3);
  });

  it('records installs, reports updates, and removes', async () => {
    const kv = new MemoryKv();
    const r = await load(failFetch, kv);
    const oewn = r.find('oewn-2025')!;
    await r.markInstalled({ ...oewn, version: 'old' }, 'oewn-2025/old.sqlite', 1);
    expect(r.updates().map((d) => d.id)).toEqual(['oewn-2025']);
    expect((await load(failFetch, kv)).installedRecord('oewn-2025')!.relativePath).toBe('oewn-2025/old.sqlite');
    expect(r.installedRecord('oewn-2025')!.source_date).toBe(oewn.source_date);
    expect(r.forStore()).toEqual([{ id: 'oewn-2025', title: oewn.title, from: 'en', to: 'en', relativePath: 'oewn-2025/old.sqlite' }]);
    await r.markRemoved('oewn-2025');
    expect(r.current.installed).toEqual([]);
  });

  it('groups by language pair and sorts by rank', async () => {
    const g = (await load(failFetch)).groups();
    expect(g.map((x) => `${x.from}-${x.to}`)).toEqual(['en-en', 'ar-en']);
    expect(g[0].dictionaries.map((d) => d.id)).toEqual(['wiktionary-en', 'oewn-2025']);
  });

  it('pre-selects Wiktionary Ar–En on Arabic devices and WordNet otherwise, never Wiktionary English', async () => {
    const r = await load(failFetch);
    expect(r.defaultSelection(['ar-SA', 'en-US'])).toEqual(['wiktionary-ar-en']);
    expect(r.defaultSelection(['en-GB'])).toEqual(['oewn-2025']);
    expect(r.defaultSelection(['fr-FR'])).toEqual(['oewn-2025']);
  });

  it('returns offline when the cache write fails, then applies the catalog on a later refresh', async () => {
    const kv = new MemoryKv();
    const newer: PublishedCatalog = { ...fixtureCatalog, generated_at: '2026-10-12T00:00:00Z' };
    const r = await load(okFetch(newer), kv);
    const realSet = kv.set.bind(kv);
    kv.set = async () => { throw new Error('disk full'); };
    expect(await r.refresh()).toBe('offline');
    kv.set = realSet;
    expect(await r.refresh()).toBe('updated');
  });

  it('keeps both records when installs overlap', async () => {
    const r = await load(failFetch);
    await Promise.all([
      r.markInstalled(r.find('oewn-2025')!, 'a.sqlite', 1),
      r.markInstalled(r.find('wiktionary-en')!, 'b.sqlite', 2),
    ]);
    expect(r.current.installed.map((x) => x.id).sort()).toEqual(['oewn-2025', 'wiktionary-en']);
  });

  it('does not treat other ar-prefixed languages as Arabic', async () => {
    const r = await load(failFetch);
    expect(r.defaultSelection(['arn-CL'])).toEqual(['oewn-2025']);
    expect(r.defaultSelection(['ar_EG'])).toEqual(['wiktionary-ar-en']);
  });

  describe('min_app_version', () => {
    const gated = (min: (string | undefined)[], generated_at = fixtureCatalog.generated_at): PublishedCatalog => ({
      format: 2, generated_at,
      dictionaries: fixtureCatalog.dictionaries.map((d, i) => (min[i] ? { ...d, min_app_version: min[i] } : d)),
    });
    const ids = (r: CatalogRepository) => r.current.available.map((d) => d.id);

    it('hides entries that need a newer app and lists entries without the field', async () => {
      const snapshot = gated(['1.1.0', '1.0.0', undefined]);
      const r = await CatalogRepository.load({ snapshot, catalogUrl: URL_, fetch: failFetch, kv: new MemoryKv(), appVersion: '1.0.0' });
      expect(ids(r)).toEqual(snapshot.dictionaries.slice(1).map((d) => d.id));
    });

    it('compares versions numerically', async () => {
      const snapshot = gated(['1.10.0', '1.9.0', '2.0.0']);
      const r = await CatalogRepository.load({ snapshot, catalogUrl: URL_, fetch: failFetch, kv: new MemoryKv(), appVersion: '1.9.3' });
      expect(ids(r)).toEqual([snapshot.dictionaries[1].id]);
    });

    it('filters a fetched catalog too, and defaults to the version the app was built with', async () => {
      const r = await load(okFetch(gated(['999.0.0', '0.0.1', undefined], '2026-10-12T00:00:00Z')));
      expect(await r.refresh()).toBe('updated');
      expect(ids(r)).toEqual(fixtureCatalog.dictionaries.slice(1).map((d) => d.id));
    });

    it('keeps the bundled v2 catalog offline when an older install cached a newer v1', async () => {
      const kv = new MemoryKv();
      const v1: PublishedCatalog = { ...fixtureCatalog, format: 1, generated_at: '2026-10-20T00:00:00Z', dictionaries: fixtureCatalog.dictionaries.slice(1) };
      await kv.set('catalog.cache', JSON.stringify(v1));
      const r = await CatalogRepository.load({ snapshot: { ...fixtureCatalog, format: 2 }, catalogUrl: URL_, fetch: failFetch, kv });
      expect(r.current.available).toHaveLength(fixtureCatalog.dictionaries.length);
    });

    it('replaces a format 1 catalog cached by an older install even when the v2 catalog has the same date', async () => {
      const kv = new MemoryKv();
      const v1: PublishedCatalog = { ...fixtureCatalog, format: 1, generated_at: '2026-10-12T00:00:00Z', dictionaries: fixtureCatalog.dictionaries.slice(1) };
      await kv.set('catalog.cache', JSON.stringify(v1));
      const snapshot: PublishedCatalog = { ...fixtureCatalog, format: 1 };
      const r = await CatalogRepository.load({ snapshot, catalogUrl: URL_, fetch: okFetch({ ...fixtureCatalog, format: 2, generated_at: '2026-10-12T00:00:00Z' }), kv });
      expect(r.current.available).toHaveLength(fixtureCatalog.dictionaries.length - 1);
      expect(await r.refresh()).toBe('updated');
      expect(r.current.available).toHaveLength(fixtureCatalog.dictionaries.length);
      expect(await r.refresh()).toBe('unchanged');
    });
  });
});
