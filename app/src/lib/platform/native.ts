import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Clipboard } from '@capacitor/clipboard';
import { Device } from '@capacitor/device';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Keyboard } from '@capacitor/keyboard';
import { Network, type ConnectionStatus } from '@capacitor/network';
import { ScreenReader } from '@capacitor/screen-reader';
import { Share } from '@capacitor/share';
import { TextZoom } from '@capacitor/text-zoom';
import { parsePublishedCatalog } from '@lexnur/core';
import { LexnurNative } from '@lexnur/native';
import snapshotJson from '../../../../catalog/v2.json';
import { PreferencesKv } from '../data/kv';
import type { ConnectionType } from '../data/package-installer';
import { capacitorDriver } from '../sql/capacitor-driver';
import type { Platform } from './types';

const map = (s: ConnectionStatus['connectionType']): ConnectionType => (s === 'wifi' || s === 'cellular' || s === 'none' ? s : 'unknown');

export async function createNativePlatform(): Promise<Platform> {
  const os = Capacitor.getPlatform() as 'ios' | 'android';
  const { packagesDir } = await LexnurNative.paths();
  return {
    kind: 'native', os,
    sql: capacitorDriver,
    resolvePackagePath: async (rel) => `${packagesDir}/${rel}`,
    native: LexnurNative,
    kv: new PreferencesKv(),
    catalogUrl: 'https://dl.lexnur.com/catalog/v2.json',
    snapshot: parsePublishedCatalog(snapshotJson),
    connection: async () => map((await Network.getStatus()).connectionType),
    onConnectionChange: (fn) => { void Network.addListener('networkStatusChange', (s) => fn(map(s.connectionType))); },
    deviceLanguages: async () => [(await Device.getLanguageTag()).value, ...navigator.languages],
    share: async ({ title, text }) => { await Share.share({ title, text, dialogTitle: title }); },
    copy: async (text) => { await Clipboard.write({ string: text }); },
    haptic: async () => { await Haptics.impact({ style: ImpactStyle.Light }); },
    systemSeed: async () => (await LexnurNative.systemColors()).seed,
    onResume: (fn) => { void App.addListener('resume', fn); },
    onBack: (fn) => { void App.addListener('backButton', () => { if (!fn()) void App.minimizeApp(); }); },
    setSystemBarsDark: async (dark) => { await SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }); },
    applyTextZoom: async () => { if (os === 'ios') await TextZoom.set({ value: (await TextZoom.getPreferred()).value }); },
    isScreenReaderOn: async () => (await ScreenReader.isEnabled()).value,
    setKeyboardAccessoryBar: async (visible) => { if (os === 'ios') await Keyboard.setAccessoryBarVisible({ isVisible: visible }); },
    appVersion: async () => { const i = await App.getInfo(); return `${i.version} (${i.build})`; },
  };
}
