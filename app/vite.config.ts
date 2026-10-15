/// <reference types="vitest/config" />
import { cpSync, createReadStream, existsSync as exists, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { checkVersionsMatch } from './scripts/version-guard';

const FIXTURES = fileURLToPath(new URL('../fixtures/', import.meta.url));
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// Fixture mode serves fixtures/ at /fixtures in dev and copies it into the build (C8).
function fixtures(): Plugin {
  let outDir = '';
  return {
    name: 'lexnur-fixtures',
    apply: () => process.env.VITE_DATA === 'fixture',
    configResolved(c) { outDir = c.build.outDir; },
    configureServer(server) {
      server.middlewares.use('/fixtures', (req, res, next) => {
        const file = join(FIXTURES, decodeURIComponent((req.url ?? '/').split('?')[0]));
        if (!file.startsWith(FIXTURES) || !exists(file) || !statSync(file).isFile()) return next();
        createReadStream(file).pipe(res);
      });
    },
    closeBundle() { cpSync(FIXTURES, join(outDir, 'fixtures'), { recursive: true }); },
  };
}

function versionGuard(): Plugin {
  const gradle = fileURLToPath(new URL('./android/app/build.gradle', import.meta.url));
  return {
    name: 'lexnur-version-guard',
    apply: 'build',
    buildStart() {
      if (exists(gradle)) checkVersionsMatch(version, readFileSync(gradle, 'utf8'));
    },
  };
}

export default defineConfig({
  plugins: [svelte(), svelteTesting(), fixtures(), versionGuard()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  build: { target: ['es2022', 'safari15', 'chrome89'] },
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  server: { fs: { allow: ['..'] } },
  test: {
    server: { deps: { inline: ['@material/material-color-utilities'] } },
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    setupFiles: ['src/test-setup.ts'],
  },
});
