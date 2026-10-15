import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PublishedCatalog } from '@lexnur/core';
import type { InstalledDictionary } from '../data/dictionary-store';

export const FIXTURES = resolve(import.meta.dirname, '../../../../fixtures') + '/';
export const fixtureCatalog: PublishedCatalog = JSON.parse(readFileSync(FIXTURES + 'catalog.json', 'utf8'));
export const fixtureInstalled: InstalledDictionary[] = fixtureCatalog.dictionaries.map((d) => ({
  id: d.id, title: d.title, from: d.from, to: d.to, relativePath: `${d.id}.sqlite`,
}));
export const resolveFixture = async (relativePath: string) => FIXTURES + 'packages/' + relativePath;
