import {describe,it} from 'vitest';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Client} from '@modelcontextprotocol/client';
import {InMemoryTransport} from '@modelcontextprotocol/server';
import {Catalog} from '../src/assets/catalog.ts';
import {Store} from '../src/server/store.ts';
import {executeTool} from '../src/server/tools.ts';
import {createMcpServer} from '../src/mcp/server.ts';
import {sanitizeSvg} from '../src/assets/sanitize.ts';
import {extractBioartSvgMetadata,extractBioartEntryText,buildBioartManifest} from '../src/assets/bioart.ts';
import {importBioartLocal} from '../src/assets/bioart-local.ts';
import {BioartHttpError,withBioartRetry,bioartRetryDelay} from '../src/assets/bioart-retry.ts';
const raw='<s:svg xmlns:s="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><metadata><title>Immune cell</title><description>Original description</description><license>Public Domain</license><creator>Original Creator</creator></metadata><s:defs><s:style>.a {fill:#abc;stroke:#123;} .b {fill:#def;}</s:style></s:defs><s:g id="membrane" transform="translate(2 3)"><s:path id="outer" class="a" d="M0 0L20 20"/><s:path id="inner" class="b" d="M1 1L10 10"/></s:g><s:circle id="granule" cx="20" cy="20" r="2" fill="#fff"/></s:svg>';
const record={filename:'one.svg',sourceUrl:'https://bioart.niaid.nih.gov/bioart/173',title:'Immune cell',description:'Original description',creator:'Original Creator',license:'Public Domain',licenseReference:'https://bioart.niaid.nih.gov/bioart/173',categories:['Cells and Organelles'],subcategories:['Immune Cells'],keywords:['immune','cell']};
function fixture(){const root=mkdtempSync(join(tmpdir(),'helix-bioart-')),input=join(root,'input');mkdirSync(input);writeFileSync(join(input,'one.svg'),raw);return{root,input,c:new Catalog(join(root,'data'))};}
describe('NIH BioArt local integration',()=>{
 it('extracts embedded official metadata without executing code or inventing a license',()=>{assert.deepEqual(extractBioartSvgMetadata(raw),{title:'Immune cell',description:'Original description',license:'Public Domain',creator:'Original Creator'});assert.throws(()=>extractBioartSvgMetadata('<!DOCTYPE svg>'+raw));assert.throws(()=>buildBioartManifest({version:1,assets:[{...record,license:''}]}));});
 it('preserves visible official categories, keywords and attribution in local manifests',()=>{
  const data=extractBioartEntryText('BIOART-000173\nImmune cell\nSubmission Date: 10/7/2024\nLicensing: Public Domain\nDescription\nOriginal description\nRepresentation\nCite This Entry\nOriginal citation\nKEYWORDS\nimmune, cell\nCOLLECTION\nNIAID Visual & Medical Arts\nCREATOR\nOriginal Creator\nCREDIT\nCourtesy of NIAID\nCATEGORY\nCells and Organelles\nCELLS AND ORGANELLES\nCells, Immune Cells\nWebsite Policies & Notices');
  assert.equal(data.title,'Immune cell');assert.deepEqual(data.subcategories,['Cells','Immune Cells']);assert.equal(data.description,'Original description');assert.equal(data.license,'Public Domain');assert.equal(data.citation,'Original citation');
  const m=buildBioartManifest({version:1,assets:[record]});assert.equal(m.assets['one.svg'].provider,'NIH BioArt Source');assert.equal(m.assets['one.svg'].license,'Public Domain');assert.deepEqual(m.assets['one.svg'].officialCategories,record.categories);
 });
 it('normalizes prefixed SVG and simple CSS while retaining paths, IDs, transforms and inline precedence',()=>{
  const cleaned=sanitizeSvg(raw.replace('class="a"','class="a" fill="#000" style="fill:#fed"'));
  assert.ok(cleaned.svg.startsWith('<svg '));assert.ok(cleaned.svg.includes('fill="#fed"'));assert.ok(cleaned.svg.includes('id="outer"'));assert.ok(cleaned.svg.includes('d="M0 0L20 20"'));assert.ok(cleaned.svg.includes('translate(2 3)'));assert.ok(!cleaned.svg.includes('<metadata'));assert.ok(!cleaned.svg.includes('<style'));
 });
 it('preserves supported blend styling and rejects unsupported CSS, filters and external references',()=>{
  const source=raw.replace('fill:#abc;stroke:#123;','fill:#abc;stroke:#123;mix-blend-mode:multiply;isolation:isolate;');const clean=sanitizeSvg(source);assert.ok(clean.svg.includes('mix-blend-mode:multiply'));assert.ok(clean.svg.includes('isolation:isolate'));
  for(const altered of [raw.replace('.a {','.a path {'),raw.replace('fill:#abc','fill:url(https://evil.invalid/a)'),raw.replace('<s:g','<s:image href="file:///tmp/x"/><s:g')])assert.throws(()=>sanitizeSvg(altered));
  // An !important declaration is applied with the marker removed, not refused.
  assert.ok(sanitizeSvg(raw.replace('fill:#abc','fill:#abc!important')).svg.includes('#abc'));
  // A filter declaration is dropped rather than rejected, and takes its dangling reference with it.
  const filtered=sanitizeSvg(raw.replace('fill:#abc','filter:url(#bad)')).svg;
  assert.ok(!filtered.includes('filter')&&!filtered.includes('#bad'));
 });
 it('imports official metadata, deduplicates, skips unchanged files and preserves original assets',async()=>{
  const{input,c}=fixture();try{const m={version:1,assets:[record]};const first=await importBioartLocal(input,c,m);assert.equal(first.import.imported,1);const item=c.search('immune',30,0,undefined,undefined,'NIH BioArt Source').items[0];assert.ok(item);const before=c.get(item.id).svg;const details=c.details(item.id) as any;assert.equal(details.author,'Original Creator');assert.equal(details.license,'Public Domain');assert.deepEqual(details.tags,['immune','cell']);assert.equal(details.sourceUrl,record.sourceUrl);assert.ok(details.importedAt);
   assert.equal((await importBioartLocal(input,c,m)).import.skipped,1);assert.equal(c.get(item.id).svg,before);
   writeFileSync(join(input,'two.svg'),raw);const duplicate=await importBioartLocal(input,c,{version:1,assets:[record,{...record,filename:'two.svg'}]});assert.equal(duplicate.import.skipped,2);assert.equal(c.provenance(item.id).length,2);
  }finally{c.close();}
 });
 it('resumes imports after interruption without adding the completed asset twice',async()=>{
  const{input,c}=fixture();try{writeFileSync(join(input,'two.svg'),raw.replace('M0 0L20 20','M0 0L25 25'));const m={version:1,assets:[record,{...record,filename:'two.svg',title:'Second cell'}]};let progress=0;
   const interrupted=await importBioartLocal(input,c,m,()=>{if(++progress===1)throw new Error('Simulated interruption');});assert.equal(interrupted.import.imported,1);assert.ok(interrupted.import.failed>0);
   const resumed=await importBioartLocal(input,c,m);assert.equal(resumed.import.imported,1);assert.equal(resumed.import.skipped,1);assert.equal(resumed.import.failed,0);assert.equal(c.search('',100,0,undefined,undefined,'NIH BioArt Source').items.length,2);
  }finally{c.close();}
 });
 it('rejects changed checksums, conflicting licenses and unsupported geometry without flattening',async()=>{
  const{input,c}=fixture();try{let r=await importBioartLocal(input,c,{version:1,assets:[{...record,sha256:'a'.repeat(64)}]});assert.equal(r.rejected.length,1);r=await importBioartLocal(input,c,{version:1,assets:[{...record,license:'CC-BY-4.0'}]});assert.equal(r.rejected.length,1);assert.equal(c.count(),6);
  }finally{c.close();}
 });
 it('filters providers with bounded pages and retains aliases when geometry is shared across providers',async()=>{
  const{input,c}=fixture();try{await importBioartLocal(input,c,{version:1,assets:[record]});const icon=c.search('immune',30,0,undefined,undefined,'NIH BioArt Source').items[0];
   const svg=c.get(icon.id).svg;c.add(svg,{name:'Bioicons Alias',category:'Alias category',tags:['aliasword'],description:'Other source',viewBox:'0 0 40 40',provider:'Bioicons',license:'CC-BY-3.0',sourceFile:'alias.svg',sourceHash:'alias'});
   assert.equal(c.search('aliasword',30,0,'Alias category',undefined,'Bioicons').items[0].provider,'Bioicons');assert.equal(c.search('immune',30,0,'Cells and Organelles',undefined,'NIH BioArt Source').items[0].provider,'NIH BioArt Source');assert.equal(c.search('',30,0,undefined,undefined,'missing-provider').items.length,0);
   assert.equal(c.providers().find(p=>p.provider==='NIH BioArt Source')?.count,1);assert.ok(c.categories('Bioicons').some(c=>c.category==='Alias category'));assert.equal(c.search('',1,0,undefined,undefined,'NIH BioArt Source').nextOffset,null);
  }finally{c.close();}
 });
 it('filters every official category/subcategory without losing the original labels',async()=>{
  const{input,c}=fixture();try{const m={version:1,assets:[{...record,categories:['Cells and Organelles','Immunology'],subcategories:['Cells','Immune Cells']}]};await importBioartLocal(input,c,m);
   assert.equal(c.search('immune',30,0,'Immunology','Immune Cells','NIH BioArt Source').items.length,1);
   assert.ok(c.categories('NIH BioArt Source').find(category=>category.category==='Immunology')?.subcategories.includes('Immune Cells'));
   assert.equal(c.search('immune',30,0,undefined,undefined,'').items.length,1);
  }finally{c.close();}
 });
 it('retains supported local gradients while resolving class paint and still rejects unresolved references',()=>{
  const gradient=raw.replace('<s:style>','<s:linearGradient id="gradient"><s:stop offset="0" stop-color="#fff"/></s:linearGradient><s:style>').replace('fill:#abc','fill:url(#gradient)');
  assert.ok(sanitizeSvg(gradient).svg.includes('fill="url(#gradient)"'));assert.throws(()=>sanitizeSvg(gradient.replace('url(#gradient)','url(#missing)')));
 });
 it('retries transient official responses with exponential backoff and Retry-After, but stops on access denial',async()=>{
  let attempt=0;const delays:number[]=[];assert.equal(await withBioartRetry(async()=>{if(++attempt<3)throw new BioartHttpError(503);return 'done';},async ms=>{delays.push(ms);}), 'done');assert.deepEqual(delays,[1000,2000]);
  attempt=0;await assert.rejects(withBioartRetry(async()=>{attempt++;throw new BioartHttpError(403);},async()=>{}));assert.equal(attempt,1);
  const after:number[]=[];attempt=0;await withBioartRetry(async()=>{if(++attempt===1)throw new BioartHttpError(429,3500);return true;},async ms=>{after.push(ms);});assert.deepEqual(after,[3500]);assert.equal(bioartRetryDelay('3'),3000);
 });
});
describe('MCP SVG ID and atomic editing regression',()=>{
 it('discovers friendly tools, updates two IDs in one revision, persists, exports, undoes/redoes, and rejects batches atomically',async()=>{
  const{root,input,c}=fixture();await importBioartLocal(input,c,{version:1,assets:[record]});const store=new Store(join(root,'data')),server=createMcpServer((n,a)=>executeTool(n,a,store,c)),client=new Client({name:'claude-compatible-regression',version:'1'}),[ct,st]=InMemoryTransport.createLinkedPair();
  const call=async(name:string,args:any)=>{const r=await client.callTool({name,arguments:args});assert.ok(!r.isError,JSON.stringify(r));return JSON.parse((r.content as any)[0].text);};
  try{await server.connect(st);await client.connect(ct);const tools=await client.listTools();for(const name of ['list_icon_elements','update_icon_element','update_icon_elements'])assert.ok(tools.tools.some(t=>t.name===name));
   let doc=await call('create_document',{title:'New test fixture'});const icon=c.search('immune').items[0];doc=await call('add_icon',{documentId:doc.id,iconId:icon.id});const id=doc.roots[0],before=structuredClone(doc),assetBefore=c.get(icon.id).svg;
   const list=await call('list_icon_elements',{documentId:doc.id,objectId:id,limit:2});assert.equal(list.revision,doc.revision);assert.ok(list.nextOffset);assert.equal(list.total,4);
   const ref=()=>({documentId:doc.id,objectId:id,expectedRevision:doc.revision});
   doc=await call('update_icon_elements',{...ref(),changes:[{elementId:'outer',fill:'#4389C7'},{elementId:'inner',fill:'#E89B43'}]});assert.equal(doc.revision,before.revision+1);
   assert.deepEqual(new Store(join(root,'data')).read(doc.id).document,doc);
   const exported=await call('export_svg',{documentId:doc.id});assert.ok(exported.svg.includes('fill="#4389C7"'));assert.ok(exported.svg.includes('fill="#E89B43"'));assert.ok(exported.svg.includes('fill="#fff"'));
   doc=await call('undo',{documentId:doc.id,expectedRevision:doc.revision});assert.deepEqual(doc.nodes,before.nodes);
   doc=await call('redo',{documentId:doc.id,expectedRevision:doc.revision});const saved=structuredClone(doc);
   const invalid=await client.callTool({name:'update_icon_elements',arguments:{...ref(),changes:[{elementId:'outer',fill:'#000'},{elementId:'absent',fill:'#fff'}]}});assert.equal(invalid.isError,true);assert.deepEqual(store.read(doc.id).document,saved);
   doc=await call('update_icon_element',{...ref(),change:{elementId:'granule',stroke:'#123'}});assert.equal(c.get(icon.id).svg,assetBefore);
  }finally{await client.close();await server.close();c.close();}
 });
});
