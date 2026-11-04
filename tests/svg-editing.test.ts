import {describe,it} from 'vitest';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Catalog} from '../src/assets/catalog.ts';
import {importDirectory} from '../src/assets/importer.ts';
import {Store} from '../src/server/store.ts';
import {executeTool} from '../src/server/tools.ts';
import {createMcpServer} from '../src/mcp/server.ts';
import {Client} from '@modelcontextprotocol/client';
import {InMemoryTransport} from '@modelcontextprotocol/server';
import {nodeSchema,createDocument,validateDocument} from '../src/core/model.ts';
import {editSvgElements} from '../src/core/svg-elements.ts';
import {renderNode} from '../src/core/render.ts';
const vector='<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10 0 80 40"><defs><clipPath id="clip"><path d="M0 0L50 50"/></clipPath><symbol id="shared"><path d="M0 0L10 10"/></symbol></defs><g id="membrane" transform="translate(2 3)" fill="#abc" stroke="#123456"><path id="edge" transform="rotate(10)" d="M0 0L30 30" fill="none" stroke="#123456"/><g><path d="M2 2L15 15"/></g></g><use href="#shared"/></svg>';
const manifest={version:1,provider:'Local lab',license:'CC0',licenseReference:'first reference',attribution:'Original author',defaults:{category:'Cells',tags:['membrane']}};
function fixture(){const root=mkdtempSync(join(tmpdir(),'helix-sub-elements-')),input=join(root,'input');mkdirSync(input);writeFileSync(join(input,'a.svg'),vector);return {root,input,catalog:new Catalog(join(root,'data'))};}
describe('provenance regression',()=>{
 it('updates only the matching provenance metadata and preserves timestamps, IDs, source identity and other sources',async()=>{
  const {input,catalog}=fixture();try{
   writeFileSync(join(input,'copy.svg'),vector);await importDirectory(input,catalog,manifest);
   const id=catalog.search('membrane').items.find(i=>i.id.startsWith('asset-'))!.id;
   const before=catalog.provenance(id),details=catalog.details(id),row=catalog.db.prepare('SELECT * FROM assets WHERE id=?').get(id);
   const base={...manifest,assets:{'a.svg':{licenseReference:'second reference'}}};
   const report=await importDirectory(input,catalog,base);assert.equal(report.updated,1);assert.equal(report.skipped,1);
   const after=catalog.provenance(id);assert.equal(after.length,2);
   for(const old of before){const next=after.find(p=>p.sourceFile===old.sourceFile);assert.deepEqual(next,{...old,...(old.sourceFile.endsWith('/a.svg')?{licenseReference:'second reference'}:{})});}
   assert.deepEqual(catalog.details(id),{...details,licenseReference:'second reference',provenance:after});
   assert.deepEqual(catalog.db.prepare('SELECT * FROM assets WHERE id=?').get(id),row);
   assert.equal((await importDirectory(input,catalog,base)).updated,0);
  }finally{catalog.close();}
 });
 it('refreshes metadata on legacy assets that have no asset_details row',async()=>{
  const {input,catalog}=fixture();try{await importDirectory(input,catalog,manifest);const id=catalog.search('membrane').items.find(i=>i.id.startsWith('asset-'))!.id;
   catalog.db.prepare('DELETE FROM asset_details WHERE assetId=?').run(id);
   const report=await importDirectory(input,catalog,{...manifest,licenseReference:'new legacy reference'});
   assert.equal(report.failed,0);assert.equal(report.updated,1);assert.equal((catalog.details(id) as any).licenseReference,'new legacy reference');
   assert.equal(catalog.provenance(id)[0].licenseReference,'new legacy reference');assert.ok(catalog.get(id).svg.includes('M0 0L30 30'));
  }finally{catalog.close();}
 });
});
describe('SVG sub-element editing',()=>{
 it('uses stable structural keys for ID-less paths/groups and excludes definitions/use',()=>{
  const elements=editSvgElements(vector).elements;
  assert.deepEqual(elements.map(e=>[e.key,e.tag,e.id]),[['1','g','membrane'],['1/0','path','edge'],['1/1','g',null],['1/1/0','path',null]]);
  assert.equal(elements[1].parentKey,'1');assert.equal(elements[1].transform,'rotate(10)');
  const changed=editSvgElements(vector,{'1/0':{fill:'#f00'}},true,'1/0');assert.deepEqual(changed.elements.map(e=>e.key),elements.map(e=>e.key));assert.ok(changed.svg.includes('data-svg-selected="true"'));
 });
 it('applies independent fill/stroke after palette mappings without changing paths, transforms, IDs or viewBox',()=>{
  const node=nodeSchema.parse({id:'instance',type:'icon',name:'test',iconId:'test',colorMap:{'#123456':'#00ff00'},elementStyles:{'1/0':{stroke:'#ff0000'},'1/1':{fill:'#abcdef'}}});
  const asset={id:'test',name:'test',category:'',tags:[],svg:vector,viewBox:'-10 0 80 40',license:'CC0',provider:'Test'};
  const out=renderNode(node,()=>asset);assert.ok(out.includes('id="instance-edge" transform="rotate(10)" d="M0 0L30 30" fill="none" stroke="#ff0000"'));
  assert.ok(out.includes('translate(2 3)'));assert.ok(out.includes('viewBox="-10 0 80 40"'));assert.ok(out.includes('href="#instance-shared"'));assert.ok(!out.includes('data-svg-element-key'));assert.ok(out.includes('fill="#abcdef"'));
  assert.equal(vector,asset.svg);
 });
 it('round-trips legacy documents without adding override fields',()=>{
  const doc=createDocument('old','Legacy');const parsed=validateDocument(JSON.parse(JSON.stringify(doc)));assert.deepEqual(parsed,doc);
  assert.ok(!Object.hasOwn(nodeSchema.parse({id:'legacy',type:'icon',name:'old',iconId:'protein'}),'elementStyles'));
 });
 it('edits through MCP, persists and exports, supports undo/redo/reset, protects revisions and locks',async()=>{
  const {root,input,catalog}=fixture();await importDirectory(input,catalog,manifest);const store=new Store(join(root,'data'));
  const server=createMcpServer((n,a)=>executeTool(n,a,store,catalog)),client=new Client({name:'svg-edit-test',version:'1'}),[ct,st]=InMemoryTransport.createLinkedPair();
  const call=async(name:string,args:any)=>{const result=await client.callTool({name,arguments:args});assert.ok(!result.isError,JSON.stringify(result));return JSON.parse((result.content as any)[0].text);};
  try{await server.connect(st);await client.connect(ct);const iconId=catalog.search('membrane').items.find(i=>i.id.startsWith('asset-'))!.id;
   let doc=await call('create_document',{title:'Temporary editing fixture'});doc=await call('add_icon',{documentId:doc.id,iconId});const id=doc.roots[0],base=()=>({documentId:doc.id,objectId:id,expectedRevision:doc.revision});
   const originalAsset=catalog.get(iconId).svg;
   assert.equal((await call('list_svg_elements',{documentId:doc.id,objectId:id})).items.length,4);
   doc=await call('recolor_asset',{...base(),colorMap:{'#123456':'#abcdef'}});
   assert.equal((await call('list_svg_elements',{documentId:doc.id,objectId:id})).items.find((e:any)=>e.key==='1/0').stroke,'#abcdef');
   doc=await call('recolor_svg_element',{...base(),elementKey:'1/0',style:{fill:'#f00'}});
   doc=await call('recolor_svg_element',{...base(),elementKey:'1/0',style:{stroke:'#0f0'}});
   assert.deepEqual(doc.nodes[id].elementStyles['1/0'],{fill:'#f00',stroke:'#0f0'});
   doc=await call('recolor_svg_element',{...base(),elementKey:'1/1',style:{fill:'#abcdef'}});
   assert.ok((await call('export_svg',{documentId:doc.id})).svg.includes('fill="#abcdef"'));
   assert.deepEqual(new Store(join(root,'data')).read(doc.id).document,doc);
   doc=await call('undo',{documentId:doc.id,expectedRevision:doc.revision});assert.ok(!doc.nodes[id].elementStyles['1/1']);
   doc=await call('redo',{documentId:doc.id,expectedRevision:doc.revision});assert.equal(doc.nodes[id].elementStyles['1/1'].fill,'#abcdef');
   doc=await call('recolor_svg_element',{...base(),elementKey:'1/0',style:{fill:null}});assert.deepEqual(doc.nodes[id].elementStyles['1/0'],{stroke:'#0f0'});
   for(const extra of [{elementKey:'0/0/0',style:{fill:'#f00'}},{elementKey:'1/0',style:{fill:'url(https://evil.invalid)'}},{elementKey:'1/0',style:{fill:'#f00'},expectedRevision:0}]){
    const result=await client.callTool({name:'recolor_svg_element',arguments:{...base(),...extra}});assert.equal(result.isError,true);
   }
   doc=await call('update_object',{...base(),patch:{locked:true}});
   assert.equal((await client.callTool({name:'recolor_svg_element',arguments:{...base(),elementKey:'1',style:{fill:'#fff'}}})).isError,true);
   assert.equal(catalog.get(iconId).svg,originalAsset);
   doc=await call('update_object',{...base(),patch:{locked:false}});
   doc=await call('update_object',{...base(),patch:{iconId:'protein'}});assert.ok(!doc.nodes[id].elementStyles);
  }finally{await client.close();await server.close();catalog.close();}
 });
});
