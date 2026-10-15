import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { nextVersion, takenVersions } from '../src/package/version.ts';
import { tempDir } from './tmp.ts';

describe('nextVersion', () => {
  it('increments N within a day', () => {
    const now = new Date('2026-10-11T23:59:00Z');
    expect(nextVersion(now, [])).toBe('20261011.1');
    expect(nextVersion(now, ['20261011.1', '20261010.7', 'fixture'])).toBe('20261011.2');
    expect(nextVersion(now, ['20261011.9', '20261011.10'])).toBe('20261011.11');
  });

  it('uses the UTC date', () => {
    expect(nextVersion(new Date('2026-10-11T00:30:00+03:00'), [])).toBe('20261010.1');
  });
});

describe('takenVersions', () => {
  it('collects versions built locally and the live one', () => {
    const build = tempDir();
    mkdirSync(join(build, 'packages', 'oewn-2025'), { recursive: true });
    writeFileSync(join(build, 'packages', 'oewn-2025', '20261011.1.json'), '{}');
    writeFileSync(join(build, 'packages', 'oewn-2025', '20261011.1.sqlite'), '');
    expect(takenVersions('oewn-2025', build, { 'oewn-2025': { version: '20261009.1' } }).sort()).toEqual(['20261009.1', '20261011.1']);
    expect(takenVersions('wiktionary-en', build, {})).toEqual([]);
  });
});
