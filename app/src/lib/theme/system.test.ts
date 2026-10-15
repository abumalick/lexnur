import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveSeed, systemPrefersDark, watchSystemDark } from './system';
import { BRAND_SEED } from './theme';

function stubMedia(matches: boolean) {
  let listener: ((e: MediaQueryListEvent) => void) | undefined;
  const mq = {
    matches,
    addEventListener: vi.fn((_t: string, l: (e: MediaQueryListEvent) => void) => { listener = l; }),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal('matchMedia', () => mq);
  return { mq, fire: (m: boolean) => listener?.({ matches: m } as MediaQueryListEvent) };
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('system theme', () => {
  it('uses the system seed when there is one', async () => {
    expect(await resolveSeed(async () => '#123456')).toBe('#123456');
  });
  it('falls back to the brand seed when there is none', async () => {
    expect(await resolveSeed(async () => null)).toBe(BRAND_SEED);
  });
  it('falls back to the brand seed when the lookup rejects', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await resolveSeed(async () => { throw new Error('not implemented'); })).toBe(BRAND_SEED);
  });
  it('follows prefers-color-scheme changes until stopped', () => {
    const { mq, fire } = stubMedia(false);
    expect(systemPrefersDark()).toBe(false);
    const seen: boolean[] = [];
    const stop = watchSystemDark((d) => seen.push(d));
    fire(true);
    expect(seen).toEqual([true]);
    stop();
    expect(mq.removeEventListener).toHaveBeenCalled();
  });
});
