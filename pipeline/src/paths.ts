import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = fileURLToPath(new URL('../../', import.meta.url));
export const BUILD = join(REPO, 'build');
export const FIXTURES = join(REPO, 'fixtures');
export const SOURCES_DIR = join(REPO, 'sources');
export const SOURCES = {
  oewnZip: join(REPO, 'sources/oewn/english-wordnet-2025-json.zip'),
  cedict: join(REPO, 'sources/cc-cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz'),
  awn4: join(REPO, 'sources/arabic-wordnet-v4/awn4.xml.gz'),
  kaikki: join(REPO, 'sources/kaikki-enwiktionary/raw-wiktextract-data.jsonl.gz'),
  perseusArabic: join(REPO, 'sources/perseus-arabic/hopper-texts-Arabic.tar.gz'),
  kaikkiFr: join(REPO, 'sources/kaikki-frwiktionary/raw-wiktextract-data.jsonl.gz'),
  jmdict: join(REPO, 'sources/jmdict/JMdict_e.gz'),
};
export const CATALOG = {
  editorial: join(REPO, 'catalog/catalog.json'),
  releases: join(REPO, 'catalog/releases.json'),
  published: join(REPO, 'catalog/v1.json'),
  publishedV2: join(REPO, 'catalog/v2.json'),
};
