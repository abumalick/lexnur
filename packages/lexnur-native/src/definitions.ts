import type { PluginListenerHandle } from '@capacitor/core';

export type JobState = 'queued' | 'waiting_network' | 'waiting_wifi' | 'downloading' | 'paused' | 'verifying' | 'installing' | 'done' | 'failed';
export type JobError = 'network' | 'http' | 'checksum' | 'no_space' | 'decompress' | 'io';
export interface InstallJob {
  id: string; version: string; state: JobState;
  bytesDownloaded: number; totalBytes: number;
  relativePath?: string;
  error?: JobError; httpStatus?: number;
}
export interface StartInstallOptions {
  id: string; version: string; url: string; sha256: string;
  sizeBytes: number; installedSizeBytes: number; allowCellular: boolean;
}
export interface LexnurNativePlugin {
  paths(): Promise<{ packagesDir: string }>;
  freeSpace(): Promise<{ bytes: number }>;
  startInstall(o: StartInstallOptions): Promise<void>;
  pauseInstall(o: { id: string }): Promise<void>;
  resumeInstall(o: { id: string; allowCellular: boolean }): Promise<void>;
  cancelInstall(o: { id: string }): Promise<void>;
  removePackage(o: { relativePath: string }): Promise<void>;
  status(): Promise<{ jobs: InstallJob[] }>;
  acknowledge(o: { id: string }): Promise<void>;
  systemColors(): Promise<{ seed: string | null }>;
  addListener(event: 'installProgress', fn: (job: InstallJob) => void): Promise<PluginListenerHandle>;
}
