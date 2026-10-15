import { existsSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { buildPackage, describeBuild } from '../src/build.ts';
import { sha256File } from '../src/package/compress.ts';
import { SOURCES } from '../src/paths.ts';
import { queryPackage } from '../src/query.ts';
import { newStats } from '../src/rows.ts';
import { tempDir } from './tmp.ts';

describe('buildPackage', () => {
  it('rejects an id without a row source', async () => {
    await expect(buildPackage('no-such-dictionary', { outDir: tempDir(), fileStem: 'x', version: '20261011.1' })).rejects.toThrow('no-such-dictionary');
  });

  it.skipIf(!existsSync(SOURCES.oewnZip))('builds a limited OEWN package end to end', { timeout: 120_000 }, async () => {
    const result = await buildPackage('oewn-2025', { outDir: tempDir(), fileStem: '20261011.1', version: '20261011.1', limit: 300 });
    expect(result.record).toMatchObject({ id: 'oewn-2025', version: '20261011.1', entry_count: 300 });
    expect(result.record.size_bytes).toBe(statSync(result.zstPath).size);
    expect(result.record.installed_size_bytes).toBe(statSync(result.sqlitePath).size);
    expect(await sha256File(result.zstPath)).toBe(result.record.sha256);
    const db = new DatabaseSync(result.sqlitePath, { readOnly: true });
    const meta = Object.fromEntries(db.prepare('SELECT key, value FROM meta').all().map((r) => [r.key, r.value]));
    db.close();
    expect(meta).toMatchObject({ id: 'oewn-2025', version: '20261011.1', entry_count: '300', schema_version: String(result.record.schema_version ?? 1), from: 'en', to: 'en' });
    expect(result.finish?.verified_rows).toBe(300);
    expect(meta.attribution).toMatch(/Princeton/);
    expect(meta.source_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.record.source_date).toBe(meta.source_date);
    const firstHeadword = queryPackage(result.sqlitePath, "'hood", 1)[0]?.headword;
    expect(firstHeadword).toBeTruthy();
  });

  it.skipIf(!existsSync(SOURCES.oewnZip))('keeps only accepted rows', { timeout: 120_000 }, async () => {
    const result = await buildPackage('oewn-2025', {
      outDir: tempDir(),
      fileStem: 'x',
      version: 'fixture',
      accept: (row) => row.headword === 'write' || row.headword === 'book',
    });
    const headwords = [...queryPackage(result.sqlitePath, 'write', 50), ...queryPackage(result.sqlitePath, 'book', 50)].map((h) => h.headword);
    expect(new Set(headwords)).toEqual(new Set(['write', 'book']));
    expect(result.record.entry_count).toBe(headwords.length);
  });
});

describe('describeBuild', () => {
  it('reports entries without a gloss on the source line, apart from the filter', () => {
    const stats = { ...newStats(), droppedSenses: 4, droppedEntries: 1, noGlossEntries: 3, lines: 10, malformed: 2 };
    const record = { id: 'x', version: '20261011.1', entry_count: 5, size_bytes: 1, installed_size_bytes: 2, sha256: 'a', source_date: '2026-10-10' };
    const lines = describeBuild({ record, sqlitePath: 'x.sqlite', zstPath: 'x.sqlite.zst', stats, rewrites: [], labelled: [] }).split('\n');
    expect(lines).toContain('filter: dropped 4 senses and 1 entries; skipped 0 empty keys');
    expect(lines).toContain('source: 10 lines read, 2 malformed; skipped 3 entries without a gloss');
  });
});

describe('describeBuild revisions', () => {
  it('lists each modernised gloss and the labelled headwords', () => {
    const record = { id: 'x', version: '20261011.1', entry_count: 5, size_bytes: 1, installed_size_bytes: 2, sha256: 'a', source_date: '2026-10-10' };
    const lines = describeBuild({ record, sqlitePath: 'x', zstPath: 'x.zst', stats: newStats(), rewrites: ['عَبْد: [coll.] Negro. → [coll.] Black person.'], labelled: ['negro'] }).split('\n');
    expect(lines).toContain('modernised 1 glosses');
    expect(lines).toContain('  عَبْد: [coll.] Negro. → [coll.] Black person.');
    expect(lines).toContain('labelled dated, offensive: negro');
  });
});
