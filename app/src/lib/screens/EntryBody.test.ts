import { expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import type { Body } from '@lexnur/core';
import { makeTestContext } from '../test/context';
import EntryBody from './EntryBody.svelte';

it('renders RTL sense context as its own line without a colon', async () => {
  const t = await makeTestContext();
  const body: Body = { v: 1, senses: [{ gloss: 'كَتَبَ، خَطَّ', parents: ['to form letters', 'on paper'] }] };
  const { container } = render(EntryBody, { props: { body, from: 'en', to: 'ar', onLink: () => {} }, context: t.context });
  const parents = container.querySelector('li .parents')!;
  expect(parents.tagName).toBe('DIV');
  expect(parents.getAttribute('dir')).toBe('auto');
  expect(parents.textContent).toBe('to form letters › on paper');
  expect(container.querySelector('li')!.textContent).not.toContain(':');
});

it('keeps LTR sense context inline with a colon and trims trailing punctuation', async () => {
  const t = await makeTestContext();
  const body: Body = { v: 1, senses: [{ gloss: 'to write', parents: ['(avec accusatif).'] }] };
  const { container } = render(EntryBody, { props: { body, from: 'fr', to: 'en', onLink: () => {} }, context: t.context });
  const parents = container.querySelector('li .parents')!;
  expect(parents.tagName).toBe('SPAN');
  expect(parents.textContent).toBe('(avec accusatif):');
});

it('trims trailing punctuation from RTL sense context', async () => {
  const t = await makeTestContext();
  const body: Body = { v: 1, senses: [{ gloss: 'كَتَبَ', parents: ['with accusative. ;'] }] };
  const { container } = render(EntryBody, { props: { body, from: 'en', to: 'ar', onLink: () => {} }, context: t.context });
  expect(container.querySelector('li .parents')!.textContent).toBe('with accusative');
});
