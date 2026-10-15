import { Preferences } from '@capacitor/preferences';

export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export class MemoryKv implements KeyValueStore {
  private m = new Map<string, string>();
  async get(key: string) { return this.m.get(key) ?? null; }
  async set(key: string, value: string) { this.m.set(key, value); }
  async remove(key: string) { this.m.delete(key); }
}

export class PreferencesKv implements KeyValueStore {
  async get(key: string) { return (await Preferences.get({ key })).value; }
  async set(key: string, value: string) { await Preferences.set({ key, value }); }
  async remove(key: string) { await Preferences.remove({ key }); }
}

export async function readJson<T>(kv: KeyValueStore, key: string): Promise<T | null> {
  const raw = await kv.get(key);
  if (raw === null) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}
