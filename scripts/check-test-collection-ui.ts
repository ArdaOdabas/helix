// Read-only browser verification of the already-created collection document.
import {chromium} from 'playwright-core';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const report=JSON.parse(readFileSync('examples/helix-test-collection-report.json','utf8'));
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
    const page=await browser.newPage({viewport:{width:1800,height:1100}});
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(id=>localStorage.setItem('helix-document',id),report.documentId);
    await page.goto('http://127.0.0.1:5173');
    await page.getByTestId('artboard').waitFor();
    assert.equal(await page.getByLabel('Document',{exact:true}).inputValue(),report.documentId);
    await page.getByLabel('Asset category',{exact:true}).selectOption('Helix original test collection');
    await page.waitForFunction(()=>document.querySelectorAll('.icon-card').length===10);
    for(const result of report.results){
        const searchResponse=page.waitForResponse(response=>{
            if(!response.url().endsWith('/api/tools/search_icons'))return false;
            return JSON.parse(response.request().postData() || '{}').query===result.name;
        });
        await page.getByLabel('Search scientific icons',{exact:true}).fill(result.name);
        await searchResponse;
        const card=page.getByTitle('Insert '+result.name,{exact:true});await card.waitFor();
        await card.locator('img').evaluate((img:HTMLImageElement)=>img.decode());
        assert.ok(await card.locator('img').evaluate((img:HTMLImageElement)=>img.naturalWidth>0));
        const edited=page.locator(`[id="${result.instanceId}-${result.editedElementId}"]`);
        await page.waitForFunction(id=>{
            const el=document.getElementById(id);return el?.getAttribute('fill')==='#1b9e77' && el?.getAttribute('stroke')==='#be3c65';
        },`${result.instanceId}-${result.editedElementId}`);
        assert.equal(await edited.getAttribute('fill'),'#1b9e77');
        result.browserLibrary=true;result.thumbnail=true;result.browserSearch=true;result.browserRenderedEdits=true;
    }
    await page.getByLabel('Search scientific icons',{exact:true}).fill('');
    await page.waitForFunction(()=>document.querySelectorAll('.icon-card').length===10);
    await page.getByRole('button',{name:'Fit',exact:true}).click();
    await page.locator('svg.canvas').screenshot({path:'examples/helix-test-collection.png'});
    assert.deepEqual(errors,[]);
    report.browser={library:10,thumbnails:10,search:10,renderedEdits:10,pageErrors:errors};
    writeFileSync('examples/helix-test-collection-report.json',JSON.stringify(report,null,2)+'\n');
    console.log('Browser collection verification: 10/10 library entries, thumbnails, searches, rendered edits; 0 page errors.');
}finally{await browser.close();}
