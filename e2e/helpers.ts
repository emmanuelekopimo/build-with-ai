import { expect, type Page } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const ADMIN = { email: 'edidiong.okon@ecews.org', password: 'Itams-Demo-2026' };
export const SUPPORT = { email: 'uwem.ekanem@ecews.org', password: 'Itams-Demo-2026' };

export async function login(page: Page, who = ADMIN) {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(who.email);
  await page.getByLabel('Password').fill(who.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Emails written by the file transport during this e2e run, newest last. */
export function mails(): Array<{ file: string; raw: string }> {
  const dir = 'var/e2e-mail';
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.eml')).sort();
  } catch {
    return [];
  }
  return files.map((f) => ({ file: f, raw: readFileSync(path.join(dir, f), 'utf8') }));
}

/** Decode quoted-printable soft breaks so links can be extracted from .eml files. */
export function linkFromMail(raw: string, kind: 'sign' | 'approve' | 'reset-password'): string | null {
  const text = raw.replace(/=\r?\n/g, '').replace(/=3D/g, '=');
  const m = new RegExp(`http://localhost:4100/${kind}/([A-Za-z0-9_-]{43})`).exec(text);
  return m ? m[0] : null;
}
