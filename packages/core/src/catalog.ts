export type Difficulty = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export interface PublishedCatalog {
  format: 1 | 2;
  generated_at: string;
  dictionaries: PublishedDictionary[];
}

export interface PublishedDictionary {
  id: string;
  title: string;
  from: string;
  to: string;
  kind: 'monolingual' | 'bilingual';
  rank: number;
  difficulty: Difficulty;
  license: string;
  license_url: string;
  attribution: string;
  source_date: string;
  summary: { en: string; ar: string };
  ai_generated: boolean;
  schema_version: 1 | 2;
  version: string;
  entry_count: number;
  size_bytes: number;
  installed_size_bytes: number;
  sha256: string;
  url: string;
  min_app_version?: string;
  availability?: string;
}

export interface SkippedDictionary {
  index: number;
  id?: string;
  error: string;
}

export interface ParsedCatalog extends PublishedCatalog {
  skipped: SkippedDictionary[];
}

export const META_KEYS = ['id', 'title', 'from', 'to', 'version', 'license', 'attribution', 'source_date', 'entry_count', 'schema_version'] as const;
export const PACKAGE_SCHEMA_VERSION = 1; // what the pipeline writes before compaction

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DIFFICULTIES: readonly Difficulty[] = ['beginner', 'intermediate', 'advanced', 'expert'];
const KINDS = ['monolingual', 'bilingual'] as const;
const VERSION = /^(\d{8}\.\d+|fixture)$/;
const SHA256 = /^[0-9a-f]{64}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;

type Obj = Record<string, unknown>;

function fail(path: string, what: string): never {
  throw new Error(`catalog: ${path} must be ${what}`);
}

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(o: Obj, key: string, path: string, pattern?: RegExp): string {
  const v = o[key];
  if (typeof v !== 'string' || v === '' || (pattern && !pattern.test(v))) fail(`${path}.${key}`, pattern ? `a string matching ${pattern}` : 'a non-empty string');
  return v;
}

function count(o: Obj, key: string, path: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) fail(`${path}.${key}`, 'a non-negative integer');
  return v;
}

function oneOf<T extends string>(o: Obj, key: string, path: string, values: readonly T[]): T {
  const v = o[key];
  if (typeof v !== 'string' || !(values as readonly string[]).includes(v)) fail(`${path}.${key}`, `one of ${values.join(', ')}`);
  return v as T;
}

function parseDictionary(d: unknown, path: string): PublishedDictionary {
  if (!isObj(d)) fail(path, 'an object');
  const summary = d.summary;
  if (!isObj(summary)) fail(`${path}.summary`, 'an object');
  if (typeof d.ai_generated !== 'boolean') fail(`${path}.ai_generated`, 'a boolean');
  if (d.schema_version !== 1 && d.schema_version !== 2) fail(`${path}.schema_version`, '1 or 2');
  const parsed: PublishedDictionary = {
    id: str(d, 'id', path),
    title: str(d, 'title', path),
    from: str(d, 'from', path),
    to: str(d, 'to', path),
    kind: oneOf(d, 'kind', path, KINDS),
    rank: count(d, 'rank', path),
    difficulty: oneOf(d, 'difficulty', path, DIFFICULTIES),
    license: str(d, 'license', path),
    license_url: str(d, 'license_url', path),
    attribution: str(d, 'attribution', path),
    source_date: str(d, 'source_date', path, DATE),
    summary: { en: str(summary, 'en', `${path}.summary`), ar: str(summary, 'ar', `${path}.summary`) },
    ai_generated: d.ai_generated,
    schema_version: d.schema_version,
    version: str(d, 'version', path, VERSION),
    entry_count: count(d, 'entry_count', path),
    size_bytes: count(d, 'size_bytes', path),
    installed_size_bytes: count(d, 'installed_size_bytes', path),
    sha256: str(d, 'sha256', path, SHA256),
    url: str(d, 'url', path),
  };
  if (d.min_app_version !== undefined) parsed.min_app_version = str(d, 'min_app_version', path, SEMVER);
  if (d.availability !== undefined) parsed.availability = str(d, 'availability', path);
  return parsed;
}

// An entry this app cannot read (a newer schema, kind or field) is skipped so the
// rest of the catalog still loads; strict mode is for the pipeline, which writes it.
export function parsePublishedCatalog(json: unknown, o: { strict?: boolean } = {}): ParsedCatalog {
  if (!isObj(json)) fail('$', 'an object');
  const format = json.format;
  if (format !== 1 && format !== 2) fail('$.format', '1 or 2');
  const generated_at = str(json, 'generated_at', '$');
  if (!Array.isArray(json.dictionaries)) fail('$.dictionaries', 'an array');
  const dictionaries: PublishedDictionary[] = [];
  const skipped: SkippedDictionary[] = [];
  json.dictionaries.forEach((d, index) => {
    try {
      dictionaries.push(parseDictionary(d, `$.dictionaries[${index}]`));
    } catch (error) {
      if (o.strict) throw error;
      const id = isObj(d) && typeof d.id === 'string' ? d.id : undefined;
      skipped.push({ index, ...(id ? { id } : {}), error: (error as Error).message });
    }
  });
  return { format, generated_at, dictionaries, skipped };
}
