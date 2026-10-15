import { describe, expect, it } from 'vitest';
import { META_KEYS, parsePublishedCatalog, type PublishedDictionary } from '../src/index.ts';

const good: PublishedDictionary = {
  id: 'oewn-2025',
  title: 'Open English WordNet 2025',
  from: 'en',
  to: 'en',
  kind: 'monolingual',
  rank: 2,
  difficulty: 'intermediate',
  license: 'CC BY 4.0 + WordNet License',
  license_url: 'https://creativecommons.org/licenses/by/4.0/',
  attribution: 'Open English WordNet 2025',
  source_date: '2026-10-10',
  summary: { en: 'Short definitions.', ar: 'تعريفات قصيرة.' },
  ai_generated: false,
  schema_version: 1,
  version: '20261011.1',
  entry_count: 135000,
  size_bytes: 25000000,
  installed_size_bytes: 90000000,
  sha256: 'a'.repeat(64),
  url: 'https://dl.lexnur.com/packages/oewn-2025/20261011.1.sqlite.zst',
};

const catalog = (dictionaries: unknown[]) => ({ format: 1, generated_at: '2026-10-11T00:00:00Z', dictionaries });

describe('parsePublishedCatalog', () => {
  it('accepts a valid catalog', () => {
    expect(parsePublishedCatalog(catalog([good])).dictionaries[0]).toEqual(good);
  });

  it('accepts the fixture version and relative urls', () => {
    const fixture = { ...good, version: 'fixture', url: 'packages/oewn-2025.sqlite.zst' };
    expect(parsePublishedCatalog(catalog([fixture])).dictionaries[0]?.version).toBe('fixture');
  });

  it.each([
    [{ ...good, sha256: 'ABC' }, '$.dictionaries[0].sha256'],
    [{ ...good, size_bytes: -1 }, '$.dictionaries[0].size_bytes'],
    [{ ...good, difficulty: 'easy' }, '$.dictionaries[0].difficulty'],
    [{ ...good, summary: { en: 'x' } }, '$.dictionaries[0].summary.ar'],
    [{ ...good, version: '2026-10-11' }, '$.dictionaries[0].version'],
    [{ ...good, ai_generated: 'no' }, '$.dictionaries[0].ai_generated'],
    [{ ...good, source_date: '10/10/2026' }, '$.dictionaries[0].source_date'],
    [{ ...good, source_date: undefined }, '$.dictionaries[0].source_date'],
    [{ ...good, min_app_version: '1.1' }, '$.dictionaries[0].min_app_version'],
    [{ ...good, min_app_version: 110 }, '$.dictionaries[0].min_app_version'],
    [{ ...good, availability: '' }, '$.dictionaries[0].availability'],
  ])('names the bad field %#', (dictionary, path) => {
    expect(() => parsePublishedCatalog(catalog([dictionary]), { strict: true })).toThrow(path);
    const parsed = parsePublishedCatalog(catalog([dictionary, good]));
    expect(parsed.dictionaries).toEqual([good]);
    expect(parsed.skipped).toEqual([{ index: 0, id: 'oewn-2025', error: expect.stringContaining(path) }]);
  });

  it.each([
    [{ ...good, id: 'future', schema_version: 3 }],
    [{ ...good, id: 'future', kind: 'trilingual' }],
    [{ ...good, id: 'future', min_app_version: 'next' }],
  ])('skips an entry it cannot read and keeps the rest %#', (dictionary) => {
    const parsed = parsePublishedCatalog(catalog([dictionary, good]));
    expect(parsed.dictionaries).toEqual([good]);
    expect(parsed.skipped.map((x) => x.id)).toEqual(['future']);
  });

  it('skips an entry that is not an object, without an id', () => {
    expect(parsePublishedCatalog(catalog(['x', good])).skipped).toEqual([{ index: 0, error: expect.stringContaining('$.dictionaries[0]') }]);
  });

  it('still throws on a bad top level', () => {
    expect(() => parsePublishedCatalog({ format: 1, generated_at: '2026-10-11T00:00:00Z', dictionaries: {} })).toThrow('$.dictionaries');
    expect(() => parsePublishedCatalog(null)).toThrow('$');
  });

  it('rejects a wrong format', () => {
    expect(() => parsePublishedCatalog({ ...catalog([]), format: 3 })).toThrow('$.format');
  });

  it('accepts format 2 with an optional min_app_version', () => {
    const parsed = parsePublishedCatalog({ ...catalog([{ ...good, min_app_version: '1.1.0' }, good]), format: 2 });
    expect(parsed.format).toBe(2);
    expect(parsed.dictionaries[0]?.min_app_version).toBe('1.1.0');
    expect(parsed.dictionaries[1]).toEqual(good);
    expect('min_app_version' in parsed.dictionaries[1]!).toBe(false);
  });

  it('carries an optional availability statement', () => {
    const parsed = parsePublishedCatalog(catalog([{ ...good, availability: 'This text may be freely distributed.' }, good]));
    expect(parsed.dictionaries[0]?.availability).toBe('This text may be freely distributed.');
    expect('availability' in parsed.dictionaries[1]!).toBe(false);
  });
});

describe('META_KEYS', () => {
  it('includes source_date, so every package records its upstream dump date', () => {
    expect(META_KEYS).toContain('source_date');
  });
});
