// Protocol-level PNG inspection/correction; isolated service, real licensed asset,
// fresh disposable documents. Never sends mutations to the user's service.
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {chromium} from 'playwright-core';
import {Catalog} from '../src/assets/catalog.ts';
import {Store} from '../src/server/store.ts';
const dir=mkdtempSync(join(tmpdir(),'helix-figure-feedback-')),report=resolve('reports/figure-feedback');mkdirSync(report,{recursive:true});
const assetId='asset-45371acc4fa9453c1c6058a71b50850d24002ae35480c43a211ffb832f73322f';
const original=new Catalog(resolve('data')),catalog=new Catalog(dir),asset=original.get(assetId),sourceHash=createHash('sha256').update(asset.svg).digest('hex');
assert.equal(catalog.add(asset.svg,{...asset,description:'Real NIH BioArt verification',sourceFile:resolve('data/assets',assetId.slice(6)+'.svg'),sourceHash}).id,assetId);catalog.close();
const port='14323',base='http://127.0.0.1:'+port,service=spawn(process.execPath,['src/server/main.ts'],{env:{...process.env,FIGURE_DATA_DIR:dir,FIGURE_PORT:port},stdio:['ignore','pipe','pipe']});let log='';service.stdout.on('data',d=>log+=d);service.stderr.on('data',d=>log+=d);
const client=new Client({name:'helix-feedback-validation',version:'1'});let browser;
const raw=async(name:string,args:any={})=>client.callTool({name,arguments:args});
const call=async(name:string,args:any={})=>{const r=await raw(name,args);assert.ok(!r.isError,JSON.stringify(r));const text=r.content.find(c=>c.type==='text');assert.ok(text?.type==='text');return{result:JSON.parse(text.text),content:r.content};};
function png(content:any[],path:string){const image=content.find(c=>c.type==='image');assert.equal(image?.mimeType,'image/png','Claude must receive a native MCP image block');const bytes=Buffer.from(image.data,'base64');assert.equal(bytes.subarray(1,4).toString(),'PNG');writeFileSync(join(report,path),bytes);return bytes;}
try{
 for(let i=0;i<100;i++){if(service.exitCode!==null)throw Error(log);try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 await client.connect(new StdioClientTransport({command:process.execPath,args:[resolve('src/mcp/main.ts')],env:{...process.env,FIGURE_SERVICE_URL:base} as Record<string,string>}));
 const tools=await client.listTools();assert.equal(tools.tools.length,33);for(const name of ['render_figure','analyze_figure_layout','compose_figure','refine_figure_layout','update_icon_elements','apply_figure_plan'])assert.ok(tools.tools.some(t=>t.name===name));writeFileSync(join(report,'mcp-tools.json'),JSON.stringify(tools,null,2));
 let doc=(await call('create_document',{title:'Disposable — measured visual feedback',width:600,height:400})).result;
 doc=(await call('add_icon',{documentId:doc.id,iconId:assetId,x:-40,y:60,width:140,height:130})).result;const icon=doc.roots[0];
 doc=(await call('add_text',{documentId:doc.id,text:'Mitochondrial matrix',name:'Overflow test label',x:180,y:90,width:170,height:50,style:{fontSize:24,fill:'#222222'}})).result;const text=doc.roots[1];
 const initial=await call('render_figure',{documentId:doc.id,expectedRevision:doc.revision});const before=png(initial.content,'before.png');assert.equal(initial.result.revision,doc.revision);assert.ok(!JSON.stringify(initial.result).includes('base64'));assert.equal(initial.result.image,undefined);
 const cached=await call('render_figure',{documentId:doc.id,expectedRevision:doc.revision});assert.deepEqual(png(cached.content,'cached.png'),before);assert.equal((await call('get_document',{documentId:doc.id})).result.revision,doc.revision);
 const inspected=await call('analyze_figure_layout',{documentId:doc.id,expectedRevision:doc.revision});assert.ok(inspected.result.analysis.issues.some((i:any)=>i.code==='outside_canvas_margin'));assert.ok(inspected.result.analysis.issues.some((i:any)=>i.code==='text_overflow'));assert.equal((await call('get_document',{documentId:doc.id})).result.revision,doc.revision);
 const readonly=await call('refine_figure_layout',{documentId:doc.id});assert.equal(readonly.result.passes.length,0);assert.equal(readonly.result.stopReason,'inspection_only');
 const invalid=await raw('refine_figure_layout',{documentId:doc.id,apply:true});assert.equal(invalid.isError,true);
 const fixed=await call('refine_figure_layout',{documentId:doc.id,expectedRevision:doc.revision,apply:true,maxIterations:3});const after=png(fixed.content,'after.png');assert.notDeepEqual(before,after);assert.ok(fixed.result.passes.length>0&&fixed.result.passes.length<=3);assert.ok(!fixed.result.analysis.issues.some((i:any)=>['outside_canvas_margin','text_overflow'].includes(i.code)));assert.equal(fixed.result.document.nodes[icon].transform[4],12);assert.ok(fixed.result.document.nodes[text].style.fontSize<24);assert.equal(fixed.result.document.nodes[text].text,'Mitochondrial matrix');assert.equal(fixed.result.document.revision,doc.revision+fixed.result.passes.length);
 let current=fixed.result.document;const stored=new Store(dir).read(doc.id).document;assert.deepEqual(stored,current);
 current=(await call('undo',{documentId:doc.id,expectedRevision:current.revision})).result;assert.equal(current.nodes[icon].transform[4],-40);
 current=(await call('redo',{documentId:doc.id,expectedRevision:current.revision})).result;assert.equal(current.nodes[icon].transform[4],12);
 const stale=await raw('refine_figure_layout',{documentId:doc.id,expectedRevision:doc.revision,apply:true});assert.equal(stale.isError,true);assert.equal((await call('get_document',{documentId:doc.id})).result.revision,current.revision);
 // Concurrent modification between async measurement and application is refused.
 const collision=await call('add_text',{documentId:doc.id,text:'Another overflowing long label',width:200,height:40,x:200,y:240,style:{fontSize:25}});current=collision.result;
 const pending=call('refine_figure_layout',{documentId:doc.id,expectedRevision:current.revision,apply:true});await new Promise(r=>setTimeout(r,50));const concurrent=await call('update_object',{documentId:doc.id,objectId:icon,patch:{name:'Concurrent user edit'}});await assert.rejects(pending,/Revision conflict/);assert.equal((await call('get_document',{documentId:doc.id})).result.nodes[icon].name,'Concurrent user edit');
 const composed=await call('compose_figure',{title:'Disposable — AI composer NIH pathway',plan:{version:1,title:'Mitochondrial schematic',panels:[{id:'panel',title:'SCIENTIFIC SCHEMATIC'}],entities:[{id:'mito',panelId:'panel',label:'Mitochondrion',iconId:assetId},{id:'protein',panelId:'panel',label:'Protein complex',iconId:'protein'}],relationships:[{from:'mito',to:'protein',label:'Illustrative association'}],labels:[{panelId:'panel',text:'Illustrative layout; no mechanism inferred.'}]},maxIterations:2});png(composed.content,'composed.png');assert.notEqual(composed.result.document.id,doc.id);assert.ok(composed.result.document.nodes.mito);assert.ok(composed.result.document.nodes.protein);
 const svg=(await call('export_svg',{documentId:composed.result.document.id})).result.svg;assert.ok(svg.includes('<path'));assert.ok(!svg.includes('<image'));writeFileSync(join(report,'composed.svg'),svg);
 // Real browser decodes PNG and shows the corrected document; PNG is not blank.
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});const page=await browser.newPage({viewport:{width:1600,height:1000}});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(id=>localStorage.setItem('helix-document',id),composed.result.document.id);await page.goto(base);await page.getByTestId('artboard').waitFor();await page.locator('[data-svg-element-key]').first().waitFor();
 const pixels=await page.evaluate(async(data:string)=>{const img=new Image();img.src='data:image/png;base64,'+data;await img.decode();const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;const ctx=canvas.getContext('2d')!;ctx.drawImage(img,0,0);const bytes=ctx.getImageData(0,0,img.width,img.height).data;let nonwhite=0;for(let i=0;i<bytes.length;i+=4)if(bytes[i]<240||bytes[i+1]<240||bytes[i+2]<240)nonwhite++;return nonwhite;},(composed.content.find(c=>c.type==='image') as any).data);assert.ok(pixels>1000);
 await page.screenshot({path:join(report,'browser.png')});assert.deepEqual(errors,[]);assert.equal(createHash('sha256').update(original.get(assetId).svg).digest('hex'),sourceHash);
 writeFileSync(join(report,'results.json'),JSON.stringify({at:new Date().toISOString(),dataDirectory:dir,documentId:doc.id,composedDocumentId:composed.result.document.id,toolCount:33,passed:['native MCP PNG image content','PNG cache and PNG decode','revision-accurate readonly renders','measured glyph overflow and bounds','inspection-only default','apply requires revision','bounded automated corrections','text and vector content preserved','undo and redo','reload persistence','stale revision rejection','concurrent UI/MCP edit rejection','new-document plan composer','vector SVG export','browser display','original NIH asset intact'],failed:[],passes:fixed.result.passes,finalAnalysis:fixed.result.analysis,renderedNonwhitePixels:pixels,browserErrors:errors},null,2));console.log('Figure feedback: 16 checks passed, 0 failed; 33 tools, actual PNG image blocks, browser and concurrent-edit protection.');
}finally{await browser?.close();await client.close();service.kill('SIGTERM');original.close();}
