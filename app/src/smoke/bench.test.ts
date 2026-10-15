import { describe, expect, it } from 'vitest';
import { percentiles, prefixesOf, mulberry32 } from './bench';

describe('bench helpers', () => {
  it('computes nearest-rank percentiles', () => {
    const s = percentiles([5, 1, 3, 2, 4, 100]);
    expect(s.p50).toBe(3);
    expect(s.max).toBe(100);
    expect(s.over16).toBe(1);
    expect(s.over50).toBe(1);
    expect(s.count).toBe(6);
  });
  it('types a word one character at a time', () => {
    expect(prefixesOf('كتب')).toEqual(['ك', 'كت', 'كتب']);
  });
  it('is deterministic for a seed', () => {
    const a = mulberry32(42), b = mulberry32(42);
    expect([a(), a()]).toEqual([b(), b()]);
  });
});
