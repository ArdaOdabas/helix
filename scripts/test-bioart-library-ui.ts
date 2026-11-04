// Read-only smoke against the running library. Blocks all document mutation requests.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const base=process.env.FIGURE_UI_URL || 'http://127.0.0.1:4317';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1600,height:1100}});page.setDefaultTimeout(15000);
 const errors:string[]=[],blocked:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/tools/*',async route=>{const name=route.request().url().split('/').pop()!;if(!['list_documents','get_document','search_icons','list_categories','list_imports','list_providers','get_asset'].includes(name)){blocked.push(name);await route.abort();return;}await route.continue();});
 await page.goto(base);await page.getByTestId('artboard').waitFor();
 await page.getByLabel('Asset provider').locator('option[value="NIH BioArt Source"]').waitFor({state:'attached'});
 const firstResponse=page.waitForResponse(r=>r.url().endsWith('/api/tools/search_icons')&&r.request().postDataJSON().provider==='NIH BioArt Source');
 await page.getByLabel('Asset provider').selectOption('NIH BioArt Source');const first=await(await firstResponse).json();
 await page.locator('.icon-card img[src*="'+first.items[0].id+'"]').waitFor();assert.ok(first.items.length<=30);
 await page.locator('.icon-card img').first().evaluate((img:HTMLImageElement)=>img.decode());
 const nextResponse=page.waitForResponse(r=>r.url().endsWith('/api/tools/search_icons')&&r.request().postDataJSON().offset===30);
 await page.getByRole('button',{name:'Next icons',exact:true}).click();const next=await(await nextResponse).json();
 await page.locator('.icon-card img[src*="'+next.items[0].id+'"]').waitFor();assert.ok(next.items.length<=30);
 assert.ok(!next.items.some((i:any)=>first.items.some((a:any)=>a.id===i.id)));
 await page.getByRole('button',{name:'Details',exact:true}).first().click();await page.locator('.asset-detail').waitFor();
 assert.ok((await page.locator('.asset-detail').innerText()).includes('NIH BioArt Source'));
 const image=await page.locator('.icon-card img').first().getAttribute('src');assert.ok(image);
 const thumbnail=await page.request.get(base+image);assert.ok(thumbnail.ok());
 const cached=await page.request.get(base+image,{headers:{'If-None-Match':thumbnail.headers().etag}});assert.equal(cached.status(),304);
 assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
 const result={providerFiltering:true,pagination:true,pageSize:30,metadataDetails:true,thumbnailDecode:true,thumbnailCaching304:true,browserErrors:errors,documentMutations:blocked};
 writeFileSync('reports/bioart-expansion/live-ui-tests.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await browser.close();}
