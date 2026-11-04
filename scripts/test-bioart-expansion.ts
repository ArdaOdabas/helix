// Authentic downloaded SVGs, isolated temporary catalog/documents. Never edits user figures.
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {DOMParser} from '@xmldom/xmldom';
import {Client} from '@modelcontextprotocol/client';
import {InMemoryTransport} from '@modelcontextprotocol/server';
import {Catalog} from '../src/assets/catalog.ts';
import {Store} from '../src/server/store.ts';
import {executeTool} from '../src/server/tools.ts';
import {createMcpServer} from '../src/mcp/server.ts';
import {importBioartLocal} from '../src/assets/bioart-local.ts';
const data=resolve('data'),downloadRoot=join(data,'bioart-downloads');
const manifest=JSON.parse(readFileSync(join(downloadRoot,'bioart-downloads.json'),'utf8'));
const db=new DatabaseSync(join(data,'catalog.sqlite'),{readOnly:true});
const records:any[]=[];
for(const license of ['Public Domain','CC BY 4.0']){const r=manifest.assets.find((a:any)=>a.license===license && db.prepare('SELECT 1 FROM import_sources WHERE sourceFile=? AND sourceHash=?').get(join(data,'bioart-source',a.filename),a.sha256));assert.ok(r,'Missing authentic imported sample for '+license);records.push(r);}
db.close();
const root=mkdtempSync(join(tmpdir(),'helix-authentic-bioart-')),catalog=new Catalog(root),store=new Store(root);
const imported=await importBioartLocal(downloadRoot,catalog,{version:1,assets:records});assert.equal(imported.import.imported,records.length);assert.equal(imported.rejected.length,0);
const server=createMcpServer((name,args)=>executeTool(name,args,store,catalog)),client=new Client({name:'authentic-bioart-isolated-test',version:'1'}),[ct,st]=InMemoryTransport.createLinkedPair();
const call=async(name:string,args:Record<string,unknown>)=>{const r=await client.callTool({name,arguments:args});assert.ok(!r.isError,JSON.stringify(r));return JSON.parse((r.content as any)[0].text);};
const parse=(svg:string)=>new DOMParser().parseFromString(svg,'image/svg+xml');
const hash=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
function geometry(el:any):any[]{const result:any[]=[];function visit(e:any){if(['g','path','rect','circle','ellipse','polygon','polyline','line','text','use'].includes(e.localName))result.push([e.localName,...['d','transform','x','y','cx','cy','rx','ry','r','points','x1','x2','y1','y2'].map(a=>e.getAttribute(a))]);for(const c of Array.from(e.childNodes) as any[])if(c.nodeType===1)visit(c);}visit(el);return result;}
function element(root:any,key:string){let e=root;for(const index of key.split('/'))e=Array.from(e.childNodes).filter((c:any)=>c.nodeType===1)[Number(index)];return e;}
const cases:any[]=[];
try{
 await server.connect(st);await client.connect(ct);
 for(const record of records){
  const icon=catalog.search(record.title,100,0,undefined,undefined,'NIH BioArt Source').items.find(i=>i.sourceUrl===record.sourceUrl);assert.ok(icon);
  const rawPath=join(downloadRoot,record.filename),originalHash=hash(rawPath),svg=catalog.get(icon.id).svg;
  const official=catalog.details(icon.id) as any;assert.equal(official.license,record.license);assert.equal(official.sourceUrl,record.sourceUrl);assert.equal(official.author,record.creator);
  let doc=await call('create_document',{title:'Isolated authentic NIH regression: '+record.title});doc=await call('add_icon',{documentId:doc.id,expectedRevision:doc.revision,iconId:icon.id});const objectId=doc.roots[0],documentId=doc.id;
  const before=await call('list_icon_elements',{documentId,objectId,limit:1000});const targets=before.items.filter((e:any)=>e.tag!=='g'&&e.fill!=='none').slice(0,2);assert.equal(targets.length,2);
  const changes=targets.map((e:any,i:number)=>({elementKey:e.key,fill:i?'#E89B43':'#4389C7',stroke:i?'#123456':'#654321'}));
  const oldRevision=doc.revision;doc=await call('update_icon_elements',{documentId,objectId,expectedRevision:doc.revision,changes});assert.equal(doc.revision,oldRevision+1);
  assert.deepEqual(new Store(root).read(documentId).document,doc);
  const after=await call('list_icon_elements',{documentId,objectId,limit:1000});for(const e of before.items)if(!targets.some((t:any)=>t.key===e.key))assert.deepEqual(after.items.find((a:any)=>a.key===e.key),e);
  const output=await call('export_svg',{documentId}),xml=parse(output.svg);const group=Array.from(xml.getElementsByTagName('g')).find(e=>e.getAttribute('data-object-id')===objectId)!;const inner=group.getElementsByTagName('svg')[0];assert.ok(inner);assert.deepEqual(geometry(inner),geometry(parse(svg).documentElement));
  for(const change of changes){assert.equal(element(inner,change.elementKey).getAttribute('fill'),change.fill);assert.equal(element(inner,change.elementKey).getAttribute('stroke'),change.stroke);}
  doc=await call('undo',{documentId,expectedRevision:doc.revision});assert.deepEqual((await call('list_icon_elements',{documentId,objectId,limit:1000})).items,before.items);
  doc=await call('redo',{documentId,expectedRevision:doc.revision});assert.deepEqual((await call('list_icon_elements',{documentId,objectId,limit:1000})).items,after.items);
  assert.equal(hash(rawPath),originalHash);assert.equal(catalog.get(icon.id).svg,svg);
  cases.push({title:record.title,sourceUrl:record.sourceUrl,license:record.license,editableElements:before.total,atomicEdit:true,independentFillAndStroke:true,persistence:true,geometryPreserved:true,export:true,unrelatedElementsUnchanged:true,undoRedo:true,sourceUnchanged:true});
 }
 const repeat=await importBioartLocal(downloadRoot,catalog,{version:1,assets:records});assert.equal(repeat.import.skipped,records.length);assert.equal(repeat.import.imported,0);
 writeFileSync('reports/bioart-expansion/authentic-tests.json',JSON.stringify({temporaryDataDirectory:root,passed:cases.length,failed:0,incrementalImport:true,cases},null,2)+'\n');
 console.log(JSON.stringify({authenticCasesPassed:cases.length,failed:0,temporaryDataDirectory:root,cases}));
}finally{await client.close();await server.close();catalog.close();}
