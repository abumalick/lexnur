#!/usr/bin/env bash
# Arabic-specific raw sources. See docs/SOURCES.md for licence status of each.
set -uo pipefail
f="$(dirname "$0")/fetch.sh"
run() { "$f" "$@" || echo "FAILED: $1" >&2; }

run perseus-arabic https://www.perseus.tufts.edu/hopper/opensource/downloads/texts/hopper-texts-Arabic.tar.gz
run arabic-wordnet-v4 https://raw.githubusercontent.com/Salah-Sal/arabic-wordnet-v4/main/output/awn4.xml.gz

