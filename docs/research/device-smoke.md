# Device smoke run

Measures read-only SQLite on a large package, search latency and Dynamic Type on iOS, using the smoke build (`VITE_SMOKE=1`, `app/src/smoke/Smoke.svelte`).

## Benchmark database

`app/scripts/bench-db.ts` builds `app/build/bench/bench.sqlite` from the published packages: the Wiktionary English package (`20261010.1`, 1,468,372 entries) with the Wiktionary Arabic-English entries (`20261011.1`, 35,559 entries) appended, so both scripts are present. Result: 1,503,931 entries, 820,047,872 bytes, `journal_mode=DELETE`, indexes `entry_key` and `entry_root`.

The `bench_word` table holds 180 words (1,260 typed prefixes): 20 common words, 130 English lemmas (`/^[a-z]{4,10}$/`, `sort_order = 0`) and 30 Arabic search keys of 3-7 characters, drawn with `mulberry32(42)`. The list is committed as `app/src/smoke/bench-words.json`.

## Results

Smoke build (`VITE_SMOKE=1`), 180 words = 1,260 prefixes, `@capacitor-community/sqlite` over the 820 MB bench database.

| Device | OS / WebView | readOnly | cold open | single p50 / p95 / p99 / max (ms) | triple p50 / p95 / p99 / max (ms) | triple p95 < 50 ms | Arabic typing | 200 % text |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Android phone, Kirin 710 (2019) | Android 10, WebView 153.0.8010.36 | rejected | 8.3 ms (33.5 ms on the first run after install) | 6.8 / 9.4 / 11.2 / 23.6 | 12.4 / 15.4 / 16.8 / 32.7 | yes | `كتب` typed through UnicodeIME: 8 results, first `كَتَبَ`, 3.5 ms | not 200 %: root font-size 16px at `font_scale` 1.0 becomes 23.2px at 2.0 (x1.45), input 17px to 24.65px; nothing clipped |
| iPhone 17 Pro Max simulator (not representative) | iOS 26.5 | rejected | 20 ms | 2 / 9 / 15 / 61 (timer resolution 1 ms) | 2 / 3 / 3 / 5 | yes | not run | `TextZoom` 1 at `large`, 3.12 at `accessibility-extra-extra-extra-large`: text about 3x, nothing clipped except the smoke page's long debug path, which overflows at every size; diacritics not exercised (no Arabic text on the smoke page) |
| iPad Pro 13-inch (M5) simulator (not representative) | iOS 26.5 | rejected | 7 ms | 1 / 4 / 6 / 8 | 1 / 3 / 5 / 15 | yes | not run | not run; universal layout renders without overflow |
| iPhone 13 (physical) | iOS 18.7 (WKWebView) | rejected | 11 ms | 1 / 3 / 5 / 67 (timer resolution 1 ms) | 1 / 4 / 4 / 6 | yes | R1 passed (user) | not run on the device (Dynamic Type measured on the simulator only) |

Notes:

- `readOnlyError` on Android: `Error: Query: in selectSQL cursor attempt to write a readonly database (code 8)`. SQLite itself rejects the write.
- The Android phone figures above are the second run (warm file cache). The first run after install measured single 8.4 / 16.7 / 39.5 / 141.7 and triple 13.5 / 15.6 / 17.2 / 29.2.
- The Android phone's per-keystroke cost with three calls per prefix (one per dictionary) stays far below the 50 ms budget.
- Text scale (measured through the WebView DevTools `getComputedStyle` at `font_scale` 1.0 and 2.0, devicePixelRatio 1.75): root, body and paragraph font-size 16px to 23.2px, input 17px to 24.65px, a factor of 1.45 instead of 2. The Configuration fontScale on this device is capped at 1.45 by EMUI when the setting is 2.0, and the WebView follows that Configuration exactly, so the app honours whatever scale the OS gives. 200 % could not be reached on this device (see v1 acceptance). The iOS Dynamic Type run is separate.
- iOS `readOnlyError` (both simulators): `Error: Query: Failed in selectSQL : Error: querySQL finalize failed rc: 8 message: attempt to write a readonly database`. SQLite rejects the write and the plugin surfaces it.
- Simulator latency runs on the host Mac's CPU and file cache and `performance.now()` is rounded to 1 ms in WKWebView, so these figures only show there is no gross problem; the physical iPhone rows remain the reference.
- `TextZoom.getPreferred()` follows Dynamic Type on iOS: 1 at `large`, 3.1176 (53 pt / 17 pt body) at `accessibility-extra-extra-extra-large`. At that size the smoke page text wraps and grows about 3x; the page has no clipping, only a long unbreakable debug path overflowing horizontally. The root font size can be driven from `TextZoom` on iOS.
- At the maximum Dynamic Type size the iPhone simulator's triple run had one sample over 50 ms (max 81 ms) out of 1,260, with p95 10 ms (simulator, not representative).

## Native install

Test package: the 820,047,872-byte bench database compressed with `zstd -3` (166,644,638 bytes), served over HTTP by `app/scripts/range-server.ts` through `adb reverse`. Android build: debug APK (cleartext allowed in the debug variant only).

### Android — phone with Kirin 710 (API 29)

| Scenario | Result | Resume offset |
|---|---|---|
| Force-stop at 15 s into a 3 MB/s download, relaunch | `.part` held 39,649,280 bytes after the kill; second request was `Range: bytes=39649280-`; `t1.sqlite` is exactly 820,047,872 bytes, no `.part`/`.zst`/`.tmp` left; states `queued → downloading → verifying → installing → done` | 39,649,280 |
| Force-stop while `installing` (`t1.sqlite.tmp` 139 MB, verified `.zst` present), relaunch | `t1.sqlite` complete at 820,047,872 bytes, `.tmp` and `.zst` gone, no new HTTP request in the server log | none (no request) |
| Server drops the connection at ~30 MB | `waiting_network`, then about 11 s later `Range: bytes=29949952-`; install completed | 29,949,952 |
| `pauseInstall` at 30 %, `resumeInstall` after 5 s | paused at 50,855,936 bytes; resumed with `Range: bytes=51380224-`; completed | 51,380,224 |
| `allowCellular: false`, Wi-Fi on (unmetered) | `queued`, then downloads | n/a |
| `allowCellular: false`, Wi-Fi switched off | `waiting_wifi`; back to `downloading` after Wi-Fi returns | n/a |
| Foreground notification during a download | `dumpsys notification` shows channel `lexnur-downloads`, id 4201, foreground-service and ongoing flags, `stat_sys_download` icon | n/a |

### Android emulator (API 36, x86_64, headless; Wi-Fi disabled so only the metered cellular network remains)

| Scenario | Result |
|---|---|
| `allowCellular: false` on a metered network | `waiting_wifi`, no request reached the server |
| `allowCellular: true` on a metered network | `queued → downloading → verifying → installing → done` |

The phone and the emulator have no SIM, so the metered case was only reachable on the emulator.

### iOS simulator (iPhone 17 Pro Max, iOS 26.5; not representative of a physical iPhone)

Same test package (166,644,638 bytes, `zstd -3`), served by the CDN at `dl.lexnur.com` (a temporary object, removed afterwards) through the background `URLSession`, debug build with the install probe. The app process was ended with `kill -9` on its simulator PID (`launchctl list` inside the simulator), not `simctl terminate`, which may behave like a user force-quit. The CDN gives no request log, so resume offsets are the `bytesDownloaded` values in `install-log.json`.

| Scenario | Result | Resume offset |
|---|---|---|
| `pauseInstall` at 30 %, `resumeInstall` after 5 s | paused at 50,682,196 bytes, first event after the resume 57,562,952; the count never decreased; completed | 50,682,196 |
| Process killed at 17,432,342 bytes, relaunched about 60 s later | the background session kept downloading while the process was dead: first event after relaunch already at 155,007,737 bytes (the probe paused it again, then resumed from 155,009,097); no event below the pre-kill count; ended `verifying → installing → done` with `t1.sqlite` at 820,047,872 bytes and no `.part`, `.zst` or `.tmp` | 155,007,737 |
| Process killed at 14.0 MB and left dead until the download finished | the system relaunched the app in the background and the log showed `installing` at 166,644,638 bytes (deferred, nothing verified or decompressed); after the app was brought to the foreground about 70 s later: `verifying → installing → done` in 9 s | none (already complete) |
| Process killed while `installing` (version `t2`: `t2.sqlite.tmp` 235,143,168 bytes, verified `t2.sqlite.zst` 166,644,638 bytes present), relaunched | `t2.sqlite` complete at 820,047,872 bytes, `.tmp` and `.zst` gone, state `done` within 30 s of the relaunch | none (restarted from the verified `.zst`) |

### iOS physical device (iPhone 13, iOS 18.7)

Same test package (166,644,638 bytes, `zstd -3`) served by the CDN at `dl.lexnur.com` (temporary object, removed afterwards), debug build with the install probe, background `URLSession`. The process was ended with `devicectl device process terminate` (SIGTERM from the host, not a user swipe-away). Resume offsets are the `bytesDownloaded` values in `install-log.json`.

| Scenario | Result | Resume offset |
|---|---|---|
| `pauseInstall` at 30 %, process terminated while paused, relaunched 30 s later | paused at 50,216,740 bytes; the first event after the relaunch was `queued` at 50,216,740, then `downloading` from 50,220,838 upward; the count never decreased; `verifying → installing → done` | 50,216,740 |
| Process terminated at 21.8 MB while downloading, relaunched 30 s later | the background session kept downloading while the process was dead: the first event after the relaunch was already `installing` at 166,644,638 bytes (deferred), then `verifying → installing → done` within 5 s | none (already complete) |
| Process terminated while `installing` (version `t2`: `t2.sqlite.tmp` 482.6 MB and verified `t2.sqlite.zst` 158.9 MiB present), relaunched 5 s later | `t2.sqlite` complete at 782.1 MiB (820,047,872 bytes) and nothing else in `Library/Application Support/packages/bench`; states `verifying → installing → done` | none (restarted from the verified `.zst`) |

One earlier attempt of the first scenario, run within a minute of uploading the test object, resumed from 50,350,651 bytes and failed with HTTP 404 after 1,360 bytes (the body of an error page). The same object answered `206` to a `Range: bytes=50350651-` request from the host, and the same scenario repeated on a fresh install completed, so it was not reproduced; a negative cache entry at the CDN edge for the freshly uploaded key is the likely cause.

The normal (non-smoke) debug build was then installed fresh on the iPhone 13 and launches; the R1 checklist below was answered on it.

## v1 acceptance

Android device: the Kirin 710 phone (API 29, locale `en-SA`), debug build, packages downloaded from `dl.lexnur.com` over Wi-Fi. Screenshots were captured during the acceptance run and are kept outside the repository; the key ones are committed under `docs/research/device-smoke/`. iOS physical results (latency, read-only, native install) come from an iPhone 13 on iOS 18.7; the remaining physical-iPhone checks are release gate R1, answered by the user and still open; "simulator:" entries come from the iOS simulator runs above and are not representative.

| Spec criterion | Android evidence | iOS evidence | Status |
|---|---|---|---|
| 1. Fresh install shows onboarding, downloads the selected dictionaries from `dl.lexnur.com`, then works offline | Fresh install shows the English onboarding with WordNet ticked and the download sizes (`accept-1-onboarding`). The OEWN package installs (57,384,960 bytes, no `.part`, `.zst` or `.tmp` left) and the app lands on search while it downloads. Wiktionary Arabic–English (162 MB installed) and Wiktionary English (657.8 MB installed) also download from the CDN. With Wi-Fi and data off and after a force-stop, `writ` gives suggestions (`accept-2-offline-search`) and `write` opens (`accept-3-entry`, committed). Release config check: `capacitor.config.json` has `"loggingBehavior": "none"`. The catalog snapshot equals the live catalog. | simulator (iPhone 17 Pro Max, `en` locale): fresh install shows the onboarding with Open English WordNet ticked and the sizes (`accept-ios-1-onboarding`); Download lands on search, the OEWN package installs from the CDN (57,384,960 bytes installed); `writ` lists suggestions (`accept-ios-2-search-writ`) and `write` opens (`accept-ios-3-entry-write`). Wiktionary Arabic–English then downloads from the library screen (162,226,176 bytes installed). Offline use after a force-quit is not testable on the simulator (its network cannot be switched off without touching the host). iPad Pro 13-inch simulator: onboarding, search and entry render in a centred column of about 690 pt (`accept-ipad-onboarding`, `accept-ipad`). Physical iPhone pending. | Android pass, iOS simulator pass except offline, physical iPhone pending |
| 2. Prefix suggestions on every keystroke, under 50 ms on Wiktionary English; a tap opens the entry | Real Wiktionary English package, 1,260 prefixes of 180 words: single call p50 6.7, p95 9.5, p99 11.3, max 25 ms; three calls per prefix p50 11.7, p95 15.6, p99 17.4, max 27.7 ms; cold first query 8.9 ms; no sample over 50 ms. The `writ` list opens the `write` entry (`en-ui-search-writ`, `en-ui-entry-write`). | simulator: `readOnly` rejected; iPhone 17 Pro Max single p95 9 ms, triple p95 3 ms, iPad Pro 13-inch triple p95 3 ms, no triple sample over 50 ms at default text size. iPhone 13 (physical, iOS 18.7): `readOnly` rejected, cold 11 ms, single p50 1 / p95 3 / p99 5 / max 67 ms (3 samples over 16 ms, 1 over 50 ms out of 1,260), triple p95 4 ms with no sample over 16 ms. | Android pass, iOS pass on the physical iPhone 13 |
| 3. Arabic search ignores diacritics, tatweel, alef variants, ى/ي and ة/ه and shows the vowelled form | Typed on the device, all showing vowelled headwords first. `كتب`: `كَتَبَ`, `كَتَّبَ`, `كِتب`, `كَتْب`, `كُتُب` (`accept-4-arabic`, committed). Tatweel `كـتـب` (typed code points 0643 0640 062A 0640 0628, confirmed in the field): identical list to `كتب` (`norm-tatweel`). Alef variants `أكل` and `اكل`: identical lists starting `أَكَلَ` (`norm-alef-hamza`, `norm-alef-plain`). ى/ي `مستشفى` and `مستشفي`: both give `مُسْتَشْفًى` and its plural (`norm-alef-maqsura`, `norm-ya`). ة/ه `مكتبة` and `مكتبه`: both give `مَكْتَبَة` (`norm-ta-marbuta`, `norm-ha`). Root search `ك ت ب` shows the "Words from ك ت ب" list (`accept-5-root`). Second source: the `normalizeKey` unit tests in `packages/core/test/normalize.test.ts` and the pipeline query tests in `pipeline/test/query.test.ts`. | simulator: `كتب` typed with `XCUIElement.typeText` in a UI test (the simulator has no scriptable way to type on the soft keyboard otherwise): first result `كَتَبَ` with root `ك ت ب`, then `كَتَّبَ`, `كِتب`, `كَتْب`, `كُتُب` (`ios-sim-arabic-search`, committed); the entry shows the vowelled headword, root chip and numbered senses (`accept-ios-5-arabic-entry`). Normalisation variants were not repeated on iOS (same core code as Android). | Android pass, iOS simulator pass for typing and display, physical iPhone pending |
| 4. UI in English and Arabic, full RTL in Arabic | English UI on search, entry and settings (`accept-*`, `en-ui-*`). With App language set to العربية the settings, search, entry and dictionaries screens are mirrored: back arrow, search icon, filter chip and tabs move to the right, the menu and clear buttons to the left, and Arabic headwords sit right-aligned in the result list (`ar-ui-search-katab`, committed; also `accept-6-rtl`, `ar-ui-entry-katab`, `ar-ui-settings`). | simulator: Settings › App language › العربية mirrors the search screen: search icon and field on the right, clear and menu on the left, dictionary chip on the right, Arabic headwords right-aligned, part-of-speech labels in Arabic (`ios-sim-rtl-search`, committed). Switching back to English restores the layout. | Android pass, iOS simulator pass, physical iPhone pending |

Criteria 5 and 6 belong to Plan 3.

### Android native feel

| Check | Result |
|---|---|
| Status bar sits on the themed background colour | pass |
| System Back at the search root minimises the app | pass (launcher resumes, task kept) |
| Back with the ⋮ sheet open closes the sheet and stays on the route | pass |
| Back from an entry returns to search with `writ`, its suggestions and the dictionary chip intact | pass |
| Settings › Sources & licences › Read the licence opens the system browser, and Back returns to the app | pass (Chrome resumes, the app WebView is not navigated) |
| Text scale | `font_scale` was 1.0 at the start. At 2.0 the activity Configuration reports fontScale 1.45 (`dumpsys activity activities`: `mGlobalConfig={1.45 …`), so EMUI caps the system scale at 1.45; the WebView follows the Configuration exactly (root font-size 16px to 23.2px, a factor of 1.45), so it adds no cap of its own and the app honours whatever scale the OS hands it. The 200 % text requirement could not be reached on this device. Restored to 1.0. |

iOS simulator: Dynamic Type `large` to `accessibility-extra-extra-extra-large` gives `TextZoom` 1 to 3.12 and text about 3x, with the smoke page's debug path the only overflow; iPad universal layout renders without overflow. With the real app at `accessibility-extra-extra-extra-large` (`accept-ios-dt`, `accept-ios-dt-search`) the search results and the `كَتَبَ` entry stay readable, the diacritics are not clipped and the dictionary chip wraps; the entry's list numbers are not visible in that capture. Physical iPhone and release gate R1 rows: pending.

Observed on the iOS simulator: on the onboarding and dictionaries screens the footer bar sits directly under the content instead of at the bottom edge of the screen, leaving a blank area below it on both the iPhone and the iPad.

## Release gate R1 (manual, answered by the user)

iPhone 13 (iOS 18.7), fresh install of the normal debug build. Items 1–7 of the native-feel checklist: onboarding and first download, offline search after a force-quit in Airplane mode, edge swipe-back, share sheet and haptic long-press, mirrored Arabic UI with swipe-back from the right edge, VoiceOver reading each suggestion as one item, and maximum Larger Text. Result: **passed**, no item failed.

Issues reported alongside, fixed afterwards in the app:
- Arabic UI: the search placeholder showed "ابحث في" on the left and the Latin dictionary name on the right (inverted order).
- Recent searches: the headword got little width while the dictionary label took most of the row.
- Search field: two focus indicators while typing (the bar ring and an outline on the inner input).

Item 8, TalkBack reading each suggestion as one item with Arabic in an Arabic voice: skipped for v1 by the user; a hands-on check on an Android 15 phone is a follow-up for a later release. Touch input injected over adb bypasses TalkBack, so it could not be driven remotely. The accessibility tree supports the expected result: each suggestion row is a single Button whose label is the whole row, the Arabic part of speech and badge carry `lang="ar"`, and the headword and gloss carry `lang="en"`. With that item skipped, R1 is closed for v1.
