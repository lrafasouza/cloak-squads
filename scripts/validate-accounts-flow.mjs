/**
 * Validation script for the accounts/sub-vault flows.
 * Renders each route in headless Chrome, captures visible text,
 * console errors, and screenshots. No wallet interaction —
 * we only validate static rendering.
 */

import { chromium } from '/Users/rafazaum/Desktop/cloak-squads/node_modules/.pnpm/playwright@1.59.1/node_modules/playwright/index.mjs';
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://localhost:3000';
const MULTISIG = '5hrqqkcaf7Xsx2gR7mFouBSXSGS1jtK1EGwV6NVnHpG2';
const OUT_DIR = join(process.cwd(), 'docs', 'validation-shots');
if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

// Use Playwright's bundled Chromium
let browser;
try {
  browser = await chromium.launch({ headless: true });
} catch (e) {
  console.error('Failed to launch Chromium:', e.message);
  console.error('Try: npx playwright install chromium');
  process.exit(1);
}

const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });

const routes = [
  { path: '', name: 'dashboard' },
  { path: '/sub-vaults', name: 'sub-vaults' },
  { path: '/limits', name: 'limits' },
  { path: '/privacy', name: 'privacy' },
  { path: '/send', name: 'send' },
];

const results = [];

for (const route of routes) {
  const page = await ctx.newPage();
  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));

  const url = `${BASE}/vault/${MULTISIG}${route.path}`;
  let statusCode = 0;
  let visibleText = '';
  let renderedOk = false;

  try {
    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
    statusCode = response?.status() ?? 0;
    // wait a bit for client-side hydration
    await page.waitForTimeout(2000);
    visibleText = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 4000));
    renderedOk = visibleText.length > 100;
    await page.screenshot({ path: join(OUT_DIR, `${route.name}.png`), fullPage: true });
  } catch (e) {
    pageErrors.push(`navigation: ${e.message}`);
  }

  results.push({
    name: route.name,
    url,
    statusCode,
    renderedOk,
    visibleText,
    consoleErrors,
    pageErrors,
  });
  await page.close();
}

await browser.close();

const report = results.map(r => `
═══ ${r.name.toUpperCase()} ═══
URL: ${r.url}
HTTP: ${r.statusCode}  rendered: ${r.renderedOk}
console errors: ${r.consoleErrors.length}
${r.consoleErrors.slice(0, 5).map(e => '  ' + e.slice(0, 200)).join('\n')}
page errors: ${r.pageErrors.length}
${r.pageErrors.slice(0, 5).map(e => '  ' + e.slice(0, 200)).join('\n')}

VISIBLE TEXT (first 1500ch):
${r.visibleText.slice(0, 1500)}
`).join('\n');

writeFileSync(join(OUT_DIR, 'report.txt'), report);
console.log(report);
console.log('\nScreenshots saved to:', OUT_DIR);
