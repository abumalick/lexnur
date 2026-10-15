#!/usr/bin/env bash
# Usage: scripts/fetch.sh <source-id> <url> [<url>...]
# Downloads into sources/<source-id>/ (resumable) and appends name, size, sha256 to its FILES.tsv.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
id="$1"; shift
dir="$root/sources/$id"
mkdir -p "$dir"
for url in "$@"; do
  name="$(basename "$url")"
  if [[ -f "$dir/FILES.tsv" ]] && cut -f1 "$dir/FILES.tsv" | rg -qxF "$name"; then continue; fi
  curl -fL --retry 5 --retry-delay 10 -C - -o "$dir/$name" "$url"
  sha="$(sha256sum "$dir/$name" | cut -d' ' -f1)"
  size="$(stat -c %s "$dir/$name")"
  printf '%s\t%s\t%s\t%s\t%s\n' "$name" "$size" "$sha" "$url" "$(date -u +%FT%TZ)" >> "$dir/FILES.tsv"
done
