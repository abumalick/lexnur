#!/usr/bin/env bash
# Debug build on the iPhone 17 Pro Max simulator, on the Mac (settings in scripts/lib/mac.sh).
set -euo pipefail
. "$(dirname "$0")/lib/mac.sh"
cd "$root"
mac_wake
rsync -a --delete --exclude node_modules --exclude sources --exclude .worktrees --exclude .git --exclude .tmp --exclude vendor \
  --exclude key.properties --exclude '*.jks' --exclude .env --exclude 'fastlane/.env' --exclude 'fastlane/AuthKey_*' \
  ./ "$LEXNUR_MAC_HOST:$LEXNUR_MAC_DIR/"
mac_run "cd $LEXNUR_MAC_DIR && "'mise trust >/dev/null && eval "$(mise env -s bash)" && pnpm install --frozen-lockfile && pnpm --filter @lexnur/app build && pnpm --filter @lexnur/app exec cap sync ios && xcodebuild -project app/ios/App/App.xcodeproj -scheme App -configuration Debug -destination "platform=iOS Simulator,name=iPhone 17 Pro Max" -derivedDataPath build/dd build && xcrun simctl boot "iPhone 17 Pro Max" 2>/dev/null; xcrun simctl install booted build/dd/Build/Products/Debug-iphonesimulator/App.app && xcrun simctl launch booted com.lexnur'
