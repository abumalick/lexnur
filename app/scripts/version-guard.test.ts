import { describe, expect, it } from 'vitest';
import { checkVersionsMatch } from './version-guard';

const gradle = (name: string) => `android {\n    defaultConfig {\n        versionCode 3\n        versionName "${name}"\n    }\n}\n`;

describe('checkVersionsMatch', () => {
  it('accepts the same version in package.json and build.gradle', () => {
    expect(() => checkVersionsMatch('1.1.0', gradle('1.1.0'))).not.toThrow();
  });

  it('rejects a package.json version that differs from versionName', () => {
    expect(() => checkVersionsMatch('1.0.0', gradle('1.1.0'))).toThrow(/1\.0\.0.*1\.1\.0/);
  });

  it('rejects a build.gradle without versionName', () => {
    expect(() => checkVersionsMatch('1.0.0', 'android {}')).toThrow(/versionName/);
  });
});
