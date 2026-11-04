import {Catalog} from '../src/assets/catalog.ts';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
function measure(action:(i:number)=>unknown,n=60){const times:number[]=[];for(let i=0;i<n;i++){const t=performance.now();action(i);times.push(performance.now()-t);}times.sort((a,b)=>a-b);return {iterations:n,medianMs:+times[Math.floor(n*.5)].toFixed(3),p95Ms:+times[Math.floor(n*.95)].toFixed(3),maxMs:+times.at(-1)!.toFixed(3)};}
const c=new Catalog('data');let actual:any;
try{actual={sqliteAssets:c.count()-6,search:measure(i=>c.search(['cell','protein','mitochondrion','dna'][i%4],30)),uniqueProviderSearch:measure(i=>c.search(i%2?'':'Homo',30,0,undefined,undefined,'PhyloPic',undefined,'C',true)),taxonomy:measure(()=>c.categories('PhyloPic')),providers:measure(()=>c.providers())};}finally{c.close();}
const fixture=new Catalog(mkdtempSync(join(tmpdir(),'helix-25000-search-')));let large:any;
try{fixture.db.exec('BEGIN');const asset=fixture.db.prepare('INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?)'),fts=fixture.db.prepare('INSERT INTO asset_search VALUES(?,?,?,?,?)'),science=fixture.db.prepare('INSERT INTO asset_science VALUES(?,?,?,?,?)');
 for(let i=0;i<25000;i++){const id='asset-'+i.toString(16).padStart(64,'0'),name='Synthetic protein fixture'+i;asset.run(id,name,'Proteins','["protein"]','Isolated synthetic benchmark','0 0 20 20','Fixture only','Benchmark '+i%3,'2026');fts.run(id,name,'Proteins','protein fixture'+i,'Synthetic only');science.run(id,'geometry'+i,'B','Proteins and receptors','{}');}fixture.db.exec('COMMIT');
 large={isolatedMetadataRows:25000,fts:measure(i=>fixture.search(i%2?'protein':'fixture24999',30)),filteredUnique:measure(i=>fixture.search(i%2?'protein':'',30,0,undefined,undefined,'Benchmark 1','Proteins and receptors','B',true))};
}finally{fixture.close();}
writeFileSync('reports/library-expansion/performance.json',JSON.stringify({actual,synthetic25000:large,note:'Synthetic rows exist only in a temporary benchmark database; none are counted or inserted into the real library.'},null,2));console.log(JSON.stringify({actual,synthetic25000:large},null,2));
