import { decompress } from 'fzstd';
import { parsePublishedCatalog } from '@lexnur/core';
import type { InstallJob, StartInstallOptions } from '@lexnur/native';
import type { PluginListenerHandle } from '@capacitor/core';
import { MemoryKv } from '../data/kv';
import type { ConnectionType, NativeDownloads } from '../data/package-installer';
import { wasmDriver } from '../sql/wasm-driver';
import type { Platform } from './types';

const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('');

export class WebFixtureDownloads implements NativeDownloads {
  private jobs = new Map<string, InstallJob>();
  private listeners = new Set<(j: InstallJob) => void>();
  private fetchImpl: typeof fetch;
  private files: Map<string, Uint8Array>;
  private freeBytes: number;

  constructor(fetchImpl: typeof fetch, files: Map<string, Uint8Array>, freeBytes = 8e9) {
    this.fetchImpl = fetchImpl;
    this.files = files;
    this.freeBytes = freeBytes;
  }

  private emit(j: InstallJob) { this.jobs.set(j.id, j); for (const l of this.listeners) l(j); }

  async startInstall(o: StartInstallOptions): Promise<void> {
    const base = { id: o.id, version: o.version, bytesDownloaded: 0, totalBytes: o.sizeBytes };
    this.emit({ ...base, state: 'downloading' });
    try {
      const res = await this.fetchImpl(o.url);
      if (!res.ok) { this.emit({ ...base, state: 'failed', error: 'http', httpStatus: res.status }); return; }
      const zst = new Uint8Array(await res.arrayBuffer());
      this.emit({ ...base, state: 'verifying', bytesDownloaded: zst.byteLength });
      if (hex(await crypto.subtle.digest('SHA-256', zst)) !== o.sha256.toLowerCase()) { this.emit({ ...base, state: 'failed', error: 'checksum' }); return; }
      this.emit({ ...base, state: 'installing', bytesDownloaded: zst.byteLength });
      const relativePath = `${o.id}/${o.version}.sqlite`;
      this.files.set(relativePath, decompress(zst));
      this.emit({ ...base, state: 'done', bytesDownloaded: o.sizeBytes, relativePath });
    } catch (e) {
      this.emit({ ...base, state: 'failed', error: e instanceof TypeError ? 'network' : 'decompress' });
    }
  }
  async pauseInstall(): Promise<void> {}
  async resumeInstall(): Promise<void> {}
  async cancelInstall({ id }: { id: string }) { this.jobs.delete(id); }
  async removePackage({ relativePath }: { relativePath: string }) { this.files.delete(relativePath); }
  async status() { return { jobs: [...this.jobs.values()] }; }
  async acknowledge({ id }: { id: string }) { this.jobs.delete(id); }
  async freeSpace() { return { bytes: this.freeBytes }; }
  async addListener(_e: 'installProgress', fn: (j: InstallJob) => void): Promise<PluginListenerHandle> {
    this.listeners.add(fn);
    return { remove: async () => { this.listeners.delete(fn); } };
  }
}

export async function createWebFixturePlatform(): Promise<Platform> {
  const catalogUrl = new URL('/fixtures/catalog.json', location.href).href;
  const snapshot = parsePublishedCatalog(await (await fetch(catalogUrl)).json());
  const files = new Map<string, Uint8Array>();
  const toConn = (): ConnectionType => (navigator.onLine ? 'wifi' : 'none');
  return {
    kind: 'web-fixture', os: 'web',
    sql: wasmDriver((loc) => files.get(loc)),
    resolvePackagePath: async (rel) => rel,
    native: new WebFixtureDownloads((u, i) => fetch(u, i), files),
    kv: new MemoryKv(), catalogUrl, snapshot,
    connection: async () => toConn(),
    onConnectionChange: (fn) => { addEventListener('online', () => fn('wifi')); addEventListener('offline', () => fn('none')); },
    deviceLanguages: async () => [...navigator.languages],
    share: async ({ title, text }) => { if (navigator.share) await navigator.share({ title, text }); else await navigator.clipboard?.writeText(text); },
    copy: async (text) => { await navigator.clipboard?.writeText(text); },
    haptic: async () => {},
    systemSeed: async () => null,
    onResume: (fn) => document.addEventListener('visibilitychange', () => { if (!document.hidden) fn(); }),
    onBack: (fn) => addEventListener('keydown', (e) => { if (e.key === 'Escape' && !e.defaultPrevented) fn(); }),
    setSystemBarsDark: async () => {},
    applyTextZoom: async () => {},
    isScreenReaderOn: async () => false,
    setKeyboardAccessoryBar: async () => {},
    appVersion: async () => 'web',
  };
}
