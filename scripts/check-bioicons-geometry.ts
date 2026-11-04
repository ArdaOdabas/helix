import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {DOMParser} from '@xmldom/xmldom';
import {Catalog} from '../src/assets/catalog.ts';
const geometryTags=new Set(['g','path','rect','circle','ellipse','line','polyline','polygon','use']);
const geometryAttrs=['d','transform','x','y','x1','x2','y1','y2','cx','cy','r','rx','ry','width','height','points'];
function geometry(svg:string){
    const root=new DOMParser().parseFromString(svg,'image/svg+xml').documentElement!;
    const result:unknown[]=[];
    function visit(el:any){if(el.localName==='metadata')return;
        if(el.namespaceURI==='http://www.w3.org/2000/svg' && geometryTags.has(el.localName))result.push([el.localName,...geometryAttrs.map(a=>el.getAttribute(a))]);
        for(const child of Array.from(el.childNodes) as any[])if(child.nodeType===1)visit(child);
    }
    visit(root);return result;
}
const catalog=new Catalog('data');
try{
    const rows=catalog.db.prepare("SELECT sourceFile,assetId FROM import_sources WHERE sourceFile LIKE ?").all(join(catalog.directory,'bioicons-source')+'/%') as {sourceFile:string;assetId:string}[];
    let checked=0;
    for(const row of rows){assert.deepEqual(geometry(catalog.get(row.assetId).svg),geometry(readFileSync(row.sourceFile,'utf8')),row.sourceFile);checked++;}
    const output=new DOMParser().parseFromString(readFileSync('reports/bioicons/verification.svg','utf8'),'image/svg+xml');
    const report=JSON.parse(readFileSync('reports/bioicons/mcp-verification.json','utf8'));
    for(const item of report.cases){const svg=Array.from(output.getElementsByTagName('g')).find(g=>g.getAttribute('data-object-id')===item.instanceId)!.getElementsByTagName('svg')[0];assert.ok(svg);assert.deepEqual(geometry(svg.toString()),geometry(catalog.get(item.assetId).svg));}
    const result={sourceFilesChecked:checked,importedGeometryPreserved:checked,exportedInstancesChecked:report.cases.length,exportedGeometryPreserved:report.cases.length,failures:0};
    writeFileSync('reports/bioicons/geometry-verification.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{catalog.close();}
