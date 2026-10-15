import { describe, expect, it } from 'vitest';
import type { Body } from '@lexnur/core';
import { firstGloss, shareText, splitLinks } from './entry-model';

describe('splitLinks', () => {
  it('turns link texts into tappable segments, in order', () => {
    expect(splitLinks('to mark on a surface, to write', [['write', 'write'], ['surface', 'surface']])).toEqual([
      { text: 'to mark on a ' }, { text: 'surface', target: 'surface' }, { text: ', to ' }, { text: 'write', target: 'write' },
    ]);
  });
  it('keeps plain text when there are no links or none match', () => {
    expect(splitLinks('to write', undefined)).toEqual([{ text: 'to write' }]);
    expect(splitLinks('to write', [['book', 'book']])).toEqual([{ text: 'to write' }]);
  });
  it('prefers the longer link at the same position and never overlaps', () => {
    expect(splitLinks('ice cream van', [['ice', 'ice'], ['ice cream', 'ice cream']])).toEqual([{ text: 'ice cream', target: 'ice cream' }, { text: ' van' }]);
  });
});

describe('share and gloss', () => {
  const body: Body = { v: 1, senses: [{ gloss: 'went', formOf: 'go' }, { gloss: 'to write' }] };
  it('uses the first non-inflection gloss', () => expect(firstGloss(body)).toBe('to write'));
  it('builds plain share text with attribution', () => {
    expect(shareText('كَتَبَ', body, 'Wiktionary Arabic–English', 'CC BY-SA 4.0')).toBe('كَتَبَ\nto write\n\nWiktionary Arabic–English · CC BY-SA 4.0');
  });
});
