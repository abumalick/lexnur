import { describe, expect, it } from 'vitest';
import { tolerantKv } from './app-context';
import { Settings, DEFAULT_SETTINGS } from './data/settings';
import type { KeyValueStore } from './data/kv';

const broken: KeyValueStore = {
  get: async () => { throw new Error('prefs unavailable'); },
  set: async () => {},
  remove: async () => {},
};

describe('tolerantKv', () => {
  it('turns a failing read into a missing key so loads fall back to defaults', async () => {
    await expect(Settings.load(broken)).rejects.toThrow();
    expect((await Settings.load(tolerantKv(broken))).current).toEqual(DEFAULT_SETTINGS);
  });
});
