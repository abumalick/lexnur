// The app reports app/package.json's version (__APP_VERSION__), which gates catalog
// entries by min_app_version, so it must match the store version in build.gradle.
export function checkVersionsMatch(packageVersion: string, gradle: string): void {
  const versionName = /^\s*versionName "([^"]+)"\s*$/m.exec(gradle)?.[1];
  if (!versionName) throw new Error('app/android/app/build.gradle has no versionName');
  if (versionName !== packageVersion) {
    throw new Error(`app/package.json version ${packageVersion} differs from build.gradle versionName ${versionName}; run just bump`);
  }
}
