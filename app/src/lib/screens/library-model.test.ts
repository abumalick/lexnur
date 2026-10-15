import { describe, expect, it } from 'vitest';
import type { PublishedDictionary } from '@lexnur/core';
import { summarize } from './library-model';

const d = (size: number, installed: number) => ({ size_bytes: size, installed_size_bytes: installed }) as PublishedDictionary;

describe('summarize', () => {
  it('needs every installed size plus the largest download', () => {
    const s = summarize([d(30e6, 90e6), d(300e6, 1100e6)], 2e9);
    expect(s).toEqual({ count: 2, download: 330e6, needed: 1190e6 + 300e6, free: 2e9, ok: true });
  });
  it('is not ok when free space is short', () => {
    expect(summarize([d(300e6, 1100e6)], 600e6).ok).toBe(false);
  });
  it('is ok for an empty selection', () => {
    expect(summarize([], 0)).toEqual({ count: 0, download: 0, needed: 0, free: 0, ok: true });
  });
});
