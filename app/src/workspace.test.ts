import { describe, expect, it } from 'vitest';
import { normalizeKey } from '@lexnur/core';

describe('workspace wiring', () => {
  it('imports @lexnur/core from the workspace', () => {
    expect(normalizeKey('كَتَبَ')).toBe('كتب');
  });
});
