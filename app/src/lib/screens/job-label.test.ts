import { describe, expect, it } from 'vitest';
import type { InstallJob } from '@lexnur/native';
import { createTranslator } from '../i18n';
import { jobLabel, reinstallNotice } from './job-label';

const t = createTranslator('en');
const job = (p: Partial<InstallJob>): InstallJob => ({ id: 'x', version: '1', state: 'queued', bytesDownloaded: 0, totalBytes: 290_000_000, ...p });

describe('jobLabel', () => {
  it('shows percent and MB while downloading', () => {
    const l = jobLabel(job({ state: 'downloading', bytesDownloaded: 120_000_000 }), t, 'en');
    expect(l.text).toBe('Downloading 41% · 120 MB / 290 MB');
    expect(l.progress).toBeCloseTo(0.414, 2);
    expect(l.error).toBe(false);
  });
  it('waiting for connection is not an error', () => {
    expect(jobLabel(job({ state: 'waiting_network' }), t, 'en')).toMatchObject({ text: 'Paused · waiting for connection', error: false });
  });
  it('verify and install are indeterminate', () => {
    expect(jobLabel(job({ state: 'verifying' }), t, 'en')).toMatchObject({ text: 'Verifying…', indeterminate: true });
  });
  it('maps failure reasons to plain words and marks them as errors', () => {
    expect(jobLabel(job({ state: 'failed', error: 'network' }), t, 'en')).toMatchObject({ text: "Download failed. Couldn't reach the server.", error: true });
    expect(jobLabel(job({ state: 'failed', error: 'http', httpStatus: 404 }), t, 'en').text).toBe('Download failed (error 404).');
    expect(jobLabel(job({ state: 'failed', error: 'checksum' }), t, 'en').text).toBe('The download was damaged.');
    expect(jobLabel(job({ state: 'failed', error: 'no_space' }), t, 'en').text).toBe('Not enough space to install.');
  });
  it('shows remaining size while waiting for Wi-Fi', () => {
    expect(jobLabel(job({ state: 'waiting_wifi', bytesDownloaded: 90_000_000 }), t, 'en').text).toBe('Waiting for Wi-Fi · 200 MB');
  });
});

describe('reinstallNotice', () => {
  it('explains a reinstall that removed the dictionary but did not start downloading it', () => {
    expect(reinstallNotice({ kind: 'started' }, 'WordNet', t, 'en')).toBeNull();
    expect(reinstallNotice({ kind: 'no_space', needed: 300_000_000, free: 100_000_000 }, 'WordNet', t, 'en'))
      .toBe("WordNet was removed, but there isn't enough space to download it again (300 MB needed, 100 MB free).");
    expect(reinstallNotice({ kind: 'cancelled' }, 'WordNet', t, 'en')).toBe('WordNet was removed. Download it again from Dictionaries.');
  });
});
