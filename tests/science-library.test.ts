import {it} from 'vitest';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Catalog} from '../src/assets/catalog.ts';
import {importDirectory} from '../src/assets/importer.ts';
import {geometryFingerprint,assessScience} from '../src/assets/science.ts';
import {sanitizeSvg} from '../src/assets/sanitize.ts';
import {renderNode} from '../src/core/render.ts';
import {nodeSchema} from '../src/core/model.ts';
import {sciDrawAuthors} from '../src/assets/scidraw-metadata.ts';
import {embeddedAttribution,licenseIdentity} from '../src/assets/svg-attribution.ts';
const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><g id="outer"><path id="p" d="M0 0L20 20" fill="#123456"/><circle cx="5" cy="5" r="2" fill="#abc"/></g></svg>';
it('retains observed embedded creator/rights/license metadata without treating software credits as artwork authors',()=>{
 const source=svg.replace('<g id=', '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:cc="http://creativecommons.org/ns#" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><dc:creator>Original illustrator</dc:creator><dc:rights>Original credit</dc:rights><cc:license rdf:resource="https://creativecommons.org/licenses/by/4.0/"/></metadata><g id=');assert.deepEqual(embeddedAttribution(source),{creators:['Original illustrator'],rights:['Original credit'],licenses:['https://creativecommons.org/licenses/by/4.0/']});assert.equal(licenseIdentity('CC-BY-4.0'),licenseIdentity('https://creativecommons.org/licenses/by/4.0/'));assert.equal(embeddedAttribution(svg.replace('<g id=','<metadata>Created by potrace software</metadata><g id=')),undefined);assert.throws(()=>embeddedAttribution('<!DOCTYPE svg [<!ENTITY bad SYSTEM "file:///etc/passwd">]>'+source));
});
it('preserves all observed creators and marks gallery-only SciDraw attribution as incomplete',()=>{
 assert.deepEqual(sciDrawAuthors('Cell',['First author','Second author']).authors,['First author','Second author']);
 assert.deepEqual(sciDrawAuthors('Cell',[],'AUTHORS\nFirst author\nSecond author\nCategory:\ncell').authors,['First author','Second author']);
 const fallback=sciDrawAuthors('Cell',[],'AUTHORS\nCategory:\ncell','Download\nCite\nSVG\nCell\nOriginal contributor\n1.2K');assert.deepEqual(fallback.authors,['Original contributor']);assert.equal(fallback.fullContributorListVerified,false);assert.deepEqual(sciDrawAuthors('Cell',[]).authors,[]);
});
it('deduplicates color/author-ID variants while retaining geometry, transforms and provider licenses',async()=>{
 const root=mkdtempSync(join(tmpdir(),'helix-science-')),input=join(root,'input');mkdirSync(input);const c=new Catalog(join(root,'data'));
 try{writeFileSync(join(input,'one.svg'),svg);const one={version:1,provider:'Original source',license:'CC0',licenseReference:'source one',defaults:{name:'Original cell'}};await importDirectory(input,c,one);
 const before=c.db.prepare('SELECT * FROM assets').get(),details=c.db.prepare('SELECT * FROM asset_details').get();const id=(before as any).id,bytes=c.get(id).svg;
 const changed=svg.replaceAll('#123456','#654321').replace('id="outer"','id="other"');assert.equal(geometryFingerprint(svg),geometryFingerprint(changed));assert.notEqual(geometryFingerprint(svg),geometryFingerprint(svg.replace('L20 20','L19 20')));assert.notEqual(geometryFingerprint(svg),geometryFingerprint(svg.replace('<g id=','<g transform="translate(1 2)" id=')));
 writeFileSync(join(input,'two.svg'),changed);const two={version:1,provider:'Second source',license:'CC-BY-4.0',licenseReference:'source two',assets:{'two.svg':{name:'Embryonic stem cell',scientificCategory:'Stem cells and development',scientificName:'Scientific name',taxonomyIds:['urn:taxonomy:123'],providerMetadata:{originalCategory:'Cells',author:'A contributor'}}}};
 const result=await importDirectory(input,c,two,undefined,{includeFiles:new Set(['two.svg']),deduplicateGeometry:true,preserveCanonical:true});assert.equal(result.imported,0);assert.equal(result.skipped,1);assert.equal(result.failed,0);assert.equal(c.get(id).svg,bytes);assert.deepEqual(c.db.prepare('SELECT * FROM assets').get(),before);assert.deepEqual(c.db.prepare('SELECT * FROM asset_details').get(),details);assert.equal(c.provenance(id).length,2);assert.ok(c.search('Embryonic',30,0,undefined,undefined,'Second source').items.some(i=>i.id===id));assert.equal(c.provenance(id)[1].license,'CC-BY-4.0');assert.deepEqual(c.provenance(id)[1].providerMetadata,{originalCategory:'Cells',author:'A contributor'});
 assert.equal((await importDirectory(input,c,two,undefined,{includeFiles:new Set(['two.svg']),deduplicateGeometry:true,preserveCanonical:true})).skipped,1);
 }finally{c.close();}
});
it('uses bounded scientific/category/quality filters and context-aware scientific synonyms',()=>{
 const root=mkdtempSync(join(tmpdir(),'helix-science-search-')),c=new Catalog(root);
 try{for(const [i,name,category]of [[1,'Endoplasmic reticulum','Cell biology'],[2,'Embryonic stem cell','Stem cells and development'],[3,'Induced pluripotent stem cell','Stem cells and development']] as const){const raw=svg.replace('L20 20','L'+i+' 20');c.add(raw,{name,category,tags:[name],description:'',viewBox:'0 0 20 20',provider:'Scientific fixture',license:'CC0',sourceHash:String(i),sourceFile:String(i),scientificCategory:category});}
 assert.equal(c.search('ER',30,0,undefined,undefined,'Scientific fixture').items.length,0);assert.equal(c.search('ER',30,0,undefined,undefined,'Scientific fixture','Cell biology').items.length,1);assert.equal(c.search('ESC',30,0,undefined,undefined,'Scientific fixture','Stem cells and development').items.length,1);assert.equal(c.search('iPSC',30,0,undefined,undefined,'Scientific fixture').items.length,1);
 const first=c.search('',1,0,undefined,undefined,'Scientific fixture',undefined,'C',true);assert.equal(first.items.length,1);assert.equal(first.nextOffset,1);assert.equal(c.search('',30,0,undefined,undefined,'Scientific fixture',undefined,'A').items.length,0);assert.equal(assessScience(svg,{provider:'PhyloPic'}).quality,'C');
 // An external CLI transaction invalidates taxonomy caches through data_version.
 const old=c.providers().find(p=>p.provider==='Scientific fixture')!.count;const second=new Catalog(root);second.add(svg.replace('L20 20','L4 20'),{name:'Extra cell',category:'Cell biology',tags:[],description:'',viewBox:'0 0 20 20',provider:'Scientific fixture',license:'CC0',sourceHash:'4',sourceFile:'4'});second.close();assert.equal(c.providers().find(p=>p.provider==='Scientific fixture')!.count,old+1);
 }finally{c.close();}
});
it('removes only recognized external SVG DTD declarations without loading external content and keeps supported mask semantics',()=>{
 const legacy='<?xml version="1.0"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 20010904//EN" "http://www.w3.org/TR/2001/REC-SVG-20010904/DTD/svg10.dtd">'+svg;
 assert.ok(sanitizeSvg(legacy).svg.includes('M0 0L20 20'));for(const bad of ['<!DOCTYPE svg [<!ENTITY bad SYSTEM "file:///etc/passwd">]>','<!DOCTYPE svg SYSTEM "https://evil.invalid/test.dtd">'])assert.throws(()=>sanitizeSvg(bad+svg));
 const masked=svg.replace('<g id=', '<defs><mask id="mask" style="mask-type:alpha"><rect width="20" height="20" fill="#fff"/></mask></defs><g mask="url(#mask)" id=');const clean=sanitizeSvg(masked);assert.ok(clean.svg.includes('mask-type:alpha'));assert.ok(clean.svg.includes('mask="url(#mask)"'));assert.throws(()=>sanitizeSvg(masked.replace('mask-type:alpha','mask-type:url(https://evil.invalid)')));
});
it('preserves accessible title/description references through export ID namespacing',()=>{
 const accessible=svg.replace('<g id=', '<title id="title">Cell</title><desc id="desc">Original description</desc><g id=').replace('viewBox=', 'aria-labelledby="title desc" viewBox=');const clean=sanitizeSvg(accessible);const node=nodeSchema.parse({id:'instance',type:'icon',name:'Cell',iconId:'test'});const output=renderNode(node,()=>({id:'test',name:'Cell',category:'Cells',tags:[],svg:clean.svg,viewBox:clean.viewBox,license:'CC0',provider:'Test'}));assert.ok(output.includes('aria-labelledby="instance-title instance-desc"'));assert.ok(output.includes('id="instance-title"'));
});
it('collapses geometry within matched provider/quality results rather than hiding their matching representatives',()=>{
 const c=new Catalog(mkdtempSync(join(tmpdir(),'helix-dedup-filter-')));
 try{for(const [i,provider]of ['Provider one','Provider two'].entries())c.add(svg.replace('#123456',i?'#654321':'#123456'),{name:'Scientific cell',category:'Cells',tags:['cell'],description:'',viewBox:'0 0 20 20',provider,license:'CC0',sourceFile:provider,sourceHash:provider});
 const rows=c.db.prepare('SELECT a.id,a.provider FROM assets a ORDER BY a.id').all() as any[];const target=rows[1];c.db.prepare("UPDATE asset_science SET quality='A' WHERE assetId=?").run(target.id);
 assert.equal(c.search('cell',30,0,undefined,undefined,target.provider,undefined,'A',true).items[0].id,target.id);assert.equal(c.search('',30,0,undefined,undefined,target.provider,undefined,'A',true).items.length,1);
 }finally{c.close();}
});
