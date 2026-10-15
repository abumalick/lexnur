import type { Lang } from '../i18n';

const UNITS = [['gigabyte', 1e9], ['megabyte', 1e6], ['kilobyte', 1e3]] as const;

export function formatBytes(bytes: number, lang: Lang): string {
  for (const [unit, size] of UNITS) {
    if (bytes >= size * 0.95 || unit === 'kilobyte') {
      const v = bytes / size;
      return new Intl.NumberFormat(lang, { style: 'unit', unit, unitDisplay: 'short', maximumFractionDigits: v < 10 ? 1 : 0 }).format(v);
    }
  }
  return String(bytes);
}

export function formatPercent(fraction: number, lang: Lang): string {
  return new Intl.NumberFormat(lang, { style: 'percent', maximumFractionDigits: 0 }).format(Math.min(1, Math.max(0, fraction)));
}

// Shows a time only after 5 s of data and smooths the rate, so the estimate does not jump around (ux.md §4.1).
export class EtaEstimator {
  private totalBytes: number;
  private start: { bytes: number; t: number } | null = null;
  private rate = 0;
  private last: { bytes: number; t: number } | null = null;

  constructor(totalBytes: number) {
    this.totalBytes = totalBytes;
  }

  update(bytesDone: number, nowMs: number): number | null {
    if (!this.start) { this.start = this.last = { bytes: bytesDone, t: nowMs }; return null; }
    const dt = nowMs - this.last!.t;
    if (dt > 0) {
      const r = (bytesDone - this.last!.bytes) / dt;
      this.rate = this.rate ? 0.8 * this.rate + 0.2 * r : r;
      this.last = { bytes: bytesDone, t: nowMs };
    }
    if (nowMs - this.start.t < 5000 || this.rate <= 0) return null;
    return Math.max(1, Math.round((this.totalBytes - bytesDone) / this.rate / 60000));
  }
}
