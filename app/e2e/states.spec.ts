import { expect, test } from '@playwright/test';

test('going offline during onboarding disables Download and says why', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Download (1)' })).toBeEnabled();
  await context.setOffline(true);
  await expect(page.getByText(/You're offline/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download (1)' })).toBeDisabled();
  await context.setOffline(false);
});

test('a damaged download is retried once, then reported in the library', async ({ page }) => {
  let hits = 0;
  await page.route('**/fixtures/packages/oewn-2025.sqlite.zst', (r) => { hits++; return r.fulfill({ body: Buffer.from('not a package') }); });
  await page.goto('/');
  await page.getByRole('button', { name: 'Download (1)' }).click();
  await page.getByRole('button', { name: 'More options' }).click();
  await page.getByRole('button', { name: 'Dictionaries', exact: true }).click();
  await expect(page.getByText('The download was damaged.')).toBeVisible({ timeout: 15_000 });
  expect(hits).toBe(2);
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
});

test('reinstall state: a package that cannot open is isolated and offers Reinstall', async ({ page }) => {
  await page.goto('/?scene=broken&lang=en');
  await expect(page.locator('body[data-scene-ready="1"]')).toBeAttached();
  await expect(page.getByRole('alert')).toContainText('needs to be reinstalled');
  await expect(page.getByRole('button', { name: 'Reinstall' })).toBeVisible();
  await page.getByRole('textbox').fill('serendipity');
  await expect(page.getByText('serendipity', { exact: true }).first()).toBeVisible();
});

test('no results says so plainly', async ({ page }) => {
  await page.goto('/?scene=search-en&lang=en');
  await expect(page.locator('body[data-scene-ready="1"]')).toBeAttached();
  await page.getByRole('textbox').fill('xyzq');
  await expect(page.getByText(/^No words start with “\u{2068}?xyzq\u{2069}?”$/u)).toBeVisible();
});

test('every control reached with Tab shows a focus indicator', async ({ page }, info) => {
  test.skip(info.project.name !== 'android-chromium', 'WebKit only tabs to form fields by default');
  await page.goto('/?scene=search-en&lang=en');
  await expect(page.locator('body[data-scene-ready="1"]')).toBeAttached();
  await page.getByRole('textbox').fill('wr');
  await expect(page.locator('.list li').first()).toBeVisible();
  await page.getByRole('textbox').focus();
  const seen: string[] = [];
  for (let i = 0; i < 8; i++) {
    const r = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      const ring = el.matches('input[type="text"]') ? getComputedStyle(el.closest('.field')!).boxShadow : getComputedStyle(el).outlineStyle;
      return { what: `${el.tagName}.${el.className.split(' ')[0]}`, ring };
    });
    seen.push(r.what);
    expect(r.ring, r.what).not.toBe('none');
    await page.keyboard.press('Tab');
  }
  expect(new Set(seen).size).toBeGreaterThan(3);
});

test('a panel focused programmatically after keyboard use gets no focus ring', async ({ page }, info) => {
  test.skip(info.project.name !== 'android-chromium', 'WebKit only tabs to form fields by default');
  await page.goto('/?scene=search-en&lang=en');
  await expect(page.locator('body[data-scene-ready="1"]')).toBeAttached();
  await page.getByRole('textbox').focus();
  await page.keyboard.press('Tab');
  const outline = await page.evaluate(() => {
    const panel = document.createElement('div');
    panel.tabIndex = -1;
    panel.style.outline = 'none';
    document.body.append(panel);
    panel.focus();
    return getComputedStyle(panel).outlineStyle;
  });
  expect(outline).toBe('none');
});

test('the focused search field shows one ring, on the bar, not on the input', async ({ page }) => {
  await page.goto('/?scene=search-en&lang=en');
  await expect(page.locator('body[data-scene-ready="1"]')).toBeAttached();
  const field = page.getByRole('textbox');
  await field.click();
  await expect(field).toBeFocused();
  expect(await field.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe('none');
  expect(await page.locator('.field').evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none');
});
