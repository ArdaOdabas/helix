// Uses normal official download controls for explicitly supplied entry URLs only.
// This is not a crawler or bulk API client. No guessed file endpoints or third-party mirrors.
import {chromium} from 'playwright-core';
import {mkdirSync,readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {withBioartRetry,BioartHttpError,bioartRetryDelay} from '../src/assets/bioart-retry.ts';
import {extractBioartSvgMetadata,extractBioartEntryText,bioartDownloadManifestSchema} from '../src/assets/bioart.ts';
const [directory='data/bioart-downloads',...entries]=process.argv.slice(2),root=resolve(directory);
if(!entries.length || entries.some(url=>!/^https:\/\/bioart\.niaid\.nih\.gov\/bioart\/\d+$/.test(url)))throw new Error('Usage: node scripts/acquire-bioart-ui.ts LOCAL_DIRECTORY OFFICIAL_ENTRY_URL [...]');
mkdirSync(root,{recursive:true});const manifestFile=join(root,'bioart-downloads.json');
const manifest=existsSync(manifestFile)?bioartDownloadManifestSchema.parse(JSON.parse(readFileSync(manifestFile,'utf8'))):{version:1 as const,assets:[] as any[]};
const hash=(file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
    for(const entry of entries){
        const previous=manifest.assets.find(a=>a.sourceUrl===entry);
        if(previous && existsSync(join(root,previous.filename)) && previous.sha256===hash(join(root,previous.filename))){console.log('Unchanged local download:',previous.filename);continue;}
        const id=entry.split('/').pop()!;
        // Recover a completed file if interrupted before the manifest checkpoint.
        let filename=readdirSync(root).find(f=>f.startsWith(id+'-') && /\.svg$/i.test(f) && existsSync(join(root,f+'.entry.txt')));
        if(!filename)filename=await withBioartRetry(async()=>{
            const page=await browser.newPage({acceptDownloads:true});let denied:string|undefined,transient:BioartHttpError|undefined;
            page.on('response',r=>{if(r.url().startsWith('https://bioart.niaid.nih.gov/')){
                if([401,403].includes(r.status()))denied=`${r.status()} ${r.url()}`;
                if([408,429,500,502,503,504].includes(r.status()))transient=new BioartHttpError(r.status(),bioartRetryDelay(r.headers()['retry-after'] || null));
            }});
            try{
                const response=await page.goto(entry);
                if(response && !response.ok())throw new BioartHttpError(response.status(),bioartRetryDelay(response.headers()['retry-after'] || null));
                if(denied || /captcha/i.test(await page.locator('body').innerText()))throw new Error('Access denied or CAPTCHA; stopped without bypassing');
                const svg=page.locator('input[name="SVG"]');await svg.waitFor();await svg.check();
                if(denied)throw new Error('Access denied; stopped: '+denied);
                const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download',exact:true}).click();const download=await pending;
                if(denied)throw new Error('Access denied; stopped: '+denied);
                const filename=id+'-'+download.suggestedFilename();
                if(!/^[\w .-]+\.svg$/i.test(filename))throw new Error('Unexpected non-SVG official download');
                await download.saveAs(join(root,filename));writeFileSync(join(root,filename+'.entry.txt'),await page.locator('body').innerText());return filename;
            }catch(error){if(denied)throw new Error('Access denied; stopped: '+denied);throw transient || error;}finally{await page.close();}
        });
        const target=join(root,filename),embedded=extractBioartSvgMetadata(readFileSync(target,'utf8'));
        const pageMetadata=extractBioartEntryText(readFileSync(target+'.entry.txt','utf8'));
        const license=embedded.license || pageMetadata.license;
        if(!license || pageMetadata.license && embedded.license && pageMetadata.license!==embedded.license)throw new Error('Missing or conflicting per-entry license; manual review needed');
        const record={...pageMetadata,filename,sourceUrl:entry,title:embedded.title || pageMetadata.title || '',description:embedded.description || pageMetadata.description,license,licenseReference:entry,creator:embedded.creator || pageMetadata.creator,credit:embedded.credit || pageMetadata.credit,creationDate:embedded.creationDate,sha256:hash(target)};
        manifest.assets=manifest.assets.filter(a=>a.sourceUrl!==entry);manifest.assets.push(record);
        bioartDownloadManifestSchema.parse(manifest);writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+'\n');
        console.log('Recorded official UI SVG:',filename,license);
    }
}finally{await browser.close();}
