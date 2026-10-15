import { beforeAll, describe, expect, it } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import SwipeBack from './SwipeBack.svelte';

const children = createRawSnippet(() => ({ render: () => '<p>page</p>' }));
beforeAll(() => { HTMLElement.prototype.setPointerCapture = () => {}; });

describe('SwipeBack', () => {
  it('leaves transform unset at rest so fixed overlays are not trapped', () => {
    const { container } = render(SwipeBack, { onBack: () => {}, rtl: false, enabled: true, children });
    expect((container.querySelector('.swipe') as HTMLElement).style.transform).toBe('');
  });
  it('translates while dragging from the edge', async () => {
    const { container } = render(SwipeBack, { onBack: () => {}, rtl: false, enabled: true, children });
    const el = container.querySelector('.swipe') as HTMLElement;
    await fireEvent.pointerDown(el, { clientX: 5, pointerId: 1 });
    await fireEvent.pointerMove(el, { clientX: 55, pointerId: 1 });
    expect(el.style.transform).toBe('translateX(50px)');
  });
  it('ignores drags when disabled', async () => {
    const { container } = render(SwipeBack, { onBack: () => {}, rtl: false, enabled: false, children });
    const el = container.querySelector('.swipe') as HTMLElement;
    await fireEvent.pointerDown(el, { clientX: 5, pointerId: 1 });
    await fireEvent.pointerMove(el, { clientX: 55, pointerId: 1 });
    expect(el.style.transform).toBe('');
  });
});
