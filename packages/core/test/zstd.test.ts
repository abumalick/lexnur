import { zstdCompressSync, constants } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { bodyDecoder, hexToBytes } from '../src/zstd.ts';

const dict = Buffer.from('{"v":1,"senses":[{"gloss":"a written work","examples":["a book"]}],"forms":[] '.repeat(40));
// Bodies are stored as magicless frames: the 4-byte zstd magic number is dropped.
const frame = (s: string) =>
  zstdCompressSync(Buffer.from(s), { dictionary: dict, params: { [constants.ZSTD_c_compressionLevel]: 19, [constants.ZSTD_c_dictIDFlag]: 0 } }).subarray(4);
const body = JSON.stringify({ v: 1, senses: [{ gloss: 'a written work — كتاب, 本', examples: ['a book'] }] });

describe.each(['wasm', 'js'] as const)('bodyDecoder (%s)', (engine) => {
  it('decodes a magicless frame against the dictionary', async () => {
    const d = await bodyDecoder(dict, engine);
    expect(d.decode(frame(body))).toBe(body);
    expect(d.decode(frame(''))).toBe('');
  });

  it('decodes a body larger than the initial memory', async () => {
    const big = JSON.stringify({ v: 1, senses: Array.from({ length: 20000 }, (_, i) => ({ gloss: `sense ${i}` })) });
    expect((await bodyDecoder(dict, engine)).decode(frame(big))).toBe(big);
  });

  it('rejects a corrupt frame', async () => {
    const f = frame(body);
    f[f.length - 2] = f[f.length - 2]! ^ 0xff;
    const d = await bodyDecoder(dict, engine);
    expect(() => d.decode(f)).toThrow(/zstd/);
    expect(d.decode(frame(body))).toBe(body);
  });

});

describe('hexToBytes', () => {
  it('parses SQLite hex() output', () => {
    expect([...hexToBytes('00FF7a')]).toEqual([0, 255, 122]);
  });
});
