import type { PublishedCatalog } from '@lexnur/core';
import type { SqlDriver } from '../sql/driver';
import type { KeyValueStore } from '../data/kv';
import type { ConnectionType, NativeDownloads } from '../data/package-installer';

export interface Platform {
  kind: 'native' | 'web-fixture';
  os: 'ios' | 'android' | 'web';
  sql: SqlDriver;
  resolvePackagePath(relativePath: string): Promise<string>;
  native: NativeDownloads;
  kv: KeyValueStore;
  catalogUrl: string;
  snapshot: PublishedCatalog;
  connection(): Promise<ConnectionType>;
  onConnectionChange(fn: (c: ConnectionType) => void): void;
  deviceLanguages(): Promise<string[]>;
  share(o: { title: string; text: string }): Promise<void>;
  copy(text: string): Promise<void>;
  haptic(): Promise<void>;
  systemSeed(): Promise<string | null>;
  onResume(fn: () => void): void;
  onBack(fn: () => boolean): void;
  setSystemBarsDark(dark: boolean): Promise<void>;
  applyTextZoom(): Promise<void>;
  isScreenReaderOn(): Promise<boolean>;
  setKeyboardAccessoryBar(visible: boolean): Promise<void>;
  appVersion(): Promise<string>;
}
