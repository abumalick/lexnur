# App name and application id

Research note for choosing the app's name and its application id (Android `applicationId` / iOS bundle id). Nothing was bought or registered.

## Criteria

- Short, memorable, easy to say for English **and** Arabic speakers. Arabic has no /p/, /v/ or /tʃ/, so names avoid those sounds.
- Not tied to one language: the catalog will grow well beyond English and Arabic.
- Clean namespace: no app with the same name on the App Store (Apple rejects duplicate app names at submission) and no crowding on Google Play.
- A domain we can buy at the standard price, so the application id can be the reverse-DNS of a domain we own.

## Method

- **Domains**: RDAP from the shell. `.com` via `rdap.verisign.com`, `.app`/`.dev` via `pubapi.registry.google`. HTTP 404 = unregistered, 200 = registered. RDAP doesn't show premium pricing, so every shortlisted `.app`/`.dev` was then priced on Porkbun's search page to rule out premium names. For a registered `.com`, Porkbun shows whether it is for sale (aftermarket price, or "Inquire" via a broker).
- **Stores**: iTunes Search API (`itunes.apple.com/search?entity=software`, US and SA storefronts) for exact App Store names; Google Play search results (`play.google.com/store/search?q=<name>&c=apps`) for package ids; web search for both.
- **Trademark**: web search for `"<name>"` plus `trademark` and near-spellings. This is an "obvious clash" screen only. No TMview/WIPO/USPTO search was run.
- Checked on 2026-10-10. Prices are Porkbun's, in USD.

Standard Porkbun prices: `.com` $11.08/yr; `.app` $8.75 first year, then $14.93/yr; `.dev` $8.75 first year, then $12.87/yr. Every free `.app`/`.dev` listed below has that standard price (none is premium).

## Shortlist

| Name | Meaning / why | .com | .app | .dev | App Store | Google Play | Trademark / clash |
|---|---|---|---|---|---|---|---|
| **Lexnur** | *lex(is)* "word" (as in lexicon) + *nūr* "light" (Arabic, Persian, Turkish, Urdu, Malay/Indonesian). "Light on words". Arabic: ليكسنور | **free** | **free** | **free** | no results | no results | No hits for LEXNUR. Closest is **Lexzur** (legal practice-management software, formerly App4Legal). Apple's search fuzzy-matches the two (a US App Store search for "lexnur" returns Lexzur first), and Lexzur is sold in the Gulf (UAE software marketplace listing). Different product class, but the one material risk |
| **Kamoos** | *qāmūs* = "dictionary" in Arabic, Persian, Urdu; *kamus* in Malay/Indonesian and Ottoman Turkish; *kamusi* in Swahili. Arabic: قاموس | taken, aftermarket **$1,800** | **free** | **free** | no exact "Kamoos", but "Qamoos Dictionary", "Qamoos Arabic Dictionary", "Qamoos53" and "Qamoos Anki" exist; 168 results for قاموس (SA) | many `alqamoos`/`qamoos` packages; developer "Qamus" publishes Arabic apps | A generic word: it cannot be protected as a dictionary brand, and anyone can use it |
| **Qamoosi** | "my dictionary" (Arabic/Urdu/Persian) | **free** | **free** | **free** | **exact name taken**: "Qamoosi", a kids' reading game (Native Melon Consulting, 2015, inactive) | `com.alqamoos*` apps nearby | Exact App Store name is taken. Initial Q without U trips English speakers |
| **Lexidar** | *lexi* "words" + *dār* "house" (Arabic, Persian, Turkish, Urdu, Swahili). "House of words" | taken, broker "Inquire" (Namegrain) | **free** | **free** | none | none | Reads like "LiDAR": searches return LiDAR scanner apps. No trademark hits |
| **Nurlex** | *nūr* + *lex*, Lexnur reversed | taken, broker "Inquire" | **free** | **free** | none | none | Near **Nurex/Nurx** (health and telemedicine marks) |
| **Harfo** | *ḥarf* = "letter" (Arabic, Turkish, Persian, Urdu) | taken, broker "Inquire" | **free** | **free** | none | none | Near **Harf – حرف**, an Arabic poetry app on the App Store since 2025 |
| **Lughat** | "dictionary" in Urdu/Persian (*lügat* in Turkish), "languages" in Arabic. Arabic: لغات | taken, aftermarket **$4,800** | **free** | **free** | crowded: "Urdu Lughat", "Offline Urdu Lughat", "Quran with Lughat", "LughatLens" | many `urdulughat` packages | Reads as an Urdu dictionary. "gh" is hard for English speakers |
| **Mojamy** | *muʿjamī* "my lexicon" (Arabic only). Arabic: معجمي | **free** | **free** | **free** | none | none | Arabic-only meaning, which goes against the brief. English speakers say "mo-jammy" |

### Rejected early

- **Lexoo**: an established UK legal-services company (acquired 2024). Trademark risk.
- **Kalimora**: a Play app already uses it (`ai.saifullah.kalimora`).
- **Lisanu**: *lisān* means "language/tongue" in Arabic, Turkish, Urdu and Persian, but a Lisan app already exists on Play (`com.amerali.lisanapp`).
- **Wordu**, **Wordwell**: English-only.
- Exact common words, with all three domains registered or no `.app`: qamus, kamus, qamoos (.com/.app taken), lisan, lisaan, dalil, daleel, lugha, maana, mani, kalima, kalam, qalam, diwan, bayan, tibyan, muhit, nuqta, alif, lexi, lexa, lexo, lexika, glosa, dikta, lugo, kamu, zelo, kalio, kalimo, wordo.
- Arabic-only words with a free `.app` (mufradat, kalimaat, kalimah, lafzi, maknaa, harfi, hurouf, mojam): they fail the "not tied to one language" criterion and gain nothing over Mojamy.

## Recommendation: **Lexnur**

- **Clean namespace.** Of all the names checked, it is the only one with `.com`, `.app` and `.dev` all unregistered at standard price, no App Store or Play results, and no trademark hits. Apple's unique-name rule is not a risk.
- **Works for both priority audiences.** English speakers recognise *lex* from *lexicon*. *Nūr* is one of the most familiar words across Arabic, Persian, Turkish, Urdu and Malay/Indonesian. It is easy to say in Arabic, with no /p/, /v/ or /tʃ/: ليكسنور.
- **Not tied to one language**, so it still fits once the catalog covers many languages. It is also not a generic term, unlike Kamoos, so it can be registered as a trademark and is searchable.

**Application id: `app.lexnur`** (reverse-DNS of `lexnur.app`). Verified unused on Play: `play.google.com/store/apps/details?id=app.lexnur` → 404; a known app id returns 200. Use it for both the Android `applicationId` and the iOS bundle id. It cannot be changed after the first Play upload.

Domains to buy:
- `lexnur.app`: $8.75 first year, then $14.93/yr.
- `lexnur.com`: $11.08/yr. Defensive, and it redirects to the `.app` site.
- `lexnur.dev` is optional ($8.75, then $12.87/yr).
- About $26/yr for `.app` + `.com`.

Known weaknesses of Lexnur:
- In Latin and the Romance languages, *lex* means "law", and legal-tech brands use it heavily (Lexzur, LexisNexis, Lexoo). Some readers will first think "legal".
- Lexzur, a legal-software brand sold in the Gulf, is one letter away. Apple's search already mixes the two up.
- *Nur* means "only" in German. That's harmless but noticeable to German speakers.
- It is an invented word, so it has to earn recognition. Kamoos would be understood instantly by Arabic, Persian, Urdu, Malay and Swahili speakers.

**Runner-up: Kamoos** (`app.kamoos`, `kamoos.app` at $8.75, then $14.93/yr). It has the strongest meaning for the priority Arabic audience and for the wider Muslim-world language set. It loses on three points:
- The `.com` costs $1,800 on the aftermarket.
- The Qamoos/Qamus store namespace is crowded, so users can confuse it with existing apps.
- The word is generic, so it can't be protected as a brand.
- The Latin spelling doesn't map cleanly to Arabic: Arabic readers see *K* as ك, not ق, and *Qamoos* puts English speakers off.

Pick it instead if instant recognition matters more than a clean, ownable brand.

**Fallback id** if the domain is not bought: a reverse-domain id under a domain already owned.

## Open points

- A formal trademark search (TMview / WIPO Global Brand Database, classes 9 and 41) for LEXNUR before committing. This is the one check that could change the answer, mainly because of how close it is to Lexzur. The web screen found nothing, but it is not a clearance.
- Confirm the name with Arabic-speaking testers: how ليكسنور looks as a wordmark, and whether *lex* reads as "law" to them.
