import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
// Always isolate this mutation test from the user's running figures.
const data=mkdtempSync(join(tmpdir(),'helix-basic-browser-')),port=process.env.FIGURE_BROWSER_TEST_PORT || '14318';
const service=spawn(process.execPath,['src/server/main.ts'],{env:{...process.env,FIGURE_DATA_DIR:data,FIGURE_PORT:port},stdio:['ignore','pipe','pipe']});let serviceLog='';service.stdout.on('data',d=>serviceLog+=d);service.stderr.on('data',d=>serviceLog+=d);
// Uses an existing installed browser; never touches the user's CDP session.
const executablePath = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors: string[] = [];
page.on('pageerror', e => errors.push(e.message));
try {
    let ready=false;for(let n=0;n<100;n++){try{const r=await fetch(`http://127.0.0.1:${port}/api/health`);if(r.ok){ready=true;break;}}catch{}if(service.exitCode!==null)throw new Error(serviceLog);await new Promise(r=>setTimeout(r,100));}assert.ok(ready,serviceLog);
    await page.goto(`http://127.0.0.1:${port}`);
    await page.getByTestId('artboard').waitFor();
    await page.getByRole('button', { name: 'Fit', exact: true }).click();
    const before=await page.locator('svg.canvas text').count();
    await page.getByRole('button', { name: 'T Text', exact: false }).click();
    await page.waitForFunction(n=>document.querySelectorAll('svg.canvas text').length>n,before);
    const label = page.locator('[data-object-id]').filter({ has: page.locator('text', {}) }).last();
    const textNodes = page.locator('svg.canvas text');
    assert.ok(await textNodes.count() > 0);
    await page.locator('svg.canvas').screenshot({ path: join(data,'editor-preview.png') });
    assert.deepEqual(errors, []);
    console.log('Browser smoke check passed');
}
finally {
    await browser.close();
    service.kill('SIGTERM');
}
