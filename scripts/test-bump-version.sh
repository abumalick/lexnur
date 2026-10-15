#!/usr/bin/env bash
# Runs bump-version.sh against a temp copy shaped like Capacitor's templates.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
tmp="$here/../.tmp/bump-test"
rm -rf "$tmp" && mkdir -p "$tmp/app/android/app" "$tmp/app/ios/App/App.xcodeproj"
cat > "$tmp/app/android/app/build.gradle" <<'EOG'
android {
    defaultConfig {
        applicationId "com.lexnur"
        versionCode 1
        versionName "1.0"
    }
}
EOG
cat > "$tmp/app/ios/App/App.xcodeproj/project.pbxproj" <<'EOG'
		504EC3171FED79650016851F /* Debug */ = {
				CURRENT_PROJECT_VERSION = 1;
				MARKETING_VERSION = 1.0;
		};
		504EC3181FED79650016851F /* Release */ = {
				CURRENT_PROJECT_VERSION = 1;
				MARKETING_VERSION = 1.0;
		};
EOG
cat > "$tmp/app/package.json" <<'EOG'
{
  "name": "@lexnur/app",
  "private": true,
  "version": "1.0.0",
  "type": "module"
}
EOG

LEXNUR_ROOT="$tmp" bash "$here/bump-version.sh" 1.2.3 7

fail() { echo "FAIL: $*"; exit 1; }
grep -q '        versionCode 7$' "$tmp/app/android/app/build.gradle" || fail "versionCode"
grep -q '        versionName "1.2.3"$' "$tmp/app/android/app/build.gradle" || fail "versionName"
[ "$(grep -c 'CURRENT_PROJECT_VERSION = 7;' "$tmp/app/ios/App/App.xcodeproj/project.pbxproj")" = 2 ] || fail "CURRENT_PROJECT_VERSION"
[ "$(grep -c 'MARKETING_VERSION = 1.2.3;' "$tmp/app/ios/App/App.xcodeproj/project.pbxproj")" = 2 ] || fail "MARKETING_VERSION"
grep -q '^  "version": "1.2.3",$' "$tmp/app/package.json" || fail "app/package.json version"
grep -q '^  "name": "@lexnur/app",$' "$tmp/app/package.json" || fail "app/package.json name"
if LEXNUR_ROOT="$tmp" bash "$here/bump-version.sh" 1.2 x 2>/dev/null; then fail "accepted a non-numeric build number"; fi
echo "bump-version OK"
