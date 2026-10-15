// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import appPkg from '../../../package.json';

describe('@capacitor-community/sqlite pin', () => {
  it('is exactly 8.1.1 in package.json and in node_modules', () => {
    expect(appPkg.dependencies['@capacitor-community/sqlite']).toBe('8.1.1');
    const installed = createRequire(import.meta.url)('@capacitor-community/sqlite/package.json');
    expect(installed.version).toBe('8.1.1');
  });
});
