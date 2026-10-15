# Sourced by the scripts that build or capture on the Mac over SSH.
# Settings come from the environment or from .env at the repo root (git-ignored):
#   LEXNUR_MAC_HOST  SSH host of the Mac (required)
#   LEXNUR_MAC_DIR   checkout directory on the Mac, relative to its home (required)
#   LEXNUR_MAC_WAKE  optional command run before syncing, e.g. one that wakes the Mac
#   LEXNUR_MAC_RUN   optional command that runs its single argument on the Mac (default: ssh "$LEXNUR_MAC_HOST")
root="$(git rev-parse --show-toplevel)"
if [ -f "$root/.env" ]; then set -a; . "$root/.env"; set +a; fi
: "${LEXNUR_MAC_HOST:?set LEXNUR_MAC_HOST to the SSH host of the Mac (docs/RELEASING.md)}"
: "${LEXNUR_MAC_DIR:?set LEXNUR_MAC_DIR to the checkout directory on the Mac (docs/RELEASING.md)}"

mac_wake() { if [ -n "${LEXNUR_MAC_WAKE:-}" ]; then $LEXNUR_MAC_WAKE; fi; }
mac_run() { if [ -n "${LEXNUR_MAC_RUN:-}" ]; then $LEXNUR_MAC_RUN "$1"; else ssh "$LEXNUR_MAC_HOST" "$1"; fi; }
