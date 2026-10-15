import { BRAND_SEED } from './theme';

export async function resolveSeed(systemSeed: () => Promise<string | null>): Promise<string> {
  try {
    return (await systemSeed()) ?? BRAND_SEED;
  } catch (e) {
    console.warn('system colours unavailable, using the brand seed', e);
    return BRAND_SEED;
  }
}

export function watchSystemDark(onChange: (dark: boolean) => void): () => void {
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const listener = (e: MediaQueryListEvent) => onChange(e.matches);
  mq.addEventListener('change', listener);
  return () => mq.removeEventListener('change', listener);
}

export const systemPrefersDark = (): boolean => matchMedia('(prefers-color-scheme: dark)').matches;
