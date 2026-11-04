// Actual configured stdio MCP -> running HTTP service. Mutates only a newly created disposable document.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';
import {DOMParser} from '@xmldom/xmldom';
import {chromium} from 'playwright-core';
const cfg=JSON.parse(readFileSync('/Users/ardaodabas/Library/Application Support/Claude/claude_desktop_config.json','utf8')).mcpServers.scientific_figure_editor;
const client=new Client({name:'helix-configured-mcp-real-assets',version:'1'});
const transport=new StdioClientTransport({command:cfg.command,args:cfg.args,env:{...process.env,...cfg.env} as Record<string,string>});
let disposableId:string|undefined;
const readOnly=new Set(['list_documents','get_document','search_icons','get_asset','list_icon_elements','export_svg']);
const call=async(name:string,args:any={})=>{if(!readOnly.has(name)&&name!=='create_document')assert.equal(args.documentId,disposableId,'Refuse any existing document mutation');const r=await client.callTool({name,arguments:args});assert.ok(!r.isError,JSON.stringify({name,r}));return JSON.parse((r.content as any)[0].text);};
const hash=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
const parser=new DOMParser();
function geometry(svg:string){const values:any[]=[];const root=parser.parseFromString(svg,'image/svg+xml').documentElement;function walk(e:any){if(e.localName==='metadata')return;if(['g','path','circle','ellipse','rect','polygon','polyline','line'].includes(e.localName))values.push([e.localName,...['d','transform','x','y','cx','cy','r','rx','ry','points','x1','x2','y1','y2'].map(a=>e.getAttribute(a))]);for(const c of Array.from(e.childNodes) as any[])if(c.nodeType===1)walk(c);}walk(root);return values;}
function at(root:any,key:string){for(const index of key.split('/'))root=Array.from(root.childNodes).filter((c:any)=>c.nodeType===1)[Number(index)];return root;}
const db=new DatabaseSync('data/catalog.sqlite',{readOnly:true});
const find=(url:string)=>db.prepare("SELECT a.id FROM assets a JOIN asset_details d ON d.assetId=a.id WHERE a.provider='NIH BioArt Source' AND json_extract(d.metadata,'$.sourceUrl')=? LIMIT 1").get(url) as {id:string};
const chosen=[{id:'asset-45371acc4fa9453c1c6058a71b50850d24002ae35480c43a211ffb832f73322f',role:'Mitochondrial outer and folded inner membrane outlines',sourceUrl:'https://bioart.niaid.nih.gov/bioart/352'}, {id:'asset-c57d0bdb1dda767089f0f21daf556309d575239ebf992366b0b0a0035fbaf4b4',role:'Two independent nucleus vector regions',sourceUrl:'https://bioart.niaid.nih.gov/bioart/72'}];for(const r of chosen)assert.ok(db.prepare("SELECT 1 FROM assets a JOIN asset_details d ON d.assetId=a.id WHERE a.id=? AND a.provider='NIH BioArt Source' AND json_extract(d.metadata,'$.sourceUrl')=?").get(r.id,r.sourceUrl));db.close();
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 await client.connect(transport);const tools=await client.listTools();for(const name of ['list_icon_elements','update_icon_element','update_icon_elements'])assert.ok(tools.tools.some(t=>t.name===name));writeFileSync('reports/library-expansion/mcp-tools.json',JSON.stringify(tools,null,2));
 const reportFile='reports/library-expansion/mcp-real-assets.json';let doc:any;
 if(existsSync(reportFile)){const previous=JSON.parse(readFileSync(reportFile,'utf8')),baseline=JSON.parse(readFileSync('reports/library-expansion/baseline.json','utf8'));assert.ok(!Object.hasOwn(baseline.files,'data/documents/'+previous.documentId+'.json'));const candidate=await call('get_document',{documentId:previous.documentId});if(candidate.revision===previous.revision&&candidate.title==='Disposable — real NIH BioArt MCP sub-element verification'&&candidate.roots.length===2){doc=candidate;disposableId=doc.id;doc=await call('apply_operations',{documentId:doc.id,expectedRevision:doc.revision,operations:doc.roots.map((id:string)=>({type:'update',id,patch:{elementStyles:{}}}))});}}
 if(!doc){doc=await call('create_document',{title:'Disposable — real NIH BioArt MCP sub-element verification',width:1100,height:650});disposableId=doc.id;}
 const page=await browser.newPage({viewport:{width:1700,height:1100}});page.setDefaultTimeout(15000);const pageErrors:string[]=[];page.on('pageerror',e=>pageErrors.push(e.message));
 await page.addInitScript(id=>localStorage.setItem('helix-document',id),doc.id);await page.goto('http://127.0.0.1:5173');await page.getByTestId('artboard').waitFor();
 const cases:any[]=[];
 for(const [i,r]of chosen.entries()){
  const assetPath='data/assets/'+r.id.slice(6)+'.svg',beforeHash=hash(assetPath),original=readFileSync(assetPath,'utf8');
  let objectId=doc.roots.find((id:string)=>doc.nodes[id].iconId===r.id);if(!objectId){doc=await call('add_icon',{documentId:doc.id,expectedRevision:doc.revision,iconId:r.id,x:i?570:40,y:100,width:440,height:440});objectId=doc.roots.at(-1);}
  let list=await call('list_icon_elements',{documentId:doc.id,objectId,limit:1000});const all=[...list.items];while(list.nextOffset!==null){list=await call('list_icon_elements',{documentId:doc.id,objectId,limit:1000,offset:list.nextOffset});all.push(...list.items);}
  // The source's final root-level 2 path is the visible outer outline and 1/3 is the cristae/inner
  // membrane outline, visually checked against the original official drawing.
  const targets=i===0?[all.find(e=>e.key==='2'),all.find(e=>e.key==='1/3')]:all.filter(e=>e.tag!=='g'&&e.fill&&e.fill!=='none').slice(0,2);assert.equal(targets.length,2);assert.ok(targets.every(Boolean));
  const changes=targets.map((e,index)=>({elementId:e.elementId,patch:{fill:index?'#E89B43':'#4389C7'}}));const rev=doc.revision;
  doc=await call('update_icon_elements',{documentId:doc.id,objectId,expectedRevision:doc.revision,changes});assert.equal(doc.revision,rev+1);
  const after=await call('list_icon_elements',{documentId:doc.id,objectId,limit:1000});for(const old of all.slice(0,1000))if(!targets.some(t=>t.key===old.key))assert.deepEqual(after.items.find((e:any)=>e.key===old.key),old);
  const waitColors=()=>page.waitForFunction(({id,targets})=>targets.every((t:any)=>document.querySelector(`[data-object-id="${id}"] [data-svg-element-key="${t.key}"]`)?.getAttribute('fill')===t.color),{id:objectId,targets:targets.map((t,j)=>({key:t.key,color:j?'#E89B43':'#4389C7'}))});
  await waitColors();doc=await call('undo',{documentId:doc.id,expectedRevision:doc.revision});assert.deepEqual((await call('list_icon_elements',{documentId:doc.id,objectId,limit:1000})).items,all.slice(0,1000));doc=await call('redo',{documentId:doc.id,expectedRevision:doc.revision});await waitColors();
  doc=await call('update_icon_element',{documentId:doc.id,objectId,elementId:targets[0].elementId,patch:{fill:'#4389C7',strokeWidth:2,opacity:.85},expectedRevision:doc.revision});
  const numeric=await call('list_icon_elements',{documentId:doc.id,objectId,limit:1000});assert.equal(numeric.items.find((e:any)=>e.elementId===targets[0].elementId).strokeWidth,'2');
  doc=await call('update_icon_element',{documentId:doc.id,objectId,elementId:targets[0].elementId,patch:{strokeWidth:null,opacity:null},expectedRevision:doc.revision});
  assert.deepEqual((await call('get_document',{documentId:doc.id})),doc);await page.reload();await waitColors();
  const exported=await call('export_svg',{documentId:doc.id});const xml=parser.parseFromString(exported.svg,'image/svg+xml');const group=Array.from(xml.getElementsByTagName('g')).find(e=>e.getAttribute('data-object-id')===objectId)!;const svg=group.getElementsByTagName('svg')[0];assert.deepEqual(geometry(svg.toString()),geometry(original));for(const [j,t]of targets.entries())assert.equal(at(svg,t.key).getAttribute('fill'),j?'#E89B43':'#4389C7');assert.equal(hash(assetPath),beforeHash);
  const pixels=await page.evaluate(async ({xml,id})=>{const parsed=new window.DOMParser().parseFromString(xml,'image/svg+xml'),inner=parsed.querySelector('[data-object-id="'+id+'"] svg')!;inner.setAttribute('width','500');inner.setAttribute('height','500');const blob=new Blob([new XMLSerializer().serializeToString(inner)],{type:'image/svg+xml'}),url=URL.createObjectURL(blob);try{const img=new Image();img.src=url;await img.decode();const canvas=document.createElement('canvas');canvas.width=500;canvas.height=500;const ctx=canvas.getContext('2d')!;ctx.drawImage(img,0,0);const data=ctx.getImageData(0,0,500,500).data;let blue=0,orange=0;for(let n=0;n<data.length;n+=4){if(data[n]===67&&data[n+1]===137&&data[n+2]===199&&data[n+3]>0)blue++;if(data[n]===232&&data[n+1]===155&&data[n+2]===67&&data[n+3]>0)orange++;}return {blue,orange};}finally{URL.revokeObjectURL(url);}},{xml:exported.svg,id:objectId});assert.ok(pixels.blue>20&&pixels.orange>20,JSON.stringify(pixels));
  cases.push({assetId:r.id,sourceUrl:r.sourceUrl,role:r.role,objectId,targets:targets.map((t,j)=>({elementId:t.elementId,key:t.key,fill:j?'#E89B43':'#4389C7'})),renderedPixels:pixels,undoRedo:true,persistenceReload:true,liveBrowser:true,unrelatedElementsUnchanged:true,geometryPreserved:true,originalAssetUnchanged:true});
 }
 await page.getByRole('button',{name:'Fit',exact:true}).click();await page.locator('svg.canvas').screenshot({path:'reports/library-expansion/mcp-real-assets.png'});const final=await call('export_svg',{documentId:doc.id});writeFileSync('reports/library-expansion/mcp-real-assets.svg',final.svg);assert.deepEqual(pageErrors,[]);
 const result={actualMcpTransport:'Configured Claude Desktop stdio command -> running Helix HTTP service',toolsDiscovered:tools.tools.length,documentId:doc.id,revision:doc.revision,cases,pageErrors};writeFileSync('reports/library-expansion/mcp-real-assets.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();await client.close();}
