// Normal public gallery/detail/download UI only; no private/undocumented API calls.
import {chromium} from 'playwright-core';
import {resolve,join} from 'node:path';
import {existsSync,readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {atomicJson,sha256,AccessStopped,download} from '../src/assets/acquire.ts';
import {sciDrawAuthors} from '../src/assets/scidraw-metadata.ts';
const root=resolve('data/collections/scidraw');mkdirSync(root,{recursive:true});
const checkpoint=join(root,'checkpoint.json'),state:any=existsSync(checkpoint)?JSON.parse(readFileSync(checkpoint,'utf8')):{entries:{}};
if(state.manualReviewRequired && !process.argv.includes('--resume-after-review'))throw new AccessStopped(state.stopReason+' Review official access/rate restrictions before resuming.');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});const context=await browser.newContext({acceptDownloads:true});
await context.route('**/*',route=>['image','font','media'].includes(route.request().resourceType())?route.abort():route.continue());
let stopped=false,nextNavigation=0;
// The first run was cut short by an HTTP 401/403/429 from the site, so the pace is configurable and
// a resumed run can be gentler than the one that was refused.
const interval=Math.max(250,Number(process.env.SCIDRAW_INTERVAL_MS ?? 1000));
const concurrency=Math.max(1,Math.min(4,Number(process.env.SCIDRAW_CONCURRENCY ?? 2)));
async function navigate(page:any,url:string){const wait=Math.max(0,nextNavigation-Date.now());nextNavigation=Math.max(Date.now(),nextNavigation)+interval;if(wait)await new Promise(r=>setTimeout(r,wait));const r=await page.goto(url);if(r&&!r.ok())throw new Error('HTTP '+r.status()+' '+url);}
try{
 const page=await context.newPage();page.setDefaultTimeout(15000);
 await navigate(page,'https://scidraw.io/terms');await page.locator('h1').waitFor();const terms=await page.locator('body').innerText();writeFileSync(join(root,'terms.txt'),terms);if(/no (?:automated|scraping)|prohibit.{0,40}(?:scrap|automat)/i.test(terms))throw new AccessStopped('Terms require manual acquisition; see cached terms');
 const inventoryFile=join(root,'inventory.json');let records:any[]=[];
 if(existsSync(inventoryFile))records=JSON.parse(readFileSync(inventoryFile,'utf8')).records;else{
  await navigate(page,'https://scidraw.io/');await page.locator('a[href^="/drawing/"]').first().waitFor();
  while(true){const items=await page.locator('a[href^="/drawing/"]').evaluateAll(es=>es.map(e=>({sourceUrl:(e as HTMLAnchorElement).href,cardText:(e as HTMLElement).innerText})));for(const r of items)if(!records.some(a=>a.sourceUrl===r.sourceUrl))records.push(r);atomicJson(inventoryFile,{provider:'SciDraw',records,complete:false});const more=page.getByRole('button',{name:'Load More',exact:true});if(!await more.count() || !await more.isVisible())break;const old=items.length;await more.click();await page.waitForFunction(n=>document.querySelectorAll('a[href^="/drawing/"]').length>n,old);}
  atomicJson(inventoryFile,{provider:'SciDraw',records,complete:true});
 }
 await page.close();let cursor=0,count=0;
 await Promise.all(Array.from({length:concurrency},async()=>{while(!stopped){const r=records[cursor++];if(!r)return;const id=r.sourceUrl.split('/').pop()!,old=state.entries[id];
  if(old?.status==='downloaded'&&existsSync(join(root,'svg',old.filename))&&sha256(join(root,'svg',old.filename))===old.sha256)continue;
  const p=await context.newPage();p.setDefaultTimeout(15000);let denied:string|undefined;
  p.on('response',res=>{if([401,403,429].includes(res.status())&&new URL(res.url()).hostname.endsWith('scidraw.io')){denied='HTTP '+res.status()+' '+res.url();state.manualReviewRequired=true;state.stopReason=denied;state.retryAfter=res.headers()['retry-after'];atomicJson(checkpoint,state);stopped=true;p.close().catch(()=>{});}});
  try{await navigate(p,r.sourceUrl);await p.locator('h1').waitFor();const button=p.getByRole('button',{name:'Download SVG',exact:true});
   const text=await p.locator('body').innerText();mkdirSync(join(root,'pages'),{recursive:true});writeFileSync(join(root,'pages',id+'.txt'),text);
   if(!await button.count()){state.entries[id]={status:'no-svg',sourceUrl:r.sourceUrl};continue;}
   const licensing=p.locator('p').filter({hasText:'This illustration is licensed under'});const licenseUrl=await licensing.locator('a').first().getAttribute('href');if(!licenseUrl||!/creativecommons\.org\/(licenses|publicdomain)\//.test(licenseUrl)||/\/by(?:-[a-z]+)*-nd\//.test(licenseUrl))throw new Error('Missing/unsupported individual license');
   const authorPanel=p.getByRole('heading',{name:'Authors',exact:true}).locator('..');await authorPanel.locator('span.text-lg').first().waitFor({state:'attached',timeout:5000}).catch(()=>{});
   const title=await p.locator('h1').innerText(),observedAuthors=await p.getByRole('heading',{name:'Authors',exact:true}).locator('..').locator('span.text-lg').allTextContents();
   const contributorMetadata=sciDrawAuthors(title,observedAuthors,text,r.cardText);const authors=contributorMetadata.authors;
   const category=await p.getByText('Category:',{exact:true}).locator('..').locator('span').last().innerText();const doiLink=p.locator('a[href^="https://doi.org/"]');const doi=await doiLink.count()?await doiLink.first().getAttribute('href'):undefined;
   const preview=await p.locator('img[src*="/files/"]').first().getAttribute('src');if(!preview)throw new Error('No official drawing file exposed');const target=new URL(preview,p.url());if(target.hostname==='scidraw.io')target.protocol='https:';const downloadUrl=target.href;if(new URL(downloadUrl).origin!=='https://scidraw.io'||!new URL(downloadUrl).pathname.toLowerCase().endsWith('.svg'))throw new Error('No compatible official SVG file URL');const official=decodeURIComponent(new URL(downloadUrl).pathname.split('/').pop()!);const filename=id+'.svg';await download(downloadUrl,join(root,'svg',filename));
   state.entries[id]={status:'downloaded',filename,originalFilename:official,downloadUrl,sourceUrl:r.sourceUrl,title,...contributorMetadata,authors,category,doi,licenseUrl,sha256:sha256(join(root,'svg',filename)),downloadedAt:new Date().toISOString()};
  }catch(error){state.entries[id]={status:denied?'stopped':'failed',sourceUrl:r.sourceUrl,error:denied || (error as Error).message};if(denied || error instanceof AccessStopped){stopped=true;state.manualReviewRequired=true;state.stopReason=denied || (error as Error).message;atomicJson(checkpoint,state);throw new AccessStopped(state.stopReason);}}
  finally{await p.close().catch(()=>{});atomicJson(checkpoint,state);if(++count%20===0)console.log('SciDraw checked',count,'/',records.length);}
 }}));state.completed=!stopped;atomicJson(checkpoint,state);
}finally{await browser.close();}
