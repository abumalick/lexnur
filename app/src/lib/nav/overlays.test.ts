import { describe, expect, it, vi } from 'vitest';
import { overlays } from './overlays';

describe('overlays', () => {
  it('closes the topmost first and reports when none is open', () => {
    const a = vi.fn(), b = vi.fn();
    const offA = overlays.push(a);
    const offB = overlays.push(b);
    expect(overlays.closeTop()).toBe(true);
    expect(b).toHaveBeenCalledOnce();
    expect(a).not.toHaveBeenCalled();
    offB();
    overlays.closeTop();
    expect(a).toHaveBeenCalledOnce();
    offA();
    expect(overlays.closeTop()).toBe(false);
  });
});
