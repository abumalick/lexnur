# UX research and design — v1

Scope: the three core flows (onboarding/download, search, entry view) for a free, offline dictionary app built with Compose Multiplatform (Android + iOS). This is research and design only; it sets the structure the first app build should follow.

Data facts this design depends on (from `docs/CATALOG.md` and `catalog/catalog.json`):

- One downloadable SQLite/FTS5 package per dictionary, served as `.sqlite.zst` from R2 with range requests (resumable).
- Catalog fields the UI uses: `title`, `from`/`to`, `kind`, `rank` (within a language pair), `difficulty`, `distribution`, `license`, `ai_generated`, plus build-added `version`, `size_bytes`, `sha256`, `url`.
- Arabic search key: tashkīl and tatweel stripped, alef forms unified, ى→ي, ة→ه. The vowelled form is kept for display, and roots are indexed.
- v1 dictionaries: **Open English WordNet** (en→en, rank 2, intermediate), **Wiktionary English** (en→en, rank 1, beginner, large: hundreds of MB), **Wiktionary Arabic–English** (ar→en, rank 1, beginner, ~59k words).

Mockups: ASCII sketches inline, and plain black-and-white HTML mockups in [`ux/`](ux/):

| File | Shows |
|---|---|
| [`ux/onboarding-download.html`](ux/onboarding-download.html) | First-run library, size/free-space check, download progress phases |
| [`ux/search-suggest.html`](ux/search-suggest.html) | Main screen, scope picker, recent searches, live suggestions in English and Arabic |
| [`ux/entry-arabic.html`](ux/entry-arabic.html) | Arabic entry: vowelled headword, root, senses, forms, linked words, attribution |
| [`ux/states.html`](ux/states.html) | Empty, offline, download failed, disk full, checksum mismatch, no results |

---

## 1. Users and context

- **Who:** learners and readers of English and Arabic. Many will be bilingual Arabic speakers looking up English, or English speakers learning Arabic. Wide range of digital literacy and age, so large type and plain wording matter.
- **When:** mid-reading or mid-conversation. They want to look up a word and get back to what they were doing within seconds. The core loop is *open → type 3–5 letters → tap → read → leave*, which should take under 10 seconds.
- **Where:** often offline or on metered data, and the reason they picked an offline app. The download is the only time the network matters.
- **Emotional context:** looking up a word is a small interruption. Any friction (ads, upsells, loading, a modal) is felt right away. Competitors' reviews are dominated by complaints about ads and paywalled offline access (see §2), which is this app's main opening.

---

## 2. Competitive research

Each claim is tagged by evidence: **[source]** comes from a store listing, help page or review found during this research, and **[general]** is general product knowledge that was not re-verified for this document.

| App | Pattern worth copying | Pitfall to avoid |
|---|---|---|
| **Merriam-Webster** | Bottom bar with Dictionary / Recent / Favorites / Daily / More. Recent keeps search history **[source: Common Sense Education review]**. Search-first home **[general]**. | A UX case study found the interface hard to read at first glance **[source: UX Planet redesign case study]**. Ads in the free tier **[general]**. Five tabs is more than a lookup tool needs. |
| **Dictionary.com** | Clear headword block with pronunciation and POS **[general]**. | Ads in the free app; offline access is an in-app purchase; reports of lost purchases and missing features offline, such as word origin **[source: Dictionary.com help center, App Store reviews, Google Play review analysis]**. |
| **Google Translate (offline)** | Downloads require Wi-Fi by default, with a setting to "ask before downloading without Wi-Fi" or allow mobile data. One **Downloaded languages** list lets you update or remove packs, and downloaded items are labelled "Downloaded" **[source: Google support page]**. | A download made in the background without clear size information surprises people on metered plans **[general]**. |
| **Reverso** | Suggestions as you type. History and favorites also work offline. Favorites feed a phrasebook **[source: App Store listing]**. | Language pair switching is not documented. A busy screen mixing translation, context and learning features **[general]**. |
| **Almaany** | Offline Arabic dictionary with condensed results that expand to the website when online **[source: App Store listing]**. | Tracking across other companies' apps and websites **[source: App Store privacy label]**. Fully offline is a trust signal this app can claim. |
| **Arabic Almanac (Hans Wehr)** | Search by **root**, typed with an Arabic keyboard **or Roman letters** **[source: App Store listing]**. Root-ordered browsing matches how classical lexica work **[source: arabic-for-nerds review]**. | Moved to a text version, then went back to page images because words were missing **[source: developer notes]**. Lesson: entry text completeness matters more than layout. |
| **Kamus Al-Munawwir** | Search works **without harakat**, accepts inflected forms, and **shows the root** for every input word **[source: App Store listing]**. This is the behaviour v1 targets. | Paid app **[source]**. |

Takeaways for this app:

1. **Search-first, no clutter.** The home screen is the search bar. There is no Word of the Day or quiz in v1.
2. **No ads, no account, no tracking.** Say it once during onboarding, then never again.
3. **The download experience is the trust moment.** Show the size before downloading, warn about mobile data, make it resumable and keep a library to manage installs. This follows Google Translate.
4. **Arabic: forgiving input, precise output.** Accept unvowelled and alef-variant input, show the vowelled headword and the root, and let the user distinguish homographs.

---

## 3. Navigation map

### UX options considered

**Option A: Single-screen search with a scope chip (recommended).** The app is one screen: a search bar with a dictionary scope chip, and the entry pushed on top. Library and settings sit behind an overflow menu.

```
┌───────────────────────────────┐      ┌───────────────────────────────┐
│ [ 🔍 search ............ ] ⋮  │      │ ←  كَتَبَ                       │
│ (scope: Wiktionary EN ▾)      │ tap  │    entry body                  │
│ recent searches               │ ───→ │    linked words → push again   │
│   word · word · word          │      │    attribution footer          │
└───────────────────────────────┘      └───────────────────────────────┘
Rough skeleton — refined into pixels and polish in Phase 2 (UI).
```

- Mental model: "a dictionary is a search box."
- Best for: quick lookups, which are the whole product in v1.
- Trade-off: favorites and history are less discoverable than they would be with a tab bar. That is acceptable while v1 has no favorites.

**Option B: Bottom navigation (Search / History / Library).** This is the Merriam-Webster model.

```
┌───────────────────────────────┐
│ [ 🔍 search ............ ]    │
│   …                           │
├───────────────────────────────┤
│  Search  │ History │ Library  │
└───────────────────────────────┘
Rough skeleton — refined into pixels and polish in Phase 2 (UI).
```

- Best for: an app with several equal destinations.
- Trade-off: the bar takes space permanently for screens used rarely. History is already shown under the search bar, and Library is a set-up-once screen.

**Option C: Dictionary-first (choose a dictionary, then search inside it).** A home grid of installed dictionaries.

- Trade-off: it adds a step before every lookup, and "search all installed" fits awkwardly. Reject it.

**Recommendation: Option A.** It gets the user to the core action fastest. Revisit bottom navigation when favorites and flashcards arrive.

### Navigation map (v1)

```
                 first launch (no dictionaries installed)
                               │
                               ▼
                    ┌─────────────────────┐
                    │ Welcome / Library   │  same screen as Library,
                    │ (first-run framing) │  with a first-run header
                    └──────────┬──────────┘
         Skip ─────────────────┤ Continue (downloads keep running)
                               ▼
┌──────────┐  tap row   ┌─────────────────────┐ tap suggestion ┌───────────┐
│  Main /  │◀──────────▶│ Search (expanded)   │───────────────▶│  Entry    │
│  Search  │   back     │ recents/suggestions │                │           │
└────┬─────┘            └─────────────────────┘                └─────┬─────┘
     │ ⋮ menu / scope sheet "Manage dictionaries"                   │ tap linked word
     ▼                                                               ▼
┌─────────────┐   ┌──────────────┐   ┌──────────────────┐     ┌───────────┐
│  Library    │   │  Settings    │──▶│ Sources & licences│     │  Entry    │ (pushed; back
│ (downloads) │◀──│              │   │  (per dictionary) │     │  (linked) │  returns)
└─────────────┘   └──────────────┘   └──────────────────┘     └───────────┘
```

Rules:

- **Back always means back:** the system back gesture on Android and the edge swipe on iOS. Entry → Entry pushes create a normal back stack. Cap it at about 20 entries by dropping the oldest, so memory stays bounded and back still behaves predictably.
- On a cold start the app opens Main with the **last scope** and an empty field. It does not reopen the last entry.
- Library is reachable from three places: the overflow menu, the scope sheet ("Manage dictionaries…") and every empty state. It is the same screen everywhere.

---

## 4. Screen by screen

### 4.1 Onboarding = Library in first-run mode

#### UX options considered

**Option A: One-screen picker (recommended).** A welcome line followed by the dictionary list grouped by language pair, with the recommended dictionary pre-selected and a single **Download** button.

```
┌───────────────────────────────┐
│ Free offline dictionaries     │
│ No ads, no account.           │
│ ── English → English ──────── │
│ [x] Wiktionary English  ★ rec │
│     beginner · ~NNN MB        │
│ [ ] Open English WordNet      │
│     intermediate · ~NN MB     │
│ ── Arabic → English ───────── │
│ [x] Wiktionary Arabic–English │
│ Total ~NNN MB · free X GB     │
│ ( Download 2 )   Skip         │
└───────────────────────────────┘
Rough skeleton — refined into pixels and polish in Phase 2 (UI).
```

- Trade-off: the user sees every choice at once. With three dictionaries in v1 that is fine. With 50 or more it needs language filters (see nice-to-haves).

**Option B: Wizard (pick languages → pick dictionaries → confirm).**

```
┌───────────────┐   ┌──────────────────┐   ┌───────────────┐
│ Which         │──▶│ Dictionaries for │──▶│ Confirm size  │
│ languages?    │   │ English, Arabic  │   │ ( Download )  │
└───────────────┘   └──────────────────┘   └───────────────┘
Rough skeleton — refined into pixels and polish in Phase 2 (UI).
```

- Trade-off: it scales to hundreds of dictionaries, but means three screens to pick from three items in v1. Hold it for when the catalog grows. The language filter in Option A can grow into it.

**Option C: Zero onboarding.** Open on an empty search screen with a "Get a dictionary" call to action. This is the fastest start, but the first experience is an empty screen, and the size and data warning still has to appear somewhere.

**Recommendation: Option A,** built as **the same composable as Library**, with a first-run header and footer. One screen to design, test and keep consistent.

#### Details

- **Grouping:** by language pair, labelled in plain words ("English → English", "Arabic → English"), never ISO codes. Within a pair, sort by `rank`.
- **Default selection:** rank 1 in each pair that matches the device languages is pre-selected. With an English-only device, preselect Wiktionary English only and show Arabic–English unselected. With Arabic in the device locales, preselect both. Never preselect `distribution: copyleft-gpl` entries.
- **The large dictionary:** Wiktionary English is rank 1 but heavy. Two honest choices to show:
  - Pre-select it, show its size prominently, and put a one-line hint under WordNet: "Smaller, quicker to download. Short definitions and synonyms."
  - Recommended: **download the small packages first** (sort the download queue by size ascending) so search works within seconds while the large one continues.
- **Row content (left to right):** checkbox, title, then one secondary line: `difficulty chip · download size · "Recommended"`. The licence goes on the details sheet, not the row.
- **Row tap:** toggles selection. A trailing ⓘ opens a details sheet with a description, entry count, licence, `ai_generated` notice, download size and installed size.
- **Footer:** "Total ~NNN MB to download · needs ~N.N GB free · you have XX GB free". This updates live as selections change.
- **Primary button:** "Download (2)", disabled when nothing is selected. A secondary text button reads **"Skip for now"**.
- **Mobile data:** if the connection is metered and the total is over a threshold (suggest 50 MB), show one dialog: "This will use ~NNN MB of mobile data. [Wait for Wi-Fi] [Download now]". Remember the choice in Settings, as Google Translate does. "Wait for Wi-Fi" queues the download for when Wi-Fi is available.
- **After Download:** go straight to Main. Downloads continue in the background. Main shows a progress strip, and the scope chip shows only installed dictionaries plus any "Downloading 42%" rows, greyed out. **Do not block on a progress screen.**

#### Download progress (Library rows and Main banner)

Phases shown to the user:

```
Queued → Downloading 42% · 120 / 290 MB · 2 min left → Verifying → Installing → Ready ✓
                 │                                                 │
                 ├─ Paused (tap to resume)        Failed (reason) ─┘── Retry
                 └─ Waiting for Wi-Fi
```

- **Show percent and MB**, because this matters on metered data. Show the time remaining only after 5 seconds of data and keep it smoothed, so it does not jump around.
- **Pause and Cancel** are on every active row, and Cancel asks for confirmation once over 10 MB has downloaded. **Resume** is automatic after connectivity returns or the app restarts, using range requests. Keep the partial file and validate it with the `sha256` after completion.
- **Background downloads:** an Android foreground service with a progress notification (WorkManager long-running worker), and an iOS background `URLSession`. The notification and Live Activity are platform conventions, so follow them rather than inventing UI.
- **Indeterminate phases** (verify, unpack): show an indeterminate bar with text ("Verifying…", "Installing…") so the bar never looks frozen at 100%.

### 4.2 Main: search

#### UX options for dictionary switching

**Option A: Scope chip under or inside the search bar (recommended).** A compact chip shows the current dictionary ("Wiktionary EN ▾") and opens a bottom sheet.

```
┌───────────────────────────────┐
│ [🔍 Search Wiktionary EN   ⋮] │
│ [Wiktionary EN ▾]              │
└───────────────────────────────┘
        │ tap chip
        ▼
┌───────────────────────────────┐
│ Search in                     │
│ ◉ All installed (3)           │
│ ── English → English ──────── │
│ ○ Wiktionary English          │
│ ○ Open English WordNet        │
│ ── Arabic → English ───────── │
│ ○ Wiktionary Arabic–English   │
│ Manage dictionaries…          │
└───────────────────────────────┘
Rough skeleton — refined into pixels and polish in Phase 2 (UI).
```

**Option B: Horizontal tabs / segmented control with one per dictionary.** Switching takes one tap, but this breaks beyond three or four dictionaries, and long titles truncate badly in Arabic.

**Option C: Always "All installed", with a filter to narrow it.** Simplest model, but results from the large Wiktionary would bury WordNet and Arabic results, and a learner who chose one dictionary loses that choice.

**Recommendation: Option A.** Default to **All installed** on first use when more than one dictionary is installed, remember the last scope, and let the user's choice stick.

#### Smart scope (script detection)

- If the user types Arabic script while the scope is an English-only dictionary, do not show "no results". Show the Arabic suggestions from installed ar→* dictionaries under a header: "Results from Wiktionary Arabic–English · Switch". Tapping a suggestion opens the entry, and the scope only changes if the user taps "Switch". Detection is cheap: the first strong character's script.
- If no installed dictionary matches the script, use the empty state "No Arabic dictionary installed · Get Wiktionary Arabic–English (~NN MB)".

#### Search field behaviour

- Material 3 `SearchBar` (collapsed) → `ExpandedFullScreenSearchBar` on phones; `DockedSearchBar` on tablets.
- **Placeholder:** "Search Wiktionary English" or "Search all dictionaries". This is the scope, said where the eye already is.
- **Focus on open:** auto-focus the field on launch so the keyboard is up, because that is the whole purpose of the app. Exception: never auto-focus when TalkBack or VoiceOver is on (it disorients), and let the user turn this off in Settings ("Open keyboard on launch").
- **IME:** `KeyboardType.Text`, `autoCorrect = false`, `capitalization = None`, `imeAction = Search`. Keyboard Search or Enter opens the top suggestion. The clear (×) button shows when the field has text.
- **Text direction:** set from the first strong character (`TextDirection.Content`), so Arabic input aligns right even in an English UI. The cursor and clear button follow.
- **Instant suggestions:** query on every keystroke against the FTS5 prefix index, with about 50 ms debounce and cancellation of the previous query. Show up to 20 rows, and no spinner for local queries. If a query takes over 150 ms, keep the previous results visible instead of blanking.

#### Suggestion rows

The diacritic-insensitive key collapses homographs: كتب matches كَتَبَ (he wrote), كُتُب (books) and كُتِبَ (it was written). So **every row needs a disambiguator**:

```
┌───────────────────────────────────────────┐
│ كَتَبَ                       verb · ك ت ب  │  ← vowelled headword (large), POS + root
│ to write                                  │  ← first gloss, one line, ellipsized
├───────────────────────────────────────────┤
│ كُتُب                        noun · ك ت ب  │
│ books (plural of كِتَاب)                   │
└───────────────────────────────────────────┘
```

- **Line 1:** headword with diacritics (the display form), then trailing POS and root for Arabic.
- **Line 2:** first gloss, one line.
- In **All installed** scope, add a small dictionary badge ("WordNet", "Wikt AR") on line 2's trailing edge. Group by exact headword: if the same headword exists in several dictionaries, show one row with "+2 dictionaries" and open the entry with dictionary tabs.
- **Ordering:** exact match on the normalized key first, then exact match on the vowelled form if the user typed diacritics, then prefix matches by frequency or length. Inflected-form hits ("went" → go) go below, with a note: "went → **go**".
- **Matched-prefix highlighting:** skip it for Arabic in v1. Highlighting across diacritic-insensitive matches is hard to do correctly, and wrong highlighting is worse than none.
- **v1:** headword prefix search only. Full-text search inside definitions (reverse lookup, "find words meaning X") is a nice-to-have: a second section, "In definitions", below the headword matches.

#### Recent searches (field empty)

- Show the last 20 **opened entries**, not typed strings, each with its dictionary badge. Typed strings without a result are noise.
- Swipe or long-press to remove one item. A "Clear history" option lives in Settings, with confirmation.
- Stored locally only. Say so in Settings ("History stays on this device").
- Tapping one opens the entry directly, skipping the suggestions step.

### 4.3 Entry view

#### UX options considered

**Option A: One scrolling page (recommended).** Header → senses grouped by POS → forms → related → attribution.

```
┌───────────────────────────────┐
│ ←                        Aa ⋮ │
│ كَتَبَ                          │  headword, large, vowelled
│ kataba · verb · root ك ت ب ›  │
│ ─ Verb (Form I) ───────────── │
│ 1. to write                   │
│ 2. to prescribe, decree       │
│ ▸ Conjugation (collapsed)     │
│ ─ Related ─────────────────── │
│ كِتَاب · مَكْتَب · كَاتِب            │  linked words (tappable)
│ ─ Source ──────────────────── │
│ Wiktionary · CC BY-SA 4.0 ›   │
└───────────────────────────────┘
Rough skeleton — refined into pixels and polish in Phase 2 (UI).
```

**Option B: Tabs per section (Meanings / Forms / Related).** This hides content behind taps. Short entries end up with empty tabs, and scanning one page is faster.

**Recommendation: Option A,** with collapsible sections for long material (conjugation and inflection tables, etymology).

#### Header (the differentiator gets the weight)

- **Headword** is the largest element on the page. For Arabic, show the vowelled form at about 1.6× body size, because diacritics need room.
- **Secondary line:** transliteration (if present) · POS · root. **The root is a chip**: tap it to search for that root ("Words from ك ت ب"), which is the Hans Wehr browsing habit in one tap. In v1 that runs a root query in the current dictionary. Root browsing as its own screen is a nice-to-have.
- **Pronunciation:** IPA text if present in the data. Audio is out of scope offline for v1.
- **Badges:** an `ai_generated` badge ("AI-generated content") sits in the header, not hidden in the footer, as the catalog requires. No v1 dictionary carries it, but the slot exists. When "All installed" found the word in several dictionaries, a row of dictionary tabs or chips sits under the header.

#### Body

- **Senses:** numbered, grouped under POS headings. Examples are indented in a lighter style. Sub-senses use 1a, 1b. Keep sense numbers stable so users can refer to them.
- **Vowelled forms:** for Arabic, plural, masdar and verb form in a compact definition list: "plural: كُتُب".
- **Inflection and conjugation tables:** collapsed by default and scroll horizontally inside their own box when wide. Never scroll the whole page sideways.
- **WordNet:** synonyms as chips. Relations (hypernym, "type of") go in a collapsed "Related" section.
- **Linked words:** every cross-reference is tappable, drawn as an underlined link in the body and as chips in "Related". Tapping looks the word up in the **same dictionary** first. If it is not there, fall back to All installed. If there are still no results, show a snackbar ("'X' isn't in your dictionaries") rather than opening an empty page.
- **Long-press on any word in a definition** → "Look up". This is a nice-to-have, since word segmentation is needed.

#### Attribution (required, not polish)

CC BY-SA requires attribution. Show a footer on every entry: "From Wiktionary (CC BY-SA 4.0) · Details". "Details" opens the dictionary's sheet with the full attribution text from the package `meta`, the licence link, the source version and date. Settings › Sources & licences lists all of them.

#### Entry toolbar

- Back, then (trailing) **text size (Aa)** and an overflow menu with **Copy word**, **Share** (plain text: headword + first sense + attribution) and **Dictionary info**.
- No favorites in v1. Leave space for a bookmark icon later.

### 4.4 Library (manage dictionaries)

The same screen as onboarding, without the welcome header:

- Sections: **Installed** (with size on disk, version and an overflow menu: Update, Delete) and **Available** (catalog, grouped by pair). Downloading rows show inline progress.
- **Delete** confirms with the reclaimed size ("Delete Wiktionary English? Frees 1.1 GB."). Deleting the dictionary currently in scope switches scope to All installed.
- **Updates** (CATALOG.md requires updatable packages, for example JMdict later): an "Update available · ~NN MB" row action, plus an "Update all" button when two or more need updating. Updates download next to the old version and swap atomically, so search keeps working during an update. Showing update badges is v1.x, but the architecture is v1.
- Storage summary at the bottom: "Dictionaries use 1.4 GB · 21 GB free".

### 4.5 Settings

Keep it short:

- Theme: System / Light / Dark
- Text size inside the app (on top of system scale, for entries only)
- Arabic: show transliteration (on/off). Diacritics are always shown in v1; a "hide tashkīl" toggle is a nice-to-have.
- Downloads: "Ask before using mobile data" (default on) / "Wi-Fi only"
- Search: "Open keyboard on launch" (default on)
- History: Clear history
- Dictionaries → Library
- Sources & licences: per-dictionary attribution and the app's own open-source licences
- About: version, "No ads. No tracking. Works offline."

---

## 5. States

All of these have mockups in [`ux/states.html`](ux/states.html).

| State | Where | What the user sees | Action |
|---|---|---|---|
| **No dictionaries installed** (skipped onboarding, or deleted all) | Main | Illustration-free text: "No dictionaries yet. Download one to start searching, then it works offline." | **Get dictionaries** → Library |
| **Offline, no catalog** (first launch without network) | Onboarding | "You're offline. Connect once to download dictionaries; after that the app works offline." The bundled catalog list still shows (see Questions). The Download button is disabled with the reason inline. | Retry; auto-refresh on connectivity |
| **Offline, mid-download** | Library row, Main strip | "Paused · waiting for connection". No error colour, since this is normal. | Resumes automatically |
| **Waiting for Wi-Fi** | Library row | "Waiting for Wi-Fi · ~NNN MB" | **Download now** (uses mobile data) |
| **Download failed** (server or network error after retries) | Library row | "Download failed. Couldn't reach the server." | **Retry** |
| **Not enough space** | Before start, inline in the footer; during install, on the row | "Needs 1.2 GB free, you have 600 MB." | **Manage storage** (opens system storage on Android; on iOS, text guidance) and a deselect suggestion |
| **Checksum mismatch** | Library row | "The download was damaged. We'll download it again." | Auto-retry once from scratch, then **Retry** |
| **Corrupt / unopenable package** | Main, when the dictionary fails to open | "Wiktionary English needs to be reinstalled." | **Reinstall** |
| **No results** | Suggestions | "No words start with 'xyzq' in Wiktionary English." In single-dictionary scope, also try All installed silently: "Found 2 in other dictionaries". If the input looks misspelt, nice-to-have: "Did you mean …" via edit distance over the key list. | Search all / switch dictionary |
| **Wrong script for scope** | Suggestions | See Smart scope in §4.2 | Switch |
| **Searching while the only dictionary downloads** | Main | Field enabled, placeholder "Available when Wiktionary English finishes (42%)" | — |

Error principles: say what happened, in plain words, and what happens next. Use error colour only when the user has to act. Retries keep the partial download.

---

## 6. Arabic, RTL and bidirectional text

- **Layout direction follows the app locale.** With an Arabic UI, mirror the whole layout (back arrow, chevrons, list order). With an English UI and Arabic content, only content blocks run right-to-left.
- **Content direction follows the entry language, not the UI.** An Arabic headword block is RTL even in an English UI. An English gloss under it is LTR. Mixed inline runs ("plural of كِتَاب") need bidi isolation (Unicode FSI/PDI or separate `Text` spans with explicit direction), or punctuation lands on the wrong side.
- **Diacritic-insensitive input, vowelled output:** the user can type كتب, كَتَبَ or اكتب variants, and results always show the full vowelled form. If the user typed diacritics, rank the exact vowelled match first.
- **Alef and hamza forgiveness:** أ إ آ ٱ → ا, ى → ي, ة → ه are already in the search key. The user never needs to know.
- **Root search:** a query of 3–4 Arabic letters separated by spaces or dashes (ك ت ب, ك-ت-ب) is treated as a root query. The root chip in entries does the same.
- **Transliteration input** (typing "kataba" for كَتَبَ, as Arabic Almanac allows) is a nice-to-have. It needs a transliteration index in the package.
- **Fonts:** Noto Naskh Arabic for body text (excellent diacritic placement, wide coverage) and the platform default for Latin. Bundle the Arabic font: system Arabic fonts vary by OEM and some place stacked diacritics poorly. Check the licence (OFL) and size, which is about 200 KB per weight subset.
- **Line height:** Arabic with tashkīl needs about 1.6–1.8× line height, versus about 1.4–1.5× for Latin. Use separate text styles (`arabicBody`, `arabicHeadline`) rather than one style for both.
- **Keyboard:** the system IME handles Arabic. The app does not ship a custom keyboard. On iOS, the field should not force a keyboard language, so the user's last-used keyboard stays.

---

## 7. Accessibility and font scaling

- **Font scaling up to 200%:** no fixed heights on rows, chips or headers. Rows grow, and secondary lines wrap instead of ellipsizing above 1.3× scale. At large scales the suggestion row's trailing POS and root move under the headword. Diacritics must never clip, so test at 200% with stacked marks such as شَدَّة + فَتْحَة.
- **Touch targets:** at least 48 dp (Android) and 44 pt (iOS). Linked words inside running text are smaller, so pad their hit area and provide the "Related" chips as a large-target alternative.
- **Screen readers:** suggestion rows read as a single node: "كَتَبَ, verb, root kaf ta ba, to write". Language-tag Arabic spans so TalkBack and VoiceOver switch voice. *Verify how Compose Multiplatform exposes a span locale to accessibility services on each platform before relying on it* (Android supports `LocaleSpan`-style semantics; the iOS bridge needs checking). Announce download progress at 25% steps, not every percent. Entry section headings are marked as headings for rotor and heading navigation.
- **Contrast:** at least 4.5:1 for body text, including secondary lines (glosses) and badges. Do not use colour alone for state: always pair it with text ("Failed", "Ready").
- **Motion:** respect reduced motion. There is nothing decorative to remove in v1 except the search bar expand transition.
- **Keyboard and hardware:** tablets with keyboards: Enter opens the top suggestion, arrow keys move through suggestions, and Esc clears or collapses the field.

---

## 8. Visual design (UI)

### Style options

- **Style A: Material 3 with dynamic colour (recommended for Android).** Wallpaper-derived colour on Android 12+, falling back to a brand seed colour. Neutral surfaces with a single accent for links and the primary button. Feels native and needs little design upkeep.
- **Style B: Editorial / book-like.** Serif headwords, warm paper background in light mode, accent used sparingly. Feels like a printed dictionary and reads well, but needs custom theming on both platforms, and serif Arabic options are limited.
- **Style C: High-contrast minimal.** Monochrome, heavy weight contrast between headword and body. Very readable, but feels clinical and less friendly to learners.

**Recommendation:** Style A for the structure, with **one** touch of Style B: headwords in a distinct display face (a serif for Latin, Naskh for Arabic). That alone makes the entry view feel like a dictionary rather than a settings page.

### Material 3 on Android, iOS-respectful on iOS

Compose Multiplatform draws Material components on both platforms. Keep the shared UI and adjust the parts iOS users notice most:

| Area | Android | iOS adjustment |
|---|---|---|
| Back navigation | System back / predictive back | Edge swipe back must work on every pushed screen (Compose Multiplatform navigation supports it; verify it in the chosen navigation library) |
| Top bar title | Small, left-aligned | Centred title on pushed screens |
| Sheets | M3 `ModalBottomSheet` | Same component, with a grabber; detents feel acceptable |
| Dialogs | M3 `AlertDialog` | Keep it, but use iOS button order (cancel left) or a native alert through an expect/actual |
| Switches | M3 `Switch` | Consider a native-looking switch in Settings only |
| Haptics | Light, on long-press only | Same |
| Scroll physics | Default | Compose on iOS has iOS-style overscroll bounce |
| Dynamic colour | Yes (Android 12+) | No; use the brand seed palette |
| Fonts | Roboto + Noto Naskh Arabic | SF via system default + Noto Naskh Arabic |

### Light and dark

- Follow the system by default, with an override in Settings.
- Dark: avoid pure black (#000) for long reading. Use M3 dark surfaces, and keep diacritics legible with no thin weights for Arabic in dark mode.
- The HTML mockups are deliberately black and white. Colour is decided at implementation time from the M3 theme builder.

---

## 9. Component list

| Component | Compose Multiplatform material3 piece | Notes |
|---|---|---|
| Search bar (Main) | `SearchBar` + `ExpandedFullScreenSearchBar` (phone) / `ExpandedDockedSearchBar` (tablet), state-based API with `rememberSearchBarState` | The older `expanded`/`onExpandedChange` overloads are deprecated. `TopSearchBar` is renamed `AppBarWithSearch`. Check the exact API in the CMP version pinned at build time. |
| Scope chip | `AssistChip` / `FilterChip` with trailing ▾ | Opens the scope sheet |
| Scope sheet | `ModalBottomSheet` + `ListItem` + `RadioButton` | Grouped by language pair, "Manage dictionaries…" at the bottom |
| Suggestion row | `ListItem` (headline = headword, supporting = gloss, trailing = POS/root/badge) | Custom text styles for Arabic |
| Recent row | `ListItem` with leading history icon, `SwipeToDismissBox` | |
| Dictionary row (Library/Onboarding) | `ListItem` + `Checkbox` / trailing action + `LinearProgressIndicator` | One composable, three modes: select, installed, downloading |
| Difficulty / AI / dictionary badges | `SuggestionChip` (non-interactive) or a small custom `Badge` | Text label, never colour alone |
| Download strip (Main) | Custom row with `LinearProgressIndicator` under the search bar | Tap → Library |
| Storage footer | Custom, `Surface` at the bottom of the list | Live total + free space |
| Entry header | Custom composable | Headword, transliteration, POS, root chip, badges |
| Sense list | `LazyColumn` items | Numbered senses, examples |
| Collapsible section | Custom, `AnimatedVisibility` | Conjugation, etymology, relations |
| Inflection table | Custom table in a horizontally scrolling `Box` | Not the whole page |
| Linked word | `LinkAnnotation` in `AnnotatedString` (body), `AssistChip` (Related) | |
| Attribution footer | `Text` + `TextButton` → bottom sheet | |
| Dialogs | `AlertDialog` | Mobile-data, delete, cancel download |
| Snackbar | `SnackbarHost` | "Not in your dictionaries", "Download paused" |
| Empty / error state | Custom: title, one line, one button | Reused for every state in §5 |

Open data question that changes the entry components: whether `entry.body` is **structured JSON** (render natively with the components above) or **light HTML** (needs a WebView, which hurts font scaling, theming, accessibility and linked-word handling). **Native rendering from structured JSON is strongly recommended.** This is the data pipeline's call; see Questions.

---

## 10. v1 scope vs nice-to-haves

| Feature | v1 | Later |
|---|---|---|
| Onboarding picker = Library (grouped by pair, rank preselect, size, difficulty) | ✅ | Language filter and search once the catalog has 20+ dictionaries; the wizard from §4.1 Option B |
| Download: size, free-space check, mobile-data prompt, pause/resume/cancel, background, verify | ✅ | Wi-Fi-only scheduling, "download overnight" |
| Start using the app while the big download runs | ✅ | |
| Update installed packages | Architecture ✅, UI badge v1.x | Auto-update on Wi-Fi |
| Search with instant prefix suggestions | ✅ | |
| Scope: single dictionary or All installed, remembered | ✅ | Per-pair scopes ("All Arabic") |
| Script detection → offer the matching dictionary | ✅ | |
| Arabic diacritic/alef-insensitive matching, vowelled display, root in rows | ✅ | |
| Root query (ك ت ب) and root chip | ✅ (as a search) | Dedicated root browser (Hans Wehr style tree) |
| Recent searches (opened entries) | ✅ | Sync across devices |
| Entry view: senses, POS, root, forms, collapsible tables, linked words, attribution | ✅ | Long-press any word to look it up |
| Copy / share entry | ✅ | |
| Light/dark/system, in-app text size | ✅ | Sepia / reading theme |
| Full-text search in definitions (reverse lookup) | | ✅ |
| Favorites / bookmarks, word lists, flashcards | | ✅ (and then revisit bottom navigation) |
| "Did you mean" spelling suggestions | | ✅ |
| Transliteration input (kataba → كَتَبَ) | | ✅ (needs index) |
| Hide/show tashkīl toggle | | ✅ |
| Audio pronunciation | | ✅ (size cost) |
| Lookup from other apps (Android `PROCESS_TEXT`, iOS share/action extension) | | ✅ High value, low UI cost: strong v1.1 candidate |
| Home-screen widget / Word of the Day | | Maybe; not core |

---

## 11. Questions

1. **Installed size in the catalog.** The published catalog has `size_bytes` (compressed download). The free-space check needs the **unpacked size** too (zstd SQLite can expand 2–4×). Add `installed_size_bytes` to the generated catalog.
2. **Bundled catalog snapshot.** Should the app ship a copy of the catalog so first launch without a network can still show what is available (download disabled)? Recommended: yes, it is small.
3. **Entry body format.** Structured JSON (native rendering, recommended) or light HTML (WebView)? This decides the entry view's components, accessibility and linked-word handling.
4. **Large dictionary default.** Pre-select Wiktionary English (rank 1, large) for English devices, or pre-select WordNet (smaller, quicker) and present Wiktionary as the upgrade? This design pre-selects Wiktionary and downloads small packages first. Confirm.
5. **Mobile-data threshold.** Prompt above 50 MB on metered connections? Or always prompt on metered connections?
6. **App UI languages for v1.** English only, or English + Arabic (full RTL chrome)? The design supports both. Arabic UI adds translation and RTL QA work.
7. **Package-level data for rows.** Suggestion rows need the first gloss and POS in the FTS result without loading the full body. The package should store a short `gloss` column next to `headword`, `pos` and `root`.
8. **Frequency for ranking.** Prefix suggestions are much better sorted by word frequency than alphabetically. Is a frequency column available, for example from Wiktionary or a corpus list?

## Sources

- [Common Sense Education: Merriam-Webster review](https://www.commonsense.org/education/app/dictionary-merriam-webster)
- [UX Planet: Redesign Merriam Webster app](https://uxplanet.org/redesign-merriam-webster-app-9de3805357bc)
- [Merriam-Webster App Store listing](https://apps.apple.com/FR/app/id399452287)
- [Google Translate help: Download languages to use offline](https://support.google.com/translate/answer/6142473?hl=en)
- [Dictionary.com help: ads in free and premium apps](https://help.dictionary.com/article/329-why-am-i-still-seeing-ads-if-i-bought-the-pro-premium-app-or-an-upgrade-to-remove-ads-in-the-free-app)
- [Dictionary.com Premium review analysis (Google Play)](https://kimola.com/reports/unlock-insights-with-our-dictionary-com-premium-feedback-report-google-play-tr-146915)
- [Reverso App Store listing](https://apps.apple.com/us/app/reverso-translate-and-learn/id919979642)
- [Almaany Arabic–Arabic App Store listing](https://apps.apple.com/app/id952606463)
- [Arabic Almanac (Hans Wehr) App Store listing](https://apps.apple.com/app/id1036801850)
- [Hans Wehr Digital App Store listing](https://apps.apple.com/us/app/-/id6743653472)
- [Arabic for Nerds: best Hans Wehr app](https://arabic-for-nerds.com/tools/best-app-hans-wehr/)
- [Kamus Al-Munawwir App Store listing](https://apps.apple.com/us/app/id6443928240)
- [Compose Multiplatform material3 SearchBar API](https://kotlinlang.org/api/compose-multiplatform/material3/androidx.compose.material3/-search-bar.html)
- [AppBarWithSearch (renamed TopSearchBar)](https://composables.com/jetpack-compose/androidx.compose.material3/material3/components/AppBarWithSearch.md)
