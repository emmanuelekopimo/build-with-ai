// Shared headless Chromium for HTML → PDF rendering.

import { chromium, type Browser } from 'playwright-core';
import { existsSync } from 'node:fs';
import { env } from '../env';

let browserPromise: Promise<Browser> | null = null;

function executablePath(): string | undefined {
  const configured = env().CHROMIUM_PATH;
  if (configured) return configured;
  // Fall back to Playwright's own lookup (PLAYWRIGHT_BROWSERS_PATH or ~/.cache/ms-playwright).
  return undefined;
}

export function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    const exe = executablePath();
    if (exe && !existsSync(exe)) throw new Error(`CHROMIUM_PATH does not exist: ${exe}`);
    browserPromise = chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    browserPromise.catch(() => {
      browserPromise = null;
    });
  }
  return browserPromise;
}

export async function htmlToPdf(html: string, opts: { landscape?: boolean } = {}): Promise<Buffer> {
  const browser = await getBrowser();
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: 'A4',
      landscape: opts.landscape ?? false,
      printBackground: true,
      margin: { top: '0', bottom: '0', left: '0', right: '0' },
      preferCSSPageSize: true,
    });
    return Buffer.from(pdf);
  } finally {
    await context.close();
  }
}

export async function closeBrowser(): Promise<void> {
  if (browserPromise) {
    const b = await browserPromise.catch(() => null);
    browserPromise = null;
    await b?.close();
  }
}
