import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {Catalog} from '../src/assets/catalog.ts';
import {importBioartLocal} from '../src/assets/bioart-local.ts';
const [input,manifestFile,data=process.env.FIGURE_DATA_DIR || 'data']=process.argv.slice(2);
if(!input || !manifestFile)throw new Error('Usage: node scripts/import-bioart.ts LOCAL_SVG_DIRECTORY BIOART_DOWNLOADS.json [DATA_DIRECTORY]');
const catalog=new Catalog(resolve(data));
try{const start=performance.now(),report=await importBioartLocal(input,catalog,JSON.parse(readFileSync(manifestFile,'utf8')));
    mkdirSync('reports/bioart',{recursive:true});writeFileSync('reports/bioart/import-report.json',JSON.stringify({...report,elapsedMs:performance.now()-start},null,2)+'\n');
    console.log(JSON.stringify(report,null,2));if(report.import.failed)process.exitCode=2;
}finally{catalog.close();}
