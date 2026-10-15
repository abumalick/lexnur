#!/usr/bin/env bash
# Usage: scripts/check-android-release.sh <app-release.aab>
# Pre-upload gate: Play rejects apps targeting API 35+ whose native libraries are not 16 KB page-aligned,
# and requires a minimum targetSdk for new apps. MIN_TARGET_SDK overrides the minimum (default 36).
set -euo pipefail
aab="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
min_target="${MIN_TARGET_SDK:-36}"
here="$(cd "$(dirname "$0")" && pwd)"
. "$here/lib/android-release-checks.sh"
root="$(git -C "$here" rev-parse --show-toplevel)"
work="$root/.tmp/android-release-check"
rm -rf "$work" && mkdir -p "$work"

sdk="${ANDROID_HOME:-$HOME/Android/Sdk}"
readelf="$(ls -d "$sdk"/ndk/*/toolchains/llvm/prebuilt/linux-x86_64/bin/llvm-readelf 2>/dev/null | tail -1 || true)"
[ -n "$readelf" ] || readelf="$(command -v readelf)"
bundletool="$root/.tmp/bundletool-all-1.18.1.jar"
[ -f "$bundletool" ] || curl -sSfL -o "$bundletool" https://github.com/google/bundletool/releases/download/1.18.1/bundletool-all-1.18.1.jar

status=0
target="$(java -jar "$bundletool" dump manifest --bundle "$aab" --xpath /manifest/uses-sdk/@android:targetSdkVersion | tr -d '[:space:]')"
if target_ok "$target" "$min_target"; then echo "ok   targetSdkVersion $target (minimum $min_target)"
else echo "FAIL targetSdkVersion '$target' is below the minimum $min_target"; status=1; fi

unzip -q -o "$aab" 'base/lib/*' -d "$work" 2>/dev/null || true
count=0
while IFS= read -r so; do
  count=$((count + 1))
  align="$("$readelf" -lW "$so" | min_load_align)"
  rel="${so#"$work/base/"}"
  if [ "$align" -ge 16384 ]; then echo "ok   $rel (LOAD align $align)"
  else echo "FAIL $rel: LOAD align $align, needs 16384 (16 KB)"; status=1; fi
done < <(find "$work/base/lib" -name '*.so' 2>/dev/null | sort)
echo "checked $count native libraries"
[ "$count" -gt 0 ] || { echo "FAIL no native libraries found in $aab (expected SQLCipher and zstd-jni)"; status=1; }
exit $status
