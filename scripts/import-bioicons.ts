// Only the checked-out official repository is read; no provider websites are fetched.
import {execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,copyFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {Catalog} from '../src/assets/catalog.ts';
import {importDirectory,manifestSchema} from '../src/assets/importer.ts';
import {sanitizeSvg} from '../src/assets/sanitize.ts';
import {buildBioiconsManifest,bioiconsLicenses} from '../src/assets/bioicons.ts';
const repository=resolve(process.argv[2] || 'vendor/bioicons'),data=resolve(process.argv[3] || process.env.FIGURE_DATA_DIR || 'data');
const origin=execFileSync('git',['-C',repository,'remote','get-url','origin'],{encoding:'utf8'}).trim();
if(origin!=='https://github.com/duerrsimon/bioicons.git')throw new Error('Expected official Bioicons git remote');
if(execFileSync('git',['-C',repository,'status','--porcelain'],{encoding:'utf8'}).trim())throw new Error('Repository has local modifications; use a pristine checkout');
const revision=execFileSync('git',['-C',repository,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
const {manifest,inventory}=buildBioiconsManifest(repository,revision);
manifestSchema.parse(manifest);
const output=resolve('reports/bioicons');mkdirSync(join(output,'licenses'),{recursive:true});
mkdirSync(join(data,'licenses/bioicons'),{recursive:true});
for(const folder of Object.keys(bioiconsLicenses)) {
    copyFileSync(join(repository,'static/icons',folder,'LICENSE'),join(output,'licenses',folder+'.txt'));
    copyFileSync(join(repository,'static/icons',folder,'LICENSE'),join(data,'licenses/bioicons',folder+'.txt'));
}
copyFileSync(join(repository,'static/icons/authors.json'),join(output,'upstream-authors.json'));
copyFileSync(join(repository,'README.md'),join(output,'upstream-README.md'));
writeFileSync(join(output,'inventory.json'),JSON.stringify(inventory,null,2)+'\n');
writeFileSync(join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const stage=join(data,'bioicons-source',revision),failures:{file:string;error:string}[]=[],compatible:string[]=[];
const first=performance.now();
for(const file of Object.keys(manifest.assets)) {
    try {sanitizeSvg(readFileSync(join(repository,'static/icons',file),'utf8'));compatible.push(file);
        const target=join(stage,file);mkdirSync(resolve(target,'..'),{recursive:true});
        if(!existsSync(target))copyFileSync(join(repository,'static/icons',file),target);
        else if(!readFileSync(target).equals(readFileSync(join(repository,'static/icons',file))))throw new Error('Pinned staging bytes differ from upstream');
    } catch(error) {failures.push({file,error:(error as Error).message});}
}
const preflightMs=performance.now()-first,catalog=new Catalog(data);
try {
    const initialCount=catalog.count(),start=performance.now();
    const imported=await importDirectory(stage,catalog,manifest);
    const importMs=performance.now()-start;
    const repeatStart=performance.now(),repeated=await importDirectory(stage,catalog,manifest),reimportMs=performance.now()-repeatStart;
    if(repeated.imported || repeated.updated || repeated.failed || repeated.skipped!==compatible.length)throw new Error('Incremental import invariant failed');
    const rows=catalog.db.prepare("SELECT a.id,a.name,a.license,a.category,d.metadata FROM assets a JOIN asset_details d ON d.assetId=a.id WHERE a.provider='Bioicons'").all() as any[];
    const licenseImported:Record<string,number>={};for(const row of rows)licenseImported[row.license]=(licenseImported[row.license] || 0)+1;
    const errors:Record<string,number>={};for(const {error}of failures)errors[error]=(errors[error] || 0)+1;
    const queries=['mitochondria','nucleus','cell membrane','protein','DNA','microscope','laboratory','receptor','neuron','plant'];
    const elapsed:number[]=[];let returned=0;
    for(let repeat=0;repeat<30;repeat++)for(const query of queries){const t=performance.now();const result=catalog.search(query,30);elapsed.push(performance.now()-t);returned+=result.items.length;}
    elapsed.sort((a,b)=>a-b);const percentile=(p:number)=>Number(elapsed[Math.min(elapsed.length-1,Math.floor(elapsed.length*p))].toFixed(3));
    const allTitlesStart=performance.now();let titleMatches=0;
    for(const row of rows)if(catalog.search(row.name,100,0,row.category).items.some(a=>a.id===row.id))titleMatches++;
    const samples=rows.filter(r=>/nucle|mitochond|receptor|cell|DNA|protein/i.test(r.name)).slice(0,20).map(r=>({id:r.id,name:r.name,license:r.license,category:r.category,...JSON.parse(r.metadata)}));
    const report={revision,origin,inventory,preflight:{compatible:compatible.length,rejected:failures.length,ms:preflightMs,errors},import:imported,repeat:repeated,
        totals:{svgDiscovered:inventory.totalRepositorySvgs,iconSvgs:inventory.totalIconSvgs,nonIconSkipped:inventory.totalRepositorySvgs-inventory.totalIconSvgs,metadataSkipped:inventory.skipped.length,importedUnique:imported.imported,updated:imported.updated,duplicateSkipped:imported.skipped,failed:failures.length+imported.failed,successfulSourceFiles:compatible.length-imported.failed},
        licenses:{discoveredIcons:inventory.licenseDistribution,importedUnique:licenseImported},
        performance:{preflightMs,importMs,reimportMs,importedPerSecond:imported.imported/(importMs/1000),queries:elapsed.length,queryMedianMs:percentile(.5),queryP95Ms:percentile(.95),queryMaxMs:percentile(1),queryRowsReturned:returned,titleQueries:rows.length,titleMatches,titleSweepMs:performance.now()-allTitlesStart,catalogCount:catalog.count(),initialCount},samples};
    writeFileSync(join(output,'rejected.json'),JSON.stringify(failures,null,2)+'\n');
    writeFileSync(join(output,'import-report.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({...report,inventory:undefined,samples:undefined},null,2));
}finally{catalog.close();}
