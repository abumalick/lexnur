import { argbFromHex, hexFromArgb, Hct, MaterialDynamicColors, SchemeTonalSpot } from '@material/material-color-utilities';

export const BRAND_SEED = '#0F5E63';

const ROLES = [
  'primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer', 'secondaryContainer', 'onSecondaryContainer',
  'surface', 'surfaceContainerLow', 'surfaceContainer', 'surfaceContainerHigh', 'onSurface', 'onSurfaceVariant',
  'outline', 'outlineVariant', 'error', 'onError', 'errorContainer', 'onErrorContainer', 'inverseSurface', 'inverseOnSurface', 'scrim',
] as const;

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

export function themeVars(seedHex: string, dark: boolean): Record<string, string> {
  const scheme = new SchemeTonalSpot(Hct.fromInt(argbFromHex(seedHex)), dark, 0);
  return Object.fromEntries(ROLES.map((r) => [`--md-${kebab(r)}`, hexFromArgb((MaterialDynamicColors as any)[r].getArgb(scheme))]));
}

export function applyTheme(seedHex: string, dark: boolean, root: HTMLElement = document.documentElement): void {
  for (const [k, v] of Object.entries(themeVars(seedHex, dark))) root.style.setProperty(k, v);
  root.style.colorScheme = dark ? 'dark' : 'light';
}
