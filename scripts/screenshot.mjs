// Usage: node scripts/screenshot.mjs <path> <out.png> [width] [height] [--full] [--role=IT_ADMIN]
// Logs in as the seeded admin, opens the page, and saves a screenshot for design comparison.
import { chromium } from 'playwright-core';

const [, , path = '/', out = 'var/shot.png', w = '1440', h = '904', ...flags] = process.argv;
const base = process.env.SHOT_BASE ?? 'http://localhost:5173';
const email = process.env.SHOT_EMAIL ?? 'edidiong.okon@ecews.org';
const password = process.env.SEED_PASSWORD ?? 'Itams-Demo-2026';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
if (!flags.includes('--anon')) {
  await page.goto(`${base}/login`);
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type=submit]');
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}
await page.goto(`${base}${path}`);
await page.waitForLoadState('networkidle');
await page.waitForTimeout(Number(process.env.SHOT_WAIT ?? 400));
await page.screenshot({ path: out, fullPage: flags.includes('--full') });
await browser.close();
console.log(`saved ${out}`);
