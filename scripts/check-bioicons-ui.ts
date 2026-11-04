// Read-only checks against the actual full supported library and newly created test document.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const report=JSON.parse(readFileSync('reports/bioicons/mcp-verification.json','utf8'));
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
    const page=await browser.newPage({viewport:{width:1800,height:1400}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(id=>localStorage.setItem('helix-document',id),report.documentId);
    await page.goto('http://127.0.0.1:5173');await page.getByTestId('artboard').waitFor();
    const pending=page.waitForResponse(r=>r.url().endsWith('/api/tools/search_icons') && JSON.parse(r.request().postData() || '{}').query==='Bioicons');
    await page.getByLabel('Search scientific icons',{exact:true}).fill('Bioicons');await pending;
    await page.waitForFunction(()=>document.querySelectorAll('.icon-card').length===30);
    await page.getByRole('button',{name:'Next icons',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('.icon-card').length===30 && !!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Previous icons'));
    for(const img of await page.locator('.icon-card img').all()) await img.evaluate((img:HTMLImageElement)=>img.decode());
    await page.getByRole('button',{name:'Details',exact:true}).first().click();
    await page.locator('.asset-detail h3').waitFor();assert.ok((await page.locator('.asset-detail').textContent())?.includes('Source attribution'));
    assert.equal(await page.getByLabel('Document',{exact:true}).inputValue(),report.documentId);
    await page.getByRole('button',{name:'Fit',exact:true}).click();
    await page.waitForFunction(()=>document.querySelectorAll('svg.canvas path[fill="#e19b56"][stroke="#315a83"]').length>=7);
    await page.locator('svg.canvas').screenshot({path:'reports/bioicons/verification.png'});
    assert.deepEqual(errors,[]);
    const result={libraryPagination:[30,30],thumbnailsDecoded:30,details:true,galleryRendered:true,pageErrors:errors};
    writeFileSync('reports/bioicons/browser-verification.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser.close();}
