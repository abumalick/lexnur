import { Observable } from '../observable';
import { readJson, type KeyValueStore } from './kv';
import type { Scope } from './dictionary-store';

export type ThemeMode = 'system' | 'light' | 'dark';
export type CellularPolicy = 'ask' | 'wifi_only' | 'allow';
export interface SettingsData {
  theme: ThemeMode; entryTextScale: number; uiLanguage: 'system' | 'en' | 'ar';
  lastScope: Scope | null; cellular: CellularPolicy; openKeyboardOnLaunch: boolean;
  showTransliteration: boolean; onboardingDone: boolean;
}

export const DEFAULT_SETTINGS: SettingsData = {
  theme: 'system', entryTextScale: 1, uiLanguage: 'system', lastScope: null, cellular: 'ask',
  openKeyboardOnLaunch: true, showTransliteration: true, onboardingDone: false,
};

const KEY = 'settings';
const oneOf = <T extends string>(v: unknown, xs: readonly T[], d: T): T => (xs.includes(v as T) ? (v as T) : d);
const scopeOf = (v: any): Scope | null =>
  v?.kind === 'all' ? { kind: 'all' } : v?.kind === 'one' && typeof v.id === 'string' ? { kind: 'one', id: v.id } : null;

function sanitize(raw: any): SettingsData {
  const d = DEFAULT_SETTINGS;
  if (!raw || typeof raw !== 'object') return { ...d };
  const scale = Number(raw.entryTextScale);
  return {
    theme: oneOf(raw.theme, ['system', 'light', 'dark'] as const, d.theme),
    entryTextScale: Number.isFinite(scale) ? Math.min(2, Math.max(0.85, scale)) : d.entryTextScale,
    uiLanguage: oneOf(raw.uiLanguage, ['system', 'en', 'ar'] as const, d.uiLanguage),
    lastScope: scopeOf(raw.lastScope),
    cellular: oneOf(raw.cellular, ['ask', 'wifi_only', 'allow'] as const, d.cellular),
    openKeyboardOnLaunch: typeof raw.openKeyboardOnLaunch === 'boolean' ? raw.openKeyboardOnLaunch : d.openKeyboardOnLaunch,
    showTransliteration: typeof raw.showTransliteration === 'boolean' ? raw.showTransliteration : d.showTransliteration,
    onboardingDone: raw.onboardingDone === true,
  };
}

export class Settings extends Observable<SettingsData> {
  private kv: KeyValueStore;

  private constructor(kv: KeyValueStore, data: SettingsData) {
    super(data);
    this.kv = kv;
  }

  static async load(kv: KeyValueStore): Promise<Settings> { return new Settings(kv, sanitize(await readJson(kv, KEY))); }

  async update(patch: Partial<SettingsData>): Promise<void> {
    const next = sanitize({ ...this.value, ...patch });
    this.set(next);
    await this.kv.set(KEY, JSON.stringify(next));
  }
}
