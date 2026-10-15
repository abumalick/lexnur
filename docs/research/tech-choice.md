# App technology choice

Lexnur must run on Android, iOS and the web, ideally from one codebase. The website can ship after the apps, but the technology is chosen now. This document compares three stacks, measures the property that could rule one out (instant prefix search over a large SQLite package), and recommends one.

Evidence tags follow `ux.md`: **[source]** is a page, issue or registry entry checked for this document; **[measured]** is a proof run for this document (method in the appendix); **[general]** is background knowledge that was not re-verified. Versions are as of 2026-10-10.

Options:

- **A. Capacitor + a web framework.** One TypeScript UI for web, Android and iOS, running in the system WebView, with native plugins for SQLite, downloads and decompression.
- **B. Kotlin/Compose Multiplatform (CMP)** for Android and iOS, and Compose for Web (Kotlin/Wasm) for the website.
- **C. KMP/CMP for mobile + a separate light web app** (the existing Astro site, plus TypeScript where the web needs it). Only the data contract and the normalization rules are shared.

## Summary

- **The latency target is met by every serious path.** On a 2019 mid-range phone (HiSilicon Kirin 710, Android 10), a prefix query over 1.07 M rows in a 479 MB package takes:
  - 0.25 ms p50 with native SQLite;
  - 8 ms p50 and 10 ms p95 through Capacitor's bridge;
  - 4 ms p50 and 9–12 ms p95 with SQLite-Wasm in Chrome.

  The 50 ms budget is never threatened, except by one browser storage mode (`opfs` VFS, 32 ms p50) that we would not use.
- **B is out for the web.** Compose for Web draws everything into a canvas. It cannot be indexed by search engines, has no server rendering, is still Beta, and costs about 4.4 MB gzipped before fonts. A dictionary site that lives on search traffic cannot be built on it, so B's website collapses into C's. The real choice is **A vs C**.
- **In-browser SQLite is the same in A and C.** Both use official sqlite-wasm with the `opfs-sahpool` VFS (or wa-sqlite) in a Worker. The web layer of the Capacitor SQLite plugin loads the whole database into memory and cannot hold a 500 MB package. So A is "one UI codebase over two storage drivers", not one SQLite layer everywhere.
- **Recommendation: A, Capacitor + Svelte, with C as the fallback.** A one-person team gets one UI, one language and one normalizer across all three platforms. iOS text input runs on WebKit's native editor, where CMP still has open Arabic RTL input bugs. The cost is a handful of small native plugins and the work to make a WebView app feel native.
- **Two questions could flip this and are not answered by evidence here** (see [Open questions](#open-questions)):
  - why an earlier dictionary app moved from React Native to KMP;
  - whether the v1 website must search offline or only serve SEO pages.

  Neither stack has been run on iOS for this document. The next proof is iOS.

## Proof: prefix search latency on a mid-range Android phone

**Setup:**

- **Device:** a 2019 mid-range Android phone, HiSilicon Kirin 710, 3.7 GB RAM, Android 10. Android System WebView 153, Chrome 154.
- **Package:** a SQLite file with the `docs/CATALOG.md` schema, built from the real Kaikki English Wiktionary dump: 1,000,000 English entries and 70,000 Arabic entries, average `body` of 294 bytes, **479 MB**.
- **Query:** the catalog's prefix range scan, returning the four columns a suggestion row shows, `LIMIT 30`.
- **Workload:** 180 words typed one character at a time, **1,286 queries**:
  - 20 common English words;
  - 130 random English lemmas;
  - 30 random Arabic keys.

  This includes the one- and two-letter prefixes where the range is widest.
- **Timing:** each time is the full round trip seen by the caller, including row materialisation and, for web, the Worker `postMessage` hop.

| Path | p50 | p95 | p99 | max | > 16 ms | > 50 ms |
|---|---|---|---|---|---|---|
| Native, `androidx.sqlite` bundled driver (what C would use) | 0.25 ms | 0.42–0.46 ms | 0.58–0.80 ms | 1.0–1.1 ms | 0 | 0 |
| Native, Android framework SQLite | 0.72–0.77 ms | 1.2–1.4 ms | 2.4–2.5 ms | 5.2–7.2 ms | 0 | 0 |
| Capacitor bridge only: plugin returning 30 fixed rows | 5.4–5.9 ms | 7.2–7.3 ms | 8.5–8.7 ms | 22.7–22.9 ms | 6–7 | 0 |
| **Capacitor + `@capacitor-community/sqlite` 8.1.1 (what A would use)** | **8.0–8.3 ms** | **10.1–10.2 ms** | 11.4–12.1 ms | 17.6–26.7 ms | 1–2 | 0 |
| **Chrome, sqlite-wasm 3.53.4, `opfs-sahpool` VFS (web in A and C)** | **3.6–4.1 ms** | **8.8–11.6 ms** | 14.0–17.5 ms | 35.6–50.2 ms | 9–17 | 0–1 |
| Chrome, sqlite-wasm 3.53.4, `opfs` VFS (needs COOP/COEP) | 31.7 ms | 76.0 ms | 94.7 ms | 148.8 ms | 1,263 | 288 |

Ranges are two runs on the device **[measured]**. Cold first query, on a fresh process with the OS page cache already warm:

- native: 5–14 ms;
- Capacitor plugin: 18–24 ms (the first bridge call costs 18–51 ms);
- web `opfs-sahpool`: 111 ms, which includes worker start and Wasm init.

What the numbers say:

- **The bridge, not SQLite, is Capacitor's cost.** About 5.5 ms per call is fixed; the plugin adds about 2.5 ms of JSON conversion on top. It is roughly 30× native but still a fifth of the budget.
- **"All dictionaries" scope multiplies the bridge cost** if every package is queried by a separate call. Querying three packages in one native call (a small custom plugin method, or `ATTACH` and `UNION ALL`) keeps it to one bridge crossing. This is a design choice, not a ceiling.
- **Debug logging matters.** With Capacitor's default debug logging, every plugin result is printed to the console. That raised the plugin's p50 to 10.6 ms and its p95 to 15.2 ms. Release builds must set `loggingBehavior: "none"` (the measured rows above do).
- **On the web, the VFS choice is decisive.** `opfs-sahpool` is about 8× faster than `opfs` and needs no COOP/COEP headers. Its limits:
  - it allows only one connection, so two open tabs need coordination;
  - its files are stored under VFS-managed names.
- **Importing a package into the browser works.** It streamed into OPFS with `importDb` (the file is never held in memory) at about 18 MB/s, 26 s for 479 MB over `adb reverse`. That is transport-bound, so real downloads will be network-bound.
  - Chrome reported a quota of 11.7 GB with about 0.96 GB used.
  - `navigator.storage.persist()` returned `false` for a plain tab, so a browser can evict the data unless the site is installed or has enough engagement.

Not measured:

- **iOS, for either stack.** WKWebView bridge latency, Safari OPFS read speed, and CMP's iOS text field are all untested.
- **A truly cold page cache.** Dropping caches needs root.
- **Compose for Web.** It was not built; it is excluded on the SEO grounds above.

### Compression (orchestrator criterion)

Same 479 MB package **[measured]**:

| Codec | Size | vs gzip -9 | Decompress, 1 core, x86 desktop |
|---|---|---|---|
| gzip -9 | 127.3 MB | — | 1.71 s |
| zstd -19 (8 MiB window) | **93.6 MB** | **−26 %** | 0.34 s |

A second sample, a 580 MB WikDict SQLite file, gave −22 % for zstd -19 against gzip -9. `zstd --long` saved a further 6 % but needs a 128 MiB window **[measured by research agent]**.

| Stack | gzip | zstd |
|---|---|---|
| Browser / any WebView | `DecompressionStream('gzip')`: Chrome 80, Safari/iOS 16.4, Android WebView 80 **[source: MDN BCD 8.1.5]** | **No browser decodes zstd with `DecompressionStream`** (Firefox only behind a flag) **[source: MDN BCD]**. Use `fzstd` (8 kB, streaming, windows up to 32 MB, so plain `-19` but not `--long`) **[source: github.com/101arrowz/fzstd]** |
| Android native | `java.util.zip.GZIPInputStream` | `zstd-jni` or Square `zstd-kmp` |
| iOS native | zlib (system `libz`) | Apple's Compression framework has no zstd **[general]**. Square `zstd-kmp` 0.4.0 bundles libzstd for iOS **[source: research notes, Maven Central artifacts]** |
| A (Capacitor) | Native everywhere | **No Capacitor zstd plugin exists** **[source: npm search]**. Needs a custom plugin (zstd-jni on Android, vendored libzstd on iOS). Decoding 500 MB in the WebView with fzstd would push every byte through JS, so it is not a good mobile option |
| C (KMP) | Native everywhere | `zstd-kmp` on both mobile platforms with Okio streaming; `fzstd` on the web |

**Conclusion:** zstd saves a quarter of every download and decodes about 5× faster, and every stack can decode it. In A it costs one small custom native plugin; in C it is a library dependency. On the web it costs an 8 kB library. fzstd's speed on a phone over a 500 MB stream is unmeasured; if it disappoints, the web can fetch a gzip variant of the same package instead.

**Hosting note:** packages must be stored on R2 as opaque files (`application/zstd` or `application/octet-stream`) with **no `Content-Encoding` header**. Otherwise the edge may decode them on the fly, which breaks Range resume **[source: community.cloudflare.com/t/426127, anecdotal]**. `docs/HOSTING.md` already uploads them that way; check it with `curl -r` once a package is up.

## Comparison

| Criterion | A. Capacitor + Svelte | B. CMP + Compose for Web | C. CMP mobile + light web |
|---|---|---|---|
| **Prefix latency, mobile** | 8 / 10 ms p50/p95 through the bridge **[measured]** | 0.25 / 0.45 ms native **[measured]** | Same as B |
| **SQLite, mobile** | `@capacitor-community/sqlite` opens a downloaded file read-only in place (`createNCConnection`) **[source]**. Always links SQLCipher: about 2 MB per ABI, and export-compliance paperwork **[source]**. Alternatives: a ~300-line custom read-only plugin, or `@capgo/capacitor-fast-sql` (vendor claims only) | `androidx.sqlite` bundled driver on both platforms, as in the spec | Same as B |
| **SQLite, web** | sqlite-wasm `opfs-sahpool` in a Worker: 4 / 9–12 ms **[measured]**. The plugin's own web layer (jeep-sqlite: sql.js in memory plus IndexedDB, last release Aug 2024) cannot hold 500 MB **[source]** | androidx.sqlite 2.7 has a `WebWorkerSQLiteDriver` but no default worker; you write it yourself over sqlite-wasm **[source]**. Young | Same sqlite-wasm path as A, written in TS |
| **Browser storage** | Safari 17+: up to 60 % of disk per origin, home-screen apps included; `persist()` granted by heuristics, without a prompt; the 7-day ITP wipe exempts home-screen apps. Whether OPFS is evicted with the origin is unverified **[source: webkit.org/blog/14403, /10218]**. Chrome: `persist()` was `false` for a plain tab **[measured]**. The same applies to A, B and C on the web. Inside the Capacitor app, packages live in the app sandbox, outside WebKit's eviction | Same | Same |
| **Resumable / background downloads** | `@capacitor/file-transfer` gives progress but no resume. Capawesome's plugin does iOS background `URLSession` + Android foreground service with Range resume, but is paid. Capgo's downloader is "not production-ready" **[source]**. Realistically a custom plugin, about 200 lines per platform | Ktor + Range in common code. Background work needs expect/actual (`URLSession` background config; WorkManager). The KMP libraries for this are young **[source]** | Same as B on mobile. Web: Range fetch into OPFS while the page is open. Background Fetch is Chrome-only **[source]** |
| **Decompression** | gzip native; zstd needs a custom plugin | zstd-kmp on mobile; fzstd on web | zstd-kmp on mobile; fzstd on web |
| **Arabic shaping / RTL layout** | HarfBuzz (Chromium) and CoreText (WebKit), as native. `dir="rtl"` plus logical CSS properties **[general]** | Skia. Several bidi/Arabic issues are still open, e.g. CMP-9221 (fathatan in bidi text), CMP-2772 (cursor direction with Arabic digits) **[source]** | Same as B on mobile |
| **Arabic IME, iOS** | WebKit's native text editing. Drive search from `input` events, never rewrite `value` mid-composition (Gboard sends keyCode 229) **[source: W3C editing TF, MDN]** | **Open:** CMP-10601 (RTL caret and punctuation jump while typing, Jul 2026, also in native-input mode), CMP-9956 (RTL input leftovers). Native text input is still experimental (CMP-10598) **[source]** | Same as B on mobile |
| **Screen readers** | TalkBack and VoiceOver read the WebView's accessibility tree. Good with semantic HTML; virtualised lists hide off-screen rows **[general]** | Android: Jetpack Compose, first class. iOS: VoiceOver works, with several open semantics issues (CMP-10207, CMP-9055) **[source]**. Web: hidden DOM tree behind the canvas; VoiceOver + TextField issue CMP-8634 open **[source]** | Android/iOS as B; web is plain HTML, first class |
| **Font scaling** | Android WebView follows the system font scale automatically. iOS WKWebView does **not** follow Dynamic Type: use `-apple-system-body` sizing or `@capacitor/text-zoom` **[source]** | Android native; iOS Dynamic Type maps to `fontScale`, with live updates fixed Jun 2026 **[source]** | Same as B |
| **Native feel** | Good scrolling (WKWebView rubber-band, Chromium overscroll). No native navigation stack: iOS swipe-back needs a JS gesture (`@capgo/capacitor-transitions`) and Android predictive-back has no preview animation **[source / general]**. Edge-to-edge settled only in Capacitor 8.3–8.4 **[source]** | Material 3 on Android is native. iOS is Skia-drawn Material, not UIKit; scrolling is close but open issues remain (CMP-9779, CMP-10873) **[source]** | Same as B |
| **Web: SEO for per-word pages** | Server-render `/word/<lang>/<slug>` on Cloudflare Workers (SvelteKit `adapter-cloudflare` or Astro), reading entries from D1 and caching at the edge. The entry and search components are shared with the app **[general]** | **None.** Canvas only, no SSR. JetBrains points SEO and content sites to HTML (CMP-4630, kotlinlang web overview) **[source]** | Server-rendered pages in Astro/TS; the entry renderer is written a second time, in TS |
| **Web: bundle size** | Svelte or Solid app: well under 100 kB gzipped; sqlite-wasm adds 869 kB of wasm (403 kB gzipped) plus a ~216 kB worker, loaded only by the offline search **[measured build]** | ≈ 4.4 MB gzipped (skiko 3.3 MB) before fonts; needs Safari 18.2+ (WasmGC) **[source]** | Same as A for the site; Kotlin/JS normalizer adds tens of kB **[source, estimate]** |
| **Web: PWA offline install** | The same app shell becomes the PWA; packages in OPFS. iOS 26 opens every home-screen site as a web app; no install prompt; no background download on iOS **[source]** | Possible, but a canvas app of 4+ MB | Possible only if the light web app grows its own offline search UI, which is a second app |
| **Store screenshots** | fastlane `snapshot`/`screengrab` work with any native shell. Recorded XCUITests cannot see into the WebView, but hand-written queries can (`app.webViews…`), and Espresso-Web drives WebViews. Simplest: a deep-link "screenshot mode" and only the capture calls **[source]** | `snapshot` sees CMP through `testTag` → `accessibilityIdentifier`; `screengrab` coexists with Compose tests **[source]** | Same as B |
| **fastlane** | `gym`, `supply`, `deliver`, `match` are binary-agnostic **[general]**. The lanes of an earlier KMP dictionary app carry over | Those lanes carry over | Same as B |
| **App Review 4.2** | Low to moderate risk. Rejections we found concern remote, link-out content, not WebViews as such. Mitigations: bundled UI, works in airplane mode, size prompt before downloading (guideline 4.2.3(ii), already in the spec), app chrome distinct from the website, review notes plus an airplane-mode video **[source]** | None | None |
| **Live updates** | Optional OTA for JS fixes (Capgo, self-hostable). Apple allows bug fixes, not new features **[source]** | No | No |
| **Pipeline / core language** | **TypeScript.** One normalizer module imported by the app, the website and a Node pipeline. Or keep a Python pipeline with shared test vectors, which gives up `CATALOG.md`'s "one source of truth" | Kotlin/JVM pipeline + shared Kotlin `core`, as planned | Kotlin `core` + Kotlin/JVM pipeline; the web imports the same core compiled to JS (`@JsExport`) or ports it with shared test vectors |
| **Languages / UI codebases** | 1 language, 1 UI, plus small native plugins (Kotlin/Swift) | 1 language, 1 UI, but the website is unusable for SEO | 2 languages, 2 UIs (CMP app; Astro/TS site, plus an offline web app if wanted) |

## Native code each option still needs

"One TypeScript codebase" is accurate only with this list beside it.

| Concern | A (Capacitor) | C (KMP) |
|---|---|---|
| Read-only SQLite | Community plugin (SQLCipher overhead), or a custom plugin: open, query, `ATTACH` for "All dictionaries" | `androidx.sqlite` bundled driver (exists) |
| zstd | Custom plugin (zstd-jni + vendored libzstd), or accept gzip | `zstd-kmp` (exists) |
| Background, resumable download | Custom plugin per platform, or Capawesome (paid) | expect/actual around `URLSession` background + WorkManager |
| Free-space check, sha256, atomic rename | `@capacitor/filesystem` covers file moves; sha256 and free space need a small plugin method | Common code + small actuals |
| Dynamic Type, swipe-back | `@capacitor/text-zoom`; a transitions plugin or a hand-written gesture | Built in |

In practice A means one in-repo Capacitor plugin, "LexnurNative", with a Kotlin half and a Swift half. It would cover download (with resume and background), zstd, sha256, free space and SQLite query. That is a few hundred lines per platform, written once and rarely changed. It replaces most third-party plugins and removes the SQLCipher dependency, and its query API is shaped for one bridge call per keystroke.

## What earlier KMP code would be lost

- **Code:** the earlier KMP dictionary app is about 700 lines of Kotlin:
  - SQLite opening per platform;
  - a search screen;
  - a reading screen.

  Its Arabic normalizer strips only tashkīl and tatweel; it does not fold alef forms, ى or ة, which Lexnur's catalog requires. Under A, the code lost is small and mostly would have been rewritten anyway.
- **What carries over in any stack:**
  - the fastlane lanes (`supply`, `deliver`, iOS archive/export with the App Store Connect API key);
  - the `justfile` recipes;
  - the store metadata layout;
  - the screenshot scripts. Android drives headless emulators with uiautomator + `screencap`, and Chromium exposes WebView content to uiautomator. The iOS XCUITest target can query `app.webViews`. Both should mostly survive, but this is not verified.
- **History:** that app itself moved from React Native to KMP (its installer still removes the React Native copy of the database).

## Risks

**A (Capacitor):**

1. **iOS bridge latency and Arabic input are unmeasured.** WKWebView's message bridge is usually faster than Android's, but that is not shown here **[general]**.
2. **Native feel needs deliberate work.** Swipe-back, transitions and keyboard handling come from plugins or hand-written code, not the platform.
3. **App Review 4.2:** a template rejection is possible. Mitigations are listed above.
4. **The in-repo native plugin is the critical path** for downloads, and it is real Swift and Kotlin code to maintain.
5. **Capacitor's yearly major versions** (8.0 Dec 2025, 9.0 in alpha) mean an upgrade chore each year **[source]**.

**C (KMP):**

1. **Arabic RTL input on iOS has open CMP bugs** (CMP-10601, CMP-9956) in exactly the field the app lives in.
2. **The web needs a second UI codebase in a second language.** It is a few SEO templates if the web only serves word pages, but a whole second app if the web must search offline.
3. **Kotlin/JS export of the normalizer** adds a build step and tens of kB. Porting it to TS with shared test vectors is the alternative, and that brings back a drift risk.

**Both (web):**

1. Whether Safari evicts OPFS together with the rest of the origin's data is unverified.
2. `persist()` was not granted to a plain tab.
3. iOS has no background download. Treat offline web as best effort: the site must say so and survive eviction by re-downloading.

## Recommendation

**Choose A: Capacitor + Svelte**, with a TypeScript `core` (normalizer, `body` types, catalog types) shared by the app, the website and a TypeScript pipeline, plus one in-repo native plugin for SQLite, download and zstd.

Reasoning, from the constraints that discriminate:

1. **Latency does not discriminate.** The bridge leaves 5× headroom on the slowest device we have, with one bridge call per keystroke.
2. **Web SQLite does not discriminate.** It is the same sqlite-wasm OPFS solution in A and C, and it measured fast. A reuses the app's search UI on top of it; C would build that UI again.
3. **One codebase is the stated goal**, and only A meets it for all three platforms. B fails it on the web, where it matters most for growth. C pays for the web in a second language and a second UI, with a normalizer that must be shared by compilation or by test vectors.
4. **Arabic text input on iOS** is where a dictionary app spends its time. On paper WebKit's native editor beats CMP's Skia text field, which has open RTL input bugs. This is the claim the next proof must confirm.
5. **What A costs is bounded and paid once:**
   - one native plugin of a few hundred lines per platform;
   - the native-feel work;
   - the 4.2 mitigations.

   What C costs grows with the website: every web feature is built twice.

Stack details to settle in the implementation plan, not here:

- **Framework:** Svelte 5, for a small runtime and one framework covering the SPA build, server rendering and Cloudflare.
- **Website:** SvelteKit server rendering on Workers with D1, or the existing Astro site with Svelte islands for word pages.
- **Mobile UI:** Konsta UI or plain CSS.
- **Pipeline:** TypeScript on Node. The Python proof builder read the Kaikki dump until it had 1.07 M English and Arabic entries in about 90 seconds, so pipeline speed is not a constraint in any language.

**Choose C instead if** either of these holds:

- The reason that earlier app left React Native also applies to a WebView app (for example, native feel on iOS mattered more than code sharing).
- The website is an SEO site only, with no offline search, for the foreseeable future. Then C's web is a few templates, and the benefit of one UI codebase shrinks to the mobile apps.

**Next proof, before any app code:** the same benchmark on an iPhone, built on the Mac:

- the WKWebView bridge timing;
- an Arabic search field under the Arabic keyboard, with composition, caret and diacritics;
- VoiceOver on the suggestion list;
- Dynamic Type at 200 %.

If C is chosen instead, the same checks apply to a CMP `TextField` in both default and native-input modes.

**Documents to update once the choice is confirmed:**

- the spec (§3 stack and units);
- `docs/CATALOG.md` ("shared Kotlin `core` module" becomes a TypeScript `core`);
- `AGENTS.md` (`app/` description).

None of these are changed by this document.

## Open questions

1. Why did the earlier dictionary app move from React Native to KMP? Does that reason apply to a Capacitor/WebView app?
2. Must the v1 website (when it ships) search offline in the browser, or is it per-word SEO pages first?
3. Is a TypeScript pipeline acceptable, replacing the planned Kotlin/JVM pipeline? The alternative under A is a Python pipeline checked against shared test vectors.
4. Is the paid Capawesome file-transfer plugin acceptable, or should downloads be in-repo native code (recommended)?

## Appendix: proof method

The proof code was throwaway: it lived in the worktree's git-ignored `.tmp/` and is not committed. This appendix is enough to rebuild it.

**Package.** One pass over `sources/kaikki-enwiktionary/raw-wiktextract-data.jsonl.gz`:

- rows: the first 1,000,000 `lang_code == "en"` entries and the first 70,000 `lang_code == "ar"` entries;
- `search_key` follows `CATALOG.md` normalization;
- `body` is JSON of senses (up to 12, each with glosses and up to 3 examples), up to 20 forms and the etymology;
- `gloss` is the first gloss, cut to 200 characters;
- `sort_order` is 1 for form-of entries, otherwise 0;
- `CREATE INDEX entry_key ON entry(search_key, sort_order)`, then `VACUUM`;
- page size 4096; result 478,646,272 bytes, 1,070,000 rows.

**Query:**

```sql
SELECT id, headword, pos, gloss FROM entry
WHERE search_key >= ?1 AND search_key < ?1 || char(1114111)
ORDER BY search_key, sort_order LIMIT 30
```

**Workload.** The word list was drawn with `random.seed(42)`:

- 20 fixed common English words;
- 130 random lemmas: `sort_order = 0`, 4–10 letters, `[a-z]` only;
- 30 random Arabic keys of 3–7 letters.

Each word was typed prefix by prefix (1,286 queries). The cold query is `'w'`.

**Apps and versions:**

- **Capacitor app:**
  - Capacitor 8.5.3, `@capacitor-community/sqlite` 8.1.1, Vite 8.3.4, debug APK;
  - `loggingBehavior: "none"`;
  - the package was copied to the app's `files/` directory and opened with `createNCConnection` (read-only).
- **Bridge baseline:** a local plugin method returning 30 fixed rows of the same shape.
- **Native baselines:** run in the same app on a background thread, timed with `System.nanoTime`:
  - `android.database.sqlite.SQLiteDatabase` (read-only);
  - `androidx.sqlite:sqlite-bundled:2.7.1`.
- **Web:**
  - `@sqlite.org/sqlite-wasm` 3.53.4-build2 in a module Worker;
  - Vite dev server with COOP/COEP headers, reached in Chrome on the device through `adb reverse`;
  - `opfs-sahpool`: `installOpfsSAHPoolVfs` + `importDb` with a streaming chunk callback;
  - `opfs`: the file was written with `createWritable` and opened with `OpfsDb(…, 'r')`.
- **Compression:** `zstd -19 -T8` (1.5.x) and `gzip -9`, timed with `zstd -dc` / `gzip -dc` to `/dev/null`.
