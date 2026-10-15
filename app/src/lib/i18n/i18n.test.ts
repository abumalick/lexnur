import { describe, expect, it } from 'vitest';
import { applyDocumentLanguage, createTranslator, isolate, labelOrRaw, MESSAGES, resolveLang } from './index';

const ar = (n: number) => new Intl.NumberFormat('ar').format(n);

describe('i18n', () => {
  it('interpolates parameters and formats numbers per language', () => {
    expect(createTranslator('en')('search.placeholder_one', { title: 'WordNet' })).toBe('Search WordNet');
    expect(createTranslator('ar')('details.entries', { count: 1200 })).toContain(ar(1200));
  });
  it('selects Arabic plural forms', () => {
    const t = createTranslator('ar');
    expect(t('search.also_in', { count: 1 })).toBe('+قاموس واحد');
    expect(t('search.also_in', { count: 2 })).toBe('+قاموسان');
    expect(t('search.also_in', { count: 3 })).toContain('قواميس');
    expect(t('search.also_in', { count: 3 })).toContain(ar(3));
  });
  it('falls back to English, then to the key', () => {
    MESSAGES.en['test.only_en'] = 'English only';
    try {
      expect(createTranslator('ar')('test.only_en')).toBe('English only');
    } finally {
      delete MESSAGES.en['test.only_en'];
    }
    expect(createTranslator('ar')('no.such.key')).toBe('no.such.key');
  });
  it('has the same keys in both languages', () => {
    expect(Object.keys(MESSAGES.ar).sort()).toEqual(Object.keys(MESSAGES.en).sort());
  });
  it('resolves the UI language from the setting or the device', () => {
    expect(resolveLang('system', ['ar-SA', 'en'])).toBe('ar');
    expect(resolveLang('system', ['fr-FR'])).toBe('en');
    expect(resolveLang('ar', ['en-US'])).toBe('ar');
  });
  it('labels known values and passes unknown ones through', () => {
    const t = createTranslator('ar');
    expect(labelOrRaw(t, 'pos', 'verb')).toBe('فعل');
    expect(labelOrRaw(t, 'pos', 'circumfix')).toBe('circumfix');
  });
  it('sets lang and dir on the document', () => {
    applyDocumentLanguage('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
    applyDocumentLanguage('en');
    expect(document.documentElement.dir).toBe('ltr');
  });
});

describe('isolate', () => {
  it('wraps content in first-strong isolate marks', () => {
    expect(isolate('CC BY-SA 4.0')).toBe('\u{2068}CC BY-SA 4.0\u{2069}');
  });
});
