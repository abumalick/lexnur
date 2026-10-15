import { describe, expect, it } from 'vitest';
import { BRAND_SEED, applyTheme, themeVars } from './theme';

describe('theme', () => {
  it('derives Material 3 roles from a seed for light and dark', () => {
    const light = themeVars(BRAND_SEED, false);
    const dark = themeVars(BRAND_SEED, true);
    for (const v of Object.values(light)) expect(v).toMatch(/^#[0-9a-f]{6}$/);
    expect(light['--md-primary']).not.toBe(dark['--md-primary']);
    expect(light['--md-surface']).not.toBe(dark['--md-surface']);
    expect(dark['--md-surface']).not.toBe('#000000');
  });
  it('writes variables and color-scheme on the root', () => {
    applyTheme(BRAND_SEED, true);
    expect(document.documentElement.style.getPropertyValue('--md-primary')).toMatch(/^#/);
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });
});
