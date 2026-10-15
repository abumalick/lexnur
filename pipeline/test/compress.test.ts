import { createHash } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { zstdDecompressSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { compressPackage, sha256File } from '../src/package/compress.ts';
import { tempDir } from './tmp.ts';

describe('compressPackage', () => {
  it('zstd-compresses, hashes the compressed bytes and reports both sizes', async () => {
    const src = join(tempDir(), 'a.sqlite');
    writeFileSync(src, Buffer.alloc(1_000_000, 'lexnur '));
    const result = await compressPackage(src, `${src}.zst`);
    const compressed = readFileSync(`${src}.zst`);
    expect(result.installed_size_bytes).toBe(1_000_000);
    expect(result.size_bytes).toBe(statSync(`${src}.zst`).size);
    expect(result.size_bytes).toBeLessThan(10_000);
    expect(result.sha256).toBe(createHash('sha256').update(compressed).digest('hex'));
    expect(zstdDecompressSync(compressed).equals(readFileSync(src))).toBe(true);
    expect(await sha256File(`${src}.zst`)).toBe(result.sha256);
  });
});
