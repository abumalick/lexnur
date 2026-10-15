import { WebPlugin } from '@capacitor/core';
import type { LexnurNativePlugin } from './definitions';

export class LexnurNativeWeb extends WebPlugin implements Omit<LexnurNativePlugin, 'addListener'> {
  async paths(): Promise<{ packagesDir: string }> { throw this.unavailable('LexnurNative is native-only; the web build uses platform/web-fixture'); }
  async freeSpace(): Promise<{ bytes: number }> { throw this.unavailable('native-only'); }
  async startInstall(): Promise<void> { throw this.unavailable('native-only'); }
  async pauseInstall(): Promise<void> { throw this.unavailable('native-only'); }
  async resumeInstall(): Promise<void> { throw this.unavailable('native-only'); }
  async cancelInstall(): Promise<void> { throw this.unavailable('native-only'); }
  async removePackage(): Promise<void> { throw this.unavailable('native-only'); }
  async status(): Promise<{ jobs: [] }> { return { jobs: [] }; }
  async acknowledge(): Promise<void> {}
  async systemColors(): Promise<{ seed: null }> { return { seed: null }; }
}
