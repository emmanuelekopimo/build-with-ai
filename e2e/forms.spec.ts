import { expect, test, type Page } from '@playwright/test';
import { login, mails, signAt, waitForLink } from './helpers';

const RECIPIENT = { name: 'Edet Bassey', department: 'Administration', staffId: 'AD-0042', email: 'edet.bassey@ecews.org' };

async function pickAsset(page: Page, tag: string) {
  const dialog = page.getByRole('dialog', { name: 'Add assets from registry' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('searchbox').fill(tag);
  await dialog.getByRole('searchbox').press('Enter');
  await expect(dialog.getByRole('button', { name: /Add 1 asset/ })).toBeEnabled();
  await dialog.getByRole('button', { name: /Add 1 asset/ }).click();
}

test.describe.configure({ mode: 'serial' });

let issuedTag = '';

test('issuance: send for signature, recipient signs on the public page, signed document', async ({ page }) => {
  await login(page);
  await page.goto('/assets?status=IN_STORE&sort=tag&dir=desc');
  issuedTag = (await page.getByRole('row').nth(1).getByRole('link').first().textContent())!.trim();
  await page.goto('/forms/new/issuance');
  await page.getByLabel('Full name').fill(RECIPIENT.name);
  await page.getByLabel('Department').fill(RECIPIENT.department);
  await page.getByLabel('Staff ID').fill(RECIPIENT.staffId);
  await page.getByLabel('Email - for the signature link').fill(RECIPIENT.email);
  await page.getByRole('button', { name: 'Add from In Store' }).click();
  await pickAsset(page, issuedTag);
  const before = mails().length;
  await page.getByRole('button', { name: 'Send for signature' }).click();
  const modal = page.getByRole('dialog', { name: 'Send for signature' });
  await expect(modal.getByText(/Please sign: ISS-\d{4} - Issuance & indemnity form/)).toBeVisible();
  await modal.getByRole('button', { name: 'Send signature request' }).click();
  await expect(page.getByText(/ISS-\d{4} sent for signature/)).toBeVisible();

  // Asset stays In Store but is locked until signed.
  await page.goto(`/assets/${issuedTag}`);
  await expect(page.getByText(/Actions are paused/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Issue' })).toBeDisabled();

  const link = await waitForLink(RECIPIENT.email, 'sign', before);
  const signer = await page.context().browser()!.newPage();
  await signAt(signer, link, RECIPIENT.name);
  // The link is single-use.
  await signer.goto(link);
  await expect(signer.getByRole('heading', { name: 'This link was already used' })).toBeVisible();
  await expect(signer.getByText(RECIPIENT.email)).toHaveCount(0);
  await signer.close();

  await page.goto(`/assets/${issuedTag}`);
  await expect(page.getByText(`Holder: ${RECIPIENT.name}`)).toBeVisible();
  await expect(page.getByRole('heading', { name: `Issued to ${RECIPIENT.name}` })).toBeVisible();
  await page.getByRole('link', { name: /Indemnity ISS-/ }).click();
  await expect(page.getByText(/Signature verified · .* WAT · IP/)).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF' }).click();
  expect((await download).suggestedFilename()).toMatch(/^ECEWS-ITAMS-ISS-\d{4}\.pdf$/);
});

test('return with damage: condition Damaged → asset Damaged after acknowledgment', async ({ page }) => {
  await login(page);
  await page.goto(`/assets/${issuedTag}`);
  await page.getByRole('button', { name: 'Return' }).click();
  await expect(page.getByRole('heading', { name: 'New Return' })).toBeVisible();
  await expect(page.getByLabel('Full name')).toHaveValue(RECIPIENT.name);
  await page.getByLabel(`Condition of ${issuedTag}`).selectOption('DAMAGED');
  await page.getByLabel('Condition notes').fill('Screen cracked in transit');
  const before = mails().length;
  await page.getByRole('button', { name: 'Confirm return' }).click();
  const modal = page.getByRole('dialog', { name: 'Confirm return' });
  await expect(modal.getByText('Damaged', { exact: true })).toBeVisible();
  await modal.getByRole('button', { name: 'Send return confirmation' }).click();
  await expect(page.getByText(/RTR-\d{4} sent for return confirmation/)).toBeVisible();
  const link = await waitForLink(RECIPIENT.email, 'sign', before);
  const signer = await page.context().browser()!.newPage();
  await signAt(signer, link, RECIPIENT.name);
  await signer.close();
  await page.goto(`/assets/${issuedTag}`);
  await expect(page.getByRole('button', { name: 'Send for Repair' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Returned' })).toBeVisible();
});

test('movement: CTO then Admin approve by email, then handover + indemnity signatures', async ({ page }) => {
  await login(page);
  await page.goto('/forms/new/movement');
  await page.getByRole('button', { name: 'Add items' }).click();
  await pickAsset(page, 'ECEWS-IT-0001');
  await expect(page.getByLabel('From - current holder')).toHaveValue(/Samuel Etuk/);
  await page.getByLabel('To location').selectOption({ label: 'Eket Office - IT Store' });
  await page.getByLabel('Full name').fill('Ima Ubong');
  await page.getByRole('option', { name: /Ima Ubong/ }).click(); // typeahead autofill from previous forms
  await expect(page.getByLabel('Email - for the indemnity link')).toHaveValue('ima.ubong@ecews.org');
  await page.getByLabel('Reason for transfer').fill('Field assignment - project ACE-5 needs a laptop at Eket');
  await page.getByLabel('CTO - email').fill('cto@ecews.org');
  await page.getByLabel('Admin Officer - email').fill('admin.officer@ecews.org');
  const before = mails().length;
  await page.getByRole('button', { name: 'Send for signatures' }).click();
  await page.getByRole('dialog', { name: 'Validate & send for signature' }).getByRole('button', { name: 'Send movement confirmation' }).click();
  await expect(page.getByText(/MVT-\d{4} sent to the CTO for approval/)).toBeVisible();

  const other = await page.context().browser()!.newPage();
  await other.goto(await waitForLink('cto@ecews.org', 'approve', before));
  await expect(other.getByText('Approval request · CTO')).toBeVisible();
  await other.getByRole('button', { name: 'Approve' }).click();
  await expect(other.getByText('Thank you - approval recorded')).toBeVisible();
  await other.goto(await waitForLink('admin.officer@ecews.org', 'approve', before));
  await expect(other.getByText('Approval request · Admin Officer')).toBeVisible();
  await other.getByRole('button', { name: 'Approve' }).click();
  await expect(other.getByText('Thank you - approval recorded')).toBeVisible();
  await signAt(other, await waitForLink('samuel.etuk@ecews.org', 'sign', before), 'Samuel Etuk');
  await signAt(other, await waitForLink('ima.ubong@ecews.org', 'sign', before), 'Ima Ubong');
  await other.close();

  await page.goto('/assets/ECEWS-IT-0001');
  await expect(page.getByText('Holder: Ima Ubong')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Moved to Ima Ubong' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Indemnity IND-/ })).toBeVisible();
});

test('sign-offs: expired link is re-sent with a fresh link; invalid links show a calm error', async ({ page }) => {
  await login(page);
  await page.goto('/signoffs?tab=EXPIRED');
  const row = page.getByRole('row').filter({ hasText: 'Blessing Etuk' });
  await row.getByRole('button', { name: 'Re-send' }).click();
  const before = mails().length;
  await page.getByRole('dialog', { name: 'Re-send signature request?' }).getByRole('button', { name: 'Re-send link' }).click();
  await expect(page.getByText(/fresh link sent · deadline extended by 7 days/)).toBeVisible();
  const link = await waitForLink('blessing.etuk@ecews.org', 'sign', before);
  const signer = await page.context().browser()!.newPage();
  await signer.goto(link);
  await expect(signer.getByRole('heading', { name: /Review & sign/ })).toBeVisible();
  await signer.goto('/sign/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
  await expect(signer.getByRole('heading', { name: 'This link is not valid' })).toBeVisible();
  await signer.close();
  await page.goto('/signoffs');
  await page.getByRole('row').filter({ hasText: 'Grace Offiong' }).filter({ hasText: 'Return' }).getByRole('button', { name: 'View' }).click();
  const drawer = page.getByRole('dialog', { name: /Sign-off · RTR-/ });
  await expect(drawer.getByText('Signers')).toBeVisible();
  await expect(drawer.getByRole('button', { name: 'Resend reminder' })).toBeVisible();
});
