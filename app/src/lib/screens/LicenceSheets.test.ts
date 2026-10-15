import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { makeTestContext } from '../test/context';
import DetailsSheet from './DetailsSheet.svelte';
import SourceSheet from './SourceSheet.svelte';

const STATEMENT = 'You leave this availability statement intact.';

describe('licence sheets', () => {
  it('show the availability statement of a dictionary that has one', async () => {
    const t = await makeTestContext();
    const dict = { ...t.ctx.catalog.find('oewn-2025')!, availability: STATEMENT };
    render(DetailsSheet, { props: { dict, onClose: () => {} }, context: t.context });
    expect(await screen.findByText(STATEMENT)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Availability' })).toBeTruthy();
  });

  it('show it for an installed dictionary, and no heading without one', async () => {
    const t = await makeTestContext();
    await t.ctx.catalog.markInstalled({ ...t.ctx.catalog.find('oewn-2025')!, availability: STATEMENT }, 'a.sqlite', 1);
    await t.ctx.catalog.markInstalled(t.ctx.catalog.find('wiktionary-en')!, 'b.sqlite', 1);
    const first = render(SourceSheet, { props: { rec: t.ctx.catalog.installedRecord('oewn-2025'), open: true, onClose: () => {} }, context: t.context });
    expect(await screen.findByText(STATEMENT)).toBeTruthy();
    first.unmount();
    render(SourceSheet, { props: { rec: t.ctx.catalog.installedRecord('wiktionary-en'), open: true, onClose: () => {} }, context: t.context });
    expect(screen.queryByRole('heading', { name: 'Availability' })).toBeNull();
  });
});
