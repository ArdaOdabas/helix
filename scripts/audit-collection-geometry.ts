// Full read-only audit of acquired source hashes, stored content IDs and vector geometry.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {DOMParser} from '@xmldom/xmldom';
import {sanitizeSvg,normalizeSvgProlog} from '../src/assets/sanitize.ts';
import {geometryFingerprint} from '../src/assets/science.ts';
const db=new DatabaseSync('data/catalog.sqlite',{readOnly:true}),cache=new Map<string,{vectorsHash:string;geometry:string}>(),failures:any[]=[];
const sources=db.prepare("SELECT * FROM import_sources WHERE sourceFile LIKE '%/data/collections/%' OR sourceFile LIKE '%/vendor/scisvg/%' OR sourceFile LIKE '%/vendor/healthicons/%'").all() as any[];
const hash=(text:string|Buffer)=>createHash('sha256').update(text).digest('hex');
function vectors(svg:string){const doc=new DOMParser().parseFromString(normalizeSvgProlog(svg),'image/svg+xml'),out:any[]=[];function walk(e:any){if(e.localName==='metadata')return;if(e.namespaceURI==='http://www.w3.org/2000/svg'&&['path','rect','circle','ellipse','line','polyline','polygon','g','use'].includes(e.localName))out.push([e.localName,...['id','d','points','transform','x','y','cx','cy','r','rx','ry','x1','x2','y1','y2'].map(a=>e.getAttribute(a))]);for(const c of Array.from(e.childNodes) as any[])if(c.nodeType===1)walk(c);}walk(doc.documentElement);return JSON.stringify(out);}
let verified=0,representatives=0,aliases=0;
try{for(const r of sources){try{
 const bytes=readFileSync(r.sourceFile);if(hash(bytes)!==r.sourceHash)throw new Error('Raw source differs from SQLite source hash');
 const receipt=r.sourceFile+'.download.json';if(existsSync(receipt)&&JSON.parse(readFileSync(receipt,'utf8')).sha256!==hash(bytes))throw new Error('Raw source differs from official download receipt');
 const clean=sanitizeSvg(bytes.toString('utf8'));
 if(!cache.has(r.assetId)){const svg=readFileSync(join('data/assets',r.assetId.slice(6)+'.svg'),'utf8');if('asset-'+hash(svg)!==r.assetId)throw new Error('Stored SVG content ID mismatch');cache.set(r.assetId,{vectorsHash:hash(vectors(svg)),geometry:geometryFingerprint(svg)});}
 const stored=cache.get(r.assetId)!;if(geometryFingerprint(clean.svg)!==stored.geometry)throw new Error('Canonical vector structure differs from source');
 if('asset-'+hash(clean.svg)===r.assetId){if(hash(vectors(bytes.toString('utf8')))!==stored.vectorsHash)throw new Error('Source geometry/IDs/transforms changed');representatives++;}else aliases++;
 verified++;if(verified%2000===0)console.log('Source geometry verified',verified,'/',sources.length);
 }catch(error){failures.push({sourceFile:r.sourceFile,assetId:r.assetId,error:(error as Error).message});}}
 const result={sourceFiles:sources.length,verified,canonicalRepresentativesChecked:representatives,geometryAliasesChecked:aliases,distinctAssets:cache.size,failures,readOnly:true};writeFileSync('reports/library-expansion/geometry.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(failures.length)process.exitCode=1;
}finally{db.close();}
