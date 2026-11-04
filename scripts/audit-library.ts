// Counts are computed from real SQLite rows/source bindings and preserved provider inventories.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
const reportRoot=resolve('reports/library-expansion'),baseline=JSON.parse(readFileSync(join(reportRoot,'baseline.json'),'utf8'));
const db=new DatabaseSync('data/catalog.sqlite',{readOnly:true});const load=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const configurations=[['reactome','Reactome','data/collections/reactome/svg'],['togo','Togo Picture Gallery','data/collections/togo/svg'],['phylopic','PhyloPic','data/collections/phylopic/svg'],['healthicons','Health Icons','vendor/healthicons/public/icons/svg'],['scidraw','SciDraw','data/collections/scidraw/svg'],['scisvg','SciSVG','vendor/scisvg']] as const;
try{
 const providers=[];
 for(const[key,provider,folder]of configurations){const report=existsSync(join(reportRoot,key+'-import.json'))?load(join(reportRoot,key+'-import.json')):undefined;const statePath='data/collections/'+key+'/checkpoint.json',state=existsSync(statePath)?load(statePath):undefined;const inventoryPath='data/collections/'+key+'/inventory.json',inventory=existsSync(inventoryPath)?load(inventoryPath):undefined;
 const newRows=Number((db.prepare('SELECT count(*) AS n FROM assets WHERE provider=?').get(provider) as any).n)-Number(baseline.providers.find((r:any)=>r.provider===provider)?.count || 0);
 const sources=db.prepare("SELECT s.sourceFile,s.sourceHash,s.assetId FROM import_sources s WHERE s.sourceFile LIKE ?").all(resolve(folder)+'/%') as any[];
 const mappedFiles=new Set(sources.map(s=>s.sourceFile));
 const failureFiles=(report?.report.failures || []).filter((r:any)=>!mappedFiles.has(resolve(folder,r.file)));
 const failedEntries=state?Object.entries(state.downloads || state.images || state.entries || {}).filter(([,r]:any)=>['failed','stopped','license-review'].includes(r.status)).map(([id,r]:any)=>({id,...r})):[];
 const downloaded=key==='togo'&&inventory?inventory.records.filter((r:any)=>{const path=join(folder,r.filename+'.download.json');return existsSync(join(folder,r.filename))&&existsSync(path)&&load(path).url===r.downloadUrl;}).length:inventory?readdirSync(folder).filter(f=>f.toLowerCase().endsWith('.svg')).length:(report?.discovered || 0);
 const skippedScope=(report?.skipped || []).filter((s:any)=>!['Not downloaded','failed','stopped','license-review'].includes(s.reason));
 const licenses=db.prepare("SELECT json_extract(metadata,'$.license') AS license,count(*) AS sourceRecords,count(DISTINCT assetId) AS assets FROM provenance WHERE json_extract(metadata,'$.provider')=? GROUP BY license ORDER BY license").all(provider);
 const partialCreators=Number((db.prepare("SELECT count(*) AS n FROM provenance WHERE json_extract(metadata,'$.provider')=? AND json_extract(metadata,'$.providerMetadata.fullContributorListVerified')=0").get(provider) as any).n);
 providers.push({partialCreatorRecords:partialCreators,key,provider,discovered:inventory?.records?.length || report?.discovered || 0,downloaded,importedNewSqliteAssets:newRows,mappedSourceFiles:sources.length,duplicateSourceFiles:sources.length-newRows,skippedScope:skippedScope.length,skippedAcquisitionSize:state?Object.values(state.downloads || {}).filter((r:any)=>r.status==='skipped-size').length:0,rejectedSvgFiles:failureFiles.length,acquisitionFailures:failedEntries.length,acquisitionFailureDetails:failedEntries,acquisitionCompleted:state?state.completed===true:true,manualReviewRequired:state?.manualReviewRequired || false,stopReason:state?.stopReason,remainingEntries:inventory&&state?.entries?inventory.records.filter((r:any)=>!Object.hasOwn(state.entries,r.sourceUrl.split('/').pop())).length:inventory&&state?.images?inventory.records.filter((r:any)=>!Object.hasOwn(state.images,r.uuid)).length:undefined,licenses});
 }
 const changedFiles:string[]=[];for(const[path,hash]of Object.entries(baseline.files)){if(!existsSync(path)||createHash('sha256').update(readFileSync(path)).digest('hex')!==hash)changedFiles.push(path);}
 const changedAssets=baseline.databaseAssets.filter((r:any)=>JSON.stringify(db.prepare('SELECT * FROM assets WHERE id=?').get(r.id))!==JSON.stringify(r)).map((r:any)=>r.id);
 const changedDetails=baseline.assetDetails.filter((r:any)=>JSON.stringify(db.prepare('SELECT * FROM asset_details WHERE assetId=?').get(r.assetId))!==JSON.stringify(r)).map((r:any)=>r.assetId);
 const baseSql="FROM asset_science s JOIN assets a ON a.id=s.assetId WHERE a.provider NOT IN ('Helix original test collection','Helix original local samples')";
 const unique=Number((db.prepare('SELECT count(DISTINCT geometryHash) AS n '+baseSql).get() as any).n);
 const classified=Number((db.prepare("SELECT count(DISTINCT geometryHash) AS n "+baseSql+" AND scientificCategory<>'Unclassified'").get() as any).n);
 const grades=db.prepare('SELECT quality,count(*) AS count FROM assets a JOIN asset_science s ON s.assetId=a.id GROUP BY quality').all();
 const uniqueGrades=db.prepare('SELECT quality,count(*) AS count FROM (SELECT geometryHash,min(quality) AS quality '+baseSql+' GROUP BY geometryHash) GROUP BY quality').all();
 const total=Number((db.prepare('SELECT count(*) AS n FROM assets').get() as any).n),structuralDuplicates=Number((db.prepare('SELECT count(*)-count(DISTINCT geometryHash) AS n FROM asset_science').get() as any).n);
 const summary={at:new Date().toISOString(),providers,sqlite:{total,providers:db.prepare('SELECT provider,count(*) AS count FROM assets GROUP BY provider').all(),quickCheck:db.prepare('PRAGMA quick_check').get(),version:db.prepare('PRAGMA user_version').get()},uniqueNonTestVectorStructures:unique,classifiedScientificVectorStructures:classified,qualityRows:grades,qualityUniqueNonTestStructures:uniqueGrades,structuralDuplicatesRetainedFromExistingLibrary:structuralDuplicates,newDuplicateSourceFiles:providers.reduce((n,p)=>n+p.duplicateSourceFiles,0),unsupportedSvgFiles:providers.reduce((n,p)=>n+p.rejectedSvgFiles,0),integrity:{existingFiles:Object.keys(baseline.files).length,changedFiles,changedAssetRows:changedAssets,changedDetailsRows:changedDetails},newDocuments:readdirSync('data/documents').filter(f=>f.endsWith('.json')&&!Object.hasOwn(baseline.files,'data/documents/'+f))};
 const output={...summary,unsupportedAtAcquisition:providers.reduce((n,p)=>n+p.skippedAcquisitionSize,0),totalUnsupportedIncludingSizeSkips:summary.unsupportedSvgFiles+providers.reduce((n,p)=>n+p.skippedAcquisitionSize,0)};
 writeFileSync(join(reportRoot,'summary.json'),JSON.stringify(output,null,2));console.log(JSON.stringify(output,null,2));if(changedFiles.length||changedAssets.length||changedDetails.length)process.exitCode=1;
}finally{db.close();}
