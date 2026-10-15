import { SOURCES } from './paths.ts';
import type { PackageFilterOptions } from './filter/package.ts';
import type { BuildStats, EntryRow } from './rows.ts';
import { cedictFileRows } from './sources/cedict.ts';
import { awn4Rows, describeJoin, loadAwn4, parseAwn4, readAwn4 } from './sources/awn4.ts';
import { kaikkiRows } from './sources/kaikki.ts';
import { FRENCH_TRANSLATIONS, kaikkiTranslationRows } from './sources/kaikki-translations.ts';
import { FRENCH, FRENCH_FR } from './sources/kaikki-fr.ts';
import { jmdictRows } from './sources/jmdict.ts';
import { loadOewn, oewnRows } from './sources/oewn.ts';
import { laneRows } from './sources/lane.ts';
import { archiveMembers, readArchiveMember, withCounts } from './sources/perseus.ts';
import { salmoneRows } from './sources/salmone.ts';

export type RowSource = (o: { limit: number; stats: BuildStats }) => AsyncIterable<EntryRow> | Iterable<EntryRow>;

function awn4EnAr(o: { limit: number; stats: BuildStats }): Iterable<EntryRow> {
  const oewn = loadOewn(SOURCES.oewnZip);
  const join = loadAwn4(parseAwn4(readAwn4(SOURCES.awn4)), oewn.synsets);
  console.error(describeJoin(join));
  return awn4Rows(oewn, join.lemmas, o.stats, o.limit);
}

export const ROW_SOURCES: Record<string, RowSource> = {
  'oewn-2025': (o) => oewnRows(loadOewn(SOURCES.oewnZip), o.stats, o.limit),
  'cc-cedict': (o) => cedictFileRows(SOURCES.cedict, o),
  'wiktionary-ar-en': (o) => kaikkiRows(SOURCES.kaikki, { lang: 'ar', maxSenses: 30, tables: true }, o),
  'wiktionary-en': (o) => kaikkiRows(SOURCES.kaikki, { lang: 'en', maxSenses: 20, tables: false }, o),
  'salmone-1889': (o) =>
    withCounts('salmone-1889', (counts) =>
      salmoneRows(readArchiveMember(SOURCES.perseusArabic, 'Arabic/Salmone/opensource/salmone.xml'), o.stats, o.limit, counts),
    ),
  'lane-lexicon': (o) =>
    withCounts('lane-lexicon', (counts) => laneRows(laneFiles(), o.stats, o.limit, counts)),
  'wiktionary-en-ar': (o) => kaikkiTranslationRows(SOURCES.kaikki, 'ar', o),
  'wiktionary-en-fr': (o) => kaikkiTranslationRows(SOURCES.kaikki, 'fr', o),
  'wiktionary-en-ja': (o) => kaikkiTranslationRows(SOURCES.kaikki, 'ja', o),
  'wiktionary-en-zh': (o) => kaikkiTranslationRows(SOURCES.kaikki, 'zh', o),
  'wiktionary-fr-en': (o) => kaikkiRows(SOURCES.kaikki, { lang: 'fr', maxSenses: 30, tables: true, terms: 'universal' }, o),
  'wiktionary-fr-ar': (o) => kaikkiRows(SOURCES.kaikkiFr, { lang: 'ar', maxSenses: 30, tables: false, edition: FRENCH }, o),
  'wiktionnaire-fr': (o) => kaikkiRows(SOURCES.kaikkiFr, { lang: 'fr', maxSenses: 20, tables: true, edition: FRENCH_FR }, o),
  'wiktionnaire-fr-ar': (o) => kaikkiTranslationRows(SOURCES.kaikkiFr, 'ar', o, FRENCH_TRANSLATIONS),
  'awn4-en-ar': awn4EnAr,
  'jmdict-en': (o) => jmdictRows(SOURCES.jmdict, o),
};

// Lane and Salmoné glosses are long prose with Arabic citations, where look-alike
// tokens would cost whole articles; their English is checked by the classical list.
// modernise rewords dated racial terms where these sources use them descriptively.
export const PACKAGE_FILTERS: Record<string, Partial<PackageFilterOptions>> = {
  'salmone-1889': { arabicGlosses: false, modernise: 'en' },
  'lane-lexicon': { arabicGlosses: false, modernise: 'en' },
  'oewn-2025': { modernise: 'en' },
  'awn4-en-ar': { modernise: 'en' },
  'wiktionary-en': { modernise: 'en' },
  'wiktionary-fr-ar': { modernise: 'fr' },
};

function* laneFiles(): Generator<string> {
  const members = archiveMembers(SOURCES.perseusArabic).filter((m) => /^Arabic\/Lane\/opensource\/[^/]+\.xml$/.test(m));
  for (const member of members.sort()) yield readArchiveMember(SOURCES.perseusArabic, member);
}

const KAIKKI = { source: 'kaikki-enwiktionary', files: ['raw-wiktextract-data.jsonl.gz'] };

export const SOURCE_FILES: Record<string, { source: string; files: string[] }> = {
  'oewn-2025': { source: 'oewn', files: ['english-wordnet-2025-json.zip'] },
  'cc-cedict': { source: 'cc-cedict', files: ['cedict_1_0_ts_utf-8_mdbg.txt.gz'] },
  'wiktionary-ar-en': KAIKKI,
  'wiktionary-en': KAIKKI,
  'salmone-1889': { source: 'perseus-arabic', files: ['hopper-texts-Arabic.tar.gz'] },
  'lane-lexicon': { source: 'perseus-arabic', files: ['hopper-texts-Arabic.tar.gz'] },
  'wiktionary-en-ar': KAIKKI,
  'wiktionary-en-fr': KAIKKI,
  'wiktionary-en-ja': KAIKKI,
  'wiktionary-en-zh': KAIKKI,
  'wiktionary-fr-en': KAIKKI,
  'wiktionary-fr-ar': { source: 'kaikki-frwiktionary', files: ['raw-wiktextract-data.jsonl.gz'] },
  'wiktionnaire-fr': { source: 'kaikki-frwiktionary', files: ['raw-wiktextract-data.jsonl.gz'] },
  'wiktionnaire-fr-ar': { source: 'kaikki-frwiktionary', files: ['raw-wiktextract-data.jsonl.gz'] },
  'awn4-en-ar': { source: 'arabic-wordnet-v4', files: ['awn4.xml.gz'] },
  'jmdict-en': { source: 'jmdict', files: ['JMdict_e.gz'] },
};
