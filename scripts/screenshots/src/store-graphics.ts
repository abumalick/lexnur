import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const convert = process.platform === 'darwin' ? 'magick' : 'convert';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
for (const [lang, locale] of [['en', 'en-US'], ['ar', 'ar']] as const) {
  const dir = join(ROOT, 'fastlane/metadata/android', locale, 'images');
  mkdirSync(dir, { recursive: true });
  const url = pathToFileURL(join(ROOT, 'scripts/screenshots/feature-graphic.html')).href + `?lang=${lang}`;
  await page.goto(url);
  await page.evaluate('document.fonts.ready');
  const feature = join(dir, 'featureGraphic.png');
  await page.screenshot({ path: feature });
  execFileSync(convert, [feature, '-alpha', 'off', feature]);
  const icon = join(dir, 'icon.png');
  execFileSync('rsvg-convert', ['-w', '512', '-h', '512', join(ROOT, 'app/assets/icon.svg'), '-o', icon]);
  execFileSync(convert, [icon, '-alpha', 'off', icon]);
}
await browser.close();
console.log('store graphics written');
