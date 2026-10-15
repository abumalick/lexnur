import en from './en.json';
import ar from './ar.json';

export type Lang = 'en' | 'ar';
export type Translate = (key: string, params?: Record<string, string | number>) => string;
type Msg = string | Partial<Record<Intl.LDMLPluralRule, string>>;

export const MESSAGES: Record<Lang, Record<string, Msg>> = { en, ar } as Record<Lang, Record<string, Msg>>;

export function createTranslator(lang: Lang): Translate {
  const plural = new Intl.PluralRules(lang);
  const nf = new Intl.NumberFormat(lang);
  return (key, params = {}) => {
    let m: Msg | undefined = MESSAGES[lang][key] ?? MESSAGES.en[key];
    if (m === undefined) return key;
    if (typeof m !== 'string') m = m[plural.select(Number(params.count ?? 0))] ?? m.other ?? key;
    return m.replace(/\{(\w+)\}/g, (all, k: string) => {
      const v = params[k];
      return v === undefined ? all : typeof v === 'number' ? nf.format(v) : v;
    });
  };
}

export function resolveLang(setting: 'system' | 'en' | 'ar', deviceLanguages: string[]): Lang {
  if (setting !== 'system') return setting;
  return deviceLanguages[0]?.toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

export function applyDocumentLanguage(lang: Lang, doc: Document = document): void {
  doc.documentElement.lang = lang;
  doc.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
}

export function labelOrRaw(t: Translate, prefix: string, value: string): string {
  const key = `${prefix}.${value}`;
  const label = t(key);
  return label === key ? value : label;
}

// Wraps content of unknown direction (a dictionary title, a licence, a word) in FIRST STRONG ISOLATE … POP DIRECTIONAL
// ISOLATE before it is interpolated into a UI sentence, so its neutrals cannot reorder against the sentence.
export const isolate = (text: string): string => `\u{2068}${text}\u{2069}`;
