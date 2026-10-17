import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { makeTestContext } from '../test/context';
import LibraryScreen from './LibraryScreen.svelte';

describe('LibraryScreen (onboarding)', () => {
  it('pre-selects WordNet on an English device and counts the selection', async () => {
    const { context } = await makeTestContext({ deviceLanguages: ['en-US'] });
    render(LibraryScreen, { props: { route: { name: 'library', onboarding: true } }, context });
    const wordnet = await screen.findByRole('checkbox', { name: /WordNet/ });
    await waitFor(() => expect((wordnet as HTMLInputElement).checked).toBe(true));
    expect((screen.getByRole('checkbox', { name: /Wiktionary English/ }) as HTMLInputElement).checked).toBe(false);
    expect(screen.getByRole('button', { name: 'Download (1)' })).toBeTruthy();
    await fireEvent.click(screen.getByRole('checkbox', { name: /Wiktionary English/ }));
    expect(screen.getByRole('button', { name: 'Download (2)' })).toBeTruthy();
  });

  it('pre-selects Wiktionary Arabic–English on an Arabic device', async () => {
    const { context } = await makeTestContext({ deviceLanguages: ['ar-SA'] });
    render(LibraryScreen, { props: { route: { name: 'library', onboarding: true } }, context });
    const ar = await screen.findByRole('checkbox', { name: /Arabic/ });
    await waitFor(() => expect((ar as HTMLInputElement).checked).toBe(true));
    expect((screen.getByRole('checkbox', { name: /WordNet/ }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole('checkbox', { name: /Wiktionary English/ }) as HTMLInputElement).checked).toBe(false);
  });

  it('starts the download smallest first, then goes to search', async () => {
    const { context, native, router, ctx } = await makeTestContext({ deviceLanguages: ['en-US'] });
    render(LibraryScreen, { props: { route: { name: 'library', onboarding: true } }, context });
    await waitFor(() => expect((screen.getByRole('checkbox', { name: /WordNet/ }) as HTMLInputElement).checked).toBe(true));
    const button = screen.getByRole('button', { name: 'Download (1)' });
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    await fireEvent.click(button);
    await waitFor(() => expect(native.started.map((s) => s.id)).toEqual(['oewn-2025']));
    await waitFor(() => expect(ctx.settings.current.onboardingDone).toBe(true));
    await waitFor(() => expect(router.stack).toEqual([{ name: 'search' }]));
  });

  it('shows no space error when there is plenty of room, not even transiently', async () => {
    const { context } = await makeTestContext({ deviceLanguages: ['en-US'] });
    const { container } = render(LibraryScreen, { props: { route: { name: 'library', onboarding: true } }, context });
    const seen: string[] = [];
    new MutationObserver(() => seen.push(container.textContent ?? '')).observe(container, { childList: true, subtree: true, characterData: true });
    await screen.findByText(/you have .* free/);
    expect(screen.queryByText(/Untick a dictionary/)).toBeNull();
    expect(seen.some((x) => x.includes('Untick a dictionary'))).toBe(false);
  });

  it('disables Download and explains when space is short', async () => {
    const { context, native } = await makeTestContext({ deviceLanguages: ['en-US'] });
    native.free = 1000;
    render(LibraryScreen, { props: { route: { name: 'library', onboarding: true } }, context });
    expect(await screen.findByText(/Untick a dictionary, or free up space\./)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Download (1)' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('LibraryScreen (manage)', () => {
  const route = { name: 'library' } as const;

  it('selects every dictionary of a group at once', async () => {
    const { context } = await makeTestContext({ deviceLanguages: ['en-US'] });
    render(LibraryScreen, { props: { route }, context });
    expect(await screen.findByRole('heading', { name: 'English' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Arabic ↔ English' })).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Select both' }));
    expect(screen.getByRole('button', { name: 'Download (2)' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Select both' })).toBeNull();
  });

  it('offers Reinstall for a broken package and reinstalls through the installer', async () => {
    const { context, ctx, native } = await makeTestContext({ installed: ['oewn-2025'] });
    await ctx.store.setInstalled(ctx.catalog.forStore().map((d) => ({ ...d, relativePath: 'missing.sqlite' })));
    expect(ctx.store.broken.has('oewn-2025')).toBe(true);
    render(LibraryScreen, { props: { route }, context });
    expect(await screen.findByText(/needs to be reinstalled/)).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Reinstall' }));
    await waitFor(() => expect(native.started.map((s) => s.id)).toEqual(['oewn-2025']));
    expect(native.removed).toEqual(['oewn-2025/fixture.sqlite']);
  });

  it('offers Reinstall when a package breaks after the screen rendered', async () => {
    const { context, ctx } = await makeTestContext({ installed: ['oewn-2025'] });
    render(LibraryScreen, { props: { route }, context });
    await screen.findByText(/on device/);
    expect(screen.queryByRole('button', { name: 'Reinstall' })).toBeNull();
    await ctx.store.setInstalled(ctx.catalog.forStore().map((d) => ({ ...d, relativePath: 'missing.sqlite' })));
    expect(await screen.findByRole('button', { name: 'Reinstall' })).toBeTruthy();
  });

  it('shows the update badge and starts the update', async () => {
    const { context, ctx, native } = await makeTestContext();
    await ctx.catalog.markInstalled({ ...ctx.catalog.find('oewn-2025')!, version: 'old' }, 'oewn-2025/old.sqlite');
    render(LibraryScreen, { props: { route }, context });
    expect(await screen.findByText(/Update available/)).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    await waitFor(() => expect(native.started.map((s) => s.id)).toEqual(['oewn-2025']));
  });

  it('confirms before deleting an installed dictionary', async () => {
    const { context, ctx } = await makeTestContext({ installed: ['oewn-2025'] });
    render(LibraryScreen, { props: { route }, context });
    await fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(ctx.catalog.installedRecord('oewn-2025')).toBeTruthy();
    const dialog = screen.getByRole('alertdialog');
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(ctx.catalog.installedRecord('oewn-2025')).toBeUndefined());
  });
});
