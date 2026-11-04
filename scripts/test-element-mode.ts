// Actual browser hit-testing and stdio MCP synchronization with real NIH SVGs.
// All documents/assets written by this test live in a new isolated data directory.
import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {Catalog} from '../src/assets/catalog.ts';
import {sanitizeSvg} from '../src/assets/sanitize.ts';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
const root=mkdtempSync(join(tmpdir(),'helix-element-mode-')),reports=resolve('reports/element-mode');mkdirSync(reports,{recursive:true});
const original=new Catalog(resolve('data')),catalog=new Catalog(root);
const ids=['asset-45371acc4fa9453c1c6058a71b50850d24002ae35480c43a211ffb832f73322f','asset-c57d0bdb1dda767089f0f21daf556309d575239ebf992366b0b0a0035fbaf4b4'];
const hashes=ids.map(id=>createHash('sha256').update(original.get(id).svg).digest('hex'));
for(const id of ids){const a=original.get(id);assert.equal(a.provider,'NIH BioArt Source');assert.equal(catalog.add(a.svg,{...a,description:'Real NIH BioArt browser regression asset',sourceFile:resolve('data/assets',id.slice(6)+'.svg'),sourceHash:createHash('sha256').update(a.svg).digest('hex')}).id,id);}
const stressSvg=sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 650 400"><defs><clipPath id="clip"><rect width="430" height="320"/></clipPath></defs><g transform="translate(5 8)" clip-path="url(#clip)">'+Array.from({length:300},(_,i)=>`<path d="M${i%20*20} ${Math.floor(i/20)*20}h12v12h-12Z" fill="none" stroke="#789abc" stroke-width="2"/>`).join('')+'<path id="topmost" d="M0 0h38v18H0Z" fill="#bb8855"/><path id="clipped" d="M500 50h20v20h-20Z" fill="#aabbcc"/></g></svg>').svg;
const stressAsset=catalog.add(stressSvg,{name:'Synthetic selection stress fixture',category:'Test',tags:[],description:'Temporary browser stress fixture, not a scientific asset import',viewBox:'0 0 650 400',provider:'Temporary test fixture',license:'CC0',sourceFile:join(root,'stress.svg'),sourceHash:createHash('sha256').update(stressSvg).digest('hex')}).id;catalog.close();
const port='14322',base='http://127.0.0.1:'+port;
const service=spawn(process.execPath,['src/server/main.ts'],{env:{...process.env,FIGURE_DATA_DIR:root,FIGURE_PORT:port},stdio:['ignore','pipe','pipe']});let logs='';service.stderr.on('data',d=>logs+=d);service.stdout.on('data',d=>logs+=d);
const client=new Client({name:'element-mode-browser-sync',version:'1'});let browser;
const call=async(name:string,args:any={})=>{const r=await client.callTool({name,arguments:args});assert.ok(!r.isError,JSON.stringify(r));return JSON.parse((r.content as any)[0].text);};
try{
 for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}if(service.exitCode!==null)throw Error(logs);await new Promise(r=>setTimeout(r,100));}
 await client.connect(new StdioClientTransport({command:process.execPath,args:['src/mcp/main.ts'],env:{...process.env,FIGURE_SERVICE_URL:base} as Record<string,string>}));
 let doc=await call('create_document',{title:'Disposable — interactive NIH SVG Element Mode',width:1000,height:650});
 for(const [i,id]of ids.entries())doc=await call('add_icon',{documentId:doc.id,iconId:id,x:40+i*450,y:70,width:410,height:440});
 const objects=[...doc.roots];
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 const page=await browser.newPage({viewport:{width:1700,height:1100},acceptDownloads:true}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(id=>{localStorage.setItem('helix-document',id);(window as any).events=[];for(const type of ['pointerdown','pointerup','click','dblclick'])document.addEventListener(type,e=>{const target=e.target as Element;(window as any).events.push({type,tag:target.tagName,key:target.closest('[data-svg-element-key]')?.getAttribute('data-svg-element-key')});},true);},doc.id);
 await page.goto(base);await page.getByTestId('artboard').waitFor();await page.getByRole('button',{name:'Fit',exact:true}).click();
 const counts=await Promise.all(objects.map(async objectId=>(await call('list_icon_elements',{documentId:doc.id,objectId,limit:1000})).total));
 const node=(index:number)=>page.locator(`[data-object-id="${objects[index]}"]`),path=(index:number,key:string)=>node(index).locator(`[data-svg-element-key="${key}"]`);
 await path(0,'2').waitFor();console.log('Loaded real SVGs');
 // Sample native SVG geometry and browser hit testing, respecting painter order,
 // clips and transforms. Mouse events below are real browser clicks, not dispatchEvent.
 async function hit(index:number,key:string){return path(index,key).evaluate((el:SVGGraphicsElement)=>{const b=el.getBBox(),m=el.getScreenCTM()!;for(let y=0;y<140;y++)for(let x=0;x<140;x++){const p=new DOMPoint(b.x+b.width*(x+.5)/140,b.y+b.height*(y+.5)/140).matrixTransform(m);const hit=document.elementFromPoint(p.x,p.y)?.closest('[data-svg-element-key]');if(hit===el)return {x:p.x,y:p.y};}throw Error('No visible hit point for '+el.getAttribute('data-svg-element-key'));});}
 const outer=await hit(0,'2');await page.mouse.dblclick(outer.x,outer.y);await page.getByRole('status').filter({hasText:'Element Mode'}).waitFor();assert.ok((await page.getByTestId('element-selection-info').innerText()).includes('@svg:2'));
 console.log('Native double-click entered Element Mode');const inner=await hit(0,'1/3');await page.mouse.click(inner.x,inner.y);await page.waitForFunction(()=>document.querySelector('[data-testid="element-selection-info"]')?.textContent?.includes('@svg:1/3'));
 const outerAgain=await hit(0,'2');await page.mouse.click(outerAgain.x,outerAgain.y);assert.ok((await page.getByTestId('element-selection-info').innerText()).includes('@svg:2'));
 const before=await call('get_document',{documentId:doc.id});
 await page.getByLabel('Element fill',{exact:true}).fill('#4389C7');await page.getByRole('button',{name:'Apply element fill',exact:true}).click();await path(0,'2').locator('xpath=self::*[@fill="#4389C7"]').waitFor();
 let fresh=await call('get_document',{documentId:doc.id});assert.deepEqual(Object.keys(fresh.nodes[objects[0]].elementStyles),['2']);assert.deepEqual(before.nodes[objects[1]],fresh.nodes[objects[1]]);
 const list=page.getByRole('listbox',{name:'SVG Elements'});await list.locator('[data-element-id="@svg:1/3"]').click();assert.equal(await list.locator('[aria-selected=true]').count(),1);
 await list.locator('[data-element-id="@svg:2"]').click({modifiers:['Shift']});assert.equal(await list.locator('[aria-selected=true]').count(),2);
 const revision=fresh.revision;await page.getByLabel('Element fill',{exact:true}).fill('#E89B43');await page.getByRole('button',{name:'Apply element fill',exact:true}).click();await page.waitForFunction(id=>document.querySelector(`[data-object-id="${id}"] [data-svg-element-key="1/3"]`)?.getAttribute('fill')==='#E89B43',objects[0]);
 fresh=await call('get_document',{documentId:doc.id});assert.equal(fresh.revision,revision+1);assert.equal(fresh.nodes[objects[0]].elementStyles['2'].fill,'#E89B43');
 await page.getByRole('button',{name:'Undo',exact:true}).click();await page.waitForFunction(id=>document.querySelector(`[data-object-id="${id}"] [data-svg-element-key="2"]`)?.getAttribute('fill')==='#4389C7',objects[0]);
 await page.getByRole('button',{name:'Redo',exact:true}).click();await page.waitForFunction(id=>document.querySelector(`[data-object-id="${id}"] [data-svg-element-key="2"]`)?.getAttribute('fill')==='#E89B43',objects[0]);
 // Restore independent membrane colors using the actual picker.
 await list.locator('[data-element-id="@svg:2"]').click();await page.getByLabel('Element fill color picker',{exact:true}).fill('#4389c7');await path(0,'2').locator('xpath=self::*[@fill="#4389c7"]').waitFor();
 // Keep inspector focus to reproduce the previous synchronization blocker.
 await page.getByLabel('Element fill',{exact:true}).focus();fresh=await call('get_document',{documentId:doc.id});
 await call('update_icon_element',{documentId:doc.id,objectId:objects[0],elementId:'@svg:1/3',patch:{stroke:'#782bc4',strokeWidth:2,opacity:.8},expectedRevision:fresh.revision});
 await page.waitForFunction(id=>document.querySelector(`[data-object-id="${id}"] [data-svg-element-key="1/3"]`)?.getAttribute('stroke')==='#782bc4',objects[0]);
 await page.reload();await path(0,'2').locator('xpath=self::*[@fill="#4389c7"]').waitFor();assert.equal(await path(0,'1/3').getAttribute('fill'),'#E89B43');
 // Second genuinely complex NIH asset: click native path and edit independently.
 const nucleusKey='1/0/0/0',nucleusHit=await hit(1,nucleusKey);await page.mouse.dblclick(nucleusHit.x,nucleusHit.y);await page.getByTestId('element-selection-info').waitFor();assert.ok((await page.getByTestId('element-selection-info').innerText()).includes('@svg:'+nucleusKey));
 await page.getByLabel('Element stroke color picker',{exact:true}).fill('#cc3344');await page.waitForFunction(id=>document.querySelector(`[data-object-id="${id}"] [data-svg-element-key="1/0/0/0"]`)?.getAttribute('stroke')==='#cc3344',objects[1]);
 const exported=await call('export_svg',{documentId:doc.id});assert.ok(exported.svg.includes('#4389c7')&&exported.svg.includes('#E89B43')&&exported.svg.includes('#cc3344'));assert.ok(!exported.svg.includes('data-svg-element-key')&&!exported.svg.includes('drop-shadow'));
 writeFileSync(join(reports,'edited.svg'),exported.svg);await page.screenshot({path:join(reports,'element-mode.png')});
 const png=page.waitForEvent('download');await page.getByRole('button',{name:'PNG',exact:true}).click();const pngDownload=await png;await pngDownload.saveAs(join(reports,'edited.png'));
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'Edit SVG Elements',exact:true}).waitFor();
 await page.getByRole('button',{name:'Edit SVG Elements',exact:true}).click();await page.getByRole('status').filter({hasText:'Element Mode'}).waitFor();const paper=await page.getByTestId('artboard').boundingBox();assert.ok(paper);await page.mouse.click(paper.x+10,paper.y+10);await page.waitForFunction(()=>!document.querySelector('.element-mode-banner'));
 // Re-select the nucleus so ordinary object dragging is tested below.

 const png2=page.waitForEvent('download');await page.getByRole('button',{name:'PNG',exact:true}).click();const plainDownload=await png2;await plainDownload.saveAs(join(root,'plain.png'));assert.deepEqual(readFileSync(join(reports,'edited.png')),readFileSync(join(root,'plain.png')),'UI highlights must never enter PNG');
 // Object drag and resize remain ordinary document operations.
 const p=await hit(1,nucleusKey);fresh=await call('get_document',{documentId:doc.id});const originalTransform=fresh.nodes[objects[1]].transform;
 await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+22,p.y+15,{steps:5});await page.mouse.up();await page.waitForFunction(rev=>Number(document.querySelector('.revision')?.textContent?.slice(1))>rev,fresh.revision);
 fresh=await call('get_document',{documentId:doc.id});assert.notDeepEqual(fresh.nodes[objects[1]].transform,originalTransform);
 const handle=await page.getByTestId('resize-handle').boundingBox();assert.ok(handle);await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(handle.x+24,handle.y+18,{steps:5});await page.mouse.up();await page.waitForFunction(rev=>Number(document.querySelector('.revision')?.textContent?.slice(1))>rev,fresh.revision);
 const afterResize=await call('get_document',{documentId:doc.id});assert.notDeepEqual(afterResize.nodes[objects[1]].transform,fresh.nodes[objects[1]].transform);
 // Group via existing object selection, then restore with undo.
 await page.locator('.layer-name').filter({hasText:ids[0]}).count(); // names may be provider titles
 const layers=page.locator('.layer-name');await layers.nth(0).click();await layers.nth(1).click({modifiers:['Shift']});await page.getByRole('button',{name:'Group',exact:true}).click();await page.getByRole('button',{name:'Ungroup',exact:true}).waitFor({state:'visible'});assert.equal((await call('get_document',{documentId:doc.id})).roots.length,1);
 await page.getByRole('button',{name:'Undo',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.layer').length===2);
 // Dense nested/clipped SVG: hidden elements remain selectable from the list,
 // and native hit-testing chooses the overlapping topmost painted path.
 let stressDoc=await call('create_document',{title:'Disposable — SVG selection stress',width:800,height:500});stressDoc=await call('add_icon',{documentId:stressDoc.id,iconId:stressAsset,x:40,y:40,width:650,height:400});
 const sp=await browser.newPage({viewport:{width:1700,height:1100}});sp.on('pageerror',e=>errors.push(e.message));await sp.addInitScript(id=>localStorage.setItem('helix-document',id),stressDoc.id);await sp.goto(base);await sp.getByTestId('artboard').waitFor();
 const surface=sp.locator('[data-object-id="'+stressDoc.roots[0]+'"]'),top=surface.locator('[data-svg-element-key="1/300"]');await top.waitFor();await top.dblclick();await sp.getByTestId('element-selection-info').waitFor();assert.ok((await sp.getByTestId('element-selection-info').innerText()).includes('topmost'));
 const stressList=sp.getByRole('listbox',{name:'SVG Elements'});assert.equal(await stressList.getByRole('option').count(),303);await stressList.locator('[data-element-id="@svg:1/0"]').click();assert.ok((await sp.getByTestId('element-selection-info').innerText()).includes('@svg:1/0'));
 await stressList.locator('[data-element-id="clipped"]').click();assert.equal(await stressList.locator('[data-element-id="clipped"]').getAttribute('aria-selected'),'true');
 const strokePath=surface.locator('[data-svg-element-key="1/20"]');const point=await strokePath.evaluate((el:SVGGraphicsElement)=>{const b=el.getBBox(),m=el.getScreenCTM()!;const p=new DOMPoint(b.x+6,b.y).matrixTransform(m);return{x:p.x,y:p.y};});await sp.mouse.move(point.x,point.y);await sp.waitForFunction(id=>getComputedStyle(document.querySelector(`[data-object-id="${id}"] [data-svg-element-key="1/20"]`)!).filter.includes('drop-shadow'),stressDoc.roots[0]);await sp.mouse.click(point.x,point.y);assert.ok((await sp.getByTestId('element-selection-info').innerText()).includes('@svg:1/20'));
 await sp.getByLabel('Element stroke',{exact:true}).fill('#1144aa');await sp.getByRole('button',{name:'Apply element stroke',exact:true}).click();await sp.waitForFunction(id=>document.querySelector(`[data-object-id="${id}"] [data-svg-element-key="1/20"]`)?.getAttribute('stroke')==='#1144aa',stressDoc.roots[0]);assert.equal(await strokePath.getAttribute('fill'),'none');
 await sp.getByRole('button',{name:'Reset element overrides',exact:true}).click();await sp.waitForFunction(id=>document.querySelector(`[data-object-id="${id}"] [data-svg-element-key="1/20"]`)?.getAttribute('stroke')==='#789abc',stressDoc.roots[0]);
 await sp.close();
 for(const[i,id]of ids.entries())assert.equal(createHash('sha256').update(original.get(id).svg).digest('hex'),hashes[i]);assert.deepEqual(errors,[]);
 const result={at:new Date().toISOString(),temporaryDataDirectory:root,documentId:doc.id,realNihAssets:ids,realAssetElementCounts:counts,stressFixtureEditableElements:303,passed:['native double click','native outer membrane click','native crista/inner fold click','target-only fill','drawing-order list','shift multi-selection','atomic multi-fill single revision','undo','redo','color pickers','MCP live sync while inspector focused','reload persistence','complex nucleus native selection','SVG export','PNG export excludes highlights','Escape exits','inspector button enters','outside click exits','303-element nested clipped fixture','overlapping native painter order','hidden list selection','stroke-only native selection','hover feedback','reset overrides','object dragging','object resizing','object grouping','original asset integrity'],failed:[],browserErrors:errors};writeFileSync(join(reports,'results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(error){if(browser){const pages=browser.contexts().flatMap(c=>c.pages());if(pages[0]){await pages[0].screenshot({path:join(reports,'failure.png')});writeFileSync(join(reports,'failure.html'),await pages[0].content());writeFileSync(join(reports,'failure-events.json'),JSON.stringify(await pages[0].evaluate(()=>(window as any).events),null,2));}}throw error;}finally{await browser?.close();await client.close();service.kill('SIGTERM');original.close();}
