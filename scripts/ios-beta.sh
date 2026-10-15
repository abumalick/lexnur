#!/usr/bin/env bash
# Builds and uploads to TestFlight on the Mac (settings in scripts/lib/mac.sh). Copies fastlane/.env and the .p8.
set -euo pipefail
. "$(dirname "$0")/lib/mac.sh"
cd "$root"
mac_wake
rsync -a --delete --exclude node_modules --exclude sources --exclude .worktrees --exclude .git --exclude .tmp --exclude vendor \
  --exclude key.properties --exclude '*.jks' --exclude /.env --exclude website/.env \
  ./ "$LEXNUR_MAC_HOST:$LEXNUR_MAC_DIR/"
mac_run "cd $LEXNUR_MAC_DIR && "'mise trust >/dev/null && eval "$(mise env -s bash)" && bundle install && bundle exec fastlane ios beta'
