import type { PublishedDictionary } from '@lexnur/core';
import { spaceNeeded } from '../data/package-installer';

export interface SelectionSummary { count: number; download: number; needed: number; free: number | null; ok: boolean }

export function summarize(selected: PublishedDictionary[], free: number | null): SelectionSummary {
  const needed = spaceNeeded(selected);
  return { count: selected.length, download: selected.reduce((s, x) => s + x.size_bytes, 0), needed, free, ok: free === null || free >= needed };
}
