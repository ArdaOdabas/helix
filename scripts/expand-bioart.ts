// All transfers use the official public page's representation/SVG/Download controls.
// No endpoint guessing, authentication bypass, third-party assets or document writes.
import {chromium} from 'playwright-core';
import {readFileSync,writeFileSync,existsSync,mkdirSync,copyFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {Catalog} from '../src/assets/catalog.ts';
import {importBioartLocal} from '../src/assets/bioart-local.ts';
import {bioartDownloadManifestSchema} from '../src/assets/bioart.ts';
import {withBioartRetry,BioartHttpError,bioartRetryDelay} from '../src/assets/bioart-retry.ts';
import {atomicBioartJson,bioartFileHash,recordBioartDownload} from '../src/assets/bioart-expansion.ts';
const root=resolve(process.argv[2] || 'data/bioart-downloads'),discovery=JSON.parse(readFileSync('reports/bioart-expansion/discovery.json','utf8'));
mkdirSync(root,{recursive:true});mkdirSync(join(root,'.packs'),{recursive:true});
const stateFile='reports/bioart-expansion/checkpoint.json',manifestFile=join(root,'bioart-downloads.json');
const state:any=existsSync(stateFile)?JSON.parse(readFileSync(stateFile,'utf8')):{entries:{},imports:[],startedAt:new Date().toISOString()};
const manifest=existsSync(manifestFile)?bioartDownloadManifestSchema.parse(JSON.parse(readFileSync(manifestFile,'utf8'))):{version:1 as const,assets:[] as any[]};
const catalogue=new Catalog(resolve(process.env.FIGURE_DATA_DIR || 'data'));
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,handleSIGTERM:false,handleSIGINT:false});
const context=await browser.newContext({acceptDownloads:true});
let cancelled=false;for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{cancelled=true;});
state.runs=[...(state.runs || []),{startedAt:new Date().toISOString(),resume:existsSync(stateFile)}];
const checkpoint=()=>{state.updatedAt=new Date().toISOString();atomicBioartJson(stateFile,state);};
let pending:any[]=[],inflight:Promise<void>|undefined;
let nextNavigation=0;
async function navigationSlot(){const delay=Math.max(0,nextNavigation-Date.now());nextNavigation=Math.max(Date.now(),nextNavigation)+1000;if(delay)await new Promise(r=>setTimeout(r,delay));}
async function flush(){while(inflight)await inflight;if(!pending.length)return;const entries=pending;pending=[];inflight=(async()=>{const r=await importBioartLocal(root,catalogue,{version:1,assets:entries});state.imports.push({at:new Date().toISOString(),records:entries.length,import:r.import,rejected:r.rejected});checkpoint();console.log('IMPORT',JSON.stringify({records:entries.length,imported:r.import.imported,skipped:r.import.skipped,rejected:r.rejected.length,failed:r.import.failed}));})();try{await inflight;}finally{inflight=undefined;}}
try {
    // Resume durable files that were downloaded before an interrupted import batch.
    pending=[...manifest.assets];await flush();
    async function acquire(index:number,entry:any){
        if(cancelled)return;
        const url=entry.url;if(!/^https:\/\/bioart\.niaid\.nih\.gov\/bioart\/\d+$/.test(url))throw new Error('Non-official discovery URL');
        let current=state.entries[url];
        if(current?.status==='done' && current.filenames?.every((f:string)=>{const r=manifest.assets.find(a=>a.filename===f);return r && existsSync(join(root,f)) && r.sha256===bioartFileHash(join(root,f));}))return;
        if(current?.status==='no-svg')return;
        const id=url.split('/').pop(),folder=join(root,'.packs',id);mkdirSync(folder,{recursive:true});
        try{
            const cachedArchive=current?.archive && existsSync(current.archive) && current.archiveHash===bioartFileHash(current.archive);
            if(!cachedArchive || current.status==='metadata-review' && !existsSync(join(folder,'license-link.json'))){
                current=await withBioartRetry(async()=>{
                    const page=await context.newPage();let denied:string|undefined,transient:BioartHttpError|undefined;
                    page.on('response',r=>{if(r.url().startsWith('https://bioart.niaid.nih.gov/')){
                        if([401,403,429].includes(r.status())){denied=`${r.status()} ${r.url()}`;page.close().catch(()=>{});}
                        if([408,429,500,502,503,504].includes(r.status()))transient=new BioartHttpError(r.status(),bioartRetryDelay(r.headers()['retry-after'] || null));
                    }});
                    try{
                        await navigationSlot();if(cancelled)throw new Error('Cancelled');
                        const response=await page.goto(url);
                        if(response && !response.ok())throw new BioartHttpError(response.status(),bioartRetryDelay(response.headers()['retry-after'] || null));
                        await page.locator('input[type="checkbox"]').first().waitFor({timeout:5000}).catch(()=>{});
                        if(denied)throw new Error('ACCESS_DENIED '+denied);
                        if(/captcha/i.test(await page.locator('body').innerText()))throw new Error('ACCESS_DENIED CAPTCHA');
                        const representations=page.locator('div > img[alt^="Indicator"]'),count=await representations.count();
                        for(let n=0;n<count;n++){
                            const image=representations.nth(n);
                            if(Number(await image.evaluate((e:HTMLImageElement)=>e.style.opacity || '1'))<1){await image.evaluate((el:HTMLElement)=>el.click());await page.waitForFunction(n=>{const images=document.querySelectorAll('div > img[alt^="Indicator"]');return (images[n] as HTMLElement)?.style.opacity==='1';},n);}
                        }
                        const text=await page.locator('body').innerText();writeFileSync(join(folder,'entry.txt'),text);
                        const licenseBadge=page.locator('a:has(img[alt="License Image"])');
                        const licenseLink=await licenseBadge.count()?await licenseBadge.first().getAttribute('href'):null;
                        atomicBioartJson(join(folder,'license-link.json'),{licenseLink,observedAt:new Date().toISOString(),sourceUrl:url});
                        if(cachedArchive)return {...current,checkedAt:new Date().toISOString()};
                        const svg=page.locator('input[name="SVG"]');
                        if(!await svg.count())return {status:'no-svg',representationCount:count,svgFileIds:[],checkedAt:new Date().toISOString()};
                        const svgFileIds=(await svg.getAttribute('value') || '').split(',').filter(Boolean);if(!svgFileIds.length)return {status:'no-svg',representationCount:count,svgFileIds:[]};
                        await svg.check();
                        const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download',exact:true}).click();const download=await downloadPromise;
                        if(denied)throw new Error('ACCESS_DENIED '+denied);
                        const suggested=download.suggestedFilename();if(!/\.(zip|svg)$/i.test(suggested))throw new Error('Unexpected official download format: '+suggested);
                        const archive=join(folder,/\.zip$/i.test(suggested)?'official.zip':'official.svg');await download.saveAs(archive);
                        return {status:'downloaded',archive,archiveHash:bioartFileHash(archive),suggestedFilename:suggested,representationCount:count,svgFileIds,checkedAt:new Date().toISOString()};
                    }catch(error){if(denied)throw new Error('ACCESS_DENIED '+denied);throw transient || error;}finally{await page.close().catch(()=>{});}
                });
                state.entries[url]=current;checkpoint();
            }
            if(current.status==='no-svg'){console.log('ENTRY',index+1,'no SVG',url);return;}
            let files:{path:string;originalFilename:string}[];
            if(/\.zip$/i.test(current.archive))files=JSON.parse(execFileSync('python3',['scripts/extract-bioart-zip.py',current.archive,join(folder,'svg')],{encoding:'utf8',maxBuffer:10000000}));
            else files=[{path:current.archive,originalFilename:current.suggestedFilename}];
            const text=readFileSync(join(folder,'entry.txt'),'utf8'),filenames:string[]=[],recordErrors:any[]=[];
            const licenseLink=existsSync(join(folder,'license-link.json'))?JSON.parse(readFileSync(join(folder,'license-link.json'),'utf8')).licenseLink:undefined;
            for(const file of files)try{
                const record=recordBioartDownload(root,file.path,file.originalFilename,url,text,licenseLink);filenames.push(record.filename);
                if(!manifest.assets.some(a=>a.filename===record.filename && a.sha256===record.sha256)){manifest.assets=manifest.assets.filter(a=>a.filename!==record.filename);manifest.assets.push(record);pending.push(record);}
            }catch(error){recordErrors.push({file:file.originalFilename,error:(error as Error).message});}
            atomicBioartJson(manifestFile,manifest);
            state.entries[url]={...current,status:recordErrors.length?'metadata-review':'done',filenames,downloadedSvgFiles:files.length,recordErrors};checkpoint();
            console.log('ENTRY',index+1+'/'+discovery.entries.length,id,'SVGs',files.length,'records',filenames.length,'pending',pending.length);
            if(pending.length>=100)await flush();
        }catch(error){const message=(error as Error).message;state.entries[url]={...current,status:/ACCESS_DENIED|long retry delay/.test(message)?'stopped':'error',error:message};checkpoint();console.log('ENTRY ERROR',id,message);if(/ACCESS_DENIED|long retry delay/.test(message)){cancelled=true;throw error;}}
    }
    let cursor=0;const concurrency=Math.max(1,Math.min(2,Number(process.env.BIOART_CONCURRENCY || 2)));
    await Promise.all(Array.from({length:concurrency},async()=>{while(!cancelled){const index=cursor++;if(index>=discovery.entries.length)return;await acquire(index,discovery.entries[index]);}}));
    await flush();state.completed=!cancelled && discovery.entries.every((e:any)=>['done','no-svg','metadata-review','error'].includes(state.entries[e.url]?.status));checkpoint();
}finally{await flush();await browser.close();catalogue.close();checkpoint();}
