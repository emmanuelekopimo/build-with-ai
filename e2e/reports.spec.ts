import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { login, SUPPORT } from './helpers';

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(new Date());

test('exports download in each format with the dated file name', async ({ page }) => {
  await login(page);
  await page.goto('/reports');
  for (const [label, ext] of [
    ['PDF', 'pdf'],
    ['Excel', 'xlsx'],
    ['CSV', 'csv'],
  ] as const) {
    await page.getByRole('button', { name: `Asset register as ${label}` }).click();
    const dialog = page.getByRole('dialog', { name: 'Export report' });
    await expect(dialog.getByText(`ECEWS-ITAMS-asset-register_${today()}.${ext}`)).toBeVisible();
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: `Download ${label}` }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(`ECEWS-ITAMS-asset-register_${today()}.${ext}`);
    const path = await file.path();
    const head = readFileSync(path!).subarray(0, 8);
    if (ext === 'pdf') expect(head.subarray(0, 4).toString()).toBe('%PDF');
    if (ext === 'xlsx') expect(head.subarray(0, 2).toString()).toBe('PK');
    if (ext === 'csv') expect(readFileSync(path!, 'utf8')).toMatch(new RegExp('^\uFEFFAsset tag,Category,'));
    await expect(dialog).toBeHidden();
  }
  // Custom filters change the count shown in the modal.
  await page.getByRole('button', { name: 'Export report' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export report' });
  const before = await dialog.getByText(/Asset register · \d+ assets/).textContent();
  await dialog.getByLabel('Status').selectOption({ label: 'Retired' });
  await expect(dialog.getByText(/Asset register · \d+ assets · filtered/)).toBeVisible();
  expect(await dialog.getByText(/Asset register · \d+ assets/).textContent()).not.toBe(before);
});

test('single-asset report and IT Support restrictions', async ({ page }) => {
  await login(page, SUPPORT);
  await page.goto('/reports');
  await expect(page.getByRole('button', { name: 'Export report' })).toBeDisabled();
  await page.goto('/assets/ECEWS-IT-0001');
  await page.getByRole('button', { name: 'Generate report' }).click();
  const dialog = page.getByRole('dialog', { name: 'Generate report' });
  await dialog.getByText('CSV', { exact: true }).click();
  const download = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Download CSV' }).click();
  expect((await download).suggestedFilename()).toBe(`ECEWS-ITAMS-ECEWS-IT-0001_full-history_${today()}.csv`);
  // Retire / Repair / Delete are hidden for IT Support.
  await page.goto('/assets?status=DAMAGED');
  await page.getByRole('row').nth(1).getByRole('link', { name: /View/ }).click();
  await expect(page.getByRole('button', { name: 'Retire' })).toHaveCount(0);
});

test('dashboard numbers link to their lists', async ({ page }) => {
  await login(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Recent Actions' })).toBeVisible();
  await page.getByRole('link', { name: /New issuance/ }).click();
  await expect(page.getByRole('heading', { name: 'New Issuance' })).toBeVisible();
  await page.goto('/');
  await page.getByRole('button', { name: /Notifications/ }).click();
  await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();
});
