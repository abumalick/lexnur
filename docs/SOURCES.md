# Dictionary data sources

Reference for every raw source in `sources/`. Facts were checked against each project's own site on 2026-10-10. Items marked **UNVERIFIED** could not be confirmed.

Each `sources/<id>/FILES.tsv` records `file, bytes, sha256, url, fetched_at`. Re-fetch with `scripts/fetch-all.sh` and `scripts/fetch-arabic.sh` (resumable; already-recorded files are skipped).

## Licence rules that shape the build

- **CC BY-SA** (Wiktionary, Kaikki, WikDict, JMdict, CC-CEDICT, Perseus, OMW Arabic): commercial use allowed. Any SQLite package built from it is an adaptation and must itself be published under CC BY-SA. App code is not affected. Every package carries its attribution text, and the app shows it on a Sources/About screen.
- **GPL data** (FreeDict Arabic, Arramooz, GCIDE): not used. GPL conflicts with App Store terms, and the candidates are low quality.
- **AI-generated** (Arabic WordNet v4): openly licensed, but must be labelled as AI-generated in the UI.

## General / multilingual

### kaikki-enwiktionary — English Wiktionary, all languages
- `https://kaikki.org/dictionary/raw-wiktextract-data.jsonl.gz` — 2.98 GB gz, ~24 GB uncompressed. Rebuilt about weekly.
- JSONL, one object per word + part of speech: `word`, `lang_code`, `pos`, `senses[].glosses`, `senses[].examples`, `forms`, `sounds` (IPA, audio URLs), `etymology_text`, `translations[]`, `synonyms`.
- Covers every language the English Wiktionary documents, all glossed in English. Each `lang_code` is an X→English dictionary; `translations[]` on English entries gives English→X.
- Use the raw file. The per-language files (`/dictionary/<Language>/kaikki.org-dictionary-<Language>.jsonl`) are marked deprecated (wiktextract issue #1178).
- Licence: CC BY-SA 4.0 + GFDL (Wiktionary). Kaikki asks for citation of Ylonen, LREC 2022.
- Quality: best free breadth. English excellent; Arabic good (~59k words, vowelled, roots, inflection tables); noise from form-of entries and template residue.

### kaikki-{ed}wiktionary — non-English Wiktionary editions
- `https://kaikki.org/{ed}wiktionary/raw-wiktextract-data.jsonl.gz` for fr, de, es, ru, it, pt, nl, pl, zh, ja, ko, tr (also cs, el, id, ku, th, simple, vi, ms available, not fetched).
- Same schema. Gives monolingual dictionaries per edition and X→{ed} bilingual ones (e.g. Arabic entries glossed in French: ~11.7k words).
- **There is no Arabic Wiktionary extraction** (`kaikki.org/arwiktionary/` is 404; DBnary and WikDict have no Arabic either).

### wikdict — WikDict bilingual SQLite
- `https://download.wikdict.com/dictionaries/sqlite/2/` — 676 files (~7.3 GB): pair files `xx-yy.sqlite3` (10–25 MB each) and monolingual `xx.sqlite3`. Snapshot dated 2026-06-23.
- 26 languages: bg ca cs da de el en es fi fr ga id it ja ku la lt mg nl no pl pt ru sv tr zh. **No Arabic.**
- Licence: CC BY-SA 4.0. Credit WikDict, Wiktionary, DBnary.
- Already SQLite: attach and copy into the package schema. Translation-focused, definitions are thin.

### oewn — Open English WordNet 2025
- `https://en-word.net/static/english-wordnet-2025.xml.gz` (GWN-LMF) and `english-wordnet-2025-json.zip`.
- Licence: CC BY 4.0, plus the Princeton WordNet licence notice. Attribute both.
- Short, accurate definitions; synonyms and relations. No etymology or pronunciation.

### jmdict — JMdict (EDRDG)
- `http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz` (English only) and `JMdict.gz` (multilingual). Updated daily. JSON variant: github.com/scriptin/jmdict-simplified releases.
- Licence: CC BY-SA 4.0 with EDRDG conditions: attribution on a dedicated screen reachable from a menu, and the app **must update the data regularly** (EDRDG asks for at least monthly). Non-English glosses are copyrighted by their compilers.

### cc-cedict — CC-CEDICT
- `https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz` — ~125k entries, updated frequently.
- Format: `Traditional Simplified [pin1 yin1] /gloss1/gloss2/`. Licence: CC BY-SA 4.0.

### tatoeba — example sentences
- `https://downloads.tatoeba.org/exports/sentences.tar.bz2` + `links.tar.bz2`. Weekly.
- Licence: CC BY 2.0 FR (some CC0). English ~2.0M sentences, Arabic ~69k.

### wikidata-lexemes
- `https://dumps.wikimedia.org/wikidatawiki/entities/latest-lexemes.json.bz2` — weekly. CC0.
- Strong on inflected forms, weak on definitions (Arabic: ~86k lexemes, only ~8.4k with senses). Use for search over inflected forms.

### omw — Open Multilingual Wordnet 2.0
- `https://github.com/omwn/omw-data/releases/download/v2.0/omw-2.0.tar.xz`. Licence per wordnet (`index.toml`). Arabic WordNet v2: CC BY-SA 3.0, ~9.9k synsets, lemmas only.

### freedict — index only
- `https://freedict.org/freedict-database.json`: all 305 FreeDict dictionaries with release URLs and sha512. 224 are Wiktionary-derived (CC BY-SA); the rest mostly GPL — check each TEI header.

### Considered and not fetched
- **GCIDE** (Webster 1913, GPLv3): archaic and GPL; Wiktionary + OEWN cover it better.
- **DBnary** (Wiktionary RDF, CC BY-SA 3.0): heavy RDF; WikDict already derives from it.
- **OmegaWiki**: site unreachable, appears unmaintained.

## Arabic

### perseus-arabic — Lane and Salmoné
- `https://www.perseus.tufts.edu/hopper/opensource/downloads/texts/hopper-texts-Arabic.tar.gz` (15.5 MB).
- **Lane's Lexicon**: `Arabic/Lane/opensource/` — 37 TEI XML files. Arabic written in Buckwalter-style transliteration; convert to Arabic script. Keyboarded, ~26 unresolved "(??)" spots. Whether all Supplement entries are present is UNVERIFIED.
- **Salmoné (1889)**: `Arabic/Salmone/opensource/salmone.xml`. Headwords grouped by root, in the same Buckwalter-style transliteration as Lane (not Arabic script); convert at build time.
- Licence: CC BY-SA 3.0 US **with the extra condition that modifications be offered back to Perseus**.
- Lane's TEI headers add their own availability statement: credit "Text provided by Perseus Digital Library, with funding from The U.S. Department of Education and The Max Planck Society." whenever the text is used, leave the statement intact, and offer Perseus any modifications. The catalog carries the credit in Lane's `attribution` and the statement verbatim in `availability`. Salmoné's header has no availability statement; its attribution credits Perseus and its funder, the National Science Foundation.
- Both use "negro" and its forms, "blacks" for people, and "halfcast"/"mongrel" for people of mixed descent as plain descriptive terms. The package filter (`pipeline/src/filter/modernise.ts`) rewords them to modern terms and the attributions say so; Lane's aside on السُّودَانُ under أَسْوَدُ ("the most stinking of mankind…") is cut.
- A corrected Lane exists at github.com/laneslexicon (SQLite labelled GPL-3, XML unlicensed). Relicensing BY-SA content as GPL is doubtful; use only as a reference for corrections unless the maintainer confirms terms.

### arabic-wordnet-v4
- `https://raw.githubusercontent.com/Salah-Sal/arabic-wordnet-v4/main/output/awn4.xml.gz` (WN-LMF 1.4). Also Zenodo DOI 10.5281/zenodo.18872077.
- 120k synsets, 136k entries, vowelled lemmas, linked to OEWN synsets (gives en↔ar). Its Arabic definitions are **not** used: Arabic–Arabic content must come from a real Arabic dictionary.
- Licence: CC BY 4.0. **AI-generated** translation of OEWN; no human validation stated. Spot-check before publishing; label in UI.

### Arabic–Arabic: deferred
No Arabic–Arabic dictionary is in the catalog. The product needs a real Arabic dictionary for this, not Wiktionary-style or AI-generated content, and none of the established ones is licensed for redistribution. Findings for when this is revisited:
- **Classical lexica** (Mukhtar al-Sihah, al-Misbah al-Munir, Maqayis al-Lugha, al-Qamus al-Muhit, al-Sihah, Asas al-Balagha, Lisan al-Arab, Taj al-Arus, Kitab al-Ayn): machine-readable text exists on Shamela and OpenITI. Shamela grants no reuse licence (shamela.ws/page/terms §5) and its texts are typed from modern edited printings; OpenITI is CC BY-NC-SA 4.0 (non-commercial). Options: permission from rights holders, or new transcription of pre-1926 printings.
- **Shamela `.bok` format**, if permission is obtained: old books at `https://old.shamela.ws/books/{id/100, 3 digits}/{id}.rar`; each holds an MS Access (Jet) database readable with `mdbtools`. Tables: `b{id}` text (`nass`, `id`, `part`, `page`), `t{id}` table of contents (`tit`, `lvl`, `id`; letter → root), `Main` edition card. Shamela ids: Mukhtar 23193, Misbah 12145, Maqayis 21710, Qamus 7283, Sihah 23235, Asas 21568, Lisan 1687, Taj 7030, Ayn 1682.
- **Modern dictionaries** (al-Muʿjam al-Wasit, al-Ghani, al-Raʾid, ʿUmar's al-Muʿāṣira): copyrighted; would need a commercial licence.
- **Arabic Wiktionary** (dump at dumps.wikimedia.org/arwiktionary): CC BY-SA but thin, and not the quality expected.
- **Kazimirski** (Arabic–French, kazimirski.online): no licence for the digital edition; needs the author's permission.

### Not usable
- **Copyrighted**: Hans Wehr, al-Mawrid, al-Munjid, al-Muʿjam al-Wasit (even though on Shamela), al-Ghani, al-Raʾid, ʿUmar's al-Muʿāṣira, Almaany, Doha Historical Dictionary.
- **Non-commercial**: OpenITI, Meta MUSE ar-en, Tanzil translations.
- **Unlicensed redistributions**: arabiclexicon.hawramani.com, collections copied from other apps.
- **Needs permission or re-typing**: Buckwalter BAMA (LDC asks commercial users to contact QAMUS LLC), Hava / Steingass / Penrice (1873) / Badger (scans only; OCR'd Arabic is unusable).
- **Low quality, GPL**: FreeDict ara-eng / eng-ara (Arabeyes word list, unmaintained since 2017, unvowelled, inflected forms as headwords).
- **Not definitions, but useful later**: Arramooz (GPL morphology lexicon), Qutrub (GPL verb conjugator), Quranic Arabic Corpus morphology (GPL + no-modification clause), Qabas lemma list (CC BY-ND 4.0).
