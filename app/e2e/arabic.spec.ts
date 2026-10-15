import { expect, test } from '@playwright/test';

test.use({ locale: 'ar-SA' });

test('Arabic device: Arabic UI, Wiktionary Ar–En pre-selected, forgiving search, root query', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByRole('checkbox', { name: /Arabic/ })).toBeChecked();
  await page.getByRole('button', { name: /تنزيل/ }).click();
  const field = page.getByRole('textbox');
  await field.fill('اكل');
  await expect(page.getByText('أَكَلَ', { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  expect(await field.evaluate((el) => el.matches(':dir(rtl)'))).toBe(true);
  await field.fill('ك ت ب');
  await expect(page.getByRole('heading', { name: /ك ت ب/ })).toBeVisible();
  expect(await page.locator('.list li').count()).toBeGreaterThanOrEqual(3);
});

test('Latin input in an Arabic UI stays left-to-right', async ({ page }) => {
  await page.goto('/?scene=search-en&lang=ar');
  await expect(page.locator('body[data-scene-ready="1"]')).toBeAttached();
  expect(await page.getByRole('textbox').evaluate((el) => el.matches(':dir(ltr)'))).toBe(true);
});

test('Arabic input in an English UI stays right-to-left', async ({ page }) => {
  await page.goto('/?scene=search-ar&lang=en');
  await expect(page.locator('body[data-scene-ready="1"]')).toBeAttached();
  expect(await page.getByRole('textbox').evaluate((el) => el.matches(':dir(rtl)'))).toBe(true);
});

for (const [lang, dir] of [['ar', 'rtl'], ['en', 'ltr']] as const) {
  test(`the empty search field lays out its placeholder in the UI direction (${lang})`, async ({ page }) => {
    await page.goto(`/?scene=search-en&lang=${lang}`);
    await expect(page.locator('body[data-scene-ready="1"]')).toBeAttached();
    await page.locator('.field button').first().click();
    await page.locator('button.scope').click();
    await page.getByRole('radio', { name: 'Open English WordNet 2025' }).click();
    const field = page.getByRole('textbox');
    await expect(field).toHaveValue('');
    await expect(field).toHaveAttribute('placeholder', /\u{2068}Open English WordNet 2025\u{2069}/u);
    expect(await field.evaluate((el) => getComputedStyle(el).direction)).toBe(dir);
  });
}

test('English glosses of an Arabic entry stay left-to-right in an Arabic UI', async ({ page }) => {
  await page.goto('/?scene=entry-ar&lang=ar');
  await expect(page.locator('body[data-scene-ready="1"]')).toBeAttached({ timeout: 15_000 });
  await expect(page.getByRole('heading', { level: 1 })).toHaveAttribute('dir', 'rtl');
  const gloss = page.locator('.senses .gloss').first();
  await expect(gloss).toHaveAttribute('dir', 'ltr');
  await expect(gloss).toHaveAttribute('lang', 'en');
  expect(await gloss.evaluate((el) => el.matches(':dir(ltr)'))).toBe(true);
});

for (const lang of ['ar', 'en'] as const) {
  test(`search field keeps its start padding before the search icon (${lang})`, async ({ page }) => {
    await page.goto(`/?scene=search-ar&lang=${lang}`);
    await expect(page.locator('body[data-scene-ready="1"]')).toBeAttached({ timeout: 15_000 });
    const gaps = await page.locator('.field').evaluate((field) => {
      const f = field.getBoundingClientRect();
      const icon = field.querySelector('svg')!.getBoundingClientRect();
      const more = field.querySelector('button:last-of-type')!.getBoundingClientRect();
      const rtl = getComputedStyle(field).direction === 'rtl';
      return { iconStart: rtl ? f.right - icon.right : icon.left - f.left, moreEnd: rtl ? more.left - f.left : f.right - more.right };
    });
    expect(gaps.iconStart).toBeGreaterThanOrEqual(16);
    expect(gaps.moreEnd).toBeLessThanOrEqual(4);
  });

  test(`inflection tables start at their first column (${lang})`, async ({ page }) => {
    await page.goto(`/?scene=entry-ar&lang=${lang}`);
    await expect(page.locator('body[data-scene-ready="1"]')).toBeAttached({ timeout: 15_000 });
    const wrap = page.locator('.tablewrap').first();
    await wrap.locator('xpath=ancestor::section[1]').getByRole('button').first().click();
    await expect(wrap).toBeVisible();
    await expect(wrap).toHaveAttribute('dir', 'ltr');
    const pos = await wrap.evaluate((w) => ({
      labelLeft: w.querySelector('th')!.getBoundingClientRect().left - w.getBoundingClientRect().left,
      formLeftOfRoman: (() => { const [, form, roman] = w.querySelectorAll('tr:has(td.roman) > *'); return form.getBoundingClientRect().left < roman.getBoundingClientRect().left; })(),
    }));
    expect(pos.labelLeft).toBeLessThanOrEqual(1);
    expect(pos.formLeftOfRoman).toBe(true);
    await expect(wrap.locator('td[lang="ar"]').first()).toHaveAttribute('dir', 'rtl');
  });
}
