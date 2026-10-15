#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
. "$here/lib/android-release-checks.sh"
fail=0
expect() { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: expected $3, got $2"; fail=1; fi; }
expect "aligned library"   "$(min_load_align < "$here/fixtures/readelf-16k.txt")" 16384
expect "4 KB library"      "$(min_load_align < "$here/fixtures/readelf-4k.txt")" 4096
expect "no LOAD segments"  "$(printf 'Program Headers:\n' | min_load_align)" 0
expect "target 36 passes"  "$(target_ok 36 36 && echo yes || echo no)" yes
expect "target 35 fails"   "$(target_ok 35 36 && echo yes || echo no)" no
expect "empty target fails" "$(target_ok '' 36 && echo yes || echo no)" no
exit $fail
