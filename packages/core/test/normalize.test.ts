import { describe, expect, it } from 'vitest';
import vectors from './normalize.vectors.json';
import { detectScript, normalizeKey, normalizeRoot, parseRootQuery, prefixUpperBound } from '../src/index.ts';

describe('normalizeKey', () => {
  it.each(vectors)('$in → $key', ({ in: input, key }) => {
    expect(normalizeKey(input)).toBe(key);
  });

  it('keeps kana voicing marks, composed or not', () => {
    expect(normalizeKey('が')).not.toBe(normalizeKey('か'));
    expect(normalizeKey('が')).toBe('が');
    expect(normalizeKey('\u30CF\u309A')).toBe('ぱ');
    expect(normalizeKey('バ')).not.toBe(normalizeKey('パ'));
  });

  it('folds katakana to hiragana so a hiragana query finds katakana words', () => {
    expect(normalizeKey('コーヒー')).toBe(normalizeKey('こーひー'));
    expect(normalizeKey('ガッコウ')).toBe(normalizeKey('がっこう'));
    expect(normalizeKey('ー・ヽヾ')).toBe('ー・ヽヾ');
  });

  it('is idempotent on every vector', () => {
    for (const { key } of vectors) expect(normalizeKey(key)).toBe(key);
  });
});

describe('normalizeRoot', () => {
  it.each([
    ['ك ت ب', 'ك ت ب'],
    ['ك-ت-ب', 'ك ت ب'],
    ['كتب', 'ك ت ب'],
    ['أ ك ل', 'ا ك ل'],
    [' ق  ر  أ ', 'ق ر ا'],
    ['س ء ل', 'س ا ل'],
    ['ء م ن', 'ا م ن'],
    ['ب د إ', 'ب د ا'],
  ])('%s → %s', (input, root) => {
    expect(normalizeRoot(input)).toBe(root);
  });
});

describe('parseRootQuery', () => {
  it.each([
    ['ك ت ب', 'ك ت ب'],
    ['ك-ت-ب', 'ك ت ب'],
    ['د ح ر ج', 'د ح ر ج'],
    ['كَ تَ بَ', 'ك ت ب'],
    ['أ ك ل', 'ا ك ل'],
    ['س ء ل', 'س ا ل'],
  ])('%s is a root query', (input, root) => {
    expect(parseRootQuery(input)).toBe(root);
  });

  it.each(['كتب', 'ك ت', 'ك ت ب ة ي', 'write', 'k t b', ''])('%s is not a root query', (input) => {
    expect(parseRootQuery(input)).toBeNull();
  });
});

describe('detectScript', () => {
  it.each([
    ['كتب', 'arabic'],
    ['  كَتَبَ', 'arabic'],
    ['write', 'latin'],
    ['123 write', 'latin'],
    ['日本', 'han'],
    ['たべる', 'kana'],
    ['カタカナ', 'kana'],
    ['食べる', 'han'],
    ['nihao', 'latin'],
    ['nǐ hǎo', 'latin'],
    ['Привет', 'other'],
    ['', 'other'],
    ['123', 'other'],
  ] as const)('%s → %s', (input, script) => {
    expect(detectScript(input)).toBe(script);
  });
});

describe('prefixUpperBound', () => {
  it('sorts after every key that starts with the prefix and before the next prefix', () => {
    const bound = prefixUpperBound('writ');
    for (const key of ['writ', 'write', 'writing', 'writ\u{10FFFE}']) expect(key < bound).toBe(true);
    expect('wriu' > bound).toBe(true);
    expect('wris' < 'writ').toBe(true);
  });
});
