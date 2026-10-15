import { expect, test } from '@playwright/test';

test('first run: onboarding, download, search, entry, back', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Free offline dictionaries' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /WordNet/ })).toBeChecked();
  await page.getByRole('button', { name: 'Download (1)' }).click();
  const field = page.getByRole('textbox');
  await expect(field).toBeVisible();
  await expect(page.getByRole('button', { name: /Downloading/ })).toHaveCount(0, { timeout: 15_000 });
  await field.fill('writ');
  await page.getByText('write', { exact: true }).first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'write' })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(field).toHaveValue('writ');
});

test('Enter opens the top suggestion; recents appear after', async ({ page }) => {
  await page.goto('/?scene=search-en&lang=en');
  await expect(page.locator('body[data-scene-ready="1"]')).toBeAttached();
  await page.getByRole('textbox').fill('book');
  await expect(page.getByText('book', { exact: true }).first()).toBeVisible();
  await page.getByRole('textbox').press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'book' })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Clear search' }).click();
  await expect(page.getByRole('heading', { name: 'Recent' })).toBeVisible();
  await expect(page.getByText('book', { exact: true })).toBeVisible();
});

test('switching the app language to Arabic mirrors the layout', async ({ page }) => {
  await page.goto('/?scene=search-en&lang=en');
  await expect(page.locator('body[data-scene-ready="1"]')).toBeAttached();
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('radio', { name: 'العربية' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('heading', { name: 'الإعدادات' })).toBeVisible();
});

test('a linked word that is missing shows a snackbar, not an empty page', async ({ page }) => {
  await page.goto('/?scene=entry-ar&lang=en');
  await expect(page.locator('body[data-scene-ready="1"]')).toBeAttached();
  const links = page.locator('article .link');
  const count = await links.count();
  expect(count).toBeGreaterThan(0);
  await links.first().click();
  await expect(page.getByRole('status')).toContainText("isn't in your dictionaries");
});

for (const [lang, back, clear] of [['en', 'Back', 'Clear search'], ['ar', 'رجوع', 'مسح البحث']] as const) {
  test(`a recent headword keeps its line at 200 % text; the dictionary label truncates (${lang})`, async ({ page }, info) => {
    await page.goto(`/?scene=search-en&lang=${lang}`);
    await expect(page.locator('body[data-scene-ready="1"]')).toBeAttached();
    const field = page.getByRole('textbox');
    await field.fill('book');
    await page.locator('.list li', { hasText: 'Open English WordNet 2025' }).first().click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.getByRole('button', { name: back }).click();
    await page.getByRole('button', { name: clear }).click();
    const row = page.locator('.recent').first();
    await expect(row.locator('.badge')).toHaveText('Open English WordNet 2025');
    await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
    const m = await row.evaluate((r) => {
      const hw = r.querySelector('.hw') as HTMLElement;
      const badge = r.querySelector('.badge') as HTMLElement;
      const rb = r.getBoundingClientRect(), bb = badge.getBoundingClientRect();
      return {
        hwLines: hw.getBoundingClientRect().height < parseFloat(getComputedStyle(hw).lineHeight) * 1.5,
        hwFits: hw.scrollWidth <= hw.clientWidth + 1,
        truncated: badge.scrollWidth > badge.clientWidth,
        ellipsis: getComputedStyle(badge).textOverflow,
        inside: bb.left >= rb.left - 1 && bb.right <= rb.right + 1,
      };
    });
    expect(m).toEqual({ hwLines: true, hwFits: true, truncated: info.project.name !== 'ipad-webkit', ellipsis: 'ellipsis', inside: true });
  });
}
