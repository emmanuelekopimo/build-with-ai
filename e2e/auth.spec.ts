import { expect, test } from '@playwright/test';
import { ADMIN, linkFromMail, login, mails } from './helpers';

test('login shows errors inline and signs in', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Enter your work email.')).toBeVisible();
  await page.getByLabel('Email address').fill(ADMIN.email);
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.');
  await login(page);
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
});

test('sign out asks for confirmation', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Sign out' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Sign out?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/);
});

test('forgot password sends a working reset link', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  const dialog = page.getByRole('dialog', { name: 'Forgot password?' });
  await dialog.getByLabel('Email address').fill('uwem.ekanem@ecews.org');
  await dialog.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText('If that email belongs to an ITAMS account')).toBeVisible();
  let link: string | null = null;
  await expect.poll(() => {
    const m = mails().find((x) => x.raw.includes('Reset your ITAMS password'));
    link = m ? linkFromMail(m.raw, 'reset-password') : null;
    return link;
  }).not.toBeNull();
  await page.goto(link!);
  await page.getByLabel('New password').fill('Fresh-password-2026');
  await page.getByLabel('Repeat password').fill('Fresh-password-2026');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(page.getByText('Password updated')).toBeVisible();
  await login(page, { email: 'uwem.ekanem@ecews.org', password: 'Fresh-password-2026' });
});
