import type { Difficulty } from '@lexnur/core';
import { readJson } from '../json.ts';
import { CATALOG } from '../paths.ts';

export interface EditorialDictionary {
  id: string;
  title: string;
  from: string;
  to: string;
  kind: 'monolingual' | 'bilingual';
  rank: number;
  difficulty: Difficulty;
  distribution: string;
  license: string;
  ai_generated?: boolean;
  min_app_version?: string;
  license_url?: string;
  attribution?: string;
  availability?: string;
  summary?: { en: string; ar: string };
  sources: string[];
}

export function loadEditorial(path = CATALOG.editorial): EditorialDictionary[] {
  return readJson<{ dictionaries: EditorialDictionary[] }>(path).dictionaries;
}

export function editorialEntry(id: string): EditorialDictionary {
  const entry = loadEditorial().find((d) => d.id === id);
  if (!entry) throw new Error(`catalog/catalog.json has no dictionary "${id}"`);
  return entry;
}
