// Read-only SQLite/file audit. Writes reports only; never changes assets or documents.
import {readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
const reportRoot=resolve('reports/bioart-expansion'),data=resolve(process.env.FIGURE_DATA_DIR || 'data');
const load=(path:string)=>JSON.parse(readFileSync(path,'utf8'));
const checkpoint=load(join(reportRoot,'checkpoint.json')),discovery=load(join(reportRoot,'discovery.json'));
const baseline=load(join(reportRoot,'baseline.json'));
const manifest=load(join(data,'bioart-downloads/bioart-downloads.json'));
const db=new DatabaseSync(join(data,'catalog.sqlite'),{readOnly:true});
try {
 const provider='NIH BioArt Source',entries=Object.entries(checkpoint.entries) as [string,any][];
 const mapped:any[]=[],unmapped:any[]=[];
 const getSource=db.prepare('SELECT assetId,sourceHash FROM import_sources WHERE sourceFile=?');
 const rejectionMap=new Map<string,string>();
 for(const batch of checkpoint.imports){for(const rejection of batch.rejected || [])rejectionMap.set(rejection.file,rejection.error);for(const failure of batch.import?.failures || [])rejectionMap.set(failure.file,failure.error);}
 for(const record of manifest.assets){const source=getSource.get(join(data,'bioart-source',record.filename)) as any;if(source?.sourceHash===record.sha256)mapped.push({...record,assetId:source.assetId});else unmapped.push({...record,error:rejectionMap.get(record.filename) || 'Not mapped to current source hash'});}
 const uniqueIds=new Set(mapped.map(r=>r.assetId));
 const metadataErrors=entries.flatMap(([url,e])=>(e.recordErrors || []).map((r:any)=>({sourceUrl:url,...r})));
 const reasons:Record<string,number>={};for(const r of [...unmapped,...metadataErrors])reasons[r.error]=(reasons[r.error] || 0)+1;
 const providers=db.prepare('SELECT provider,count(*) AS count FROM assets GROUP BY provider ORDER BY provider').all() as any[];
 const nihCount=Number(providers.find(r=>r.provider===provider)?.count || 0);
 const provenanceCount=db.prepare("SELECT count(DISTINCT assetId) AS count FROM provenance WHERE json_extract(metadata,'$.provider')=?").get(provider);
 const licenses=db.prepare("SELECT json_extract(metadata,'$.license') AS license,count(DISTINCT assetId) AS assets,count(*) AS sourceRecords FROM provenance WHERE json_extract(metadata,'$.provider')=? GROUP BY license ORDER BY license").all(provider);
 const categories=db.prepare("SELECT c.value AS category,count(DISTINCT p.assetId) AS assets FROM provenance p,json_each(p.metadata,'$.officialCategories') c WHERE json_extract(p.metadata,'$.provider')=? GROUP BY c.value ORDER BY c.value").all(provider);
 const integrity:{checkedFiles:number;changedOrMissing:string[];newDocuments:string[]}={checkedFiles:0,changedOrMissing:[],newDocuments:[]};
 for(const folder of ['data/documents','data/assets'])for(const [file,hash]of Object.entries(baseline[folder])){const path=join(folder,file);integrity.checkedFiles++;if(!existsSync(path)||createHash('sha256').update(readFileSync(path)).digest('hex')!==hash)integrity.changedOrMissing.push(path);}
 integrity.newDocuments=readdirSync(join(data,'documents')).filter(f=>f.endsWith('.json')&&!Object.hasOwn(baseline['data/documents'],f));
 const statusCounts:Record<string,number>={};for(const [,e]of entries)statusCounts[e.status]=(statusCounts[e.status] || 0)+1;
 const notDownloaded=discovery.entries.filter((e:any)=>!checkpoint.entries[e.url] || ['error','stopped','downloaded'].includes(checkpoint.entries[e.url].status)).map((e:any)=>({sourceUrl:e.url,...checkpoint.entries[e.url]}));
 const search=db.prepare("SELECT a.id FROM asset_search JOIN assets a ON a.id=asset_search.id WHERE asset_search MATCH ? AND (a.provider=? OR a.id IN(SELECT assetId FROM provenance WHERE json_extract(metadata,'$.provider')=?)) ORDER BY bm25(asset_search),a.id LIMIT 31");
 const timings:any[]=[];for(const keyword of ['cell','mitochondria','virus','protein','dna']){const samples:number[]=[];let results=0;for(let i=0;i<30;i++){const start=performance.now();results=search.all('"'+keyword+'"*',provider,provider).length;samples.push(performance.now()-start);}samples.sort((a,b)=>a-b);timings.push({keyword,resultsUpTo31:results,medianMs:+samples[15].toFixed(3),p95Ms:+samples[28].toFixed(3)});}
 const concurrentDocumentChange=existsSync(join(reportRoot,'concurrent-document-change.json'))?load(join(reportRoot,'concurrent-document-change.json')):undefined;
 const summary={generatedAt:new Date().toISOString(),completed:checkpoint.completed===true,officialEntriesDiscovered:discovery.entries.length,entriesChecked:entries.length,statusCounts,
 officialSvgFilesDiscovered:entries.reduce((n,[,e])=>n+(e.downloadedSvgFiles || 0),0),manifestRecords:manifest.assets.length,
 successfullyMappedSourceFiles:mapped.length,distinctMappedAssets:uniqueIds.size,duplicateSourceFiles:mapped.length-uniqueIds.size,
 previouslyImportedNihAssets:Number(baseline.providers.find((r:any)=>r.provider===provider)?.count || 0),newCanonicalNihAssets:nihCount-Number(baseline.providers.find((r:any)=>r.provider===provider)?.count || 0),
 sqlite:{total:Number((db.prepare('SELECT count(*) AS count FROM assets').get() as any).count),providers,nihCanonicalAssets:nihCount,nihAssetsIncludingProvenance:provenanceCount,licenses,categories,userVersion:db.prepare('PRAGMA user_version').get(),quickCheck:db.prepare('PRAGMA quick_check').get()},
 rejectedSourceFiles:unmapped.length,metadataReviewFiles:metadataErrors.length,rejectionReasons:reasons,notDownloadedEntries:notDownloaded,
 runtimeImportFailures:checkpoint.imports.reduce((n:number,r:any)=>n+(r.import?.failed || 0),0),searchTimings:timings,integrity,concurrentDocumentChange};
 writeFileSync(join(reportRoot,'summary.json'),JSON.stringify(summary,null,2)+'\n');
 writeFileSync(join(reportRoot,'rejected.json'),JSON.stringify({rejected:unmapped,metadataReview:metadataErrors,notDownloaded},null,2)+'\n');
 writeFileSync(join(reportRoot,'imported.json'),JSON.stringify(mapped,null,2)+'\n');
 console.log(JSON.stringify({...summary,sqlite:{...summary.sqlite,categories:categories.length},notDownloadedEntries:notDownloaded.length},null,2));
 if(integrity.changedOrMissing.length || integrity.newDocuments.length)process.exitCode=1;
}finally{db.close();}
