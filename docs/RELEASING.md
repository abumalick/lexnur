# Releasing Lexnur

How to ship an app update to Google Play and the App Store. Publishing a dictionary package or a catalog change does not need an app release: see [pipeline/README.md § Publishing a dictionary](../pipeline/README.md#publishing-a-dictionary).

**Where things stand** (update this line when you ship): 1.1.1, build 3, is in review on Google Play production. On iOS, 1.1.0 (build 2) is waiting for App Review with release after approval; 1.1.1 (build 3) is on TestFlight with its screenshots committed — once 1.1.0 is approved, run `just metadata-ios` and submit 1.1.1. The next upload needs build number 4 or higher on Android, 3 or higher on iOS.

The flow, in short:

1. In a worktree: `just bump`, release notes, store texts, screenshots, `just test`; finish it into `main`.
2. From the main checkout: `just android-internal` (Play internal testing) and `just ios-beta` (TestFlight), plus `just metadata-android` / `just metadata-ios` when the listing changed.
3. Check both test builds on real devices.
4. In the consoles: promote to Play production and send for review; submit the App Store version for review, released after approval.

The justfile and `fastlane/Fastfile` hold every command; `just --list` shows the recipes.

## One-time setup

```sh
mise install            # Node, pnpm, Java 21, Ruby (mise.toml)
pnpm install
bundle install          # fastlane (Gemfile)
echo "sdk.dir=$HOME/Android/Sdk" > app/android/local.properties
```

**iOS builds and screenshots run on a Mac** (Xcode 26, mise, pnpm, ImageMagick). `just ios-beta`, `just ios-sim` and `scripts/screenshots/run-ios.sh` rsync the checkout to the Mac over SSH and run there; they read `LEXNUR_MAC_HOST` (the SSH host) and `LEXNUR_MAC_DIR` (the checkout directory on the Mac, relative to its home) from the environment or from a git-ignored `.env` at the repo root. Two optional hooks: `LEXNUR_MAC_WAKE`, a command run before syncing (for example one that wakes the Mac), and `LEXNUR_MAC_RUN`, a command that runs its single argument on the Mac instead of `ssh "$LEXNUR_MAC_HOST"` (for example one that also keeps the Mac awake meanwhile). See `scripts/lib/mac.sh`. Keep the Mac on AC power for long runs: on battery it sleeps mid-run.

Publishing packages to R2 needs `wrangler login` (OAuth) on the Cloudflare account that owns `lexnur.com`; see `docs/HOSTING.md`.

## Secrets

None of these are in git. Release signing and uploads therefore run from the **main checkout** only: worktrees do not get the keys.

| What | Path | Read by |
|---|---|---|
| Play service account key (`lexnur-fastlane`) | `~/.config/lexnur/play-store-credentials.json` (outside the repo, mode 600) | `fastlane/Appfile`, `PLAY_KEY` in the Fastfile |
| Android upload keystore | `app/android/key.properties` (alias `upload`) + `app/android/upload.jks` | Gradle release signing; the Android lanes refuse to run without `key.properties` |
| App Store Connect API key | `fastlane/.env` (`APP_STORE_KEY_ID`, `APP_STORE_ISSUER_ID`, `APPLE_TEAM_ID`) + `fastlane/AuthKey_<APP_STORE_KEY_ID>.p8` | fastlane loads `fastlane/.env`; the iOS lanes and the Xcode export use the `.p8` |
| App Review contact | `fastlane/metadata/ios/review_information/{first_name,last_name,email_address,phone_number}.txt` (only `notes.txt` is tracked) | `just metadata-ios` |

Backups of the Play key and the upload keystore are kept by the account holder outside the repo. `just android-validate` checks that the Play key still reaches the Play Console.

`just ios-beta` copies `fastlane/.env` and the `.p8` to the Mac because the TestFlight lane needs them there; `just ios-sim` and `run-ios.sh` exclude them.

## Release runbook

### 1. Prepare the release in a worktree

```sh
scripts/worktree.sh create release-X.Y.Z
cd .worktrees/release-X.Y.Z
just bump X.Y.Z <build>
```

- `just bump` (`scripts/bump-version.sh`) sets the same version name and build number in `app/android/app/build.gradle`, the Xcode project and `app/package.json`. The app reports `app/package.json`'s version to the catalog (`min_app_version`), and `vite build` fails when it differs from `build.gradle` (`app/scripts/version-guard.ts`). Every store upload needs a build number higher than the last one, on both stores.
- **Release notes:** `fastlane/metadata/android/{en-US,ar}/changelogs/<build>.txt` (the file name is the build number, 500 characters max) and `fastlane/metadata/ios/{en-US,ar-SA}/release_notes.txt`.
- **Store texts**, when they change: `fastlane/metadata/android/<locale>/` and `fastlane/metadata/ios/<locale>/`. Limits, checked by `fastlane/check_metadata.rb` (part of `just test`): Play title 30 characters and **short description 80 characters**; App Store name and subtitle 30 characters, promotional text 170, and **keywords 100 bytes** (Apple counts bytes, so an Arabic letter costs two; comma-separated, no spaces around commas).
- **Screenshots**, when the UI changed: `just screenshots`. They are taken with Playwright from the web fixture build: Chromium here for Play (`fastlane/metadata/android/<locale>/images/`), WebKit on the Mac for the App Store (`fastlane/screenshots/ios/`, via `scripts/screenshots/run-ios.sh`, which copies them back). `just store-graphics` redraws the Play icon and feature graphic.
- `just test` and `just typecheck`, then commit and `scripts/worktree.sh finish release-X.Y.Z`.

### 2. Upload test builds (main checkout)

```sh
cd <main checkout>        # on main, clean, with the release merged
just android-internal
just ios-beta
```

- `just android-internal` builds the signed bundle (`android build` lane), runs `scripts/check-android-release.sh` (16 KB alignment of every native library, targetSdk ≥ 36) and uploads it to the **internal testing** track as a completed release. Pass `draft` (`just android-internal draft`) to upload without rolling it out to testers. Dry run: `bundle exec fastlane android internal validate_only:true`.
- `just ios-beta` builds, signs (cloud-managed signing through the API key) and uploads to **TestFlight** on the Mac; it takes about 25 minutes. The lane refuses an IPA whose version differs from the project. In App Store Connect → TestFlight, add the build to the **Lexnur internal** group if it does not get it automatically. `bundle exec fastlane ios latest_build` prints the latest TestFlight build number.
- **Listing:** `just metadata-android` uploads the Play texts, images and screenshots, and must run after `just android-internal` (supply attaches the listing to the internal release with the current build number). `just metadata-ios` uploads the App Store texts, review notes and screenshots to the version named by the Xcode project, creating that version in App Store Connect if needed; it never submits. Both run the metadata and screenshot checks first.

### 3. Test

Install the internal-testing build on an Android phone and the TestFlight build on an iPhone and go through search, an entry, downloading a dictionary and the library. For development builds: `just android-debug <adb serial>` and `just ios-sim` (Mac simulator).

### 4. Release

**Google Play** (Play Console → Lexnur):
1. Test and release → Testing → Internal testing → the release → **Promote release → Production**. Check the release notes (they come from `changelogs/<build>.txt`) and save.
2. Publishing overview → **Send changes for review**. Nothing reaches review until this is done. With managed publishing on, approved changes then wait for **Publish** on the same page.

**App Store** (App Store Connect → Lexnur → the new version):
1. Build → select the TestFlight build.
2. App Store Version Release → **Automatically release this version after App Review approval** (`AFTER_APPROVAL`).
3. **Add for Review**, then **Submit to App Review**.

Then update "Where things stand" at the top of this file.

## Store records

- **Foreground service (Play):** the download runs as a `dataSync` foreground service (`packages/lexnur-native/android/src/main/AndroidManifest.xml`). Play Console → App content → Foreground service permissions holds the declaration with a demo video of a download. Update it if the app starts using another foreground-service type or changes what the service does.
- **Content rating:** the Play content rating and the Apple age rating answered "no offensive language". That relies on the pipeline's content filter (`docs/CATALOG.md`); if a package ever ships vulgar senses, redo both questionnaires.
- **Export compliance:** `Info.plist` sets `ITSAppUsesNonExemptEncryption = NO` (the app does no encryption of its own; HTTPS is exempt), so TestFlight asks no question. The `ios beta` lane refuses to build without it.
- **App Privacy** answers in App Store Connect must be **Published** before a submission; they are, and only need republishing if data handling changes.

## Gotchas

- **App Review contact:** the App Store Connect API refuses the review contact fields (name, email) unless the phone number is sent in the same request. Keep all four contact files plus `notes.txt` in `fastlane/metadata/ios/review_information/`; the phone number needs a `+` country code.
- **iOS screenshots and the version guard:** `run-ios.sh` does not sync `app/android/`, but the vite build on the Mac checks `app/package.json` against `app/android/app/build.gradle`, so the script copies `build.gradle` separately. Keep that copy if the excludes change. A run interrupted mid-way can leave `vite preview` listening on the Mac; capture refuses to start until it is stopped.
- **Play screenshots** above a 2:1 ratio are rejected; the phone shots are 1080×1920. **App Store screenshots** must have no alpha channel; `capture.ts` strips it and the check refuses otherwise.
- **16 KB pages:** Play rejects an app targeting API 35+ if any native library is 4 KB-aligned; the `android internal` lane refuses to upload until `scripts/check-android-release.sh` passes.
- **Release builds** must have Capacitor `loggingBehavior: "none"`; the lanes check the synced `capacitor.config.json`. Do not export `LEXNUR_DEBUG` when releasing.
- **Team id:** the Xcode project carries no `DEVELOPMENT_TEAM`; the `beta` lane and `app/scripts/ios-device.sh` pass `APPLE_TEAM_ID` from `fastlane/.env`. If Xcode's Signing tab writes a team back into `project.pbxproj`, drop it before committing. The simulator build needs none.
- **Homebrew rsync on the Mac** breaks Xcode's IPA export; the `beta` lane pins rsync's server side to `/usr/bin/rsync`.
- **Play API and production:** the Play API cannot create a completed production release for an app that has never been published, and a production release saved through the API or `supply` still waits for **Send changes for review** in the console.
- **Regenerating the native icons:** `pnpm dlx --allow-build=sharp @capacitor/assets@3.0.5 generate --ios --android …` (pnpm 11 blocks sharp's build script without the flag). Revert the whitespace-only `AndroidManifest.xml` reformat it makes.
