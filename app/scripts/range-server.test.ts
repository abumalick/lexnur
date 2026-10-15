import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { startRangeServer } from './range-server';

let server: Server; let url: string;
const body = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 256));

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rs-'));
  writeFileSync(join(dir, 'p.bin'), body);
  server = await startRangeServer({ file: join(dir, 'p.bin'), port: 0 });
  url = `http://127.0.0.1:${(server.address() as any).port}/p.bin`;
});
afterAll(() => server.close());

describe('range server', () => {
  it('serves the whole file with 200', async () => {
    const r = await fetch(url);
    expect(r.status).toBe(200);
    expect(Buffer.from(await r.arrayBuffer())).toEqual(body);
  });
  it('serves a suffix with 206 and Content-Range', async () => {
    const r = await fetch(url, { headers: { Range: 'bytes=900-' } });
    expect(r.status).toBe(206);
    expect(r.headers.get('content-range')).toBe('bytes 900-999/1000');
    expect((await r.arrayBuffer()).byteLength).toBe(100);
  });
});
