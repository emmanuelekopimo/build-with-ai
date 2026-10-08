import { expect, test, type Page } from '@playwright/test';
import { login } from './helpers';

async function addLine(page: Page, opts: { category: string; make: string; serial: string; failed?: boolean }) {
  await page.getByRole('button', { name: 'Add line item' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add line item' });
  await dialog.getByLabel('Category').selectOption({ label: opts.category });
  await dialog.getByLabel('Make / model').fill(opts.make);
  await dialog.getByLabel('Serial number').fill(opts.serial);
  if (opts.failed) await dialog.getByText('Failed', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Add item' }).click();
  await expect(dialog).toBeHidden();
}

test('intake: passed items go In Store, failed items are flagged Damaged', async ({ page }) => {
  await login(page);
  await page.goto('/intake');
  await expect(page.getByRole('heading', { name: 'Intake - Validation Checklist' })).toBeVisible();
  // Validation without data highlights the first problem.
  await page.getByRole('button', { name: 'Validate & create assets' }).click();
  await expect(page.getByText('Enter the supplier / vendor.').first()).toBeVisible();

  await page.getByLabel('Supplier / vendor').fill('Dell EMC Nigeria');
  await page.getByLabel('PO reference').fill('PO-E2E-1');
  await page.getByLabel('Project').selectOption({ label: 'ACE-5 Uyo' });
  await page.getByLabel('Delivery location').selectOption({ label: 'Eket Office - IT Store' });
  await addLine(page, { category: 'Laptop', make: 'Dell Latitude 7420', serial: 'E2E-8XW4T9' });
  await addLine(page, { category: 'Laptop', make: 'Dell Latitude 7420', serial: 'E2E-8XW4U0' });
  await addLine(page, { category: 'External Monitor', make: 'Dell P2422H', serial: 'E2E-MON-1', failed: true });
  await expect(page.getByText(/Draft IN-\d+ auto-saved/)).toBeVisible({ timeout: 10000 });

  const groups = page.getByRole('radiogroup');
  for (let i = 0; i < 7; i++) {
    await groups.nth(i).getByText(i === 3 ? 'N/A' : 'Yes', { exact: true }).click();
  }
  await expect(page.getByText('6 of 6 checks passed')).toBeVisible();

  await page.getByRole('button', { name: 'Validate & create assets' }).click();
  const dialog = page.getByRole('dialog', { name: 'Validate & create assets?' });
  await expect(dialog.getByText('2 items passed')).toBeVisible();
  await expect(dialog.getByText('1 item failed')).toBeVisible();
  await dialog.getByRole('button', { name: 'Validate & create assets' }).click();

  await expect(page).toHaveURL(/\/assets\?/);
  await expect(page.getByText('2 assets created · status In Store')).toBeVisible();
  await expect(page.getByText('1 item failed intake · flagged Damaged')).toBeVisible();

  const failedRow = page.getByRole('row').filter({ hasText: 'E2E-MON-1' });
  await expect(failedRow.getByText('Damaged')).toBeVisible();
  await expect(failedRow.getByText('Failed intake')).toBeVisible();
  await failedRow.getByRole('link', { name: /View/ }).click();
  await expect(page.getByRole('button', { name: 'Send for Repair' })).toBeVisible();
  await page.getByRole('button', { name: 'Retire' }).click();
  const retire = page.getByRole('dialog', { name: 'Retire this asset?' });
  await expect(retire.getByLabel('Reason')).toHaveValue('REJECTED_AT_INTAKE');
  await retire.getByRole('button', { name: 'Retire asset' }).click();
  await expect(page.getByRole('button', { name: 'Repair' })).toBeVisible();
  await expect(page.getByText('Retired: Rejected at intake')).toBeVisible();
});

test('registry filters live in the URL and report damage works', async ({ page }) => {
  await login(page);
  await page.goto('/assets');
  await page.getByRole('button', { name: /Status: All/ }).click();
  await page.getByRole('button', { name: 'In Store' }).click();
  await expect(page).toHaveURL(/status=IN_STORE/);
  await page.getByRole('searchbox', { name: 'Search assets' }).fill('E2E-8XW4T9');
  await expect(page).toHaveURL(/q=E2E-8XW4T9/);
  await expect(page.getByText(/^1$/).first()).toBeVisible();
  await page.goBack();
  await page.goForward();
  const row = page.getByRole('row').filter({ hasText: 'E2E-8XW4T9' });
  await row.getByRole('link', { name: /View/ }).click();
  await page.getByRole('button', { name: 'Report damage' }).click();
  const dialog = page.getByRole('dialog', { name: 'Report damage' });
  await dialog.getByText('Poor', { exact: true }).click();
  await dialog.getByLabel('Notes').fill('Hinge cracked on the left side');
  await dialog.getByRole('button', { name: 'Report damage' }).click();
  await expect(page.getByText(/reported damaged · status Damaged/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Reported damaged' })).toBeVisible();
});
