#!/usr/bin/env bash
# Helpers for the worktree harness. Sourced by worktree.sh / dev-server.sh.
# Defines functions only, no side effects on source. Copied verbatim into a
# project as scripts/lib/worktree-common.sh.

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

# wh_portless <args...> — run portless without the package-manager env that agent
# shells inherit: portless refuses to start when it sees npm_command=exec etc.
# Names come from prefix expansion, not from parsing `env`, whose values may
# contain newlines. PORTLESS_STATE_DIR is taken from WH_PORTLESS_STATE_DIR when set.
wh_portless() {
  local -a unset_args=()
  local n
  for n in "${!npm_@}" "${!PNPM_@}" "${!pnpm_@}" "${!COREPACK_@}"; do
    unset_args+=(-u "$n")
  done
  if [ -n "${WH_PORTLESS_STATE_DIR:-}" ]; then
    env ${unset_args[@]+"${unset_args[@]}"} PORTLESS_STATE_DIR="$WH_PORTLESS_STATE_DIR" portless "$@"
  else
    env ${unset_args[@]+"${unset_args[@]}"} portless "$@"
  fi
}

# ── Processes started in a worktree ─────────────────────────────────────────
# A dev server started in a worktree is not a child of the script that later
# removes the worktree, so nothing links the two except the server's cwd: it
# inherits the worktree path and no process of another worktree carries it. The
# port is no key (portless picks the real one) and neither is a pid file.
# Linux reads /proc; elsewhere lsof is used when installed; otherwise nothing is
# found and callers carry on. Everything here is best effort and returns 0.

# _wh_realpath <path> -> physical path; works for a deleted leaf whose parent exists.
_wh_realpath() {
  local p="$1"
  if [ -d "$p" ]; then (cd "$p" 2>/dev/null && pwd -P) && return 0; fi
  local parent; parent="$(cd "$(dirname "$p")" 2>/dev/null && pwd -P)" || { printf '%s' "$p"; return 0; }
  printf '%s/%s' "$parent" "$(basename "$p")"
}

# _wh_ppid <pid> -> parent pid
_wh_ppid() {
  local rest
  if [ -r "/proc/$1/stat" ]; then
    # The command name is parenthesised and may contain spaces and parens, so
    # read the fields after the last ')': state, then ppid.
    rest="$(cat "/proc/$1/stat" 2>/dev/null)" || return 0
    rest="${rest##*) }"
    # shellcheck disable=SC2086
    set -- $rest
    printf '%s' "${2:-}"
  else
    ps -o ppid= -p "$1" 2>/dev/null | tr -d ' '
  fi
}

# _wh_cwd <pid> -> its working directory ("(deleted)" suffix dropped)
_wh_cwd() {
  local cwd
  if [ -d /proc/1 ]; then
    cwd="$(readlink "/proc/$1/cwd" 2>/dev/null)" || return 0
    printf '%s' "${cwd% (deleted)}"
  elif command -v lsof >/dev/null 2>&1; then
    lsof -a -p "$1" -d cwd -F n 2>/dev/null | sed -n 's/^n//p'
  fi
}

_wh_under() { [ "$1" = "$2" ] || [ "${1#"$2"/}" != "$1" ]; }

# _wh_family_root <dir> -> the topmost ancestor of this script whose cwd is in <dir>
# (this script itself when none is). An agent launched inside the worktree is such
# an ancestor: its whole tree, the caller's siblings included, is left alone.
_wh_family_root() {
  local pid="$$" root="$$"
  while [ -n "$pid" ] && [ "$pid" != 0 ] && [ "$pid" != 1 ]; do
    if _wh_under "$(_wh_cwd "$pid")" "$1"; then root="$pid"; fi
    pid="$(_wh_ppid "$pid")"
  done
  printf '%s' "$root"
}

# _wh_related <pid> <root> -> true when <pid> is an ancestor of this script (whoever
# removes a worktree is often standing in it) or descends from <root> (the
# subshells doing the scan stand in the caller's cwd too).
_wh_related() {
  local pid
  pid="$$"
  while [ -n "$pid" ] && [ "$pid" != 0 ] && [ "$pid" != 1 ]; do
    [ "$pid" = "$1" ] && return 0
    pid="$(_wh_ppid "$pid")"
  done
  pid="$1"
  while [ -n "$pid" ] && [ "$pid" != 0 ] && [ "$pid" != 1 ]; do
    [ "$pid" = "$2" ] && return 0
    pid="$(_wh_ppid "$pid")"
  done
  return 1
}

# _wh_pid_cwds -> "<pid> <cwd>" for every visible process.
_wh_pid_cwds() {
  local entry cwd
  if [ -d /proc/1 ]; then
    for entry in /proc/[0-9]*; do
      cwd="$(readlink "$entry/cwd" 2>/dev/null)" || continue
      # A removed directory is reported as "<path> (deleted)": still a match.
      printf '%s %s\n' "${entry#/proc/}" "${cwd% (deleted)}"
    done
  elif command -v lsof >/dev/null 2>&1; then
    lsof -a -d cwd -u "$(id -u)" -F pn 2>/dev/null \
      | awk '/^p/{pid=substr($0,2)} /^n/{print pid, substr($0,2)}'
  fi
  return 0
}

# wh_procs_under <dir> -> "<pid>\t<path relative to dir, '.' for dir>\t<command>"
# for every process working in <dir> or below, except the caller's own family.
wh_procs_under() {
  local dir="${1:-}" pid cwd rel cmd root
  [ -n "$dir" ] || return 0
  dir="$(_wh_realpath "$dir")"
  root="$(_wh_family_root "$dir")"
  _wh_pid_cwds | while read -r pid cwd; do
    # The trailing slash matters: a sibling named <dir>2 is not below <dir>.
    if [ "$cwd" = "$dir" ]; then rel=.
    elif [ "${cwd#"$dir"/}" != "$cwd" ]; then rel="${cwd#"$dir"/}"
    else continue; fi
    if _wh_related "$pid" "$root"; then continue; fi
    if [ -r "/proc/$pid/cmdline" ]; then cmd="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null)" || cmd=""
    else cmd="$(ps -o command= -p "$pid" 2>/dev/null)" || cmd=""; fi
    printf '%s\t%s\t%s\n' "$pid" "$rel" "${cmd:-?}"
  done
  return 0
}

# wh_stop_procs_in <dir> — SIGTERM every process working in <dir> together with
# its descendants, wait (portless deregisters its route on SIGTERM), then SIGKILL
# what is left. Never fails the caller. Messages go to stderr.
wh_stop_procs_in() {
  local dir="${1:-}" procs pids pid _i root
  if [ ! -d /proc/1 ] && ! command -v lsof >/dev/null 2>&1; then
    echo "note: cannot list processes here (no /proc, no lsof); stop servers in $dir yourself" >&2
    return 0
  fi
  root="$(_wh_family_root "$(_wh_realpath "$dir")")"
  if [ "$root" != "$$" ]; then
    echo "note: the caller's own process tree (pid $root) works in $dir; it is left running" >&2
  fi
  procs="$(wh_procs_under "$dir" 2>/dev/null)" || return 0
  [ -n "$procs" ] || return 0
  echo "stopping processes still working in $dir:" >&2
  printf '%s\n' "$procs" | cut -f1,3 | sed 's/^/  /' >&2
  for pid in $(printf '%s\n' "$procs" | cut -f1); do wh_kill_tree "$pid"; done
  for _i in 1 2 3 4 5 6 7 8 9 10; do
    sleep 0.2
    pids="$(wh_procs_under "$dir" 2>/dev/null | cut -f1)" || pids=""
    [ -n "$pids" ] || return 0
  done
  # shellcheck disable=SC2086
  kill -9 $pids 2>/dev/null || true
  return 0
}

# wh_kill_tree <pid> — SIGTERM <pid> and every descendant. A package-manager
# wrapper puts several processes between a pid and the server holding the port.
# Children are collected before anything is killed: killing a parent loses them.
wh_kill_tree() {
  local pid="${1:-}" child
  [ -n "$pid" ] || return 0
  for child in $(pgrep -P "$pid" 2>/dev/null); do
    wh_kill_tree "$child"
  done
  kill "$pid" 2>/dev/null || true
  return 0
}
