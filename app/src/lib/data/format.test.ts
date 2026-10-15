import { describe, expect, it } from 'vitest';
import { EtaEstimator, formatBytes, formatPercent } from './format';

describe('format', () => {
  it('formats sizes with locale digits', () => {
    expect(formatBytes(300_000_000, 'en')).toBe('300 MB');
    expect(formatBytes(1_400_000_000, 'en')).toBe('1.4 GB');
    expect(formatBytes(512_000, 'en')).toBe('512 kB');
    expect(formatBytes(300_000_000, 'ar')).toContain(new Intl.NumberFormat('ar').format(300));
  });
  it('formats percentages', () => {
    expect(formatPercent(0.42, 'en')).toBe('42%');
  });
  it('waits 5 seconds before estimating, then smooths', () => {
    const e = new EtaEstimator(100_000_000);
    expect(e.update(0, 0)).toBeNull();
    expect(e.update(10_000_000, 4000)).toBeNull();
    const m = e.update(20_000_000, 8000)!;
    expect(m).toBeGreaterThan(0);
    expect(m).toBeLessThan(2);
  });
});
