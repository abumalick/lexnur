#!/usr/bin/env bash
# Captures the App Store screenshots in Playwright WebKit on the Mac (SF fonts) and copies them back.
# Usage: scripts/screenshots/run-ios.sh [--skip-build]   (Mac settings: scripts/lib/mac.sh)
# The Mac must be on AC power: on battery it drops into maintenance sleep mid-run despite caffeinate.
# A dropped run can leave vite preview listening on the Mac; capture then refuses to start until it is killed.
set -euo pipefail
. "$(dirname "$0")/../lib/mac.sh"
cd "$root"
HOST=$LEXNUR_MAC_HOST
REMOTE_DIR=$LEXNUR_MAC_DIR

mac_wake

rsync -a --delete --exclude node_modules --exclude sources --exclude .worktrees --exclude .git --exclude .tmp \
  --exclude build --exclude 'app/android' --exclude 'app/ios' --exclude vendor \
  --exclude key.properties --exclude '*.jks' --exclude .env --exclude 'fastlane/AuthKey_*' \
  ./ "$HOST:$REMOTE_DIR/"
# vite's version guard compares app/package.json with build.gradle, which the exclude above skips
rsync -a --mkpath app/android/app/build.gradle "$HOST:$REMOTE_DIR/app/android/app/build.gradle"

mac_run "cd $REMOTE_DIR && mise trust >/dev/null && eval \"\$(mise env -s bash)\" \
  && (command -v magick >/dev/null || brew install imagemagick) \
  && pnpm install --frozen-lockfile \
  && pnpm --filter @lexnur/screenshots exec playwright install webkit \
  && pnpm --filter @lexnur/screenshots capture --platform=ios $* \
  && pnpm --filter @lexnur/screenshots check --platform=ios"

for locale in en-US ar-SA; do
  mkdir -p "fastlane/screenshots/ios/$locale"
  rsync -a --delete "$HOST:$REMOTE_DIR/fastlane/screenshots/ios/$locale/" "fastlane/screenshots/ios/$locale/"
done
pnpm --filter @lexnur/screenshots check --platform=ios
