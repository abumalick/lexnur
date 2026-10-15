import type { Platform } from './types';

export async function createPlatform(): Promise<Platform> {
  if (import.meta.env.VITE_DATA === 'fixture') return (await import('./web-fixture')).createWebFixturePlatform();
  return (await import('./native')).createNativePlatform();
}
export type { Platform };
