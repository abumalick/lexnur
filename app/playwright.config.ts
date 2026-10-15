import { defineConfig, devices } from '@playwright/test';

const base = `http://127.0.0.1:${process.env.LEXNUR_PREVIEW_PORT ?? '4173'}`;

export default defineConfig({
  testDir: 'e2e',
  outputDir: '.tmp/test-results',
  timeout: 30_000,
  fullyParallel: true,
  use: { baseURL: base },
  webServer: {
    command: 'pnpm build:fixture && pnpm preview:fixture',
    url: `${base}/fixtures/catalog.json`,
    reuseExistingServer: process.env.LEXNUR_REUSE_SERVER === '1',
    timeout: 180_000,
  },
  projects: [
    { name: 'android-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'ios-webkit', use: { ...devices['iPhone 15'] } },
    { name: 'ipad-webkit', use: { ...devices['iPad Pro 11'] } },
  ],
});
