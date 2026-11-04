// Screenshot a page for documentation. Optional --click "Button text" steps run before capture.
import { chromium } from 'playwright-core';
const args = process.argv.slice(2);
const url = args[0], out = args[1];
const w = Number(args[2] ?? 1600), h = Number(args[3] ?? 1000);
const clicks: string[] = [];
for (let i = 4; i < args.length; i++) if (args[i] === '--click') clicks.push(args[++i]);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
for (const label of clicks) { await page.getByRole('button', { name: label, exact: false }).first().click(); await page.waitForTimeout(2500); }
await page.screenshot({ path: out });
console.log('ok', out);
await browser.close();
