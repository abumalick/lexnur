#!/usr/bin/env bash
# Downloads every raw source listed in docs/SOURCES.md. Re-runnable; curl resumes partial files.
set -uo pipefail
f="$(dirname "$0")/fetch.sh"
run() { "$f" "$@" || echo "FAILED: $1" >&2; }

run oewn https://en-word.net/static/english-wordnet-2025-json.zip https://en-word.net/static/english-wordnet-2025.xml.gz
run cc-cedict https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz
run jmdict http://ftp.edrdg.org/pub/Nihongo/JMdict_e.gz http://ftp.edrdg.org/pub/Nihongo/JMdict.gz
run omw https://github.com/omwn/omw-data/releases/download/v2.0/omw-2.0.tar.xz
run freedict https://freedict.org/freedict-database.json
run tatoeba https://downloads.tatoeba.org/exports/sentences.tar.bz2 https://downloads.tatoeba.org/exports/links.tar.bz2
run wikidata-lexemes https://dumps.wikimedia.org/wikidatawiki/entities/latest-lexemes.json.bz2
run kaikki-enwiktionary https://kaikki.org/dictionary/raw-wiktextract-data.jsonl.gz
for ed in fr de es ru it pt nl pl zh ja ko tr; do
  run "kaikki-${ed}wiktionary" "https://kaikki.org/${ed}wiktionary/raw-wiktextract-data.jsonl.gz"
done

base=https://download.wikdict.com/dictionaries/sqlite/2/
mapfile -t wd < <(curl -fs "$base" | rg -o 'href="([a-z-]+\.sqlite3)"' -r '$1' | sort -u)
run wikdict "${wd[@]/#/$base}"
