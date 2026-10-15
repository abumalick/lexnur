import { registerPlugin } from '@capacitor/core';
import type { LexnurNativePlugin } from './definitions';

export const LexnurNative = registerPlugin<LexnurNativePlugin>('LexnurNative', {
  web: () => import('./web').then((m) => new m.LexnurNativeWeb()),
});
export * from './definitions';
