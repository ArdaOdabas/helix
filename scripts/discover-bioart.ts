// Enumerate only links exposed by the official gallery's normal pagination.
import {chromium} from 'playwright-core';
import {mkdirSync,readFileSync,writeFileSync,existsSync,renameSync} from 'node:fs';
const output='reports/bioart-expansion/discovery.json';mkdirSync('reports/bioart-expansion',{recursive:true});
const saved=existsSync(output)?JSON.parse(readFileSync(output,'utf8')):{entries:[],pages:[]};
const knownComplete=!!saved.complete;
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
 const page=await browser.newPage();let denied:string|undefined;
 page.on('response',r=>{if(r.url().startsWith('https://bioart.niaid.nih.gov/')&&[401,403,429].includes(r.status())){denied=`${r.status()} ${r.url()}`;page.close().catch(()=>{});}});
 await page.goto('https://bioart.niaid.nih.gov/discover');await page.locator('a[href^="/bioart/"]').first().waitFor();
 for(let number=1;;number++){
  if(denied)throw new Error('Stopped: '+denied);
  await page.waitForLoadState('networkidle',{timeout:10000}).catch(()=>{});
  await page.locator('a[href^="/bioart/"]').first().waitFor();
  const text=await page.locator('body').innerText();
  const entries=await page.locator('a[href^="/bioart/"]').evaluateAll(es=>es.map(e=>({url:(e as HTMLAnchorElement).href,displayText:(e as HTMLElement).innerText})));
  const advertised=Number((text.match(/of ([\d,]+) images/)?.[1] || '0').replaceAll(',',''));
  if(number===1 && knownComplete && advertised===saved.entries.length && entries.every(e=>saved.entries.some((old:any)=>old.url===e.url))){saved.lastVerifiedAt=new Date().toISOString();writeFileSync(output,JSON.stringify(saved,null,2));console.log('Resumed complete inventory:',saved.entries.length,'official entry links; advertised count and newest page match.');break;}
  const first=entries[0]?.url;if(!first)throw new Error('Empty gallery page');
  for(const entry of entries)if(!saved.entries.some((e:any)=>e.url===entry.url))saved.entries.push(entry);
  saved.pages=saved.pages.filter((p:any)=>p.number!==number);saved.pages.push({number,first,entries:entries.length,summary:text.match(/Displaying [\d,]+ to [\d,]+ of [\d,]+ images/)?.[0]});
  saved.complete=false;saved.checkedAt=new Date().toISOString();saved.totalEntries=saved.entries.length;
  writeFileSync(output+'.tmp',JSON.stringify(saved,null,2));renameSync(output+'.tmp',output);
  console.log('Gallery page',number,'entries discovered',saved.entries.length);
  const next=page.getByRole('button',{name:'Go to next page',exact:true});if(await next.isDisabled()){saved.complete=true;writeFileSync(output,JSON.stringify(saved,null,2));break;}
  const nextNumber=number+1;
  if(number===1){await next.click();await page.waitForURL(url=>url.searchParams.get('page')==='2');}
  else {const nextUrl=new URL(page.url());nextUrl.searchParams.set('page',String(nextNumber));await page.goto(nextUrl.href);}
  // Only the public gallery URL/query observed from its own pagination is reused.
  await page.reload();await page.locator('a[href^="/bioart/"]').first().waitFor();
 }
}finally{await browser.close();}
