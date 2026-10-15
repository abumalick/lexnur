import { describe, expect, it } from 'vitest';
import { MemoryKv } from './kv';
import { DEFAULT_SETTINGS, Settings } from './settings';

describe('Settings', () => {
  it('starts from defaults', async () => {
    const s = await Settings.load(new MemoryKv());
    expect(s.current).toEqual(DEFAULT_SETTINGS);
    expect(s.current.cellular).toBe('ask');
    expect(s.current.openKeyboardOnLaunch).toBe(true);
  });

  it('persists updates and notifies subscribers', async () => {
    const kv = new MemoryKv();
    const s = await Settings.load(kv);
    const seen: string[] = [];
    s.subscribe((v) => seen.push(v.theme));
    await s.update({ theme: 'dark', lastScope: { kind: 'one', id: 'oewn-2025' } });
    expect(seen).toEqual(['system', 'dark']);
    const again = await Settings.load(kv);
    expect(again.current.theme).toBe('dark');
    expect(again.current.lastScope).toEqual({ kind: 'one', id: 'oewn-2025' });
  });

  it('ignores corrupt stored data and unknown keys', async () => {
    const kv = new MemoryKv();
    await kv.set('settings', '{"theme":"neon","entryTextScale":9,"bogus":1');
    expect((await Settings.load(kv)).current).toEqual(DEFAULT_SETTINGS);
    await kv.set('settings', JSON.stringify({ theme: 'neon', entryTextScale: 9, bogus: 1, uiLanguage: 'ar' }));
    const s = await Settings.load(kv);
    expect(s.current.theme).toBe('system');
    expect(s.current.entryTextScale).toBe(2);
    expect(s.current.uiLanguage).toBe('ar');
  });
});
