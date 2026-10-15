#!/usr/bin/env bash
# Usage: app/scripts/ios-device.sh "<device name>" [extra env for the web build, e.g. VITE_SMOKE=1]
# Code signing needs the login keychain, which is locked to a plain ssh session, so the build runs in the
# console user's GUI session. It runs detached on the Mac, logging to a file, because a long ssh session can drop
# during the first xcodebuild; this script polls it until it finishes and exits with its status.
set -euo pipefail
device="$1"; shift || true
here="$(cd "$(dirname "$0")" && pwd)"
. "$(git rev-parse --show-toplevel)/scripts/lib/mac.sh"
host="$LEXNUR_MAC_HOST"
dest="$LEXNUR_MAC_DIR"
run="ios-device-$(date +%Y%m%d-%H%M%S)"

build=$(
  printf 'device=%q\nextra=()\n' "$device"
  for a in "$@"; do printf 'extra+=(%q)\n' "$a"; done
  cat <<'EOF'
cd "$(dirname "$0")/.."
status="${0%.sh}.status"
if [ "${1:-}" != run ]; then
  # sudo -n fails instead of waiting for a password nobody can type.
  nohup bash -c 'echo $$ > "$2"
    sudo -n launchctl asuser "$(id -u)" sudo -n -u "$(whoami)" env PATH="$PATH" HOME="$HOME" bash "$0" run
    rc=$?; [ -e "$1" ] || echo "$rc" > "$1"' "$PWD/${0#./}" "$status" "${0%.sh}.pid" > "${0%.sh}.log" 2>&1 < /dev/null &
  exit 0
fi
set -euo pipefail
trap 'echo $? > "$status"' EXIT
caffeinate -s -w $$ &
set -a && . fastlane/.env && set +a
env ${extra[@]+"${extra[@]}"} pnpm --filter @lexnur/app build
pnpm --filter @lexnur/app exec cap sync ios
xcodebuild -project app/ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination "platform=iOS,name=$device" -derivedDataPath app/ios/build \
  DEVELOPMENT_TEAM="$APPLE_TEAM_ID" -allowProvisioningUpdates \
  -authenticationKeyPath "$PWD/fastlane/AuthKey_$APP_STORE_KEY_ID.p8" \
  -authenticationKeyID "$APP_STORE_KEY_ID" -authenticationKeyIssuerID "$APP_STORE_ISSUER_ID" build
# The name is the first column, padded with at least two spaces: match it literally and whole.
# awk reads all its input, so pipefail never sees a SIGPIPE.
id=$(xcrun devicectl list devices | awk -v n="$device" '
  !id && substr($0, 1, length(n) + 2) == n "  " { for (i = 1; i <= NF; i++) if (length($i) == 36 && $i ~ /^[0-9A-F-]+$/) { id = $i; break } }
  END { print id }')
[ -n "$id" ] || { echo "No device named $device" >&2; exit 1; }
xcrun devicectl device install app --device "$id" app/ios/build/Build/Products/Debug-iphoneos/App.app
xcrun devicectl device process launch --terminate-existing --device "$id" com.lexnur
EOF
)
payload=$(printf '%s\n' "$build" | base64 | tr -d '\n')

"$here/mac.sh" "mkdir -p .tmp && echo $payload | base64 --decode > .tmp/$run.sh && bash .tmp/$run.sh"
echo "Building on $host, log: ~/$dest/.tmp/$run.log"

fails=0
while :; do
  sleep 20
  # "lost": no status and the detached run is gone (reboot, killed), so it will never write one.
  out=$(mac_run "f=$dest/.tmp/$run; cat \$f.status 2>/dev/null || { kill -0 \$(cat \$f.pid 2>/dev/null) 2>/dev/null && echo running; } || cat \$f.status 2>/dev/null || echo lost" 2>/dev/null) || out=""
  out="${out##*$'\n'}"
  case "$out" in
    running) fails=0 ;;
    lost) echo "The build on $host ended without a status, log: ~/$dest/.tmp/$run.log" >&2; out=1; break ;;
    '' | *[!0-9]*)
      fails=$((fails + 1))
      if ((fails >= 15)); then echo "Lost contact with $host; the build may still be running, log: ~/$dest/.tmp/$run.log" >&2; exit 1; fi ;;
    *) break ;;
  esac
done
ssh "$host" "tail -n 40 $dest/.tmp/$run.log" || true
exit "$out"
