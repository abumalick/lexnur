import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/svelte';
import App from './App.svelte';
import { makeTestContext } from './lib/test/context';
import { BRAND_SEED, themeVars } from './lib/theme/theme';

function stubMedia(dark: boolean) {
  const listeners: Array<(e: MediaQueryListEvent) => void> = [];
  vi.stubGlobal('matchMedia', () => ({
    matches: dark,
    addEventListener: (_t: string, l: (e: MediaQueryListEvent) => void) => listeners.push(l),
    removeEventListener: () => {},
  }));
  return (m: boolean) => listeners.forEach((l) => l({ matches: m } as MediaQueryListEvent));
}

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('App shell', () => {
  it('opens onboarding in the library when nothing is installed', async () => {
    stubMedia(false);
    const { ctx, router } = await makeTestContext();
    render(App, { ctx, router });
    await waitFor(() => expect(router.top).toEqual({ name: 'library', onboarding: true }));
    expect(await screen.findByText('Free offline dictionaries')).toBeTruthy();
  });

  it('lets the platform back handler pop the stack, and report when it cannot', async () => {
    stubMedia(false);
    let handler: () => boolean = () => true;
    const { ctx, router } = await makeTestContext({ installed: ['oewn-2025'], platform: { onBack: (fn) => { handler = fn; } } });
    await ctx.settings.update({ onboardingDone: true });
    render(App, { ctx, router });
    router.push({ name: 'settings' });
    expect(handler()).toBe(true);
    expect(router.top.name).toBe('search');
    expect(handler()).toBe(false);
  });

  it('keeps the brand theme when system colours fail', async () => {
    stubMedia(false);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { ctx, router } = await makeTestContext({ platform: { systemSeed: async () => { throw new Error('boom'); } } });
    render(App, { ctx, router });
    await waitFor(() => expect(document.documentElement.style.getPropertyValue('--md-primary')).toBe(themeVars(BRAND_SEED, false)['--md-primary']));
  });

  it('follows the system colour scheme when the setting is system', async () => {
    const fire = stubMedia(false);
    const dark: boolean[] = [];
    const { ctx, router } = await makeTestContext({ platform: { setSystemBarsDark: async (d) => { dark.push(d); } } });
    render(App, { ctx, router });
    await waitFor(() => expect(dark.at(-1)).toBe(false));
    fire(true);
    await waitFor(() => expect(dark.at(-1)).toBe(true));
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('applies the entry text scale', async () => {
    stubMedia(false);
    const { ctx, router } = await makeTestContext();
    await ctx.settings.update({ entryTextScale: 1.5 });
    render(App, { ctx, router });
    await waitFor(() => expect(document.documentElement.style.getPropertyValue('--entry-scale')).toBe('1.5'));
  });
});

vi.mock('./lib/screens/SearchScreen.svelte', async () => ({ default: (await import('./lib/test/MountCounter.svelte')).default }));

vi.mock('./lib/screens/SettingsScreen.svelte', async () => ({ default: (await import('./lib/test/MountCounter.svelte')).default }));

describe('App shell navigation', () => {
  it('keeps a screen alive when it moves from top to under and back', async () => {
    stubMedia(false);
    const { mounts } = await import('./lib/test/mounts');
    for (const k of Object.keys(mounts)) delete mounts[k];
    const { ctx, router } = await makeTestContext();
    await ctx.settings.update({ onboardingDone: true });
    render(App, { ctx, router });
    router.push({ name: 'settings' });
    await waitFor(() => expect(mounts.settings).toBe(1));
    router.push({ name: 'sources' });
    await screen.findByRole('heading', { name: 'Sources & licences' });
    router.back();
    await waitFor(() => expect(router.top.name).toBe('settings'));
    await new Promise((r) => setTimeout(r, 20));
    expect(mounts.settings).toBe(1);
  });

  it('keeps the screen below alive across a push and a pop', async () => {
    stubMedia(false);
    const { mounts } = await import('./lib/test/mounts');
    for (const k of Object.keys(mounts)) delete mounts[k];
    const { ctx, router } = await makeTestContext();
    await ctx.settings.update({ onboardingDone: true });
    render(App, { ctx, router });
    await waitFor(() => expect(mounts.search).toBe(1));
    router.push({ name: 'settings' });
    await waitFor(() => expect(mounts.settings).toBe(1));
    router.back();
    await waitFor(() => expect(router.stack).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 20));
    expect(mounts.search).toBe(1);
  });

  it('back closes an open overlay before popping the route', async () => {
    stubMedia(false);
    let back: () => boolean = () => false;
    const { ctx, router } = await makeTestContext({ platform: { onBack: (fn) => { back = fn; } } });
    await ctx.settings.update({ onboardingDone: true });
    render(App, { ctx, router });
    router.push({ name: 'sources' });
    const answer = (ctx.cellular as any).ask({ bytes: 100e6 });
    await screen.findByRole('alertdialog');
    expect(back()).toBe(true);
    expect(await answer).toBe('cancel');
    expect(router.top.name).toBe('sources');
    expect(back()).toBe(true);
    expect(router.top.name).toBe('search');
  });

  it('reapplies the theme from a fresh system seed on resume', async () => {
    stubMedia(false);
    let resume = () => {};
    let seed: string | null = null;
    const { ctx, router } = await makeTestContext({ platform: { onResume: (fn) => { resume = fn; }, systemSeed: async () => seed } });
    render(App, { ctx, router });
    await waitFor(() => expect(document.documentElement.style.getPropertyValue('--md-primary')).toBe(themeVars(BRAND_SEED, false)['--md-primary']));
    seed = '#B3261E';
    resume();
    await waitFor(() => expect(document.documentElement.style.getPropertyValue('--md-primary')).toBe(themeVars('#B3261E', false)['--md-primary']));
  });

  it('survives a failing system bar update', async () => {
    stubMedia(false);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { ctx, router } = await makeTestContext({ platform: { setSystemBarsDark: async () => { throw new Error('no bars'); } } });
    render(App, { ctx, router });
    await new Promise((r) => setTimeout(r, 20));
    expect(document.documentElement.style.colorScheme).toBe('light');
  });
});
