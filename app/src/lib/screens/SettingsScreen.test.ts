import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { makeTestContext } from '../test/context';
import SettingsScreen from './SettingsScreen.svelte';
import SourcesScreen from './SourcesScreen.svelte';

describe('SettingsScreen', () => {
  it('changes theme, language and the mobile-data policy', async () => {
    const { context, ctx } = await makeTestContext();
    render(SettingsScreen, { props: { route: { name: 'settings' } }, context });
    await fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
    await fireEvent.click(screen.getByRole('radio', { name: 'العربية' }));
    await fireEvent.click(screen.getByRole('radio', { name: 'Wi-Fi only' }));
    await waitFor(() => expect(ctx.settings.current).toMatchObject({ theme: 'dark', uiLanguage: 'ar', cellular: 'wifi_only' }));
  });

  it('explains the 50 MB threshold only under the policy that uses it', async () => {
    const { context } = await makeTestContext();
    render(SettingsScreen, { props: { route: { name: 'settings' } }, context });
    expect(screen.getByText(/50 MB/)).toBeTruthy();
    await fireEvent.click(screen.getByRole('radio', { name: 'Wi-Fi only' }));
    await waitFor(() => expect(screen.queryByText(/50 MB/)).toBeNull());
  });

  it('lets the text size reach both ends of the slider in exact steps', async () => {
    const { context, ctx } = await makeTestContext();
    render(SettingsScreen, { props: { route: { name: 'settings' } }, context });
    const slider = screen.getByRole('slider', { name: 'Text size in entries' }) as HTMLInputElement;
    await fireEvent.input(slider, { target: { value: '2' } });
    await waitFor(() => expect(ctx.settings.current.entryTextScale).toBe(2));
    slider.stepDown();
    await fireEvent.input(slider);
    await waitFor(() => expect(ctx.settings.current.entryTextScale).toBe(1.95));
  });

  it('clears history after confirmation', async () => {
    const { context, ctx } = await makeTestContext();
    await ctx.recents.add({ dictionaryId: 'oewn-2025', entryId: 1, headword: 'write', gloss: null });
    render(SettingsScreen, { props: { route: { name: 'settings' } }, context });
    await fireEvent.click(screen.getByRole('button', { name: 'Clear history' }));
    await fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Clear history' }));
    await waitFor(() => expect(ctx.recents.current).toEqual([]));
  });

  it('shows the app version and the offline promise', async () => {
    const { context } = await makeTestContext();
    render(SettingsScreen, { props: { route: { name: 'settings' } }, context });
    expect(await screen.findByText('Version test')).toBeTruthy();
    expect(screen.getByText('No ads. No tracking. Works offline.')).toBeTruthy();
  });
});

describe('SourcesScreen', () => {
  it('lists every dictionary with its licence link and attribution', async () => {
    const { context, ctx } = await makeTestContext();
    render(SourcesScreen, { props: { route: { name: 'sources' } }, context });
    for (const d of ctx.catalog.current.available) {
      expect(screen.getByRole('heading', { name: d.title })).toBeTruthy();
    }
    expect(screen.getAllByRole('link', { name: 'Read the licence' }).length).toBe(ctx.catalog.current.available.length);
  });
});
