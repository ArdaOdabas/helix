// Verify every currently mapped authentic download against its immutable catalog vector geometry.
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {DOMParser} from '@xmldom/xmldom';
const data=resolve('data'),manifest=JSON.parse(readFileSync(join(data,'bioart-downloads/bioart-downloads.json'),'utf8'));
const db=new DatabaseSync(join(data,'catalog.sqlite'),{readOnly:true});
const source=db.prepare('SELECT assetId,sourceHash FROM import_sources WHERE sourceFile=?');
const geometryCache=new Map<string,string>(),failures:any[]=[];
let checked=0,notImported=0;
function geometry(svg:string){const doc=new DOMParser().parseFromString(svg,'image/svg+xml'),items:any[]=[];function walk(el:any){if(el.localName==='metadata')return;if(el.namespaceURI==='http://www.w3.org/2000/svg' && ['g','path','rect','circle','ellipse','line','polyline','polygon','text','tspan','use','linearGradient','radialGradient','clipPath','mask','marker','symbol'].includes(el.localName))items.push([el.localName,...['id','d','transform','x','y','cx','cy','r','rx','ry','points','x1','x2','y1','y2','dx','dy','gradientTransform','gradientUnits','clipPathUnits','maskUnits','maskContentUnits','markerWidth','markerHeight','refX','refY','orient','markerUnits'].map(a=>el.getAttribute(a)),el.getAttributeNS('http://www.w3.org/1999/xlink','href') || el.getAttribute('href') || null]);for(const c of Array.from(el.childNodes) as any[])if(c.nodeType===1)walk(c);}walk(doc.documentElement);return JSON.stringify(items);}
try{
 for(const record of manifest.assets){const mapped=source.get(join(data,'bioart-source',record.filename)) as any;if(!mapped || mapped.sourceHash!==record.sha256){notImported++;continue;}
  try{const raw=readFileSync(join(data,'bioart-downloads',record.filename));if(createHash('sha256').update(raw).digest('hex')!==record.sha256)throw new Error('Original raw source hash mismatch');
   if(!geometryCache.has(mapped.assetId)){const stored=readFileSync(join(data,'assets',mapped.assetId.slice(6)+'.svg'));if('asset-'+createHash('sha256').update(stored).digest('hex')!==mapped.assetId)throw new Error('Catalog asset hash mismatch');geometryCache.set(mapped.assetId,geometry(stored.toString('utf8')));}
   if(geometry(raw.toString('utf8'))!==geometryCache.get(mapped.assetId))throw new Error('Vector geometry/IDs/transforms differ from official source');checked++;
  }catch(error){failures.push({file:record.filename,assetId:mapped.assetId,error:(error as Error).message});}
 }
 const report={checkedSources:checked,distinctAssets:geometryCache.size,notImportedSources:notImported,failures,readOnly:true};writeFileSync('reports/bioart-expansion/geometry-audit.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));if(failures.length)process.exitCode=1;
}finally{db.close();}
