#!/usr/bin/env bash
# SC2016: the *_CMD config vars below are single-quoted on purpose (they expand at eval time).
# shellcheck disable=SC2016
set -euo pipefail

# ── Config (filled by the worktree-harness builder) ──────────────────────────
WH_LABEL=""                 # portless/base label, e.g. package.json "portless"; empty -> no URL
WH_TLD=""                     # dev-host TLD (e.g. dev.example.com); empty -> localhost
WH_PORT_MODE="none"         # hash (export PORT from the band) | portless (portless assigns it) | none
WH_PORT_BAND_START=""
WH_PORT_BAND_SIZE=""
WH_WT_DIR=".worktrees"
WH_ENV_FILES="app/android/local.properties .env website/.env"                    # space-separated gitignored files copied main->worktree
WH_SHARED_LINKS="sources"              # space-separated gitignored dirs symlinked main->worktree
# The *_CMD vars below are SINGLE-quoted so any $WH_PORT/$WH_SLUG/... they contain
# expand at eval time, not at assignment. Keep them free of literal single quotes.
WH_INSTALL_CMD='pnpm install'                # run in a new/resumed worktree, e.g. pnpm install; empty = skip
WH_UP_CMD=''                          # server-start cmd, run from the worktree (empty = print only)
WH_FINISH_MODEL="merge-main"              # pr | merge-main | merge-branch | land
WH_INTEGRATION_BRANCH="main" # branches start from it and finish into it (e.g. main, demo)
WH_DEPLOY_CMD=''                  # run from the main checkout after merge; empty = skip
WH_DEPLOY_VERIFY=''            # run to confirm deploy; empty = skip
# ─────────────────────────────────────────────────────────────────────────────

here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=/dev/null
. "$here/lib/worktree-common.sh"

# Run from the main checkout even when invoked inside a worktree.
main_root="$(git rev-parse --path-format=absolute --git-common-dir)"
main_root="$(cd "$main_root/.." && pwd)"
ib="$WH_INTEGRATION_BRANCH"

# Only `create`'s worktree path goes to stdout; every message goes to stderr.
say() { printf '%s\n' "$*" >&2; }
die() { say "$*"; exit 1; }
g()   { git -C "$main_root" "$@"; }

wt_path()  { printf '%s/%s/%s' "$main_root" "$WH_WT_DIR" "$(wh_slugify "$1")"; }
wt_port()  { wh_hash_to_port "$(wh_slugify "$1")" "$WH_PORT_BAND_START" "$WH_PORT_BAND_SIZE"; }
wt_url()   { wh_url "$WH_LABEL" "$(wh_leaf "$1")" "$WH_TLD"; }

has_origin()   { g remote get-url origin >/dev/null 2>&1; }
fetch_origin() { if has_origin; then g fetch --quiet origin >&2 || say "warning: git fetch origin failed; using local refs"; fi; }

# base_ref -> origin/<integration> when it exists, else the local integration branch.
base_ref() {
  if has_origin && g rev-parse --verify --quiet "refs/remotes/origin/$ib" >/dev/null; then echo "origin/$ib"
  elif g rev-parse --verify --quiet "refs/heads/$ib" >/dev/null; then echo "$ib"
  else die "integration branch '$ib' not found"; fi
}

# With a remote, only what reached origin counts: a merge left unpushed is not done.
is_merged() {
  if has_origin && g rev-parse --verify --quiet "refs/remotes/origin/$ib" >/dev/null; then
    g merge-base --is-ancestor "$1" "origin/$ib" 2>/dev/null
  else
    g merge-base --is-ancestor "$1" "$ib" 2>/dev/null
  fi
}

# _worktrees -> "<path>\t<branch>" per linked worktree (branch empty when detached).
# The first porcelain record is the main checkout and is skipped.
_worktrees() {
  local line path="" br="" n=0
  { g worktree list --porcelain; echo; } | while IFS= read -r line; do
    case "$line" in
      "worktree "*) path="${line#worktree }"; br="" ;;
      "branch refs/heads/"*) br="${line#branch refs/heads/}" ;;
      "")
        if [ -n "$path" ]; then
          n=$((n + 1))
          if [ "$n" -gt 1 ]; then printf '%s\t%s\n' "$path" "$br"; fi
        fi
        path="" ;;
    esac
  done
}

# resolve <branch|slug> -> R_BRANCH, R_WT (each empty when absent). Folder names are
# slugified, so the slug is how an agent sees a worktree; the branch is what git needs.
resolve() {
  local arg="$1" slug path br
  slug="$(wh_slugify "$arg")"; R_BRANCH=""; R_WT=""
  while IFS=$'\t' read -r path br; do
    if [ -n "$br" ] && [ "$br" = "$arg" ]; then R_WT="$path"; R_BRANCH="$br"; break; fi
    case "$path" in */"$WH_WT_DIR/$slug") R_WT="$path"; R_BRANCH="$br" ;; esac
  done < <(_worktrees)
  if [ -z "$R_WT" ] && g show-ref --verify --quiet "refs/heads/$arg"; then R_BRANCH="$arg"; fi
}

# _dirty_files <wt> -> tracked changes + untracked non-ignored files, minus the
# shared-dir symlinks create added (git sees a symlink, not the ignored dir).
# Fails when git status itself fails: an unreadable worktree is not a clean one.
_dirty_files() {
  local st l; st="$(git -C "$1" status --porcelain --untracked-files=all)" || return 1
  # shellcheck disable=SC2086
  for l in $WH_SHARED_LINKS; do st="$(printf '%s\n' "$st" | grep -vxF "?? ${l%/}" || true)"; done
  printf '%s' "$st"
}

_rebase_in_progress() {
  local d
  for d in rebase-merge rebase-apply; do
    [ -d "$(git -C "$1" rev-parse --path-format=absolute --git-path "$d")" ] && return 0
  done
  return 1
}

# rebase_onto <wt> <base> — a conflicting rebase is aborted, leaving the branch as it was.
rebase_onto() {
  local wt="$1" base="$2" out
  git -C "$wt" merge-base --is-ancestor "$base" HEAD && return 0
  if out="$(git -C "$wt" rebase "$base" 2>&1)"; then say "rebased onto $base"; return 0; fi
  if _rebase_in_progress "$wt"; then
    git -C "$wt" rebase --abort >/dev/null 2>&1 || true
    say "warning: rebasing onto $base conflicts — aborted, branch left as it was."
  else
    say "warning: could not rebase onto $base:"; say "$out"
  fi
  return 1
}

# A pushed branch (PR open) is not rebased: that would make its next push a rejected
# non-fast-forward.
_resume_rebase() {
  if git -C "$1" rev-parse --verify --quiet '@{upstream}' >/dev/null 2>&1; then
    say "branch is already pushed (has an upstream); not rebasing it onto $2"
  else
    rebase_onto "$1" "$2" || true
  fi
}

# Copy gitignored env/secret files from the main checkout into the worktree, so the
# worktree's server has its config without those files being tracked. Missing files
# are skipped; a worktree's own copy is never overwritten on resume.
_copy_env_files() {
  local wt="$1" f
  # shellcheck disable=SC2086
  for f in $WH_ENV_FILES; do
    if [ ! -f "$main_root/$f" ] || [ -e "$wt/$f" ]; then continue; fi
    mkdir -p "$wt/$(dirname "$f")"
    cp "$main_root/$f" "$wt/$f"
    say "copied $f -> worktree"
  done
}

# Large gitignored dirs (data, caches) are shared by symlink instead of copied.
_link_shared() {
  local wt="$1" d
  # shellcheck disable=SC2086
  for d in $WH_SHARED_LINKS; do
    d="${d%/}"
    [ -e "$main_root/$d" ] || continue
    [ -L "$wt/$d" ] && continue
    if [ -e "$wt/$d" ]; then say "warning: $d already exists in the worktree; not linked"; continue; fi
    mkdir -p "$(dirname "$wt/$d")"
    ln -s "$main_root/$d" "$wt/$d"
    say "linked $d -> main checkout"
  done
}

_unlink_shared() {
  local wt="$1" d
  # shellcheck disable=SC2086
  for d in $WH_SHARED_LINKS; do
    d="${d%/}"
    if [ -L "$wt/$d" ]; then rm "$wt/$d"; fi
  done
}

# A worktree's mise config is a copy at a new path, so it starts untrusted even
# when main's is trusted, and every mise-managed tool then fails in it.
_mise_trust() {
  local wt="$1" f
  command -v mise >/dev/null 2>&1 || return 0
  for f in mise.toml .mise.toml .tool-versions; do
    [ -f "$wt/$f" ] || continue
    mise trust "$wt/$f" >&2 2>&1 || say "warning: mise trust $f failed"
  done
}

_print_info() {
  if [ -n "$WH_LABEL" ]; then say "url:      $(wt_url "$1")"; fi
  case "$WH_PORT_MODE" in
    portless) say "port:     assigned by portless" ;;
    hash)     say "port:     $(wt_port "$1")" ;;
  esac
}

cmd_create() {
  local branch="$1" wt base cur
  wt="$(wt_path "$branch")"
  fetch_origin
  base="$(base_ref)"
  if [ -d "$wt" ]; then
    git -C "$wt" rev-parse --git-dir >/dev/null 2>&1 || die "$wt exists but is not a git worktree"
    # Distinct branches can share a slug (feat/x, feat-x): never resume another's worktree.
    cur="$(git -C "$wt" symbolic-ref --quiet --short HEAD)" || cur="(detached)"
    [ "$cur" = "$branch" ] || die "$wt belongs to branch $cur, not $branch — pick another branch name"
    say "resuming existing worktree $wt"
    _resume_rebase "$wt" "$base"
  elif g show-ref --verify --quiet "refs/heads/$branch"; then
    g worktree add "$wt" "$branch" >&2
    _resume_rebase "$wt" "$base"
  else
    g worktree add --no-track -b "$branch" "$wt" "$base" >&2
  fi
  _copy_env_files "$wt"
  _link_shared "$wt"
  _mise_trust "$wt"
  if [ -n "$WH_INSTALL_CMD" ]; then
    say "+ install: $WH_INSTALL_CMD"
    ( cd "$wt" && eval "$WH_INSTALL_CMD" ) >&2 || say "warning: install failed; rerun it in $wt"
  fi
  say "worktree: $wt"
  _print_info "$branch"
  printf '%s\n' "$wt"
}

cmd_up() {
  local arg="$1" bg="$2" wt branch url="" port="" log
  resolve "$arg"; wt="$R_WT"
  if [ -z "$wt" ] || [ ! -d "$wt" ]; then die "no worktree for '$arg' — create it first"; fi
  branch="${R_BRANCH:-$arg}"
  if [ -n "$WH_LABEL" ]; then url="$(wt_url "$branch")"; fi
  if [ "$WH_PORT_MODE" = hash ]; then port="$(wt_port "$branch")"; fi
  if [ -z "$WH_UP_CMD" ]; then
    say "Start the dev server from $wt${url:+ at $url}${port:+ (port $port)}."
    return 0
  fi
  # WH_SLUG/WH_PORT let the up-cmd namespace DB / COMPOSE_PROJECT_NAME per worktree.
  export WH_URL="$url" WH_PORT="$port" WH_SLUG="${wt##*/}"
  if [ -n "$port" ]; then export PORT="$port"; fi
  if [ "$bg" = 1 ]; then
    log="$main_root/$WH_WT_DIR/.logs/${wt##*/}.log"
    mkdir -p "$(dirname "$log")"
    # The redirections apply to the whole subshell: redirecting only the inner command
    # leaves the subshell holding the caller's stdout, so `$(… up --bg)` never returns.
    ( cd "$wt" && eval "$WH_UP_CMD" ) </dev/null >"$log" 2>&1 &
    printf 'log: %s\npid: %s\n' "$log" "$!"
    return 0
  fi
  say "starting: $WH_UP_CMD  (cwd=$wt${url:+, url=$url}${port:+, port=$port})"
  cd "$wt" && eval "$WH_UP_CMD"
}

cmd_list() {
  local base path br dir behind ahead merged dirty age registered=" " procs orphans
  base="$(base_ref 2>/dev/null)" || base=""
  printf '%-28s %-28s %-14s %-6s %-7s %s\n' DIR BRANCH +AHEAD/-BEHIND MERGED DIRTY LAST-COMMIT
  while IFS=$'\t' read -r path br; do
    dir="${path##*/}"; registered="$registered$dir "
    behind="-"; ahead="-"; merged="-"; dirty="-"; age="-"
    if [ -n "$br" ] && [ -n "$base" ]; then
      read -r behind ahead < <(g rev-list --left-right --count "$base...$br")
      if is_merged "$br"; then merged=yes; else merged=no; fi
    fi
    if [ -d "$path" ]; then
      if ! dirty="$(_dirty_files "$path")"; then dirty=error
      elif [ -n "$dirty" ]; then dirty=yes; else dirty=no; fi
      age="$(git -C "$path" log -1 --format=%cr 2>/dev/null)" || age="-"
    else
      dirty=missing
    fi
    printf '%-28s %-28s %-14s %-6s %-7s %s\n' "$dir" "${br:-(detached)}" "+$ahead/-$behind" "$merged" "$dirty" "$age"
  done < <(_worktrees)

  # Processes still running in a worktree directory that is no longer registered.
  procs="$(wh_procs_under "$main_root/$WH_WT_DIR")"
  orphans="$(printf '%s\n' "$procs" | while IFS=$'\t' read -r pid rel cmd; do
    [ -n "$pid" ] || continue
    dir="${rel%%/*}"
    case "$dir" in .|.logs) continue ;; esac
    case "$registered" in *" $dir "*) continue ;; esac
    printf '  %s  %s  %s\n' "$pid" "$dir" "$cmd"
  done)"
  if [ -n "$orphans" ]; then
    echo
    echo "processes left in removed worktrees (stop with: scripts/worktree.sh remove <dir>):"
    printf '%s\n' "$orphans"
  fi
}

cmd_remove() {
  local arg="$1" force="$2" branch wt dirty sha
  resolve "$arg"; branch="$R_BRANCH"; wt="$R_WT"
  if [ -n "$branch" ] && [ "$branch" = "$ib" ]; then die "refusing to remove the integration branch $ib"; fi
  if [ "$force" != 1 ]; then
    if [ -n "$branch" ]; then
      fetch_origin
      is_merged "$branch" || die "$branch is not merged into $ib — finish it first, or pass --force to discard it"
    fi
    if [ -n "$wt" ] && [ -d "$wt" ]; then
      dirty="$(_dirty_files "$wt")" || die "cannot read the status of $wt (pass --force to remove it anyway)"
      [ -z "$dirty" ] || { say "$wt has uncommitted changes (pass --force to discard them):"; say "$dirty"; exit 1; }
    fi
  fi
  # Also when nothing is registered any more: a re-run clears what an earlier removal left.
  if [ -z "$branch$wt" ]; then
    [ -n "$(wh_procs_under "$(wt_path "$arg")")" ] || die "no worktree or branch matching '$arg'"
    wh_stop_procs_in "$(wt_path "$arg")"
    return 0
  fi
  wh_stop_procs_in "${wt:-$(wt_path "$arg")}" || true
  if [ -n "$wt" ]; then
    if [ -d "$wt" ]; then
      _unlink_shared "$wt"
      if [ "$force" = 1 ]; then g worktree remove --force "$wt" >&2; else g worktree remove "$wt" >&2; fi
    else
      g worktree prune
    fi
    say "removed $wt"
  fi
  if [ -n "$branch" ]; then
    sha="$(g rev-parse --short "refs/heads/$branch")"
    g branch -D "$branch" >/dev/null
    say "deleted branch $branch (restore with: git branch $branch $sha)"
  fi
}

# _run_deploy: returns non-zero (does NOT exit) if a deploy/verify step fails, so
# the caller can restore the checkout before exiting. Runs from the main checkout.
_run_deploy() {
  if [ -n "$WH_DEPLOY_CMD" ]; then
    say "+ deploy: $WH_DEPLOY_CMD"
    ( cd "$main_root" && eval "$WH_DEPLOY_CMD" ) || return 1
  fi
  if [ -n "$WH_DEPLOY_VERIFY" ]; then
    say "+ verify: $WH_DEPLOY_VERIFY"
    ( cd "$main_root" && eval "$WH_DEPLOY_VERIFY" ) || return 1
  fi
  return 0
}

# _head -> the main checkout's branch, or its commit when detached; _restore takes either.
_head() { g symbolic-ref --quiet --short HEAD || g rev-parse HEAD; }
_restore() {
  if g show-ref --verify --quiet "refs/heads/$1"; then g checkout --quiet "$1" 2>/dev/null && return 0
  else g checkout --quiet --detach "$1" 2>/dev/null && return 0; fi
  say "warning: could not switch the main checkout back to $1"
}

# The main checkout's uncommitted changes may belong to other agents: refuse when
# they would be swept into the merge or collide with it. Unrelated noise is fine.
_check_main_checkout() {
  local branch="$1" base="$2" overlap
  g diff --cached --quiet || die "the main checkout has staged changes — they would be swept into the merge; sort them out first (they may belong to another agent)"
  overlap="$(comm -12 <(g diff --name-only | sort) <(g diff --name-only "$base...$branch" | sort))"
  if [ -n "$overlap" ]; then
    say "the main checkout has uncommitted changes to files $branch also changes:"
    say "$overlap"
    die "commit or move them first (they may belong to another agent)"
  fi
}

_ff_from_origin() {
  if has_origin && g rev-parse --verify --quiet "refs/remotes/origin/$ib" >/dev/null; then
    g merge --ff-only --quiet "origin/$ib" >&2 || return 1
  fi
}

# finish merges inside the shared main checkout, so two finishes must not overlap.
# The lock is a directory holding the owner's pid; exec keeps the pid, so it carries
# into _post-merge. A lock whose owner is gone is stale and taken over.
lock_dir="$(git rev-parse --path-format=absolute --git-common-dir)/wh-finish.lock"
_lock_release() { if [ "$(cat "$lock_dir/pid" 2>/dev/null)" = "$$" ]; then rm -rf "$lock_dir"; fi; }
_lock_take() {
  local waited=0 owner
  trap _lock_release EXIT
  [ "${WH_LOCK_HELD:-}" = 1 ] && [ "$(cat "$lock_dir/pid" 2>/dev/null)" = "$$" ] && return 0
  until mkdir "$lock_dir" 2>/dev/null; do
    owner="$(cat "$lock_dir/pid" 2>/dev/null)" || owner=""
    if [ -n "$owner" ] && ! kill -0 "$owner" 2>/dev/null; then
      say "removing stale finish lock (pid $owner is gone)"; rm -rf "$lock_dir"; continue
    fi
    if [ "$waited" -ge "${WH_LOCK_TIMEOUT:-300}" ]; then
      die "another finish (pid ${owner:-?}) holds $lock_dir; if none is running, remove that directory"
    fi
    [ "$waited" -gt 0 ] || say "waiting for another finish (pid ${owner:-?}) to complete…"
    sleep 1; waited=$((waited + 1))
  done
  echo "$$" > "$lock_dir/pid"
}

# The merge may have changed this very script, and bash keeps executing the old
# bytes; the post-merge phase therefore runs the merged copy.
_post_merge_exec() {
  local self prefix
  prefix="$(git -C "$here" rev-parse --show-prefix 2>/dev/null)" || prefix=""
  self="$main_root/$prefix$(basename "$0")"
  [ -f "$self" ] || self="$0"
  WH_LOCK_HELD=1 exec bash "$self" _post-merge "$@"
}

_finish_merge() {
  local branch="$1" orig base out conflicts pre
  orig="$(_head)"
  fetch_origin
  base="$(base_ref)"
  _check_main_checkout "$branch" "$base"
  g checkout --quiet "$ib" >&2 || die "cannot switch the main checkout to $ib"
  if ! _ff_from_origin; then _restore "$orig"; die "local $ib has diverged from origin/$ib — reconcile it first"; fi
  pre="$(g rev-parse HEAD)"
  if ! out="$(g merge --no-ff -m "Merge $branch into $ib" "$branch" 2>&1)"; then
    conflicts="$(g diff --name-only --diff-filter=U)"
    g merge --abort >/dev/null 2>&1 || true
    _restore "$orig"
    if [ -n "$conflicts" ]; then
      say "MERGE CONFLICT ($branch -> $ib) in:"; say "$conflicts"
      die "aborted; main checkout restored to $orig. Rebase $branch onto $ib in its worktree, resolve, then retry."
    fi
    say "$out"
    die "merge of $branch into $ib failed; main checkout restored to $orig"
  fi
  _post_merge_exec "$branch" "$orig" "$pre"
}

# land: rebase in the worktree, fast-forward the integration branch, remove the
# worktree, then deploy from the main checkout. Re-runnable at every step.
_finish_land() {
  local branch="$1" wt="$2" cur pre
  if [ -z "$wt" ] || [ ! -d "$wt" ]; then die "finish (land): $branch has no worktree to rebase in"; fi
  cur="$(g rev-parse --abbrev-ref HEAD)"
  [ "$cur" = "$ib" ] || die "finish (land): the main checkout is on '$cur', not $ib — switch it back first"
  if _rebase_in_progress "$wt"; then die "a rebase is in progress in $wt — finish or abort it, then re-run"; fi
  fetch_origin
  _ff_from_origin || die "local $ib has diverged from origin/$ib — reconcile it first"
  _check_main_checkout "$branch" "$ib"
  rebase_onto "$wt" "$ib" || die "in $wt: git rebase $ib, resolve the conflicts, then re-run finish"
  pre="$(g rev-parse HEAD)"
  g merge --ff-only --quiet "$branch" >&2 || die "cannot fast-forward $ib to $branch"
  _post_merge_exec "$branch" "$ib" "$pre"
}

cmd_finish() {
  local arg="$1" branch wt dirty existing
  resolve "$arg"; branch="$R_BRANCH"; wt="$R_WT"
  if [ -z "$branch" ] || ! g show-ref --verify --quiet "refs/heads/$branch"; then die "no such branch: $arg"; fi
  if [ -n "$wt" ] && [ -d "$wt" ]; then
    dirty="$(_dirty_files "$wt")" || die "cannot read the status of $wt"
    [ -z "$dirty" ] || { say "$wt has uncommitted changes — commit first:"; say "$dirty"; exit 1; }
  fi
  case "$WH_FINISH_MODEL" in
    pr)
      has_origin || die "finish (pr): no 'origin' remote to push $branch to"
      command -v gh >/dev/null || die "gh not found"
      g push --quiet -u origin "$branch" >&2 \
        || die "push of $branch rejected — if it was rebased after the PR opened, rebase it on origin/$branch, or push --force-with-lease yourself"
      existing="$(cd "${wt:-$main_root}" && gh pr view "$branch" --json url -q .url 2>/dev/null)" || existing=""
      if [ -n "$existing" ]; then say "PR already open for $branch: $existing (pushed the latest commits)"; return 0; fi
      ( cd "${wt:-$main_root}" && gh pr create --fill --base "$ib" --head "$branch" )
      say "PR opened for $branch — move ticket to In Review; merge after CI is green."
      say "once it is merged: scripts/worktree.sh remove $branch"
      ;;
    merge-main|merge-branch) _lock_take; _finish_merge "$branch" ;;
    land) _lock_take; _finish_land "$branch" "$wt" ;;
    *) die "unknown WH_FINISH_MODEL: $WH_FINISH_MODEL" ;;
  esac
}

# Hidden: the half of finish that runs after the merge, from the merged script.
# The main checkout is on the integration branch with the merge applied.
cmd_post_merge() {
  local branch="$1" orig="$2" pre="$3"
  _lock_take
  if has_origin && ! g push --quiet origin "$ib" >&2; then
    # Undo the local merge, so a re-run fetches and merges again instead of finding
    # local $ib diverged from origin (and remove does not see the branch as merged).
    g reset --quiet --keep "$pre" >&2 || say "warning: could not reset $ib to $pre"
    _restore "$orig"
    die "PUSH FAILED — merge undone, worktree kept. Fix, then re-run finish."
  fi
  if [ "$WH_FINISH_MODEL" = land ]; then
    cmd_remove "$branch" 0
    _run_deploy || die "DEPLOY/VERIFY FAILED — $branch landed and pushed, worktree removed; fix and re-run the deploy from $main_root."
    say "landed $branch on $ib${WH_DEPLOY_CMD:+, deployed}${WH_DEPLOY_VERIFY:+ + verified}"
  else
    if ! _run_deploy; then
      _restore "$orig"
      die "DEPLOY/VERIFY FAILED — pushed, but worktree kept and main checkout restored to $orig; ticket NOT advanced."
    fi
    _restore "$orig"
    cmd_remove "$branch" 0
    say "merged $branch -> $ib, pushed${WH_DEPLOY_CMD:+, deployed}${WH_DEPLOY_VERIFY:+ + verified}; main checkout on $orig"
  fi
  say "the worktree is gone: cd $main_root"
}

usage() {
  say "usage: worktree.sh create <branch> | up <branch|slug> [--bg] | list"
  say "                   | remove <branch|slug> [--force] | finish <branch|slug>"
  exit 2
}

cmd="${1:-}"; [ $# -gt 0 ] && shift
if [ "$cmd" = _post-merge ]; then cmd_post_merge "${1:?}" "${2:?}" "${3:?}"; exit; fi
arg=""; force=0; bg=0
for a in "$@"; do
  case "$a" in
    --force) [ "$cmd" = remove ] || usage; force=1 ;;
    --bg)    [ "$cmd" = up ] || usage; bg=1 ;;
    -*)      usage ;;
    *)       [ -z "$arg" ] || usage; arg="$a" ;;
  esac
done
case "$cmd" in
  create) cmd_create "${arg:?branch required}" ;;
  up)     cmd_up     "${arg:?branch required}" "$bg" ;;
  remove) cmd_remove "${arg:?branch required}" "$force" ;;
  list)   cmd_list ;;
  finish) cmd_finish "${arg:?branch required}" ;;
  *)      usage ;;
esac
