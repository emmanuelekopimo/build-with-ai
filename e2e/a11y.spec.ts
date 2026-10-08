import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { login } from './helpers';

// Automated WCAG 2.1 A/AA checks on every main screen. Colour-contrast is reported separately
// (see docs/BUILD_REPORT.md) because the design's light-gray secondary text is kept for fidelity.
const PAGES = ['/', '/assets', '/assets/ECEWS-IT-0001', '/intake', '/forms', '/forms/new/issuance', '/forms/new/return', '/forms/new/movement', '/signoffs', '/reports', '/documents/ISS-0161'];

for (const path of PAGES) {
  test(`a11y ${path}`, async ({ page }) => {
    await login(page);
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const r = await new AxeBuilder({ page }).exclude('iframe').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).disableRules(['color-contrast']).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)).toEqual([]);
  });
}

test('a11y login and public pages', async ({ page }) => {
  for (const path of ['/login', '/sign/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).disableRules(['color-contrast']).analyze();
    expect(r.violations.map((v) => v.id)).toEqual([]);
  }
});

test('keyboard: modals trap focus and close on Escape', async ({ page }) => {
  await login(page);
  await page.goto('/signoffs');
  await page.getByRole('button', { name: 'New form' }).click();
  const dialog = page.getByRole('dialog', { name: 'New form' });
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 8; i++) await page.keyboard.press('Tab');
  expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
