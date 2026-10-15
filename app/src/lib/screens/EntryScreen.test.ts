import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { makeTestContext } from '../test/context';
import EntryScreen from './EntryScreen.svelte';

const ALL3 = ['oewn-2025', 'wiktionary-ar-en', 'wiktionary-en'];

async function open(headword: string, dictionaryId: string) {
  const t = await makeTestContext({ installed: ALL3 });
  const s = (await t.ctx.store.suggest(headword, { kind: 'one', id: dictionaryId })).items.find((x) => x.headword === headword)!;
  render(EntryScreen, { props: { route: { name: 'entry', dictionaryId, entryId: s.entryId } }, context: t.context });
  return t;
}

describe('EntryScreen', () => {
  it('shows the vowelled headword, the root chip and attribution, and records a recent', async () => {
    const { ctx } = await open('كَتَبَ', 'wiktionary-ar-en');
    expect(await screen.findByRole('heading', { level: 1, name: 'كَتَبَ' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /ك ت ب/ })).toBeTruthy();
    expect(screen.getByText(/CC BY-SA/)).toBeTruthy();
    await waitFor(() => expect(ctx.recents.current[0]?.headword).toBe('كَتَبَ'));
  });

  it('runs a root search from the root chip', async () => {
    const { ctx, router } = await open('كَتَبَ', 'wiktionary-ar-en');
    await fireEvent.click(await screen.findByRole('button', { name: /ك ت ب/ }));
    expect(ctx.search.current.query).toBe('ك ت ب');
    expect(router.stack).toEqual([{ name: 'search' }]);
  });

  it('shows dictionary tabs when the headword is in two dictionaries', async () => {
    await open('write', 'oewn-2025');
    const tabs = await screen.findAllByRole('tab');
    expect(tabs.length).toBe(2);
  });

  it('shows the specific gloss with its broader lead-in, and the Arabic headword as rtl', async () => {
    await open('كَتَبَ', 'wiktionary-ar-en');
    const h1 = await screen.findByRole('heading', { level: 1 });
    expect(h1.getAttribute('dir')).toBe('rtl');
    expect(h1.getAttribute('lang')).toBe('ar');
    expect(document.querySelector('.senses li')?.textContent).toMatch(/to draw \(figures\)/);
    expect(document.querySelector('.parents')?.textContent).toContain('to mark (symbols');
  });

  it('opens a linked word that is in an installed dictionary', async () => {
    const { ctx, router } = await open('كَتَبَ', 'wiktionary-ar-en');
    const write = (await ctx.store.suggest('write', { kind: 'one', id: 'oewn-2025' })).items[0];
    ctx.store.lookupLinked = async () => write;
    await fireEvent.click(await screen.findByRole('button', { name: 'draw' }));
    await waitFor(() => expect(router.top).toEqual({ name: 'entry', dictionaryId: 'oewn-2025', entryId: write.entryId }));
  });

  it('shows a toast for a linked word that is in no installed dictionary', async () => {
    const { ctx, router } = await open('كَتَبَ', 'wiktionary-ar-en');
    ctx.store.lookupLinked = async () => null;
    await fireEvent.click(await screen.findByRole('button', { name: 'draw' }));
    await waitFor(() => expect(ctx.toasts.current).toContain("isn't in your dictionaries"));
    expect(router.stack).toEqual([{ name: 'search' }]);
  });

  it('tags only the root as Arabic in the chip and searches the current dictionary', async () => {
    const { ctx } = await open('كَتَبَ', 'wiktionary-ar-en');
    const chip = await screen.findByRole('button', { name: /ك ت ب/ });
    expect(chip.getAttribute('lang')).toBeNull();
    const bdi = chip.querySelector('bdi[lang="ar"]');
    expect(bdi?.textContent).toBe('ك ت ب');
    const calls: unknown[] = [];
    const setQuery = ctx.search.setQuery.bind(ctx.search);
    ctx.search.setQuery = (q, sc) => { calls.push(sc); setQuery(q, sc); };
    await fireEvent.click(chip);
    expect(calls[0]).toEqual({ kind: 'one', id: 'wiktionary-ar-en' });
  });

  it('clamps the text scale to 2', async () => {
    const { ctx } = await open('write', 'oewn-2025');
    await ctx.settings.update({ entryTextScale: 1.9 });
    await fireEvent.click(await screen.findByRole('button', { name: 'Text size' }));
    await fireEvent.click(screen.getByRole('button', { name: /Larger text/ }));
    expect(ctx.settings.current.entryTextScale).toBe(2);
  });

  it('shows a toast when copy fails and ignores a cancelled share', async () => {
    const t = await makeTestContext({ installed: ALL3, platform: { copy: async () => { throw new Error('denied'); }, share: async () => { throw new Error('cancelled'); } } });
    const s = (await t.ctx.store.suggest('write', { kind: 'one', id: 'oewn-2025' })).items.find((x) => x.headword === 'write')!;
    render(EntryScreen, { props: { route: { name: 'entry', dictionaryId: 'oewn-2025', entryId: s.entryId } }, context: t.context });
    await screen.findByRole('heading', { level: 1, name: 'write' });
    await fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    await fireEvent.click(screen.getByRole('button', { name: /Copy word/ }));
    await waitFor(() => expect(t.ctx.toasts.current).toBe("Couldn't copy"));
    await fireEvent.click(screen.getByRole('button', { name: 'More options' }));
    await fireEvent.click(screen.getByRole('button', { name: /Share/ }));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByRole('heading', { level: 1, name: 'write' })).toBeTruthy();
  });

  it('shows an empty state with Back when the entry cannot be loaded', async () => {
    const t = await makeTestContext({ installed: ALL3 });
    t.ctx.store.entry = async () => { throw new Error('broken'); };
    render(EntryScreen, { props: { route: { name: 'entry', dictionaryId: 'oewn-2025', entryId: 1 } }, context: t.context });
    expect(await screen.findByText("This entry can't be opened")).toBeTruthy();
  });

  it('ignores a stale entry that resolves after a newer tab tap', async () => {
    const { ctx } = await open('write', 'oewn-2025');
    const tabs = await screen.findAllByRole('tab');
    const real = ctx.store.entry.bind(ctx.store);
    let releaseFirst!: () => void;
    const gate = new Promise<void>((r) => (releaseFirst = r));
    let calls = 0;
    ctx.store.entry = async (d, id) => { if (calls++ === 0) await gate; return real(d, id); };
    await fireEvent.click(tabs[1]);
    await fireEvent.click(tabs[0]);
    await waitFor(() => expect(calls).toBe(2));
    releaseFirst();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getAllByRole('tab')[0].getAttribute('aria-selected')).toBe('true');
  });
});

describe('EntryScreen content direction follows the dictionary, not the UI', () => {
  const cases = [
    { headword: 'كِتَاب', dictionaryId: 'wiktionary-ar-en', from: ['ar', 'rtl'], to: ['en', 'ltr'] },
    { headword: 'write', dictionaryId: 'oewn-2025', from: ['en', 'ltr'], to: ['en', 'ltr'] },
  ];
  for (const ui of ['en', 'ar'] as const) for (const c of cases) {
    it(`${c.dictionaryId} in the ${ui} UI`, async () => {
      const t = await makeTestContext({ installed: ALL3, lang: ui });
      const s = (await t.ctx.store.suggest(c.headword, { kind: 'one', id: c.dictionaryId })).items.find((x) => x.headword === c.headword)!;
      render(EntryScreen, { props: { route: { name: 'entry', dictionaryId: c.dictionaryId, entryId: s.entryId } }, context: t.context });
      const h1 = await screen.findByRole('heading', { level: 1 });
      const attrs = (el: Element | null) => [el?.getAttribute('lang'), el?.getAttribute('dir')];
      expect(attrs(h1)).toEqual(c.from);
      expect(attrs(document.querySelector('.senses'))).toEqual(c.to);
      expect(attrs(document.querySelector('.senses .gloss'))).toEqual(c.to);
      expect(attrs(document.querySelector('.example .ex'))).toEqual(c.from);
      const ipa = document.querySelector('.sub bdi.ipa');
      expect(ipa?.tagName).toBe('BDI');
      expect(ipa?.getAttribute('dir')).toBe('ltr');
      expect(document.querySelector('.sub bdi.pos')).toBeTruthy();
    });
  }
});
