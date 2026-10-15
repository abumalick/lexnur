import { describe, expect, it } from 'vitest';
import { MemoryKv } from './kv';
import { RecentSearches } from './recent-searches';

const item = (id: number, dictionaryId = 'oewn-2025') => ({ dictionaryId, entryId: id, headword: `w${id}`, gloss: null });

describe('RecentSearches', () => {
  it('keeps the newest first and moves a reopened entry to the top', async () => {
    const r = await RecentSearches.load(new MemoryKv());
    await r.add(item(1), 1); await r.add(item(2), 2); await r.add(item(1), 3);
    expect(r.current.map((x) => x.entryId)).toEqual([1, 2]);
  });

  it('caps the list', async () => {
    const r = await RecentSearches.load(new MemoryKv(), 3);
    for (let i = 0; i < 5; i++) await r.add(item(i), i);
    expect(r.current.map((x) => x.entryId)).toEqual([4, 3, 2]);
  });

  it('removes one item, a whole dictionary, or everything, and persists', async () => {
    const kv = new MemoryKv();
    const r = await RecentSearches.load(kv);
    await r.add(item(1)); await r.add(item(2, 'wiktionary-en')); await r.add(item(3));
    await r.remove('oewn-2025', 3);
    expect((await RecentSearches.load(kv)).current.map((x) => x.entryId)).toEqual([2, 1]);
    await r.removeDictionary('wiktionary-en');
    expect(r.current.map((x) => x.entryId)).toEqual([1]);
    await r.clear();
    expect((await RecentSearches.load(kv)).current).toEqual([]);
  });

  it('removeDictionary drops its recents', async () => {
    const r = await RecentSearches.load(new MemoryKv());
    await r.add(item(1, 'gone')); await r.add(item(2));
    await r.removeDictionary('gone');
    expect(r.current.every((x) => x.dictionaryId !== 'gone')).toBe(true);
  });

  it('re-resolves one dictionary by headword, drops what no longer resolves, and persists', async () => {
    const kv = new MemoryKv();
    const r = await RecentSearches.load(kv);
    await r.add(item(1), 1); await r.add(item(2, 'wiktionary-en'), 2); await r.add(item(3), 3);
    await r.remap('oewn-2025', async (headword) => (headword === 'w1' ? 11 : null));
    expect((await RecentSearches.load(kv)).current.map((x) => [x.dictionaryId, x.entryId, x.headword]))
      .toEqual([['wiktionary-en', 2, 'w2'], ['oewn-2025', 11, 'w1']]);
  });
});
