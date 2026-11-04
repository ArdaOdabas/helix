import {readFileSync,existsSync,mkdirSync,copyFileSync,statSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {collectionNames} from '../src/assets/collection-names.ts';
import {request,download,atomicJson,AccessStopped} from '../src/assets/acquire.ts';
const root=resolve('data/collections/togo');mkdirSync(root,{recursive:true});
const stateFile=join(root,'checkpoint.json'),state:any=existsSync(stateFile)?JSON.parse(readFileSync(stateFile,'utf8')):{downloads:{}};
const source='https://dbarchive.biosciencedbc.jp/data/togo-pic/image/';
await download(source+'20180926_togopic_masterfile.csv',join(root,'metadata.csv'));
const html=await(await request(source)).text();atomicJson(join(root,'directory.json'),{sourceUrl:source,html});
const originalRecords=[...new Set([...html.matchAll(/href="([^"/]+\.svg)"/gi)].map(m=>m[1]))].map(filename=>({id:decodeURIComponent(filename).replace(/\.svg$/i,''),filename:decodeURIComponent(filename),downloadUrl:new URL(filename,source).href}));
const records=collectionNames(originalRecords);
atomicJson(join(root,'inventory.json'),{provider:'Togo Picture Gallery',records,discovered:records.length,license:'CC-BY-4.0',licenseReference:'https://dbarchive.biosciencedbc.jp/data/togo-pic/LATEST/README_e.html',attribution:'© 2016 DBCLS TogoTV / CC-BY-4.0',archiveStatus:'svg_format.zip named in README but no archive link in current official download page or directory; using published individual SVG links'});
state.completed=false;atomicJson(stateFile,state);let cursor=0,stopped=false,count=0;
try{await Promise.all(Array.from({length:3},async()=>{while(!stopped){const r=records[cursor++];if(!r)return;try{const target=join(root,'svg',r.filename),original=join(root,'svg',(r as any).originalFilename);if(target!==original&&!existsSync(target)&&existsSync(original)&&existsSync(original+'.download.json')){const old=JSON.parse(readFileSync(original+'.download.json','utf8'));if(old.url===r.downloadUrl){copyFileSync(original,target);copyFileSync(original+'.download.json',target+'.download.json');}}
 const oversizedPartial=existsSync(target+'.part')&&statSync(target+'.part').size>2000000;
 if(!process.argv.includes('--download-oversize') && (oversizedPartial || !existsSync(target))){let size=oversizedPartial?statSync(target+'.part').size:0;if(!size){const head=await request(r.downloadUrl,{method:'HEAD'});size=Number(head.headers.get('content-length') || 0);}if(size>2000000){state.downloads[r.id]={status:'skipped-size',sourceUrl:r.downloadUrl,bytesObserved:size,reason:'Exceeds existing 2 MB SVG importer limit; original URL and partial transfer retained'};continue;}}
 const receipt=await download(r.downloadUrl,target);state.downloads[r.id]={status:'downloaded',...receipt};}catch(error){state.downloads[r.id]={status:'failed',error:(error as Error).message};if(error instanceof AccessStopped){stopped=true;throw error;}}if(++count%50===0){atomicJson(stateFile,state);console.log('Togo downloaded',count,'/',records.length);}}}));}finally{state.discovered=records.length;state.completed=!stopped;atomicJson(stateFile,state);}
