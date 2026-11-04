import {describe,it} from 'vitest';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {Catalog} from '../src/assets/catalog.ts';
import {importDirectory,parseManifest} from '../src/assets/importer.ts';
import {sanitizeSvg} from '../src/assets/sanitize.ts';
import {Store} from '../src/server/store.ts';
import {executeTool} from '../src/server/tools.ts';
import {createMcpServer} from '../src/mcp/server.ts';
import {InMemoryTransport} from '@modelcontextprotocol/server';
import {Client} from '@modelcontextprotocol/client';
const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 0 80 40"><title>Vesicle</title><defs><symbol id="part"><path id="membrane" d="M0 0L20 20" stroke="#123456"/></symbol></defs><g id="layer" transform="translate(2 3)"><use href="#part" fill="#abc"/></g></svg>';
function setup(){const root=mkdtempSync(join(tmpdir(),'helix-assets-v2-')),input=join(root,'input');mkdirSync(join(input,'Cells','Vesicles'),{recursive:true});const c=new Catalog(join(root,'data'));return {root,input,c,file:join(input,'Cells','Vesicles','vesicle.svg')};}
describe('scientific asset upgrades',()=>{
 it('recursively imports without manifest, extracts geometry, searches filters, and skips unchanged files',async()=>{
  const {input,c,file}=setup();try{writeFileSync(file,svg);let progress=0;const r=await importDirectory(input,c,undefined,()=>progress++);assert.equal(r.imported,1);assert.equal(progress,1);
  const items=c.search('Vesicle',30,0,'Cells','Vesicles').items;assert.equal(items.length,1);const d=c.details(items[0].id) as any;assert.equal(d.width,80);assert.equal(d.height,40);assert.equal(d.vectorElements,2);assert.deepEqual(d.palette,['#123456','#abc']);assert.equal(d.originalFilename,'vesicle.svg');assert.equal(d.license,'Unspecified');assert.ok(d.importedAt);assert.ok(c.categories().some(c=>c.subcategories.includes('Vesicles')));
  const again=await importDirectory(input,c);assert.equal(again.skipped,1);assert.equal(again.updated,0);assert.ok(c.history()[0].finishedAt);
  }finally{c.close();}
 });
 it('versions changed SVGs without altering existing assets and retains failures for retry',async()=>{
  const {input,c,file}=setup();try{writeFileSync(file,svg);await importDirectory(input,c);const original=c.search('Vesicle').items[0].id,before=c.get(original).svg;
  writeFileSync(file,svg.replace('L20 20','L30 30'));const r=await importDirectory(input,c);assert.equal(r.updated,1);assert.equal(r.imported,0);assert.equal(c.get(original).svg,before);
  writeFileSync(file,svg.replace('<g','<foreignObject/><g'));assert.equal((await importDirectory(input,c)).failed,1);assert.equal(c.history()[0].report.failures.length,1);
  writeFileSync(file,svg);assert.equal((await importDirectory(input,c)).updated,1);assert.equal(c.count(),8);
  }finally{c.close();}
 });
 it('reads quoted CSV metadata, updates metadata and FTS, and keeps IDs',async()=>{
  const {input,c,file}=setup();try{writeFileSync(file,svg);const csv='filename,title,category,subcategory,keywords,provider,license,licenseReference\nCells/Vesicles/vesicle.svg,"Transport, vesicle",Cell biology,Transport,traffic;cargo,Lab,CC0,Local author';
  const manifest=parseManifest(csv,'manifest.csv');await importDirectory(input,c,manifest);const a=c.search('cargo',30,0,'Cell biology','Transport').items[0];assert.ok(a);assert.equal(a.name,'Transport, vesicle');assert.equal(a.provider,'Lab');
  const changed=parseManifest(csv.replace('traffic;cargo','secretory'),'manifest.csv');assert.equal((await importDirectory(input,c,changed)).updated,1);assert.equal(c.search('secretory').items[0].id,a.id);assert.equal(c.search('cargo').items.length,0);
  assert.throws(()=>parseManifest('filename\n"oops','a.csv'));
  }finally{c.close();}
 });
 it('removes executable content and preserves groups, IDs, transforms, masks and local references',()=>{
  const clean=sanitizeSvg(svg.replace('<g id="layer"','<script>alert(1)</script><g onclick="alert(1)" id="layer"'));
  assert.ok(!clean.svg.includes('script'));assert.ok(!clean.svg.includes('onclick'));assert.ok(clean.svg.includes('id="membrane"'));assert.ok(clean.svg.includes('translate(2 3)'));assert.ok(clean.svg.includes('href="#part"'));
  assert.throws(()=>sanitizeSvg(svg.replace('href="#part"','href="file:///etc/passwd"')));
  assert.throws(()=>sanitizeSvg(svg.replace('href="#part"','href="data:image/svg+xml,bad"')));
  assert.throws(()=>sanitizeSvg('<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]>'+svg));
  assert.throws(()=>sanitizeSvg(svg.replace('<path id="membrane" d="M0 0L20 20" stroke="#123456"/>','<use href="#part"/>')));
  assert.ok(sanitizeSvg(svg.replace('<symbol id="part">','<symbol id="part"><mask id="mask"><rect width="20" height="20" fill="#fff"/></mask>')).svg.includes('<mask'));
 });
 it('migrates the original database without deleting asset metadata or IDs',()=>{
  const root=mkdtempSync(join(tmpdir(),'helix-migration-'));const db=new DatabaseSync(join(root,'catalog.sqlite'));
  db.exec('CREATE TABLE assets (id TEXT PRIMARY KEY,name TEXT NOT NULL,category TEXT NOT NULL,tags TEXT NOT NULL,description TEXT NOT NULL,viewBox TEXT NOT NULL,license TEXT NOT NULL,provider TEXT NOT NULL,createdAt TEXT NOT NULL)');db.prepare('INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?)').run('asset-'+'a'.repeat(64),'Legacy','Old','[]','','0 0 10 10','CC0','Lab','2020');db.close();
  const c=new Catalog(root);try{assert.ok(c.search('').items.some(i=>i.name==='Legacy'));assert.equal((c.db.prepare('PRAGMA user_version').get() as any).user_version,2);}finally{c.close();}
 });
 it('inserts and recolors imported vectors through the actual MCP SDK and preserves export references',async()=>{
  const {root,input,c,file}=setup();writeFileSync(file,svg);await importDirectory(input,c);const asset=c.search('Vesicle').items[0];const store=new Store(join(root,'data'));const server=createMcpServer((name,args)=>executeTool(name,args,store,c)), client=new Client({name:'asset-tests',version:'1'});const [ct,st]=InMemoryTransport.createLinkedPair();const call=async(name:string,args:any)=>{const r=await client.callTool({name,arguments:args});assert.ok(!r.isError,JSON.stringify(r));return JSON.parse((r.content as any)[0].text);};
  try{await server.connect(st);await client.connect(ct);const doc=await call('create_document',{title:'Asset test'});const inserted=await call('add_icon',{documentId:doc.id,iconId:asset.id,expectedRevision:doc.revision});const id=inserted.roots[0];const recolored=await call('recolor_asset',{documentId:doc.id,objectId:id,expectedRevision:inserted.revision,colorMap:{'#123456':'#ff0000'}});assert.equal(recolored.revision,inserted.revision+1);
  const out=await call('export_svg',{documentId:doc.id});assert.ok(out.svg.includes('stroke="#ff0000"'));assert.ok(out.svg.includes(`href="#${id}-part"`));assert.ok(out.svg.includes('viewBox="-10 0 80 40"'));assert.ok(c.get(asset.id).svg.includes('#123456'));assert.ok((await call('get_asset',{iconId:asset.id})).provenance.length);assert.ok((await call('list_categories',{})).length);
  const bad=await client.callTool({name:'recolor_asset',arguments:{documentId:doc.id,objectId:id,colorMap:{'#absent':'#fff'}}});assert.equal(bad.isError,true);
  }finally{await client.close();await server.close();c.close();}
 });
});
