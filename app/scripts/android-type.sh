#!/usr/bin/env bash
# Usage: app/scripts/android-type.sh <serial> <text>   (text must not contain a single quote)
# Types Unicode text into the focused field through Appium's UnicodeIME, restoring the previous keyboard afterwards.
set -euo pipefail
serial="$1"; text="$2"
here="$(cd "$(dirname "$0")" && pwd)"
ime=io.appium.settings/.UnicodeIME
case "$text" in *\'*) echo "android-type.sh: text must not contain a single quote" >&2; exit 2;; esac

previous="$(adb -s "$serial" shell settings get secure default_input_method | tr -d '\r')"
if [ -z "$previous" ] || [ "$previous" = null ]; then
  echo "android-type.sh: cannot read the current keyboard" >&2; exit 1
fi

encoded="$(cd "$here/.." && pnpm exec tsx scripts/utf7.ts "$text")"

packages="$(adb -s "$serial" shell pm list packages io.appium.settings)"
if [ -z "$packages" ]; then
  dir="$(git rev-parse --show-toplevel)/.tmp/appium-settings"; mkdir -p "$dir"
  curl -sL https://registry.npmjs.org/io.appium.settings/-/io.appium.settings-8.4.1.tgz | tar xz -C "$dir"
  adb -s "$serial" install -r "$dir/package/apks/settings_apk-debug.apk" >/dev/null
fi
# A freshly installed package stays in the stopped state and its IME is unknown to the system until it is launched once.
adb -s "$serial" shell am start -n io.appium.settings/.Settings >/dev/null
sleep 1

if [ "$previous" != "$ime" ]; then
  trap 'adb -s "$serial" shell ime set "$previous" >/dev/null' EXIT
fi
adb -s "$serial" shell ime enable "$ime" >/dev/null
adb -s "$serial" shell ime set "$ime" >/dev/null
adb -s "$serial" shell "input text '$encoded'"
sleep 1
