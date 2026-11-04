import {describe,it} from 'vitest';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {sanitizeSvg} from '../src/assets/sanitize.ts';
import {Catalog} from '../src/assets/catalog.ts';
import {importDirectory} from '../src/assets/importer.ts';
import {editSvgElements} from '../src/core/svg-elements.ts';
const root='samples/scientific-test-collection';
const manifest=JSON.parse(readFileSync(join(root,'manifest.json'),'utf8'));
describe('original ten-illustration collection',()=>{
    for(const [filename,meta] of Object.entries(manifest.assets) as [string,any][]){
        it(`preserves editable independent vector geometry in ${meta.name}`,()=>{
            const clean=sanitizeSvg(readFileSync(join(root,'svg',filename),'utf8'));
            assert.equal(clean.title,meta.name);assert.equal(clean.viewBox,'0 0 240 180');
            assert.ok(clean.palette.length>=3);assert.ok(clean.vectorElements>=3);
            const original=editSvgElements(clean.svg);
            const paths=original.elements.filter(e=>e.tag==='path');assert.ok(paths.length>=3);
            assert.ok(original.elements.some(e=>e.tag==='g'));assert.ok(paths.every(e=>e.id && e.fill && e.stroke));
            const target=paths[0],control=paths[1];
            const edited=editSvgElements(clean.svg,{[target.key]:{fill:'#f00',stroke:'#0f0'}});
            assert.equal(edited.elements.find(e=>e.key===target.key)!.fill,'#f00');
            assert.equal(edited.elements.find(e=>e.key===target.key)!.stroke,'#0f0');
            assert.deepEqual(edited.elements.find(e=>e.key===control.key),control);
            assert.ok(!edited.svg.includes('<image'));
        });
    }
    it('imports all ten through the existing importer, searches every title and skips unchanged reimports',async()=>{
        const catalog=new Catalog(mkdtempSync(join(tmpdir(),'helix-collection-regression-')));
        try{
            assert.equal(Object.keys(manifest.assets).length,10);
            const report=await importDirectory(join(root,'svg'),catalog,manifest);
            assert.equal(report.imported,10);assert.equal(report.failed,0);
            assert.equal(catalog.search('',100,0,manifest.defaults.category).items.length,10);
            for(const meta of Object.values(manifest.assets) as any[]){
                const item=catalog.search(meta.name,100,0,manifest.defaults.category).items.find(a=>a.name===meta.name);
                assert.ok(item);assert.equal(item.provider,manifest.provider);
            }
            const repeated=await importDirectory(join(root,'svg'),catalog,manifest);
            assert.equal(repeated.skipped,10);assert.equal(repeated.failed,0);
        }finally{catalog.close();}
    });
});
