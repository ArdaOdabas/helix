// Actual mixed-provider catalog queries plus a separate 20k-row synthetic metadata/FTS benchmark.
import {Catalog} from '../src/assets/catalog.ts';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
function measure(action:(i:number)=>unknown,iterations:number){const values:number[]=[];for(let i=0;i<iterations;i++){const start=performance.now();action(i);values.push(performance.now()-start);}values.sort((a,b)=>a-b);return{iterations,medianMs:values[Math.floor(iterations*.5)],p95Ms:values[Math.floor(iterations*.95)],maxMs:values.at(-1)};}
const actual=new Catalog('data');let actualResults:any;
try{actualResults={catalogIcons:actual.count(),providerAssets:actual.providers().find(p=>p.provider==='NIH BioArt Source')?.count,providerSearch:measure(i=>actual.search(['cell','protein','mitochondria','nucleus'][i%4],30,0,undefined,undefined,'NIH BioArt Source'),300),allProviderSearch:measure(i=>actual.search(['cell','protein','DNA','nucleus'][i%4],30),300)};}finally{actual.close();}
const synthetic=new Catalog(mkdtempSync(join(tmpdir(),'helix-20k-fts-')));
try{
    synthetic.db.exec('BEGIN');
    const asset=synthetic.db.prepare('INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?)'),fts=synthetic.db.prepare('INSERT INTO asset_search VALUES(?,?,?,?,?)');
    for(let i=0;i<20000;i++){const id='asset-'+i.toString(16).padStart(64,'0'),name='Synthetic cell fixture'+i,provider='Synthetic provider '+i%4;asset.run(id,name,'Cells','["cell"]','Synthetic search benchmark only','0 0 20 20','Test fixture',provider,'2026');fts.run(id,name,'Cells','cell fixture'+i,'Synthetic search benchmark only');}
    synthetic.db.exec('COMMIT');
    const large=measure(i=>synthetic.search(i%2?'cell':'fixture19999',30,0,undefined,undefined,i%2?'Synthetic provider 1':undefined),200);
    writeFileSync('reports/bioart/performance.json',JSON.stringify({actual:actualResults,synthetic:{metadataRows:20000,note:'Isolated metadata/FTS search benchmark; no official assets or documents created.',queries:large}},null,2)+'\n');
    console.log(JSON.stringify({actual:actualResults,synthetic20k:large},null,2));
}finally{synthetic.close();}
