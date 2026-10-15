import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit, type Browser } from '@playwright/test';
import { matrix, outputPath, sceneUrl, type Engine } from './matrix';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
// Not vite's default 4173, which is often taken by another project's preview server
const PORT = process.env.LEXNUR_PREVIEW_PORT ?? '4183';
const BASE = `http://127.0.0.1:${PORT}`;
const platform = (process.argv.find((a) => a.startsWith('--platform='))?.split('=')[1] ?? 'all') as
  | 'ios'
  | 'android'
  | 'all';
const skipBuild = process.argv.includes('--skip-build');
const convert = process.platform === 'darwin' ? 'magick' : 'convert';

async function answers(url: string): Promise<boolean> {
  try {
    await fetch(url);
    return true;
  } catch {
    return false;
  }
}

async function waitForServer(url: string, timeoutMs = 60_000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`preview server did not answer at ${url}`);
}

let server: ChildProcess | undefined;
const browsers = new Map<Engine, Browser>();
try {
  if (await answers(`${BASE}/`)) {
    throw new Error(`something already answers on ${BASE}; stop it or set LEXNUR_PREVIEW_PORT to a free port`);
  }
  if (!skipBuild) execFileSync('pnpm', ['--filter', '@lexnur/app', 'build:fixture'], { cwd: ROOT, stdio: 'inherit' });
  server = spawn('pnpm', ['--filter', '@lexnur/app', 'preview:fixture'], {
    cwd: ROOT,
    stdio: 'inherit',
    detached: true,
    env: { ...process.env, LEXNUR_PREVIEW_PORT: PORT },
  });
  await waitForServer(`${BASE}/`);

  for (const shot of matrix(platform)) {
    let browser = browsers.get(shot.engine);
    if (!browser) {
      browser = await (shot.engine === 'webkit' ? webkit : chromium).launch();
      browsers.set(shot.engine, browser);
    }
    const context = await browser.newContext({
      viewport: shot.viewport,
      deviceScaleFactor: shot.scale,
      isMobile: shot.engine === 'chromium' ? true : undefined, // WebKit on desktop does not support isMobile
      hasTouch: true,
      locale: shot.lang === 'ar' ? 'ar-SA' : 'en-US',
      colorScheme: 'light',
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await page.goto(sceneUrl(shot, BASE));
    await page.waitForSelector('body[data-scene-ready="1"]', { timeout: 30_000 });
    await page.evaluate('document.fonts.ready');
    const dir = await page.evaluate<string>('document.documentElement.dir');
    const want = shot.lang === 'ar' ? 'rtl' : 'ltr';
    if (dir !== want) throw new Error(`${shot.scene}/${shot.lang}/${shot.device}: document dir is "${dir}", expected "${want}"`);

    const file = join(ROOT, outputPath(shot));
    mkdirSync(dirname(file), { recursive: true });
    await page.screenshot({ path: file, fullPage: false });
    execFileSync(convert, [file, '-alpha', 'off', file]);
    console.log(`wrote ${outputPath(shot)}`);
    await context.close();
  }
} finally {
  for (const b of browsers.values()) await b.close();
  if (server?.pid) process.kill(-server.pid, 'SIGTERM');
}
