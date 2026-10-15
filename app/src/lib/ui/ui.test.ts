import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { createRawSnippet, tick } from 'svelte';
import ProgressBar from './ProgressBar.svelte';
import Collapsible from './Collapsible.svelte';
import Dialog from './Dialog.svelte';

const text = (s: string) => createRawSnippet(() => ({ render: () => `<p>${s}</p>` }));

describe('UI parts', () => {
  it('ProgressBar exposes its value, and none when indeterminate', () => {
    render(ProgressBar, { value: 0.42, label: 'Downloading' });
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('42');
  });
  it('ProgressBar omits aria-valuenow when indeterminate', () => {
    render(ProgressBar, { value: null, label: 'Working' });
    expect(screen.getByRole('progressbar').hasAttribute('aria-valuenow')).toBe(false);
  });
  it('Collapsible toggles aria-expanded and content visibility', async () => {
    render(Collapsible, { title: 'Conjugation', children: text('table') });
    const b = screen.getByRole('button', { name: /Conjugation/ });
    expect(b.getAttribute('aria-expanded')).toBe('false');
    await fireEvent.click(b);
    expect(b.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('table').closest('[hidden]')).toBeNull();
  });
  it('Dialog renders actions in the given order and closes on Escape', async () => {
    let closed = false;
    render(Dialog, { open: true, title: 'Delete?', actions: [{ label: 'Cancel', onClick: () => {} }, { label: 'Delete', onClick: () => {}, destructive: true }], onClose: () => (closed = true) });
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Cancel', 'Delete']);
    await fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    expect(closed).toBe(true);
  });
});

describe('overlay behaviour', () => {
  it('Dialog registers with the back stack while open', async () => {
    const { overlays } = await import('../nav/overlays');
    let closed = 0;
    const view = render(Dialog, { open: true, title: 'T', actions: [{ label: 'OK', onClick: () => {} }], onClose: () => closed++ });
    expect(overlays.closeTop()).toBe(true);
    expect(closed).toBe(1);
    await view.rerender({ open: false, title: 'T', actions: [], onClose: () => closed++ });
    expect(overlays.closeTop()).toBe(false);
  });
  it('Dialog restores focus on close and wraps Tab', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const view = render(Dialog, { open: true, title: 'T', actions: [{ label: 'A', onClick: () => {} }, { label: 'B', onClick: () => {} }], onClose: () => {} });
    const [a, b] = within(screen.getByRole('alertdialog')).getAllByRole('button');
    expect(document.activeElement).toBe(a);
    b.focus();
    await fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Tab' });
    expect(document.activeElement).toBe(a);
    await fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(b);
    await view.rerender({ open: false, title: 'T', actions: [], onClose: () => {} });
    await tick();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
  it('two dialogs get distinct label ids', () => {
    render(Dialog, { open: true, title: 'One', actions: [], onClose: () => {} });
    render(Dialog, { open: true, title: 'Two', actions: [], onClose: () => {} });
    const ids = screen.getAllByRole('alertdialog').map((d) => d.getAttribute('aria-labelledby'));
    expect(new Set(ids).size).toBe(2);
  });
});
