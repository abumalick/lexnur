import { describe, expect, it } from 'vitest';
import { MAX_ENTRY_DEPTH, Router } from './router.svelte';

describe('Router', () => {
  it('pushes and pops', () => {
    const r = new Router();
    expect(r.canGoBack).toBe(false);
    r.push({ name: 'settings' });
    expect(r.top.name).toBe('settings');
    expect(r.back()).toBe(true);
    expect(r.back()).toBe(false);
  });
  it('caps entry pushes by dropping the oldest entry', () => {
    const r = new Router();
    for (let i = 0; i < MAX_ENTRY_DEPTH + 5; i++) r.push({ name: 'entry', dictionaryId: 'd', entryId: i });
    const entries = r.stack.filter((x) => x.name === 'entry');
    expect(entries).toHaveLength(MAX_ENTRY_DEPTH);
    expect((entries[0] as any).entryId).toBe(5);
    expect(r.stack[0].name).toBe('search');
  });
  it('resets to a single route', () => {
    const r = new Router();
    r.push({ name: 'settings' });
    r.reset({ name: 'library', onboarding: true });
    expect(r.stack).toEqual([{ name: 'library', onboarding: true }]);
  });
});
