import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SOURCES_DIR } from '../paths.ts';

export function sourceDate(filesTsv: string, names: string[]): string {
  const dates = filesTsv
    .split('\n')
    .map((line) => line.split('\t'))
    .filter((cols) => cols.length >= 5 && names.includes(cols[0] as string))
    .map((cols) => new Date(cols[4] as string).toISOString().slice(0, 10));
  if (dates.length === 0) throw new Error(`FILES.tsv has no fetched_at for ${names.join(', ')}`);
  return dates.sort().at(-1) as string;
}

export function sourceDateFor(sourceId: string, names: string[]): string {
  return sourceDate(readFileSync(join(SOURCES_DIR, sourceId, 'FILES.tsv'), 'utf8'), names);
}
