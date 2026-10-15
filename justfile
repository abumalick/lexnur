set shell := ["zsh", "-c"]
set dotenv-load

# Optional memory cap for the big pipeline builds, e.g. LEXNUR_HEAVY="systemd-run --user --scope -p MemoryMax=8G" (env or .env)
heavy := env("LEXNUR_HEAVY", "")

# Install every workspace package
install:
    pnpm install

# Unit tests across the workspace, plus the release-tooling checks
test:
    pnpm test
    bash scripts/test-bump-version.sh
    bash scripts/test-check-android-release.sh
    bundle exec ruby fastlane/check_metadata.rb

typecheck:
    pnpm typecheck

# Pipeline (Plan 1). The Kaikki builds stream ~24 GB and run under the optional memory cap.

pipeline-oewn:
    pnpm --filter @lexnur/pipeline build:oewn

pipeline-ar-en:
    {{heavy}} pnpm --filter @lexnur/pipeline build:wiktionary-ar-en

pipeline-en:
    HEAVY_MEM=12G {{heavy}} pnpm --filter @lexnur/pipeline build:wiktionary-en

fixture:
    {{heavy}} pnpm --filter @lexnur/pipeline build:fixture

catalog:
    pnpm --filter @lexnur/pipeline run catalog

# App (Plan 2)

app-dev:
    pnpm --filter @lexnur/app dev

app-build:
    pnpm --filter @lexnur/app build

# Debug build installed on an Android device: just android-debug <adb serial>
android-debug serial:
    adb devices
    pnpm --filter @lexnur/app build && pnpm --filter @lexnur/app exec cap sync android
    cd app/android && ./gradlew assembleDebug
    adb -s {{serial}} install -r app/android/app/build/outputs/apk/debug/app-debug.apk

# Debug build on the iPhone 17 Pro Max simulator, on the Mac
ios-sim:
    bash scripts/ios-sim.sh

# Store screenshots (Playwright on the fixture build): Android here, iOS on the Mac

screenshots: screenshots-android screenshots-ios

screenshots-android *args:
    pnpm --filter @lexnur/screenshots capture --platform=android {{args}}
    pnpm --filter @lexnur/screenshots check --platform=android

screenshots-ios *args:
    bash scripts/screenshots/run-ios.sh {{args}}

store-graphics:
    pnpm --filter @lexnur/screenshots graphics

# Release (main checkout only: needs app/android/key.properties and fastlane/.env)

android-validate:
    bundle exec fastlane android validate_credentials

android-release:
    bundle exec fastlane android build

android-internal status="completed": android-release
    bundle exec fastlane android internal status:{{status}}

ios-beta:
    bash scripts/ios-beta.sh

metadata-android:
    bundle exec ruby fastlane/check_metadata.rb
    pnpm --filter @lexnur/screenshots check --platform=android
    bundle exec fastlane android upload_metadata

metadata-ios:
    bundle exec ruby fastlane/check_metadata.rb
    pnpm --filter @lexnur/screenshots check --platform=ios
    bundle exec fastlane ios upload_metadata

# Same version on both platforms, e.g. just bump 1.0.1 2
bump name code:
    bash scripts/bump-version.sh {{name}} {{code}}
