#!/usr/bin/env bash
# Usage: scripts/bump-version.sh <versionName> <buildNumber>
# Sets the same version name and build number on Android and iOS, and the version name in app/package.json
# (the app reads it as __APP_VERSION__ for catalog min_app_version). Store builds need a new build number every upload.
set -euo pipefail
[ $# -eq 2 ] || { echo "usage: $0 <versionName e.g. 1.0.1> <buildNumber e.g. 2>" >&2; exit 2; }
name=$1 build=$2
[[ $name =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "versionName must be X.Y.Z, got $name" >&2; exit 2; }
[[ $build =~ ^[0-9]+$ ]] || { echo "buildNumber must be an integer, got $build" >&2; exit 2; }

root=${LEXNUR_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}
gradle="$root/app/android/app/build.gradle"
pbxproj="$root/app/ios/App/App.xcodeproj/project.pbxproj"
package="$root/app/package.json"

sed -i.bak -E "s/^([[:space:]]*versionCode )[0-9]+$/\1$build/; s/^([[:space:]]*versionName )\"[^\"]*\"$/\1\"$name\"/" "$gradle"
sed -i.bak -E "s/(CURRENT_PROJECT_VERSION = )[^;]+;/\1$build;/g; s/(MARKETING_VERSION = )[^;]+;/\1$name;/g" "$pbxproj"
sed -i.bak -E "s/^(  \"version\": )\"[^\"]*\",$/\1\"$name\",/" "$package"
rm -f "$gradle.bak" "$pbxproj.bak" "$package.bak"

grep -q "versionCode $build" "$gradle" || { echo "versionCode not updated in $gradle" >&2; exit 1; }
grep -q "MARKETING_VERSION = $name;" "$pbxproj" || { echo "MARKETING_VERSION not updated in $pbxproj" >&2; exit 1; }
grep -q "^  \"version\": \"$name\",$" "$package" || { echo "version not updated in $package" >&2; exit 1; }
echo "Android + iOS + app/package.json: $name ($build)"
