# Package pipeline

Builds the dictionary packages described in `docs/CATALOG.md` § Package format from `sources/`. It shares `@lexnur/core` (normalizer, `body` and catalog types) with the app.

## Commands (from the repo root)

| Command | What it does |
|---|---|
| `pnpm --filter @lexnur/pipeline build:oewn` | Open English WordNet 2025 → `build/packages/oewn-2025/<version>.sqlite(.zst)` + `<version>.json` (about a minute) |
| `pnpm --filter @lexnur/pipeline build:cc-cedict` | CC-CEDICT zh→en → `build/packages/cc-cedict/<version>.sqlite(.zst)` + `<version>.json` (seconds) |
| `heavy pnpm --filter @lexnur/pipeline build:wiktionary-ar-en` | Streams the Kaikki dump for `lang_code == "ar"` |
| `HEAVY_MEM=12G heavy pnpm --filter @lexnur/pipeline build:wiktionary-en` | Streams the Kaikki dump for `lang_code == "en"` (over 1M rows) |
| `heavy pnpm --filter @lexnur/pipeline build:salmone-1889` | Salmoné from the Perseus Arabic archive (read with `tar`, no extraction); prints placeholder and unknown-character counts |
| `heavy pnpm --filter @lexnur/pipeline build:lane-lexicon` | Lane from the same archive: main entries plus a row per arrow (↓) word, senses split at Lane's section markers |
| `heavy pnpm --filter @lexnur/pipeline build:wiktionary-fr-en` | Streams the Kaikki dump for `lang_code == "fr"` (French→English, first conjugation table per verb, universal gloss term filter) |
| `HEAVY_MEM=12G heavy pnpm --filter @lexnur/pipeline build:wiktionary-en-ar` | Streams the Kaikki dump for `lang_code == "en"` and keeps the Modern Standard Arabic `translations[]` (dialect, regional and colloquial items are skipped and counted apart), one sense per English sense header |
| `HEAVY_MEM=12G heavy pnpm --filter @lexnur/pipeline build:wiktionary-en-fr` | Same pass for the French `translations[]`, each word with its gender, number and regional label, e.g. `eau (f)`, `char (m, Quebec)` |
| `HEAVY_MEM=12G heavy pnpm --filter @lexnur/pipeline build:wiktionary-en-ja` | Same pass for the Japanese `translations[]`, each word with its kana reading (romaji when Kaikki has no kana), e.g. `犬 (いぬ)`; links open the written form |
| `HEAVY_MEM=12G heavy pnpm --filter @lexnur/pipeline build:wiktionary-en-zh` | Same pass for the Mandarin `translations[]` (cmn, or zh without another variety), simplified first, traditional when it differs, and pinyin, e.g. `猫 / 貓 (māo)`; links open the simplified form |
| `heavy pnpm --filter @lexnur/pipeline build:wiktionary-fr-ar` | Streams the French-edition Kaikki dump for `lang_code == "ar"` (Arabic→French) |
| `HEAVY_MEM=12G heavy pnpm --filter @lexnur/pipeline build:wiktionnaire-fr` | Streams the French-edition Kaikki dump for `lang_code == "fr"` (French monolingual, about 2M rows) |
| `HEAVY_MEM=12G heavy pnpm --filter @lexnur/pipeline build:wiktionnaire-fr-ar` | Streams the French-edition Kaikki dump for `lang_code == "fr"` and keeps the Arabic `translations[]`, one sense per French sense header; items marked with an Arab country are left out |
| `heavy pnpm --filter @lexnur/pipeline build:awn4-en-ar` | Arabic WordNet 4 joined to OEWN 2025 on ILI → English→Arabic rows; prints the join miss rate |
| `heavy pnpm --filter @lexnur/pipeline build:jmdict-en` | Streams `JMdict_e.gz`: one row per entry plus alias rows for its other kanji forms and readings |
| `heavy pnpm --filter @lexnur/pipeline build:fixture` | Rebuilds `fixtures/` from `fixtures/lemmas.json` |
| `pnpm --filter @lexnur/pipeline catalog` | Regenerates `catalog/v2.json` from `catalog/catalog.json` + `catalog/releases.json`; `catalog/v1.json` is frozen and never regenerated (see `docs/CATALOG.md` § Published catalogs) |
| `pnpm --filter @lexnur/pipeline run publish <id> <version>` | Uploads a build to R2 and publishes the catalog (see below) |
| `pnpm --filter @lexnur/pipeline cli query <abs .sqlite path> <text>` | Prefix query, or a root query such as `ك ت ب` |
| `heavy pnpm --filter @lexnur/pipeline cli compact <id>` | Downloads the live package and rewrites the same content in the compact layout (schema 2 when smaller) into `build/packages/<id>/`. Never publishes |
| `heavy pnpm --filter @lexnur/pipeline cli refilter <id> [--dry-run]` | Downloads the live package (catalog/v2.json), re-applies the package filters, and writes the next version to `build/packages/<id>/`; prints drops per reason with samples. Never publishes; `--dry-run` writes nothing |

Add `--limit N` to a build to stop after N rows.

## Rules

- **Versions:** `YYYYMMDD.N` (UTC date + counter), never reused. Package keys on R2 are immutable.
- **Content filter:** senses tagged vulgar, offensive, derogatory, slur or pejorative, or in vulgar/offensive/derogatory/slur categories or the `en:Sex` topics, are dropped (`src/filter/content.ts`). So are WordNet senses in the obscenity, disparagement and slur usage domains. For the French edition the categories are `Termes vulgaires`, `Termes péjoratifs` and `Insultes`, and the topics `sexuality`, `pornography` and `eroticism`, and the raw tags `Vulgaire`, `Injurieux`, `Péjoratif`, `Grossier` and `Raciste`; an entry whose own categories put it in the sexuality, pornography, eroticism or sexual-fetishism lexicon is dropped whole. Sources without usage tags check their glosses (not their examples) with `blockedTermReason`: the universal set of vulgarities and slurs everywhere, plus the classical set of sexual and anatomical words and Latin euphemisms for Lane and Salmoné. Then, on the whole package (`src/filter/package.ts`, also run by `refilter`): English-to-other-language packages drop headwords on the universal term list; to-Arabic packages remove Arabic vulgar words (`blockedArabicTerm`, whole words) from glosses with their links, and other packages drop senses whose gloss quotes one (`gloss:ar-vulgar`; off for Lane and Salmoné via `PACKAGE_FILTERS` in `src/dictionaries.ts`), relation words it blocks are removed everywhere (`relation:ar-vulgar`), and from-Arabic packages drop form and table rows it blocks (`form:ar-vulgar`); from-Arabic packages drop headwords it blocks and strip a trailing gender, number or verb-form mark (`وَاحَة f .`); and rows whose every sense is a form of a lemma the package does not contain are dropped (`formof:dangling`), compared on normalized keys of the words in the headword's script. Entries left with no senses are dropped. Each build prints the dropped-sense count per reason; keep that output with the release notes.
- **Glosses:** `Sense.gloss` is the most specific Kaikki gloss and `Sense.parents` the broader ones; the `entry.gloss` column is the most specific gloss of the first non-form-of sense.
- **Source date:** `meta.source_date` and the catalog's `source_date` come from `fetched_at` in `sources/<id>/FILES.tsv` (`src/dictionaries.ts` names the files).
- **One row per (headword, part of speech):** Kaikki lines are merged only when they are adjacent in the dump, which is how Wiktextract writes a page's entries. Two lines for the same headword and part of speech that are far apart stay two rows.
- **Publishing:** `publish` refuses to run unless the branch contains `main`, and refuses when either live catalog (`v1.json`, `v2.json`) lists another release that `catalog/releases.json` does not have, so a catalog never drops another branch's release. It also refuses to overwrite an existing key with different bytes. Packages are uploaded with `Cache-Control: public, max-age=31536000, immutable`. Each release records `published_at` (UTC) and the catalog's `generated_at` is the latest of them, so every publish gives the app a newer catalog. `releases.json`, `v1.json` and `v2.json` are written only after both catalog uploads succeed; commit them after publishing.
- **Memory:** anything that streams Kaikki runs under `heavy`, a memory-capping wrapper that is not part of the repo; use your own (e.g. `systemd-run --user --scope -p MemoryMax=8G`) or drop it.

## Publishing a dictionary

A dictionary reaches users without an app release: installed apps refresh `https://dl.lexnur.com/catalog/v2.json` and download packages from R2. Work in a worktree (`AGENTS.md`); `build/` is per worktree, `sources/` is shared. Publishing needs `wrangler login` on the Cloudflare account (`docs/HOSTING.md`).

1. **New source** (skip when the source is already in `sources/`): record it in `docs/SOURCES.md`, download it once with `scripts/fetch.sh <source-id> <url>…` (from one worktree only), and add its file path to `SOURCES` in `src/paths.ts`.
2. **New dictionary** (skip when rebuilding an existing one): add a row source to `ROW_SOURCES` in `src/dictionaries.ts` (and `PACKAGE_FILTERS` if it needs non-default filters), a `build:<id>` script in `package.json`, and an entry in `catalog/catalog.json` (fields in `docs/CATALOG.md`; ship both directions of a language pair). Set `min_app_version` when the dictionary needs app changes, so older apps do not list it. Add a test in `pipeline/test/` like the other sources' tests.
3. **Build:** `heavy pnpm --filter @lexnur/pipeline build:<id>` (or `cli build <id>`; `--limit N` for a quick look). It writes `build/packages/<id>/<version>.sqlite(.zst)` and `<version>.json`, prints the dropped senses per reason (keep them with the release notes) and runs the package gates (`docs/CATALOG.md` § Compact layout). Spot-check with `pnpm --filter @lexnur/pipeline cli query <abs .sqlite path> <text>`. To rewrite a live package rather than rebuild it, use `cli refilter <id>` or `cli compact <id>`.
4. **Publish:** `git merge main` in the worktree, then `pnpm --filter @lexnur/pipeline run publish <id> <version>`. It uploads the package, regenerates and uploads `catalog/v2.json`, and checks the live catalogs, range requests and CORS first (see Rules above). `catalog/v1.json` is frozen and never touched.
5. **Commit** the rewritten `catalog/releases.json` and `catalog/v2.json` (with any code and `catalog.json` changes), then `scripts/worktree.sh finish <branch>`.
6. **Check:** `curl -s https://dl.lexnur.com/catalog/v2.json | jq '.dictionaries[] | select(.id=="<id>") | .version'`, then refresh the catalog in the app on a device and download the dictionary.

Editorial-only changes to `catalog/catalog.json` (titles, rank, difficulty) go live with the next `publish`: the app ignores a catalog whose `generated_at` has not changed, and only `publish` advances it. The app also bundles `catalog/v2.json` as its offline snapshot when it is built, so the next app release carries the new catalog to first launches without network.
