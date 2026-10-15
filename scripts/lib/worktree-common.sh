#!/usr/bin/env bash
# Pure helpers for the worktree harness. Sourced by worktree.sh / dev-server.sh.
# Deterministic, no side effects on source. Copied verbatim into a project as
# scripts/lib/worktree-common.sh.

# wh_slugify <string> -> lowercase, non [a-z0-9-] collapsed to '-', trimmed
wh_slugify() {
  [ "${1:-}" = "--" ] && shift
  printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9-]+/-/g; s/-+/-/g; s/^-+//; s/-+$//'
}

# wh_leaf <branch> -> slugified last path segment (portless prefix)
wh_leaf() { wh_slugify "${1##*/}"; }

# wh_hash_to_port <string> <band_start> <band_size> -> stable port in [start, start+size)
# Deterministic per input, but not collision-free: distinct inputs can share a slot.
wh_hash_to_port() {
  local s="$1" start="$2" size="$3" h=5381 i c
  for (( i=0; i<${#s}; i++ )); do
    printf -v c '%d' "'${s:$i:1}"
    h=$(( (h * 33 + c) & 0xffffffff ))
  done
  printf '%d' $(( start + (h % size) ))
}

# wh_url <label> <leaf> [tld] -> portless host URL (https on dev host, localhost fallback)
wh_url() {
  local label="$1" leaf="$2" tld="${3:-}"
  if [ -n "$tld" ]; then printf 'https://%s-%s.%s' "$label" "$leaf" "$tld"
  else printf 'http://%s-%s.localhost' "$label" "$leaf"; fi
}
