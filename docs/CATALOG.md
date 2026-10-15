# Catalog and packaging

The app downloads dictionaries on demand and uses them offline. This document defines the catalog the app reads, how dictionaries are ranked, and the package format to build from `sources/`.

## Repository layout

```
sources/<source-id>/      raw downloads, untouched (git-ignored). FILES.tsv = name, bytes, sha256, url, fetched_at
catalog/catalog.json      editorial catalog: which dictionaries exist, their rank, difficulty, licence
catalog/releases.json     published package versions (written by publish)
catalog/v1.json, v2.json  published catalogs (see "Published catalogs")
pipeline/                 package builds and publishing (pipeline/README.md)
packages/core/            normalizer, body and catalog types, zstd decoder, shared by app and pipeline
build/                    generated packages (git-ignored)
```

A *source* is a raw upstream download. A *dictionary* is one package the user can install. One source can produce many dictionaries (the English Wiktionary dump yields one per language), and one dictionary can combine sources.

## catalog/catalog.json

`dictionaries[]` lists hand-curated entries. `generated_families[]` describes dictionaries produced in bulk (one per language), which the build expands into concrete entries. `supplements[]` are shared resources (example sentences, inflected forms) rather than dictionaries.

| Field | Meaning |
|---|---|
| `id` | Stable kebab-case id. Never reuse an id for different content. |
| `title` | Display title, in the dictionary's own language where natural. |
| `from`, `to` | ISO 639-1 codes. Equal for monolingual dictionaries. |
| `kind` | `monolingual` or `bilingual`. |
| `rank` | Recommendation order **within the same `from`→`to` pair**. 1 = suggested default. |
| `difficulty` | `beginner` · `intermediate` · `advanced` · `expert`. How hard the entries are to read, independent of rank. |
| `distribution` | `open`. See below. |
| `license` | Licence of the data as published. |
| `ai_generated` | `true` when content was machine-generated; the UI must say so. |
| `min_app_version` | Optional `MAJOR.MINOR.PATCH`. The oldest app release that can use this dictionary; see "Published catalogs" below. |
| `availability` | Optional. A source availability statement that must travel with the text verbatim (Lane's Perseus header); published in the catalog, written to the package `meta` and shown in the dictionary details and source sheets. |
| `sources` | Source ids under `sources/`. |
| `filter` / `path` / `file` | Which part of the source this dictionary uses. |

### Rank vs difficulty

Rank is the editorial recommendation: which dictionary to suggest first for a language pair. Difficulty describes the reader the dictionary suits. They are separate so the app can suggest the best *beginner* dictionary to a learner even when a harder one ranks higher (e.g. Wiktionary vs Lane for Arabic–English).

Difficulty guide:
- **beginner** — short, modern glosses; vowelled or romanized. (Wiktionary, JMdict.)
- **intermediate** — compact but needs some grammar; older language. (Salmoné, WordNet.)
- **advanced** — terse, abbreviated or concept-organised entries.
- **expert** — vast scholarly works with classical citations. (Lane.)

Arabic–Arabic is deliberately absent: it will come from a licensed, established Arabic dictionary later (see SOURCES.md). Do not fill the gap with Wiktionary or AI-generated Arabic definitions.

Every published language pair ships in both directions (X→Y and Y→X). If one direction is too thin to be useful, it is not published silently: report the gap with entry counts and decide it explicitly.

### Distribution

- `open` — build and publish.

## Package format

One SQLite file per dictionary, compressed with zstd for download (`.sqlite.zst`, about 26% smaller than gzip). The app decompresses it in its native download plugin; the web build uses fzstd.

```sql
meta(key TEXT PRIMARY KEY, value TEXT)  -- id, title, from, to, version, license, attribution, source_date, entry_count, schema_version, availability (optional)
entry(
  id INTEGER PRIMARY KEY,
  headword TEXT NOT NULL,      -- display form, vowelled for Arabic
  search_key TEXT NOT NULL,    -- normalized headword
  pos TEXT,                    -- part of speech
  root TEXT,                   -- Arabic root, normalized; null otherwise
  gloss TEXT,                  -- one-line summary shown in suggestion rows
  sort_order INTEGER NOT NULL, -- order among equal keys: lemma before inflected form, then frequency when known
  body TEXT NOT NULL           -- structured JSON, see below
)
CREATE INDEX entry_key ON entry(search_key, sort_order);
CREATE INDEX entry_root ON entry(root) WHERE root IS NOT NULL;
```

- **One row per (lemma, part of speech).** Senses from the source are merged into that row's `body`. WordNet synsets are grouped by lemma and part of speech the same way.
- **Alias rows for extra search keys.** A headword searchable under several keys (JMdict kanji and kana, CC-CEDICT simplified, traditional and pinyin) gets one row per key, all with the same `headword` and `body`. The primary row has `sort_order` 0, aliases 1. The app dedupes suggestions within one dictionary by (headword, pos), or by (headword, gloss) when pos is null, so alias rows show once; across dictionaries it keeps the first row per headword and lists the other dictionaries as "also in" (`alsoIn`).
- **Search is headword-prefix only**: a range scan on `entry_key` (`search_key >= :q AND search_key < :q || char(0x10FFFF)`). There is no FTS index; full-text search in definitions is a later feature.
- **Root query**: Arabic letters separated by spaces (`ك ت ب`) query `entry_root`, since classical lexica are ordered by root.
- Arabic search key: strip diacritics (tashkīl) and tatweel, unify alef forms (أ إ آ ٱ → ا), ى → ي and ة → ه. Keep the original vowelled form for display.
- Other search keys: lowercase, strip accents (NFD, drop combining marks except the kana voiced sound marks U+3099/U+309A, then NFC). Kana keep their voicing (が ≠ か), the ligatures œ and æ fold to oe and ae (cœur = coeur), and Han characters are unchanged; Hangul keys are NFC (precomposed syllables, not jamo).
- **`body`** is versioned JSON that the app renders natively, without a WebView: senses (gloss, examples, labels), forms and inflection tables, linked headwords, etymology, notes.
- **One source of truth**: the normalizer, the `body` types and the catalog models live in a shared TypeScript `core` package (`packages/core`). The app and the Node pipeline both import it, so the two cannot drift.
- **Content filter**: the app is rated for all ages, so the build drops Wiktionary senses tagged vulgar, offensive, derogatory, slur or pejorative, senses in the matching "<Language> vulgarities / offensive terms / derogatory terms / ethnic slurs / religious slurs" categories, and senses in the `en:Sex` and `en:Sex positions` topic categories; from OEWN it drops senses in the obscenity, disparagement and slur usage domains. Sources without such tags (Lane, Salmoné, and as a backstop other English glosses) have their glosses checked against shared English term lists (`blockedTermReason` in `pipeline/src/filter/content.ts`), matched as whole words (a hyphen counts as part of the word): a universal set of vulgarities and slurs for every source, and for Lane and Salmoné a classical set of sexual and anatomical vocabulary, including Lane's Latin euphemisms (`inivit`, `coivit`…). After that, the whole package is checked: English-to-other-language packages drop headwords on the universal list, to-Arabic packages remove Arabic vulgar words from glosses, from-Arabic packages drop vulgar Arabic headwords, and form-of rows whose lemma is not in the package are dropped, so inflections of a filtered lemma do not survive it. Each build prints dropped senses per reason. Entries left with no senses are dropped.
- **Fixture packages**: the pipeline also produces small committed fixtures, three packages (`oewn-2025`, `wiktionary-ar-en`, `wiktionary-en`) of about 100–140 entries each, same schema. The app's unit tests, UI tests and screenshot runs use them.

The published catalog served to the app is generated from `catalog/catalog.json` plus build output (`catalog/releases.json`) by `pnpm --filter @lexnur/pipeline catalog`, and rewritten by `publish`. It adds `version`, `schema_version`, `size_bytes` (download), `installed_size_bytes`, `sha256` and `url` for each package. The app also ships a snapshot of it, so a first launch without network can still list what is available.

### Published catalogs

Two files are generated and published side by side, because app 1.0.0 ignores `min_app_version` and would list a dictionary it cannot use:

| File | `format` | Lists | Read by |
|---|---|---|---|
| `catalog/v1.json` | 1 | **frozen**: the last schema-1 releases of the dictionaries without `min_app_version` | app 1.0.0 |
| `catalog/v2.json` | 2 | every released dictionary, with `min_app_version` when set | app 1.1.0 and later (URL and bundled snapshot) |

**`catalog/v1.json` is frozen.** App 1.0.0 reads only schema-1 packages and ignores `min_app_version`, so v1.json stays byte-identical to the file it had when schema 2 was introduced (its sha256 is pinned as `FROZEN_V1_SHA256` in `pipeline/src/catalog/publish.ts`). `catalog` and `publish` never regenerate or upload it; new releases reach v2.json only. Before any upload, `publish` checks that the local and live v1.json are that file and that every package URL it lists still answers. Never delete an R2 object that v1.json references.

The app hides a v2 entry whose `min_app_version` is newer than its own version (`app/package.json`, injected at build time as `__APP_VERSION__`); an entry without the field is always listed. `@lexnur/core`'s parser accepts both formats, so a v1 catalog cached by an older install keeps working until the first refresh replaces it with v2. Set `min_app_version` on a dictionary that needs app changes (e.g. the CJK search scripts for `jmdict-en` and `cc-cedict`), and drop it once no supported app release predates it. A schema-2 release gets `min_app_version` 1.1.0 (or the editorial value when newer) automatically.

A breaking change to the format itself gets a new file (`v3.json`) the same way, while older files keep being published for the builds that read them.

### Compact layout and schema 2

The pipeline writes the plain schema above, runs every filter and revision on it, and compacts it as the very last step (`pipeline/src/package/compact.ts`, `finish.ts`). Compaction keeps the same query surface: `headword`, `search_key`, `gloss`, `pos`, `root`, `sort_order` and `body` are still columns of `entry`, so suggestions never decompress anything.

```sql
entry(
  id INTEGER PRIMARY KEY,
  search_key TEXT NOT NULL, pos TEXT, root TEXT, sort_order INTEGER NOT NULL,
  hw TEXT,          -- headword when it differs from search_key
  g TEXT,           -- gloss of a row that is not templated
  tpl INTEGER,      -- form-of template id; lemma and tail complete it
  lemma TEXT, tail TEXT,
  z BLOB,           -- schema 2: body as a zstd frame (schema 1: plain body TEXT)
  zref INTEGER,     -- schema 2: id of the row whose z this row shares
  headword TEXT GENERATED ALWAYS AS (coalesce(hw, search_key)) VIRTUAL,
  gloss TEXT GENERATED ALWAYS AS (…) VIRTUAL,   -- g, or the template's gloss with the lemma put back
  body TEXT GENERATED ALWAYS AS (…) VIRTUAL     -- the expanded template; NULL for a zstd row in schema 2
)
body_dict(id INTEGER PRIMARY KEY, data BLOB NOT NULL)   -- schema 2 only: the zstd dictionary, id 1
```

- **Templates.** A form-of row (`sort_order` 1, no root, every sense pointing at one lemma) whose body head and gloss match one of the package's 256 most common templates (used at least 8 times) stores the template id, the lemma and the rest of the body. The generated columns expand it with `replace(…, char(57344), lemma)`; U+E000 never occurs in package text.
- **Clustering.** Rows are written in `(search_key, sort_order, id)` order with 16 KB pages, so a prefix scan reads few adjacent pages. Ids are renumbered; the app remaps recent searches by headword after an update.
- **Schema 2: zstd bodies.** Every other body is a zstd frame (level 19, content size in the header, no checksum, no dictionary id) with its 4-byte magic number removed, compressed against a dictionary trained on the package's own bodies (`zstd --train`, up to 256 KB, about 1/40 of the body bytes for small packages). Rows whose body is identical to an earlier row's store `zref` instead (alias rows). The app reads a body with `SELECT …, body, hex(coalesce(e.z, r.z)) AS z FROM entry e LEFT JOIN entry r ON r.id = e.zref WHERE e.id = ?` (`ENTRY_SQL` in `@lexnur/core`): `body` when it is not NULL, otherwise it decodes `z`. `hex()` keeps the bytes a plain string through every SQLite plugin.
- **Decoder.** `@lexnur/core` embeds a decoder-only zstd WebAssembly module (`packages/core/zstd/decoder.c`, zstd 1.5.7, about 68 KB; rebuild with `scripts/build-zstd-wasm.sh`). It prepares the package dictionary once per open package (in the background when the package opens) and runs in the app WebView on Android and iOS, in the web build and in Node. Where WebAssembly is unavailable (iOS Lockdown Mode turns it off in WKWebView) the app loads the same decoder translated to JavaScript by binaryen's wasm2js (`zstd-js.ts`, a separate chunk). fzstd, used for whole-package downloads, does not support external dictionaries.
- **Which schema.** Compaction builds both layouts and keeps zstd bodies (schema 2) only when the installed file is smaller; otherwise the compact schema-1 layout ships, which every app version can read.
- **Gates** (all in `finishPackage`): a round-trip that reads every row through the app's SQL and decoder and compares it with the plain package row for row; the app's queries answered identically by SQLite 3.36 (iOS 15's system SQLite, the oldest that opens these packages: generated columns need 3.31); then a device smoke test before publishing.
- `compact <id>` republishes a live package's content unchanged in the compact layout; `refilter` expands a compacted live package to the plain layout before filtering and compacts the result again.
- The app accepts `schema_version` 1 and 2; a package with any other value is shown as broken.

## Processing notes

- The Kaikki raw dump is ~24 GB uncompressed. Stream it line by line (`zcat | …`); never load it whole. One streaming pass can split it by `lang_code` into all per-language dictionaries.
- Treat downloads as untrusted data: extract each archive into its own empty directory, and keep build scripts outside `sources/`.
- Lane: map Buckwalter-style transliteration to Arabic script before indexing.
- JMdict: EDRDG requires regular data updates, so the app must support updating installed packages.

## Hosting

Packages and the published catalogs are served from the R2 bucket `lexnur-packages` at https://dl.lexnur.com, under immutable keys `packages/<id>/<version>.sqlite.zst`; R2 serves range requests, so the app resumes interrupted downloads. Setup, key layout and CORS: `docs/HOSTING.md`. Publishing steps: `pipeline/README.md` § Publishing a dictionary.
