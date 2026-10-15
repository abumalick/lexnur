import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { makeTestContext } from '../test/context';
import SearchScreen from './SearchScreen.svelte';

const ALL3 = ['oewn-2025', 'wiktionary-ar-en', 'wiktionary-en'];

describe('SearchScreen', () => {
  it('shows suggestions while typing and opens an entry', async () => {
    const { context, router } = await makeTestContext({ installed: ALL3 });
    render(SearchScreen, { props: { route: { name: 'search' } }, context });
    await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'writ' } });
    const [headword] = await screen.findAllByText('write');
    await fireEvent.click(headword.closest('button')!);
    expect(router.top.name).toBe('entry');
  });

  it('finds the vowelled Arabic headword from unvowelled input', async () => {
    const { context } = await makeTestContext({ installed: ALL3 });
    render(SearchScreen, { props: { route: { name: 'search' } }, context });
    await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'كتب' } });
    expect(await screen.findByText('كَتَبَ')).toBeTruthy();
  });

  it('shows recent entries when the field is empty', async () => {
    const { context, ctx } = await makeTestContext({ installed: ALL3 });
    await ctx.recents.add({ dictionaryId: 'oewn-2025', entryId: 1, headword: 'serendipitous', gloss: null });
    render(SearchScreen, { props: { route: { name: 'search' } }, context });
    expect(await screen.findByText('serendipitous')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Recent' })).toBeTruthy();
  });

  it('offers the Arabic dictionary when Arabic is typed in an English scope', async () => {
    const { context, ctx } = await makeTestContext({ installed: ALL3 });
    await ctx.settings.update({ lastScope: { kind: 'one', id: 'oewn-2025' } });
    render(SearchScreen, { props: { route: { name: 'search' } }, context });
    await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'كتب' } });
    expect(await screen.findByText(/Results from/)).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Switch' }));
    await waitFor(() => expect(ctx.settings.current.lastScope).toEqual({ kind: 'one', id: 'wiktionary-ar-en' }));
  });

  it('says no Arabic dictionary is installed when there is none', async () => {
    const { context } = await makeTestContext({ installed: ['oewn-2025'] });
    render(SearchScreen, { props: { route: { name: 'search' } }, context });
    await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'كتب' } });
    expect(await screen.findByText('No Arabic dictionary installed')).toBeTruthy();
  });

  it('shows the empty state with no dictionaries', async () => {
    const { context } = await makeTestContext({ installed: [] });
    render(SearchScreen, { props: { route: { name: 'search' } }, context });
    expect(await screen.findByText('No dictionaries yet')).toBeTruthy();
  });

  it('shows "no words start with" for a nonsense query', async () => {
    const { context } = await makeTestContext({ installed: ALL3 });
    render(SearchScreen, { props: { route: { name: 'search' } }, context });
    await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'xyzq' } });
    expect(await screen.findByText(/^No words start with “\u{2068}?xyzq\u{2069}?”$/u)).toBeTruthy();
  });

  it('Enter pressed before the current results arrive opens the current query top hit', async () => {
    const { context, router } = await makeTestContext({ installed: ALL3 });
    render(SearchScreen, { props: { route: { name: 'search' } }, context });
    const box = screen.getByRole('textbox');
    await fireEvent.input(box, { target: { value: 'xyzq' } });
    await screen.findByText(/^No words start with “\u{2068}?xyzq\u{2069}?”$/u);
    await fireEvent.input(box, { target: { value: 'writ' } });
    await fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(router.top.name).toBe('entry'));
  });

  it('Enter right after a scope change opens the hit of the new scope', async () => {
    const { context, router, ctx } = await makeTestContext({ installed: ALL3 });
    render(SearchScreen, { props: { route: { name: 'search' } }, context });
    const box = screen.getByRole('textbox');
    await fireEvent.input(box, { target: { value: 'writ' } });
    await screen.findAllByText('write');
    await fireEvent.click(screen.getByRole('button', { name: /Search in: All dictionaries/ }));
    await fireEvent.click(await screen.findByRole('radio', { name: /^Wiktionary English$/ }));
    await waitFor(() => expect(ctx.settings.current.lastScope).toEqual({ kind: 'one', id: 'wiktionary-en' }));
    await fireEvent.keyDown(box, { key: 'Enter' });
    const expected = (await ctx.store.suggest('writ', { kind: 'one', id: 'wiktionary-en' })).items[0];
    await waitFor(() => expect(router.top.name).toBe('entry'));
    expect(expected.dictionaryId).toBe('wiktionary-en');
    expect(router.top).toMatchObject({ dictionaryId: expected.dictionaryId, entryId: expected.entryId });
  });

  it('leaves the empty state when an install completes', async () => {
    const { context, ctx } = await makeTestContext({ installed: [] });
    render(SearchScreen, { props: { route: { name: 'search' } }, context });
    await screen.findByText('No dictionaries yet');
    const d = ctx.catalog.find('oewn-2025')!;
    await ctx.catalog.markInstalled(d, `oewn-2025/${d.version}.sqlite`);
    await ctx.store.setInstalled(ctx.catalog.forStore());
    await waitFor(() => expect(screen.queryByText('No dictionaries yet')).toBeNull());
  });

  it('removes a recent with its remove button', async () => {
    const { context, ctx } = await makeTestContext({ installed: ALL3 });
    await ctx.recents.add({ dictionaryId: 'oewn-2025', entryId: 1, headword: 'serendipitous', gloss: null });
    render(SearchScreen, { props: { route: { name: 'search' } }, context });
    await screen.findByText('serendipitous');
    await fireEvent.click(screen.getByRole('button', { name: 'Remove from history' }));
    await waitFor(() => expect(screen.queryByText('serendipitous')).toBeNull());
  });

  it('Enter opens the top hit once its result is current', async () => {
    const { context, router } = await makeTestContext({ installed: ALL3 });
    render(SearchScreen, { props: { route: { name: 'search' } }, context });
    const box = screen.getByRole('textbox');
    await fireEvent.input(box, { target: { value: 'writ' } });
    await screen.findAllByText('write');
    await fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(router.top.name).toBe('entry'));
  });

  it('remembers the chosen scope', async () => {
    const { context, ctx } = await makeTestContext({ installed: ALL3 });
    render(SearchScreen, { props: { route: { name: 'search' } }, context });
    await fireEvent.click(screen.getByRole('button', { name: /Search in: All dictionaries/ }));
    await fireEvent.click(await screen.findByRole('radio', { name: /Open English WordNet 2025/ }));
    await waitFor(() => expect(ctx.settings.current.lastScope).toEqual({ kind: 'one', id: 'oewn-2025' }));
  });
});

describe('SuggestionRow content direction', () => {
  it('lays out an English gloss of an Arabic headword left-to-right in the Arabic UI', async () => {
    const { context } = await makeTestContext({ installed: ALL3, lang: 'ar' });
    render(SearchScreen, { props: { route: { name: 'search' } }, context });
    await fireEvent.input(screen.getByRole('textbox'), { target: { value: 'كتب' } });
    const [headword] = await screen.findAllByText('كَتَبَ');
    const row = headword.closest('button')!;
    expect([headword.getAttribute('lang'), headword.getAttribute('dir')]).toEqual(['ar', 'rtl']);
    const gloss = row.querySelector('.gloss')!;
    expect([gloss.getAttribute('lang'), gloss.getAttribute('dir')]).toEqual(['en', 'ltr']);
  });
});

describe('search field direction', () => {
  for (const [lang, dir] of [['ar', 'rtl'], ['en', 'ltr']] as const) {
    it(`lays out the placeholder in the ${lang} UI direction and typed text by its own`, async () => {
      const { context } = await makeTestContext({ installed: ['oewn-2025'], lang });
      render(SearchScreen, { props: { route: { name: 'search' } }, context });
      const field = screen.getByRole('textbox');
      await waitFor(() => expect(field.getAttribute('placeholder')).toContain('\u{2068}Open English WordNet 2025\u{2069}'));
      expect(field.getAttribute('dir')).toBe(dir);
      await fireEvent.input(field, { target: { value: 'كتب' } });
      expect(field.getAttribute('dir')).toBe('auto');
    });
  }
});

describe('DownloadStrip', () => {
  it('does not call a paused download "Downloading" in the strip', async () => {
    const { context, ctx } = await makeTestContext({ installed: ['oewn-2025'] });
    ctx.installer.setSceneJob({ id: 'wiktionary-en', version: '1', state: 'paused', bytesDownloaded: 42, totalBytes: 100 });
    render(SearchScreen, { props: { route: { name: 'search' } }, context });
    const strip = (await screen.findByText(/Paused/)).closest('button')!;
    expect(strip.textContent).toContain('42%');
    expect(strip.textContent).not.toContain('Downloading');
  });
});
