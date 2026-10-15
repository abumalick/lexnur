# Package size study

How to make installed dictionary packages smaller. All figures were measured on the real published packages. The goal is the smallest **installed** size on the user's device; download size matters less.

## Where the bytes go

- **Form-of rows dominate the large Wiktionary packages.** In `wiktionnaire-fr`, 1.53 M of 2.08 M rows are inflections ("mangeons" → "manger"). Each one carries a full `body` JSON and a `gloss`, and they differ only in the lemma and a short tail. About 3,500 distinct body templates cover them.
- **JSON keys and common fragments repeat in every row** (`{"senses":[{"gloss":`…).
- **Rows are stored in insertion order.** The `entry_key` index is therefore not clustered, so a prefix search touches pages all over the file.
- **JMdict and CC-CEDICT alias rows** repeat the same `body` once per search key (JMdict: 485 k rows, 218 k distinct bodies).

## Technique A: same schema, compacted layout

These steps need no reader change, and existing app builds read the result.

1. **Slim stored columns.** `headword`, `gloss` and `body` become `VIRTUAL` generated columns, rebuilt from smaller stored columns.
2. **Form-of templates.** A form-of row stores a template id, the lemma and a tail. The generated column expands them with nested `replace()`.
3. **Tokens.** 31 one-byte control characters stand for the most common JSON fragments.
4. **Clustering and page size.** Rows are written in `(search_key, sort_order)` order, with 16 KB pages.

| Package | Installed before → after | Download before → after |
|---|---|---|
| wiktionnaire-fr | 993 → 514 MB | 124.8 → 106.2 MB |
| wiktionary-en | 656 → 434 MB | 108.4 → 90.4 MB |
| wiktionary-fr-en | 178.8 → 75.3 MB | |

Cold prefix search becomes faster, from about 6 ms to 1–2 ms, because the clustered rows put one prefix on a few adjacent pages.

Constraints:
- **SQLite ≥ 3.31** is needed for generated columns. The iOS 15 system SQLite (3.36) was tested.
- **SQLite 3.36 limits `replace()` nesting** (the expression depth limit is hit at about 27 levels). Chain the replacements at most 8 at a time.
- **Compaction must be the last pipeline step**, because the content filter and modernisation passes edit plain columns.
- **Equality gate.** `SELECT … EXCEPT` between the source and the compacted package must return no rows.
- **Other gates.** Run an open-and-query test under SQLite 3.36, then a smoke test on a device.

Rejected options:
- A `UNION ALL` view over separate lemma and form-of tables took 4.8 s per query.
- 8 KB pages saved less than 16 KB pages: 956 MB vs 925 MB, against a 993 MB baseline.

## Technique B: per-row zstd with a trained dictionary (schema change)

`body` is stored as a zstd frame compressed against a dictionary trained on the package's own rows. The dictionary is stored in the package. `headword`, `search_key` and `gloss` stay plain, so suggestions never decompress anything. Only opening an entry decodes one row.

The figures below come from the non-form-of rows of each package after A's templating:

| Package | Rows | Raw body | zstd, 112 KB dictionary | zstd, 256 KB dictionary | deflate, 32 KB dictionary | Package with B |
|---|---|---|---|---|---|---|
| wiktionnaire-fr | 552 k | 363.5 MB | 90.0 MB (×4.04) | 86.4 MB (×4.21) | 98.7 MB | ≈ 317–320 MB |
| wiktionary-en | 948 k | 372.1 MB | 102.7 MB (×3.62) | — | 107.8 MB | ≈ 239 MB |

Decoding one row and parsing its JSON took 4–9 µs on desktop.

B roughly halves the installed size again after A. The download gets 11–24% larger, because already-compressed rows leave little for the outer `.sqlite.zst` to compress. B also needs a decoder in the app on every platform, including the web path.

## Technique C: alias body dedupe

Alias rows in JMdict and CC-CEDICT point to one shared body instead of repeating it. JMdict went from 139.7 MB to 94.2 MB.

## Tooling

Study scripts: `build_variant.py`, `build_gen.py` (A), `compress_study.py` (B), `token_study.py`, `templates.py`, `bench.mjs`. A SQLite 3.36 shell was used for the compatibility tests.

## Results: what shipped

A and B were combined and each piece of A was measured on top of B on `wiktionary-en` (656 MB installed):

| Layout | Installed |
|---|---|
| zstd bodies only (B, 112 KB dictionary) | 272.1 MB |
| + form-of templates | 243.9 MB |
| + clustering and 16 KB pages | 238.1 MB |
| + shared bodies for identical rows (C) | 237.0 MB |
| + 256 KB dictionary | 232.9 MB |
| A alone (no zstd) | 522.1 MB |

All of these stayed. The 31 control-character tokens and the `replace()`-rebuilt body were dropped: a zstd body cannot use them and the trained dictionary covers the same repeats. C is worth most on the alias-heavy packages: on JMdict, 81.4 MB without it and 68.4 MB with it. See `docs/CATALOG.md` § Compact layout and schema 2 for the format.

Every published package was compacted from its live version without content changes, and every one ended smaller as schema 2 than as compact schema 1:

| Package | Installed before → after | Download before → after | Techniques |
|---|---|---|---|
| awn4-en-ar 20261011.4 | 56.1 → 20.6 MB (-63%) | 9.0 → 11.5 MB (+27%) | clustering + 16 KB pages, zstd bodies (schema 2), shared bodies (39306) |
| cc-cedict 20261011.2 | 105.9 → 43.5 MB (-59%) | 13.7 → 17.3 MB (+27%) | clustering + 16 KB pages, zstd bodies (schema 2), shared bodies (314810) |
| jmdict-en 20261011.3 | 143.8 → 68.4 MB (-52%) | 19.1 → 25.3 MB (+32%) | clustering + 16 KB pages, zstd bodies (schema 2), shared bodies (267241) |
| lane-lexicon 20261011.4 | 52.7 → 18.1 MB (-66%) | 8.6 → 12.2 MB (+42%) | clustering + 16 KB pages, zstd bodies (schema 2), shared bodies (5675) |
| oewn-2025 20261011.2 | 57.4 → 27.4 MB (-52%) | 9.4 → 14.6 MB (+56%) | clustering + 16 KB pages, zstd bodies (schema 2), shared bodies (2) |
| salmone-1889 20261011.4 | 10.5 → 7.1 MB (-32%) | 2.1 → 3.0 MB (+41%) | clustering + 16 KB pages, zstd bodies (schema 2), shared bodies (5608) |
| wiktionary-ar-en 20261011.3 | 161.9 → 16.9 MB (-90%) | 11.0 → 13.1 MB (+19%) | templates, clustering + 16 KB pages, zstd bodies (schema 2), shared bodies (17) |
| wiktionary-en 20261011.5 | 655.8 → 232.9 MB (-64%) | 108.4 → 131.4 MB (+21%) | templates, clustering + 16 KB pages, zstd bodies (schema 2), shared bodies (30621) |
| wiktionary-en-ar 20261011.5 | 8.3 → 3.8 MB (-54%) | 1.7 → 2.2 MB (+31%) | clustering + 16 KB pages, zstd bodies (schema 2), shared bodies (7) |
| wiktionary-en-fr 20261011.5 | 22.2 → 10.8 MB (-51%) | 5.1 → 6.5 MB (+26%) | clustering + 16 KB pages, zstd bodies (schema 2), shared bodies (82) |
| wiktionary-en-ja 20261011.4 | 12.9 → 6.6 MB (-49%) | 3.0 → 4.0 MB (+32%) | clustering + 16 KB pages, zstd bodies (schema 2), shared bodies (26) |
| wiktionary-en-zh 20261011.4 | 17.9 → 9.7 MB (-46%) | 4.3 → 5.8 MB (+37%) | clustering + 16 KB pages, zstd bodies (schema 2), shared bodies (39) |
| wiktionary-fr-ar 20261011.4 | 6.6 → 2.9 MB (-57%) | 1.0 → 1.5 MB (+49%) | templates, clustering + 16 KB pages, zstd bodies (schema 2), shared bodies (16) |
| wiktionary-fr-en 20261011.7 | 178.8 → 42.3 MB (-76%) | 19.1 → 18.3 MB (-4%) | templates, clustering + 16 KB pages, zstd bodies (schema 2), shared bodies (834) |
| wiktionnaire-fr 20261011.4 | 992.9 → 317.7 MB (-68%) | 124.7 → 134.3 MB (+8%) | templates, clustering + 16 KB pages, zstd bodies (schema 2), shared bodies (44681) |
| wiktionnaire-fr-ar 20261011.4 | 5.8 → 2.9 MB (-51%) | 1.3 → 1.8 MB (+32%) | clustering + 16 KB pages, zstd bodies (schema 2), shared bodies (63) |
| **Total** | 2489.6 → 831.4 MB | 341.4 → 402.7 MB | |

Installed size falls by two thirds overall; the download grows by 18%, because zstd frames leave little for the outer `.sqlite.zst` to compress.

### Device timings

`DictionaryStore.suggest()` per typed prefix and `entry()` on the top suggestions, old (published schema 1) → new (schema 2) build of each package, measured with the store bench (`VITE_SMOKE_STORE`, 60 evenly spaced words per package). "First entry" is the first entry opened right after the package opened, including the one-time decoder load; the app starts that load 1.5 s after opening a package, so it is usually done before the first entry is opened. iPhone timings are rounded to 1 ms by WKWebView; the two largest old packages were not copied to the iPhone.

Mid-range Android phone, 2024 (Android 15):

| Package | Suggest p50 · p95 (old → new) | Entry p50 · p95 (old → new) | First entry |
|---|---|---|---|
| awn4-en-ar | 3.1 · 7.7 → 2.6 · 4.7 | 1.9 · 4.5 → 1.8 · 3.0 | 126 |
| cc-cedict | 4.5 · 10 → 6.3 · 9.9 | 2.3 · 4.8 → 4.2 · 6.9 | 123 |
| jmdict-en | 5.4 · 12 → 5.4 · 11 | 3.8 · 5.1 → 4.5 · 7.0 | 118 |
| lane-lexicon | 6.1 · 12 → 6.7 · 11 | 3.8 · 5.5 → 4.3 · 6.0 | 134 |
| oewn-2025 | 6.7 · 12 → 6.3 · 11 | 4.6 · 5.3 → 4.9 · 5.4 | 128 |
| salmone-1889 | 12 · 21 → 11 · 19 | 9.1 · 10 → 9.2 · 11 | 91 |
| wiktionary-ar-en | 14 · 24 → 12 · 19 | 12 · 22 → 11 · 13 | 195 |
| wiktionary-en | 6.7 · 18 → 8.7 · 15 | 3.0 · 9.7 → 6.1 · 9.1 | 186 |
| wiktionary-en-ar | 5.8 · 17 → 6.7 · 14 | 3.8 · 9.3 → 5.6 · 10 | 79 |
| wiktionary-en-fr | 10 · 21 → 7.8 · 15 | 7.1 · 10 → 5.5 · 9.0 | 184 |
| wiktionary-en-ja | 6.7 · 17 → 11 · 18 | 5.6 · 8.4 → 9.8 · 11 | 131 |
| wiktionary-en-zh | 5.8 · 15 → 6.7 · 14 | 3.6 · 7.3 → 4.9 · 8.0 | 180 |
| wiktionary-fr-ar | 5.2 · 14 → 8.0 · 13 | 3.5 · 8.1 → 6.4 · 10 | 98 |
| wiktionary-fr-en | 11 · 19 → 8.5 · 16 | 6.2 · 9.3 → 6.4 · 9.1 | 202 |
| wiktionnaire-fr | 12 · 20 → 12 · 16 | 5.9 · 9.0 → 8.7 · 11 | 144 |
| wiktionnaire-fr-ar | 7.4 · 15 → 5.8 · 13 | 5.2 · 11 → 4.7 · 9.3 | 78 |

iPhone 13 (iOS 18.7):

| Package | Suggest p50 · p95 (old → new) | Entry p50 · p95 (old → new) | First entry |
|---|---|---|---|
| awn4-en-ar | 1.0 · 1.0 → 0.0 · 1.0 | 0.0 · 1.0 → 0.0 · 1.0 | 18 |
| cc-cedict | 1.0 · 2.0 → 0.0 · 1.0 | 0.0 · 1.0 → 0.0 · 1.0 | 4.0 |
| jmdict-en | 1.0 · 3.0 → 0.0 · 1.0 | 0.0 · 1.0 → 0.0 · 1.0 | 4.0 |
| lane-lexicon | 1.0 · 2.0 → 0.0 · 1.0 | 0.0 · 1.0 → 0.0 · 1.0 | 4.0 |
| oewn-2025 | 0.0 · 1.0 → 0.0 · 1.0 | 0.0 · 1.0 → 0.0 · 1.0 | 3.0 |
| salmone-1889 | 1.0 · 1.0 → 0.0 · 1.0 | 0.0 · 1.0 → 0.0 · 1.0 | 2.0 |
| wiktionary-ar-en | 1.0 · 2.0 → 0.0 · 1.0 | 0.0 · 1.0 → 0.0 · 1.0 | 3.0 |
| wiktionary-en | — → 1.0 · 1.0 | — → 0.0 · 1.0 | 3.0 |
| wiktionary-en-ar | 0.0 · 2.0 → 0.0 · 1.0 | 0.0 · 1.0 → 0.0 · 1.0 | 2.0 |
| wiktionary-en-fr | 1.0 · 2.0 → 0.0 · 1.0 | 0.0 · 1.0 → 0.0 · 1.0 | 3.0 |
| wiktionary-en-ja | 0.0 · 2.0 → 0.0 · 1.0 | 0.0 · 1.0 → 0.0 · 1.0 | 3.0 |
| wiktionary-en-zh | 1.0 · 2.0 → 0.0 · 1.0 | 0.0 · 1.0 → 0.0 · 1.0 | 3.0 |
| wiktionary-fr-ar | 0.0 · 2.0 → 0.0 · 1.0 | 0.0 · 1.0 → 0.0 · 1.0 | 2.0 |
| wiktionary-fr-en | 1.0 · 2.0 → 1.0 · 1.0 | 0.0 · 1.0 → 0.0 · 1.0 | 4.0 |
| wiktionnaire-fr | — → 1.0 · 2.0 | — → 0.0 · 1.0 | 3.0 |
| wiktionnaire-fr-ar | 0.0 · 1.0 → 0.0 · 1.0 | 0.0 · 1.0 → 0.0 · 1.0 | 2.0 |

Mid-range Android phone, 2019 (Kirin 710, Android 10), the slowest test device:

| Package | Suggest p50 · p95 (old → new) | Entry p50 · p95 (old → new) | First entry |
|---|---|---|---|
| awn4-en-ar | 8.0 · 14 → 8.7 · 12 | 6.5 · 7.9 → 7.2 · 9.0 | 178 |
| cc-cedict | 9.4 · 22 → 8.9 · 12 | 6.0 · 7.5 → 7.0 · 9.0 | 123 |
| jmdict-en | 7.5 · 16 → 7.9 · 12 | 5.5 · 6.2 → 6.6 · 8.9 | 126 |
| lane-lexicon | 8.2 · 16 → 8.2 · 12 | 5.8 · 7.0 → 6.5 · 7.9 | 152 |
| oewn-2025 | 7.6 · 12 → 8.2 · 12 | 5.5 · 6.3 → 6.4 · 7.3 | 121 |
| salmone-1889 | 8.2 · 13 → 8.2 · 9.2 | 5.9 · 6.7 → 6.3 · 7.0 | 92 |
| wiktionary-ar-en | 7.1 · 15 → 7.9 · 11 | 6.5 · 7.7 → 6.5 · 7.3 | 150 |
| wiktionary-en | 11 · 16 → 8.1 · 11 | 5.4 · 6.6 → 5.8 · 7.0 | 110 |
| wiktionary-en-ar | 7.0 · 16 → 7.0 · 9.1 | 5.6 · 7.0 → 6.1 · 7.1 | 78 |
| wiktionary-en-fr | 7.7 · 17 → 8.3 · 11 | 5.4 · 6.1 → 6.3 · 7.1 | 120 |
| wiktionary-en-ja | 7.2 · 15 → 7.5 · 11 | 5.6 · 6.6 → 6.4 · 6.9 | 124 |
| wiktionary-en-zh | 7.3 · 16 → 7.7 · 11 | 5.5 · 6.0 → 6.4 · 7.2 | 119 |
| wiktionary-fr-ar | 8.2 · 14 → 8.0 · 9.5 | 5.9 · 6.6 → 6.4 · 7.4 | 74 |
| wiktionary-fr-en | 9.2 · 16 → 9.2 · 12 | 5.5 · 6.4 → 6.4 · 7.2 | 135 |
| wiktionnaire-fr | 9.8 · 16 → 8.7 · 11 | 5.3 · 6.1 → 5.7 · 6.6 | 109 |
| wiktionnaire-fr-ar | 6.4 · 10 → 6.4 · 8.5 | 5.4 · 6.5 → 5.6 · 6.5 | 62 |

Suggestions are as fast or faster after compaction (p95 lower on every package on the 2019 phone: clustered rows put one prefix on a few pages). Opening an entry costs 0–2 ms more at p50 on Android to decode its body (4 ms on wiktionary-en-ja on the 2024 phone, whose timings were noisier), and nothing measurable on the iPhone. Decoding in the WebView is the same code everywhere; desktop Node measures 23 µs per body with WebAssembly and 97 µs with the JavaScript fallback.
