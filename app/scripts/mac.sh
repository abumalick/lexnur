#!/usr/bin/env bash
# Usage: app/scripts/mac.sh '<command run from the repo root on the Mac>'
# Mirrors this checkout to the Mac and runs the command there (Mac settings: scripts/lib/mac.sh).
set -euo pipefail
. "$(git rev-parse --show-toplevel)/scripts/lib/mac.sh"
host="$LEXNUR_MAC_HOST"
dest="$LEXNUR_MAC_DIR"
ssh "$host" "mkdir -p $dest"
rsync -a --delete \
  --exclude .git --exclude node_modules --exclude sources --exclude .worktrees --exclude .tmp --exclude /build \
  --exclude 'app/ios/build' --exclude 'app/build/bench' --exclude '.build' --exclude 'app/android/app/build' --exclude 'app/android/build' \
  --exclude .env --exclude 'fastlane/AuthKey_*.p8' \
  "$root/" "$host:$dest/"
mac_run "cd $dest && mise trust >/dev/null && mise install >/dev/null && pnpm install --frozen-lockfile >/dev/null && $1"
