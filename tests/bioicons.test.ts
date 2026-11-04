import {describe,it} from 'vitest';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {buildBioiconsManifest,bioiconsLicenses} from '../src/assets/bioicons.ts';
import {sanitizeSvg} from '../src/assets/sanitize.ts';
import {importDirectory} from '../src/assets/importer.ts';
import {Catalog} from '../src/assets/catalog.ts';
import {Store} from '../src/server/store.ts';
import {executeTool} from '../src/server/tools.ts';
const svg='<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 20 20"><g transform="translate(1 2)"><path id="edge" d="M0 0L10 10" fill="#abc"/></g></svg>';
function repository(){const dir=mkdtempSync(join(tmpdir(),'helix-bioicons-')),root=join(dir,'static/icons');mkdirSync(root,{recursive:true});writeFileSync(join(root,'authors.json'),JSON.stringify({'A & B':'https://example.org/author'}));writeFileSync(join(root,'icons.json'),'[]');return{dir,root};}
function asset(root:string,license:string,name='sample'){const folder=join(root,license,'Cell_types','A_&_B');mkdirSync(folder,{recursive:true});writeFileSync(join(root,license,'LICENSE'),'Full license notice & copyright');writeFileSync(join(folder,name+'.svg'),svg);}
describe('Bioicons adapter and compatible SVG profile',()=>{
 it('maps seven licenses per file, preserves author and pinned attribution, and discovers icons absent from the stale index',()=>{
  const {dir,root}=repository();for(const license of Object.keys(bioiconsLicenses))asset(root,license);
  const {manifest,inventory}=buildBioiconsManifest(dir,'a'.repeat(40));assert.equal(Object.keys(manifest.assets).length,7);assert.equal(inventory.unindexed.length,7);
  for(const [path,m]of Object.entries(manifest.assets)){assert.equal(m.license,bioiconsLicenses[path.split('/')[0]].id);assert.equal(m.author,'A & B');assert.equal(m.authorReference,'https://example.org/author');assert.equal(m.category,'Cell types');assert.ok(m.attribution.includes('A & B'));assert.ok(m.sourceUrl.includes('a'.repeat(40)));assert.ok(m.licenseReference.endsWith('/LICENSE'));assert.ok(m.keywords.includes('Bioicons'));}
 });
 it('skips missing authors and unknown licenses instead of applying a blanket MIT license',()=>{
  const {dir,root}=repository();asset(root,'unknown');mkdirSync(join(root,'cc-by-4.0','Cell_types'),{recursive:true});writeFileSync(join(root,'cc-by-4.0','LICENSE'),'Notice');writeFileSync(join(root,'cc-by-4.0','Cell_types','missing-author.svg'),svg);
  const r=buildBioiconsManifest(dir,'a'.repeat(40));assert.equal(Object.keys(r.manifest.assets).length,0);assert.equal(r.inventory.skipped.length,2);
  assert.throws(()=>buildBioiconsManifest(dir,'main'));
 });
 it('accepts safe export metadata, XML whitespace and Unicode IDs while preserving geometry and local clipping',()=>{
  const source='<svg xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" version="1.1" viewBox="0 0 20 20" xml:space="preserve" inkscape:version="1"><metadata><rdf:RDF/></metadata><defs><clipPath id="裁切" clipPathUnits="userSpaceOnUse"><path d="M0 0L20 20"/></clipPath></defs><g id="图层" transform="translate(2 3)" clip-path="url(#裁切)"><path id="边缘" d="M0 0L10 10" style="fill:#abc;stroke-miterlimit:4;stroke-dasharray:2 3;paint-order:stroke fill"/></g></svg>';
  const clean=sanitizeSvg(source);assert.ok(clean.svg.includes('id="图层"'));assert.ok(clean.svg.includes('url(#裁切)'));assert.ok(clean.svg.includes('translate(2 3)'));assert.ok(clean.svg.includes('stroke-dasharray="2 3"'));assert.ok(!clean.svg.includes('<metadata'));assert.ok(!clean.svg.includes('inkscape:version'));
 });
 it('continues rejecting unsafe external references, DTDs, embedded images, unsupported CSS and filters',()=>{
  for(const s of [svg.replace('fill="#abc"','fill="url(https://evil.invalid/p)"'),'<!!!DOCTYPE svg>'+svg,'<!DOCTYPE svg>'+svg,svg.replace('<g','<image href="data:image/png;base64,AA"/><g'),svg.replace('<g','<style>.a path{fill:red}</style><g'),])assert.throws(()=>sanitizeSvg(s));
  // Filter definitions are stripped with their references instead of failing the file.
  assert.ok(!sanitizeSvg(svg.replace('<g','<filter id="f"/><g')).svg.includes('filter'));
 });
 it('deduplicates geometry while retaining all licenses/attributions, and exports license text and modifications',async()=>{
  const {dir,root}=repository();asset(root,'cc-by-3.0');asset(root,'mit');const{manifest}=buildBioiconsManifest(dir,'a'.repeat(40));const catalog=new Catalog(join(dir,'data')),store=new Store(join(dir,'data'));
  try{const report=await importDirectory(root,catalog,manifest);assert.equal(report.imported,1);assert.equal(report.skipped,1);
   const icon=catalog.search('Bioicons').items[0];const details=catalog.details(icon.id) as any;
   assert.equal(details.author,'A & B');assert.deepEqual(new Set(details.provenance.map((p:any)=>p.license)),new Set(['CC-BY-3.0','MIT']));
   mkdirSync(join(dir,'data/licenses/bioicons'),{recursive:true});for(const name of ['mit','cc-by-3.0'])writeFileSync(join(dir,'data/licenses/bioicons',name+'.txt'),'Copyright A & B. Full license notice.');
   let doc=executeTool('create_document',{title:'Temporary license fixture'},store,catalog) as any;
   doc=executeTool('add_icon',{documentId:doc.id,iconId:icon.id},store,catalog);const id=doc.roots[0];
   const elements=executeTool('list_svg_elements',{documentId:doc.id,objectId:id},store,catalog) as any;
   const key=elements.items.find((e:any)=>e.tag==='path').key;
   doc=executeTool('recolor_svg_element',{documentId:doc.id,objectId:id,elementKey:key,style:{fill:'#f00'}},store,catalog);
   const exported=executeTool('export_svg',{documentId:doc.id},store,catalog) as any;
   assert.ok(exported.svg.includes('Copyright A &amp; B. Full license notice.'));assert.ok(exported.svg.includes('CC-BY-3.0'));assert.ok(exported.svg.includes('MIT'));assert.ok(exported.svg.includes('modifications'));assert.ok(exported.svg.includes('fill="#f00"'));assert.ok(exported.svg.includes('d="M0 0L10 10"'));assert.ok(exported.svg.includes('translate(1 2)'));
  }finally{catalog.close();}
 });
 it('does not read arbitrary files through license-notice metadata',()=>{
  const {dir}=repository(),catalog=new Catalog(join(dir,'data'));try{const clean=sanitizeSvg(svg);const result=catalog.add(clean.svg,{name:'Safe',category:'Test',tags:[],description:'',viewBox:clean.viewBox,provider:'Test',license:'MIT',sourceFile:'x.svg',sourceHash:'a',licenseNotice:'../../outside-secret.txt'});assert.ok(!('licenseNoticeText' in catalog.attributions(result.id)[0]));}finally{catalog.close();}
 });
});
