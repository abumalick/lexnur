# AGENTS.md

This file provides guidance to AI agents working on this project.

Offline dictionaries app: the user picks dictionaries (monolingual or translation), downloads them, and uses them offline on Android and iOS.

## Layout

- `app/` — Capacitor + Svelte app (Android, iOS, and later the web), TypeScript. pnpm workspace with `packages/core` (normalizer, entry body and catalog types, zstd decoder; shared with the pipeline) and `packages/lexnur-native` (the native download plugin).
- `pipeline/` — Node/TypeScript CLI that builds SQLite dictionary packages from `sources/` and publishes them; commands in `pipeline/README.md`.
- `sources/` — raw downloaded data, large and git-ignored. Worktrees get a symlink to the main checkout's copy; never copy it. `scripts/fetch*.sh` download into it.
- `catalog/` — `catalog.json` (editorial: which dictionaries exist), `releases.json` (published package versions), and the generated catalogs the app reads: `v2.json` for app 1.1.0+ (also bundled into the app as its offline snapshot) and `v1.json`, **frozen** for app 1.0.0 — never regenerate, edit or upload it.
- `website/` — Astro site for lexnur.com (privacy/support pages for the stores).
- `justfile` — entry point for tests, builds, screenshots and store uploads (`just --list`). `fastlane/` — store lanes, listing texts and screenshots. `scripts/screenshots/` — Playwright store screenshots. `scripts/worktree.sh` — worktree lifecycle (below).

## Setup and checks

`mise install && pnpm install && bundle install`, then `just test` (unit tests for every package plus the release-tooling and store-metadata checks) and `just typecheck`. Big jobs (Kaikki pipeline builds) should run under a memory cap. `pipeline/README.md` writes it as `heavy`, a local wrapper that is not part of the repo: substitute your own (e.g. `systemd-run --user --scope -p MemoryMax=8G`) or drop it. The justfile reads the wrapper from `LEXNUR_HEAVY`.

## Docs

- `docs/RELEASING.md` — shipping an app update to Google Play and the App Store, secrets, store gotchas.
- `pipeline/README.md` § Publishing a dictionary — building and publishing a package and the catalog (no app release needed).
- `docs/CATALOG.md` — catalog and package format. `docs/SOURCES.md` — data sources and licences. `docs/HOSTING.md` — Cloudflare: website deploy and the `dl.lexnur.com` package bucket.
- `docs/research/`, `docs/superpowers/` — dated research notes, plans and reports; history, not instructions.

Never commit `sources/`, `build/` outputs, `local.properties`, signing keys (`key.properties`, `*.jks`) or any credentials.

Machine-specific instructions, if any, live in `CLAUDE.local.md` at the repo root (not tracked).

<!-- worktree-harness:begin -->
## Worktree development (required)

**HARD RULE — never edit `main`'s working tree for code.** Every task that
touches files, however small, starts by creating a worktree. The top-level
checkout stays on `main`, always. Only `*.md`/docs edits may happen on `main`,
and even then its branch must not change. If you catch yourself having edited
`main`, stop and move the change into a worktree
(`git stash push` → `scripts/worktree.sh create <branch>` → `git stash pop`).

**Lifecycle (one line per phase):**
1. **Start** — `scripts/worktree.sh create <branch>`. It branches from `main` into
   `.worktrees/<branch>`, copies `app/android/local.properties` and the git-ignored
   `.env` files, and symlinks `sources/`.
2. **Work** — edit, build and test only inside `.worktrees/<branch>`; commit there.
3. **Finish** — once tests pass, `scripts/worktree.sh finish <branch>` merges the
   branch into `main` with `--no-ff` (and pushes when an `origin` remote exists).
   On a conflict it aborts: merge `main` into the branch inside the worktree,
   resolve, then retry.
4. **Clean up** — `scripts/worktree.sh remove <branch>` (only worktrees this
   session created; it refuses unmerged branches), then `git worktree list` to
   surface any worktrees other agents left open — **do not touch those**.

**Shared data:** `sources/` is one directory shared by every worktree. Fetch a new
source from one place only — two worktrees downloading the same source id at once
write to the same files. Pipeline outputs go to each worktree's own `build/`.

**Release signing** (`key.properties`, keystores) is not copied into worktrees;
release builds run from the main checkout.
<!-- worktree-harness:end -->

<!-- superpowers-usage:begin -->
## Use superpowers for the work (when installed)

The `superpowers` skills auto-load at session start; this reinforces them and covers
hosts/clones where the plugin is absent. **Inside the worktree, use them for the craft:**
- **Before building a feature** → `superpowers:brainstorming`, then `superpowers:writing-plans`.
- **Fixing a bug** → `superpowers:systematic-debugging` first.
- **While implementing** → `superpowers:test-driven-development`.
- **Before finishing** → `superpowers:requesting-code-review` + `superpowers:verification-before-completion`.

**The worktree lifecycle stays with this harness, not superpowers:**
- Create / clean up worktrees with `scripts/worktree.sh` — **never
  `superpowers:using-git-worktrees`**, which makes a plain worktree without the
  `sources/` link or copied config.
- Integrate with `scripts/worktree.sh finish` — do **not** use
  `superpowers:finishing-a-development-branch`, which would re-offer merge/PR
  choices that fight the configured flow.
<!-- superpowers-usage:end -->
