import { expect, test } from '@playwright/test';

const SCENES = ['onboarding', 'search-en', 'search-ar', 'entry-ar', 'entry-en', 'library', 'broken'];

for (const scene of SCENES) for (const lang of ['en', 'ar']) {
  test(`scene ${scene} (${lang}) becomes ready with the right direction`, async ({ page }) => {
    await page.goto(`/?scene=${scene}&lang=${lang}&theme=light&chrome=ios`);
    await expect(page.locator('body[data-scene-ready="1"]')).toBeAttached({ timeout: 15_000 });
    expect(await page.evaluate(() => document.documentElement.dir)).toBe(lang === 'ar' ? 'rtl' : 'ltr');
  });
}

test('chrome=ios draws the status bar and reserves the safe area', async ({ page }) => {
  await page.goto('/?scene=search-en&lang=en&chrome=ios');
  await expect(page.locator('body[data-scene-ready="1"]')).toBeAttached();
  await expect(page.getByTestId('fake-status-bar')).toHaveText(/9:41/);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--safe-area-inset-top').trim())).toBe('54px');
});

test('search-ar scene shows the vowelled headword', async ({ page }) => {
  await page.goto('/?scene=search-ar&lang=ar');
  await expect(page.locator('body[data-scene-ready="1"]')).toBeAttached();
  await expect(page.getByText('كَتَبَ', { exact: true }).first()).toBeVisible();
});

test('content is a centred column on iPad', async ({ page }, info) => {
  test.skip(info.project.name !== 'ipad-webkit');
  await page.goto('/?scene=search-en&lang=en');
  await expect(page.locator('body[data-scene-ready="1"]')).toBeAttached();
  const box = (await page.locator('.page').first().boundingBox())!;
  const vw = page.viewportSize()!.width;
  expect(box.width).toBeLessThanOrEqual(720);
  expect(Math.abs(box.x - (vw - box.width) / 2)).toBeLessThan(2);
});

const ready = async (page: import('@playwright/test').Page, query: string) => {
  await page.goto(`/?${query}`);
  await expect(page.locator('body[data-scene-ready="1"]')).toBeAttached({ timeout: 15_000 });
};

test('library scene shows a download at 42 %', async ({ page }) => {
  await ready(page, 'scene=library&lang=en');
  await expect(page.getByText(/Downloading 42%/)).toBeVisible();
});

test('entry-en scene shows the two dictionary tabs', async ({ page }) => {
  await ready(page, 'scene=entry-en&lang=en');
  await expect(page.getByRole('tab')).toHaveText(['Open English WordNet 2025', 'Wiktionary English']);
  await expect(page.getByRole('heading', { level: 1, name: 'write' })).toBeVisible();
});

for (const [lang, checked, unchecked] of [['ar', /Arabic/, /WordNet/], ['en', /WordNet/, /Arabic/]] as const) {
  test(`onboarding scene (${lang}) pre-selects the default dictionary for the language`, async ({ page }) => {
    await ready(page, `scene=onboarding&lang=${lang}`);
    await expect(page.getByRole('checkbox', { name: checked })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: unchecked })).not.toBeChecked();
  });
}

test('search-ar scene shows a كَتَبَ row', async ({ page }) => {
  await ready(page, 'scene=search-ar&lang=ar');
  await expect(page.locator('.list li .headword', { hasText: /^كَتَبَ$/ }).first()).toBeVisible();
});

test('search-en scene shows a "write" row', async ({ page }) => {
  await ready(page, 'scene=search-en&lang=en');
  await expect(page.locator('.list li .headword', { hasText: /^write$/ })).toBeVisible();
});

test('entry-ar scene opens كَتَبَ', async ({ page }) => {
  await ready(page, 'scene=entry-ar&lang=en');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('كَتَبَ');
});

for (const scene of ['onboarding', 'library']) {
  test(`${scene} scene pins the storage footer to the bottom of the screen`, async ({ page }) => {
    await ready(page, `scene=${scene}&lang=en`);
    const box = (await page.locator('footer.footer').boundingBox())!;
    expect(Math.abs(box.y + box.height - page.viewportSize()!.height)).toBeLessThan(2);
  });
}

test('sense numbers keep room for the marker when the entry text is enlarged', async ({ page }) => {
  await ready(page, 'scene=entry-en&lang=en');
  await page.evaluate(() => document.documentElement.style.setProperty('--entry-scale', '3'));
  const [pad, size] = await page.locator('.senses').first().evaluate((el) => {
    const s = getComputedStyle(el);
    return [parseFloat(s.paddingInlineStart), parseFloat(s.fontSize)];
  });
  expect(pad).toBeGreaterThanOrEqual(2 * size - 0.5);
});
