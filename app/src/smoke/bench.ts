export interface Stats { count: number; p50: number; p95: number; p99: number; max: number; over16: number; over50: number }

export function percentiles(samples: number[]): Stats {
  const s = [...samples].sort((a, b) => a - b);
  const at = (p: number) => s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
  return {
    count: s.length, p50: at(50), p95: at(95), p99: at(99), max: s[s.length - 1],
    over16: s.filter((x) => x > 16).length, over50: s.filter((x) => x > 50).length,
  };
}

export function prefixesOf(word: string): string[] {
  const chars = [...word];
  return chars.map((_, i) => chars.slice(0, i + 1).join(''));
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const BENCH_SQL =
  'SELECT id, headword, pos, gloss FROM entry WHERE search_key >= ? AND search_key < ? ORDER BY search_key, sort_order LIMIT 30';
