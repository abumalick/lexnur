import { ZSTD_WASM_BASE64 } from './zstd-wasm.ts';

// Schema-2 package bodies are zstd frames stored without their 4-byte magic number and decoded
// against the dictionary in the package's `body_dict` table.

// core compiles without DOM types; this is the part of the WebAssembly global it uses.
declare const WebAssembly: { instantiate(bytes: Uint8Array, imports: object): Promise<{ instance: { exports: unknown } }> } | undefined;

interface Exports {
  memory: { buffer: ArrayBuffer };
  _initialize(): void;
  lx_malloc(n: number): number;
  lx_free(p: number): void;
  lx_ddict(dict: number, n: number): number;
  lx_content_size(src: number, n: number): number;
  lx_decode(ddict: number, dst: number, cap: number, src: number, n: number): number;
}

export interface BodyDecoder {
  decode(frame: Uint8Array): string;
}

export type DecoderEngine = 'wasm' | 'js';
const instances = new Map<DecoderEngine, Promise<Exports>>();

// WebAssembly, or the same decoder translated to JavaScript where WebAssembly is unavailable (iOS
// Lockdown Mode turns it off in WKWebView); the JavaScript module is only loaded in that case.
export const defaultEngine = (): DecoderEngine => (typeof WebAssembly === 'undefined' ? 'js' : 'wasm');

function load(engine: DecoderEngine): Promise<Exports> {
  let p = instances.get(engine);
  if (p) return p;
  p = (async () => {
    let memory: Exports['memory'] | undefined;
    const random_get = (ptr: number, len: number) => {
      crypto.getRandomValues(new Uint8Array(memory!.buffer, ptr, len));
      return 0;
    };
    const imports = { wasi_snapshot_preview1: { random_get } };
    let x: Exports;
    if (engine === 'wasm') {
      const bytes = Uint8Array.from(atob(ZSTD_WASM_BASE64), (c) => c.charCodeAt(0));
      x = (await WebAssembly!.instantiate(bytes, imports)).instance.exports as Exports;
    } else {
      x = (await import('./zstd-js.ts')).instantiate(imports) as Exports;
    }
    memory = x.memory;
    x._initialize();
    return x;
  })();
  p.catch(() => instances.delete(engine));
  instances.set(engine, p);
  return p;
}

function alloc(x: Exports, n: number): number {
  const p = x.lx_malloc(n);
  if (!p) throw new Error('zstd: out of memory');
  return p;
}

const NO_SIZE = 2 ** 32 - 1;

export async function bodyDecoder(dict: Uint8Array, engine: DecoderEngine = defaultEngine()): Promise<BodyDecoder> {
  const x = await load(engine);
  const pdict = alloc(x, dict.length);
  new Uint8Array(x.memory.buffer, pdict, dict.length).set(dict);
  const ddict = x.lx_ddict(pdict, dict.length);
  x.lx_free(pdict);
  if (!ddict) throw new Error('zstd: invalid body dictionary');
  const text = new TextDecoder();
  return {
    decode(frame) {
      const src = alloc(x, frame.length);
      new Uint8Array(x.memory.buffer, src, frame.length).set(frame);
      try {
        const cap = x.lx_content_size(src, frame.length) >>> 0;
        if (cap === NO_SIZE) throw new Error('zstd: frame has no content size');
        const dst = alloc(x, cap || 1);
        try {
          const n = x.lx_decode(ddict, dst, cap, src, frame.length) >>> 0;
          if (n === NO_SIZE || n !== cap) throw new Error('zstd: corrupt body frame');
          return text.decode(new Uint8Array(x.memory.buffer, dst, n));
        } finally {
          x.lx_free(dst);
        }
      } finally {
        x.lx_free(src);
      }
    },
  };
}

const nibble = (c: number) => (c <= 57 ? c - 48 : (c | 32) - 87);

export function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = (nibble(hex.charCodeAt(2 * i)) << 4) | nibble(hex.charCodeAt(2 * i + 1));
  return out;
}

