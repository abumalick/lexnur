// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { InstallJob } from '@lexnur/native';
import { FIXTURES, fixtureCatalog } from '../test/fixtures';
import { WebFixtureDownloads } from './web-fixture';

const fileFetch = (async (url: string) => {
  const rel = new URL(url).pathname.replace(/^\/fixtures\//, '');
  return new Response(readFileSync(FIXTURES + rel));
}) as unknown as typeof fetch;

describe('WebFixtureDownloads', () => {
  const d = fixtureCatalog.dictionaries.find((x) => x.id === 'oewn-2025')!;
  const opts = (sha256 = d.sha256) => ({
    id: d.id, version: d.version, url: `http://x/fixtures/${d.url}`, sha256,
    sizeBytes: d.size_bytes, installedSizeBytes: d.installed_size_bytes, allowCellular: true,
  });

  it('downloads, verifies, decompresses and reports done', async () => {
    const files = new Map<string, Uint8Array>();
    const w = new WebFixtureDownloads(fileFetch, files);
    const seen: InstallJob[] = [];
    await w.addListener('installProgress', (j) => seen.push(j));
    await w.startInstall(opts());
    expect(seen.map((j) => j.state)).toEqual(['downloading', 'verifying', 'installing', 'done']);
    const bytes = files.get(seen.at(-1)!.relativePath!)!;
    expect(new TextDecoder().decode(bytes.slice(0, 15))).toBe('SQLite format 3');
  });

  it('fails with checksum on a hash mismatch', async () => {
    const w = new WebFixtureDownloads(fileFetch, new Map());
    const seen: InstallJob[] = [];
    await w.addListener('installProgress', (j) => seen.push(j));
    await w.startInstall(opts('0'.repeat(64)));
    expect(seen.at(-1)).toMatchObject({ state: 'failed', error: 'checksum' });
  });
});
