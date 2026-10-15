import { describe, expect, it } from 'vitest';
import { parsePublishedCatalog } from '@lexnur/core';
import { editorialEntry, loadEditorial, type EditorialDictionary } from '../src/catalog/editorial.ts';
import { assertFrozenV1, buildPublishedCatalog, readReleases, type ReleaseRecord } from '../src/catalog/publish.ts';
import { readJson } from '../src/json.ts';
import { CATALOG } from '../src/paths.ts';

const base = {
  kind: 'monolingual' as const,
  distribution: 'open',
  license: 'CC BY 4.0',
  license_url: 'https://creativecommons.org/licenses/by/4.0/',
  attribution: 'Attribution text',
  summary: { en: 'Summary', ar: 'ملخص' },
  sources: ['x'],
};
const editorial: EditorialDictionary[] = [
  { ...base, id: 'oewn-2025', title: 'OEWN', from: 'en', to: 'en', rank: 2, difficulty: 'intermediate' },
  { ...base, id: 'wiktionary-en', title: 'Wikt EN', from: 'en', to: 'en', rank: 1, difficulty: 'beginner' },
  { ...base, id: 'wiktionary-ar-en', title: 'Wikt AR', from: 'ar', to: 'en', kind: 'bilingual', rank: 1, difficulty: 'beginner' },
  { ...base, id: 'jmdict-en', title: 'JMdict', from: 'ja', to: 'en', kind: 'bilingual', rank: 1, difficulty: 'beginner', min_app_version: '1.1.0' },
  { id: 'salmone-1889', title: 'Salmoné', from: 'ar', to: 'en', kind: 'bilingual', rank: 2, difficulty: 'intermediate', distribution: 'open', license: 'CC BY-SA 3.0', sources: ['p'] },
];
const rec = (version: string): ReleaseRecord => ({ version, entry_count: 10, size_bytes: 100, installed_size_bytes: 300, sha256: 'ab'.repeat(32), source_date: '2026-10-10' });

describe('buildPublishedCatalog', () => {
  it('lists released open dictionaries sorted by language pair, then rank', () => {
    const catalog = buildPublishedCatalog(editorial, {
      'oewn-2025': rec('20261011.1'),
      'wiktionary-en': rec('20261012.2'),
      'wiktionary-ar-en': rec('20261011.3'),
    });
    expect(catalog.dictionaries.map((d) => d.id)).toEqual(['wiktionary-ar-en', 'wiktionary-en', 'oewn-2025']);
    expect(catalog.generated_at).toBe('2026-10-12T00:00:00Z');
    expect(catalog.dictionaries[2]).toMatchObject({
      version: '20261011.1',
      url: 'https://dl.lexnur.com/packages/oewn-2025/20261011.1.sqlite.zst',
      ai_generated: false,
      schema_version: 1,
      size_bytes: 100,
      installed_size_bytes: 300,
      source_date: '2026-10-10',
    });
    expect(() => parsePublishedCatalog(catalog, { strict: true })).not.toThrow();
  });

  it('dates the catalog at the latest publish, so two publishes on one day differ', () => {
    const releases = {
      'oewn-2025': { ...rec('20261011.1'), published_at: '2026-10-11T08:00:00Z' },
      'wiktionary-en': { ...rec('20261011.2'), published_at: '2026-10-11T17:30:05Z' },
    };
    expect(buildPublishedCatalog(editorial, releases).generated_at).toBe('2026-10-11T17:30:05Z');
  });

  it('falls back to the version day for a release without published_at', () => {
    const releases = {
      'oewn-2025': { ...rec('20261011.1'), published_at: '2026-10-11T08:00:00Z' },
      'wiktionary-en': rec('20261012.1'),
    };
    expect(buildPublishedCatalog(editorial, releases).generated_at).toBe('2026-10-12T00:00:00Z');
  });

  it('refuses to publish a dictionary without attribution, licence url or summary', () => {
    expect(() => buildPublishedCatalog(editorial, { 'salmone-1889': rec('20261011.1') })).toThrow('salmone-1889');
  });

  it('gives an empty catalog dated at the epoch when nothing is released', () => {
    expect(buildPublishedCatalog(editorial, {})).toEqual({ format: 1, generated_at: '1970-01-01T00:00:00Z', dictionaries: [] });
  });

  it('keeps dictionaries that need a newer app out of format 1 and lists them in format 2', () => {
    const releases = { 'oewn-2025': rec('20261011.1'), 'jmdict-en': rec('20261012.1') };
    const v1 = buildPublishedCatalog(editorial, releases);
    expect(v1.format).toBe(1);
    expect(v1.dictionaries.map((d) => d.id)).toEqual(['oewn-2025']);
    expect(v1.generated_at).toBe('2026-10-11T00:00:00Z');
    const v2 = buildPublishedCatalog(editorial, releases, undefined, undefined, 2);
    expect(v2.format).toBe(2);
    expect(v2.dictionaries.map((d) => d.id)).toEqual(['oewn-2025', 'jmdict-en']);
    expect(v2.dictionaries[1]?.min_app_version).toBe('1.1.0');
    expect('min_app_version' in v2.dictionaries[0]!).toBe(false);
    expect(v2.generated_at).toBe('2026-10-12T00:00:00Z');
    expect(() => parsePublishedCatalog(v2, { strict: true })).not.toThrow();
  });

  it('lists a schema-2 release in format 2 only, gated behind the app release that reads it', () => {
    const releases = { 'oewn-2025': { ...rec('20261011.1'), schema_version: 2 as const }, 'wiktionary-en': rec('20261011.1') };
    expect(buildPublishedCatalog(editorial, releases).dictionaries.map((d) => d.id)).toEqual(['wiktionary-en']);
    const v2 = buildPublishedCatalog(editorial, releases, undefined, undefined, 2);
    expect(v2.dictionaries.find((d) => d.id === 'oewn-2025')).toMatchObject({ schema_version: 2, min_app_version: '1.1.0' });
    expect(v2.dictionaries.find((d) => d.id === 'wiktionary-en')).toMatchObject({ schema_version: 1 });
    expect('min_app_version' in v2.dictionaries.find((d) => d.id === 'wiktionary-en')!).toBe(false);
    expect(() => parsePublishedCatalog(v2, { strict: true })).not.toThrow();
  });

  it('keeps a newer min_app_version than the schema-2 floor', () => {
    const later = editorial.map((d) => (d.id === 'oewn-2025' ? { ...d, min_app_version: '1.3.0' } : d));
    const v2 = buildPublishedCatalog(later, { 'oewn-2025': { ...rec('20261011.1'), schema_version: 2 } }, undefined, undefined, 2);
    expect(v2.dictionaries[0]?.min_app_version).toBe('1.3.0');
  });

  it('carries an availability statement only where the catalog gives one', () => {
    const withAvailability = editorial.map((d) => (d.id === 'oewn-2025' ? { ...d, availability: 'Leave this statement intact.' } : d));
    const catalog = buildPublishedCatalog(withAvailability, { 'oewn-2025': rec('20261011.1'), 'wiktionary-en': rec('20261011.1') });
    expect(catalog.dictionaries.find((d) => d.id === 'oewn-2025')?.availability).toBe('Leave this statement intact.');
    expect('availability' in catalog.dictionaries.find((d) => d.id === 'wiktionary-en')!).toBe(false);
  });

  it('uses the given url builder and date for fixtures', () => {
    const catalog = buildPublishedCatalog(editorial, { 'oewn-2025': rec('fixture') }, (id) => `packages/${id}.sqlite.zst`, '2026-01-01T00:00:00Z');
    expect(catalog.dictionaries[0]?.url).toBe('packages/oewn-2025.sqlite.zst');
    expect(catalog.generated_at).toBe('2026-01-01T00:00:00Z');
  });
});

describe('committed catalog files', () => {
  it('give the three v1 dictionaries their licence url, attribution and summary', () => {
    loadEditorial();
    for (const id of ['oewn-2025', 'wiktionary-ar-en', 'wiktionary-en']) {
      expect(editorialEntry(id)).toMatchObject({
        license_url: expect.stringMatching(/^https:\/\/creativecommons\.org\/licenses\//),
        attribution: expect.stringMatching(/Lexnur\.$/),
        summary: { en: expect.any(String), ar: expect.any(String) },
      });
    }
  });

  it('keep catalog/v1.json frozen for app 1.0.0', () => {
    expect(() => assertFrozenV1()).not.toThrow();
  });

  it('keep catalog/v2.json equal to what the generator produces', () => {
    expect(readJson(CATALOG.publishedV2)).toEqual(buildPublishedCatalog(loadEditorial(), readReleases(), undefined, undefined, 2));
  });

  it('credit Perseus as each Perseus text header asks, and say the glosses were modernised', () => {
    const lane = editorialEntry('lane-lexicon');
    expect(lane.attribution).toContain('Text provided by Perseus Digital Library, with funding from The U.S. Department of Education and The Max Planck Society.');
    expect(lane.availability).toMatch(/^This text may be freely distributed, subject to the following restrictions: .*You leave this availability statement intact..*You offer Perseus any modifications you make.$/);
    expect(editorialEntry('salmone-1889').attribution).toContain('with funding from The National Science Foundation');
    for (const d of [lane, editorialEntry('salmone-1889')]) expect(d.attribution).toContain('dated racial terms');
  });

  it('gate the CJK dictionaries behind the app release that supports them', () => {
    expect(editorialEntry('jmdict-en').min_app_version).toBe('1.1.0');
    expect(editorialEntry('cc-cedict').min_app_version).toBe('1.1.0');
  });
});
