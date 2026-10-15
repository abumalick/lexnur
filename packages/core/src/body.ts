export const BODY_VERSION = 1;

export interface Body {
  v: 1;
  transliteration?: string;
  ipa?: string[];
  senses: Sense[];
  forms?: Form[];
  tables?: InflectionTable[];
  relations?: Relation[];
  etymology?: string;
  notes?: string[];
}

export interface Sense {
  gloss: string;
  parents?: string[];
  labels?: string[];
  examples?: Example[];
  formOf?: string;
  links?: [text: string, target: string][];
}

export interface Example {
  text: string;
  translation?: string;
}

export interface Form {
  label: string;
  form: string;
  roman?: string;
}

export interface InflectionTable {
  title: 'conjugation' | 'declension' | 'inflection';
  rows: { label: string; form: string; roman?: string }[];
}

export type RelationKind = 'synonyms' | 'antonyms' | 'derived' | 'related' | 'hypernyms' | 'hyponyms';

export interface Relation {
  kind: RelationKind;
  words: string[];
}
