import { copyFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { compactPackage } from '../src/package/compact.ts';
import { finishPackage } from '../src/package/finish.ts';
import { checkSqlite336 } from '../src/package/sqlite336.ts';
import { expandPackage, metaOf, verifyCompacted } from '../src/package/verify.ts';
import { FIXTURES } from '../src/paths.ts';
import { tempDir } from './tmp.ts';

const fixture = (id: string) => join(FIXTURES, 'packages', `${id}.sqlite`);

// The committed wiktionary-en fixture is compacted; expanding it gives a plain package with form-of rows.
async function plainEnglish(dir: string): Promise<string> {
  const plain = join(dir, 'plain.sqlite');
  await expandPackage(fixture('wiktionary-en'), plain);
  return plain;
}

describe('compactPackage', { timeout: 120_000 }, () => {
  it('round-trips a plain package through schema 2 with templates', async () => {
    const dir = tempDir();
    const plain = await plainEnglish(dir);
    const out = join(dir, 'out.sqlite');
    const r = await compactPackage(plain, out, { minTemplateUses: 2, version: '20261101.1' });
    expect(r.templated).toBeGreaterThan(0);
    expect(r.compressed).toBeGreaterThan(0);
    const db = new DatabaseSync(out, { readOnly: true });
    expect(metaOf(db)).toMatchObject({ schema_version: '2', version: '20261101.1' });
    db.close();
    expect((await verifyCompacted(plain, out)).rows).toBe(104);
    expect(checkSqlite336(out).queries).toBeGreaterThan(0);
  });

  it('shares one zstd body between rows with identical bodies', async () => {
    const dir = tempDir();
    const plain = await plainEnglish(dir);
    const db = new DatabaseSync(plain);
    db.exec("INSERT INTO entry(headword, search_key, pos, root, gloss, sort_order, body) SELECT headword, 'zz' || search_key, pos, root, gloss, 1, body FROM entry WHERE sort_order = 0 LIMIT 5");
    db.close();
    const out = join(dir, 'out.sqlite');
    const r = await compactPackage(plain, out);
    expect(r.deduped).toBe(5);
    expect((await verifyCompacted(plain, out)).rows).toBe(109);
  });

  it('refuses a package that is already compacted', async () => {
    await expect(compactPackage(fixture('wiktionary-en'), join(tempDir(), 'x.sqlite'))).rejects.toThrow('only a plain schema-1 package');
  });
});

describe('verifyCompacted', { timeout: 120_000 }, () => {
  it.each([
    ['a body', "UPDATE entry SET body = replace(body, 'e', 'E') WHERE id = (SELECT min(id) FROM entry WHERE sort_order = 0)"],
    ['a gloss', "UPDATE entry SET gloss = gloss || '.' WHERE id = (SELECT max(id) FROM entry)"],
    ['a missing row', 'DELETE FROM entry WHERE id = (SELECT max(id) FROM entry)'],
  ])('fails when the source differs in %s', async (_, sql) => {
    const dir = tempDir();
    const plain = await plainEnglish(dir);
    const out = join(dir, 'out.sqlite');
    await compactPackage(plain, out);
    const db = new DatabaseSync(plain);
    db.exec(sql);
    db.close();
    await expect(verifyCompacted(plain, out)).rejects.toThrow();
  });
});

describe('finishPackage', { timeout: 120_000 }, () => {
  it('keeps the smaller layout and removes the plain file', async () => {
    const dir = tempDir();
    const plain = join(dir, 'plain.sqlite');
    copyFileSync(fixture('oewn-2025'), plain);
    const size = statSync(plain).size;
    const out = join(dir, 'out.sqlite');
    const f = await finishPackage(plain, out);
    expect(f.verified_rows).toBeGreaterThan(0);
    expect(statSync(out).size).toBeLessThan(size);
    expect(() => statSync(plain)).toThrow();
  });

  it('expands a compacted package back to the same rows', async () => {
    const dir = tempDir();
    const plain = await plainEnglish(dir);
    expect((await verifyCompacted(plain, fixture('wiktionary-en'))).rows).toBe(104);
  });
});
