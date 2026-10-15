#!/usr/bin/env bash
# Usage: scripts/worktree.sh {create|list|remove|finish} [branch]
# One isolated worktree + branch per task under .worktrees/, so the main checkout stays on main.
set -euo pipefail

WH_WT_DIR=".worktrees"
WH_ENV_FILES="app/android/local.properties .env website/.env"     # gitignored per-checkout files copied main -> worktree
WH_SHARED_LINKS="sources"               # large gitignored dirs symlinked from main, never copied
WH_INTEGRATION_BRANCH="main"

here="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=/dev/null
. "$here/lib/worktree-common.sh"

# Run from the main checkout even when invoked inside a worktree.
main_root="$(git rev-parse --path-format=absolute --git-common-dir)"
main_root="$(cd "$main_root/.." && pwd)"

wt_path() { printf '%s/%s/%s' "$main_root" "$WH_WT_DIR" "$(wh_slugify "$1")"; }
has_origin() { git -C "$main_root" remote get-url origin >/dev/null 2>&1; }

cmd_create() {
  local branch="$1" wt f; wt="$(wt_path "$branch")"
  if git -C "$main_root" show-ref --verify --quiet "refs/heads/$branch"; then
    git -C "$main_root" worktree add "$wt" "$branch"
  else
    git -C "$main_root" worktree add -b "$branch" "$wt" "$WH_INTEGRATION_BRANCH"
  fi
  # shellcheck disable=SC2086
  for f in $WH_ENV_FILES; do
    [ -f "$main_root/$f" ] || continue
    mkdir -p "$wt/$(dirname "$f")"
    cp "$main_root/$f" "$wt/$f"
    echo "copied $f"
  done
  # shellcheck disable=SC2086
  for f in $WH_SHARED_LINKS; do
    [ -e "$main_root/$f" ] || continue
    [ -e "$wt/$f" ] || ln -s "$main_root/$f" "$wt/$f"
    echo "linked $f -> $main_root/$f"
  done
  echo "worktree: $wt"
}

cmd_list() { git -C "$main_root" worktree list; }

# Refuses unmerged branches: another agent's work must never be lost to a cleanup.
cmd_remove() {
  local branch="$1" wt; wt="$(wt_path "$branch")"
  if ! git -C "$main_root" merge-base --is-ancestor "$branch" "$WH_INTEGRATION_BRANCH" 2>/dev/null; then
    echo "refusing: $branch is not merged into $WH_INTEGRATION_BRANCH (finish it first, or remove by hand)"
    exit 1
  fi
  if [ -d "$wt" ]; then
    git -C "$main_root" worktree remove "$wt"
    echo "removed $wt"
  fi
  git -C "$main_root" branch -d "$branch"
  cmd_list
}

cmd_finish() {
  local branch="$1" target="$WH_INTEGRATION_BRANCH" orig
  if [ -n "$(git -C "$main_root" diff --cached --name-only)" ]; then
    echo "refusing: the main checkout has staged changes; commit or unstage them first"
    exit 1
  fi
  if [ -n "$(git -C "$(wt_path "$branch")" status --porcelain)" ]; then
    echo "refusing: $branch has uncommitted changes in its worktree"
    exit 1
  fi
  orig="$(git -C "$main_root" rev-parse --abbrev-ref HEAD)"
  git -C "$main_root" checkout "$target" --quiet
  if has_origin; then
    git -C "$main_root" fetch origin --quiet
    git -C "$main_root" merge --ff-only "origin/$target" --quiet
  fi
  if ! git -C "$main_root" merge --no-ff "$branch" -m "Merge $branch into $target" --quiet; then
    git -C "$main_root" merge --abort 2>/dev/null || true
    git -C "$main_root" checkout "$orig" --quiet
    echo "MERGE CONFLICT ($branch -> $target): aborted. Merge $target into $branch inside the worktree, resolve, then retry."
    exit 1
  fi
  if has_origin; then
    git -C "$main_root" push origin "$target" --quiet
  fi
  git -C "$main_root" checkout "$orig" --quiet
  echo "merged $branch -> $target$(has_origin && echo ', pushed' || echo ' (no remote, not pushed)')"
}

usage() { echo "usage: worktree.sh {create|list|remove|finish} [branch]"; exit 2; }
case "${1:-}" in
  create) shift; cmd_create "${1:?branch required}" ;;
  list)   cmd_list ;;
  remove) shift; cmd_remove "${1:?branch required}" ;;
  finish) shift; cmd_finish "${1:?branch required}" ;;
  *)      usage ;;
esac
