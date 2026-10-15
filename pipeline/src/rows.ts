import type { Body } from '@lexnur/core';

export interface EntryRow {
  headword: string;
  search_key: string;
  pos: string | null;
  root: string | null;
  gloss: string | null;
  sort_order: number;
  alias?: true;
  body: Body;
}

export interface BuildStats {
  droppedSenses: number;
  droppedEntries: number;
  noGlossEntries: number;
  skippedEmptyKey: number;
  lines: number;
  malformed: number;
  droppedByReason: Record<string, number>;
  skippedByReason: Record<string, number>;
}

export function newStats(): BuildStats {
  return { droppedSenses: 0, droppedEntries: 0, noGlossEntries: 0, skippedEmptyKey: 0, lines: 0, malformed: 0, droppedByReason: {}, skippedByReason: {} };
}

export function countDrop(stats: BuildStats, reason: string): void {
  stats.droppedSenses++;
  stats.droppedByReason[reason] = (stats.droppedByReason[reason] ?? 0) + 1;
}

export function countDrops(stats: BuildStats, reason: string, n: number): void {
  stats.droppedSenses += n;
  stats.droppedByReason[reason] = (stats.droppedByReason[reason] ?? 0) + n;
}

export function countSkip(stats: BuildStats, reason: string): void {
  stats.skippedByReason[reason] = (stats.skippedByReason[reason] ?? 0) + 1;
}

export function truncateGloss(gloss: string, max = 120): string {
  return gloss.length <= max ? gloss : `${gloss.slice(0, max - 1).trimEnd()}…`;
}
