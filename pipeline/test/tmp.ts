import { mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { REPO } from '../src/paths.ts';

export function tempDir(): string {
  const base = join(REPO, '.tmp');
  mkdirSync(base, { recursive: true });
  return mkdtempSync(join(base, 'pipeline-test-'));
}
