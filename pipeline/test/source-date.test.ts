import { describe, expect, it } from 'vitest';
import { newStats, countDrop } from '../src/rows.ts';
import { sourceDate } from '../src/package/source-date.ts';

const TSV = [
  'english-wordnet-2025-json.zip\t9986555\t7d74\thttps://en-word.net/static/english-wordnet-2025-json.zip\t2026-10-10T17:30:17Z',
  'english-wordnet-2025.xml.gz\t11363503\t9ca6\thttps://en-word.net/static/english-wordnet-2025.xml.gz\t2026-10-12T00:10:00Z',
  '',
].join('\n');

describe('sourceDate', () => {
  it('returns the UTC fetch date of the named file', () => {
    expect(sourceDate(TSV, ['english-wordnet-2025-json.zip'])).toBe('2026-10-10');
  });
  it('returns the latest date when several files are named', () => {
    expect(sourceDate(TSV, ['english-wordnet-2025-json.zip', 'english-wordnet-2025.xml.gz'])).toBe('2026-10-12');
  });
  it('converts an offset timestamp to its UTC date', () => {
    expect(sourceDate('a.gz\t1\tx\tu\t2026-10-11T01:00:00+03:00\n', ['a.gz'])).toBe('2026-10-10');
  });
  it('throws when the file is not recorded', () => {
    expect(() => sourceDate(TSV, ['missing.gz'])).toThrow('missing.gz');
  });
});

describe('countDrop', () => {
  it('counts dropped senses in total and per reason', () => {
    const stats = newStats();
    countDrop(stats, 'tag:vulgar');
    countDrop(stats, 'tag:vulgar');
    countDrop(stats, 'topic:en:Sex');
    expect(stats.droppedSenses).toBe(3);
    expect(stats.droppedByReason).toEqual({ 'tag:vulgar': 2, 'topic:en:Sex': 1 });
  });
});
