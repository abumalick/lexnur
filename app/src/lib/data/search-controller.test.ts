import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SuggestResult } from './dictionary-store';
import { SearchController } from './search-controller';

const ALL = { kind: 'all' } as const;
const result = (query: string): SuggestResult => ({ query, mode: 'prefix', items: [] });

describe('SearchController', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('drops a stale result that arrives after a newer one', async () => {
    const pending = new Map<string, (r: SuggestResult) => void>();
    const store = { suggest: (q: string) => new Promise<SuggestResult>((ok) => pending.set(q, ok)) };
    const c = new SearchController(store, 30);
    c.setQuery('w', ALL); await vi.advanceTimersByTimeAsync(30);
    c.setQuery('wr', ALL); await vi.advanceTimersByTimeAsync(30);
    pending.get('wr')!(result('wr')); await vi.advanceTimersByTimeAsync(0);
    pending.get('w')!(result('w')); await vi.advanceTimersByTimeAsync(0);
    expect(c.current.result?.query).toBe('wr');
  });

  it('keeps the previous results visible while the next query runs', async () => {
    let release: (r: SuggestResult) => void = () => {};
    const store = { suggest: vi.fn(async (q: string) => (q === 'w' ? result('w') : new Promise<SuggestResult>((ok) => (release = ok)))) };
    const c = new SearchController(store, 30);
    c.setQuery('w', ALL); await vi.advanceTimersByTimeAsync(30);
    c.setQuery('wr', ALL); await vi.advanceTimersByTimeAsync(30);
    expect(c.current.result?.query).toBe('w');
    expect(c.current.loading).toBe(true);
    release(result('wr')); await vi.advanceTimersByTimeAsync(0);
    expect(c.current.result?.query).toBe('wr');
  });

  it('clears immediately on an empty query, without querying', async () => {
    const store = { suggest: vi.fn(async (q: string) => result(q)) };
    const c = new SearchController(store, 30);
    c.setQuery('  ', ALL); await vi.advanceTimersByTimeAsync(100);
    expect(store.suggest).not.toHaveBeenCalled();
    expect(c.current.result).toBeNull();
  });

  it('drops a result that resolves inside the debounce window of a newer query', async () => {
    let release: (r: SuggestResult) => void = () => {};
    const store = { suggest: vi.fn((q: string) => (q === 'w' ? new Promise<SuggestResult>((ok) => (release = ok)) : Promise.resolve(result(q)))) };
    const c = new SearchController(store, 30);
    c.setQuery('w', ALL); await vi.advanceTimersByTimeAsync(30);
    c.setQuery('wr', ALL);
    release(result('w')); await vi.advanceTimersByTimeAsync(0);
    expect(c.current.query).toBe('wr');
    expect(c.current.result?.query).not.toBe('w');
  });

  it('clears loading and does not reject when suggest fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = { suggest: vi.fn(async () => { throw new Error('boom'); }) };
    const c = new SearchController(store, 30);
    c.setQuery('w', ALL); await vi.advanceTimersByTimeAsync(30);
    expect(c.current.loading).toBe(false);
    warn.mockRestore();
  });

  it('rerun cancels the pending debounce so the store is queried once', async () => {
    const store = { suggest: vi.fn(async (q: string) => result(q)) };
    const c = new SearchController(store, 30);
    c.setQuery('w', ALL);
    c.rerun(ALL); await vi.advanceTimersByTimeAsync(100);
    expect(store.suggest).toHaveBeenCalledTimes(1);
  });
});
