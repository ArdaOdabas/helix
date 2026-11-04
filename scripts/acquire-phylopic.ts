// Uses documented build-pinned image lists, embedded metadata and published vectorFile links.
import {existsSync,readFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {atomicJson,request,download,AccessStopped} from '../src/assets/acquire.ts';
const root=resolve('data/collections/phylopic');mkdirSync(root,{recursive:true});
const stateFile=join(root,'checkpoint.json'),state:any=existsSync(stateFile)?JSON.parse(readFileSync(stateFile,'utf8')):{pages:{},images:{},startedAt:new Date().toISOString()};
const rootResponse=await request('https://api.phylopic.org',{headers:{Accept:'application/vnd.phylopic.v2+json'}});const index=await rootResponse.json() as any;
if(state.build && state.build!==index.build)throw new Error('PhyloPic build changed; retain old files and explicitly start a new inventory.');state.build=index.build;
const list=await(await request('https://api.phylopic.org/images?build='+state.build)).json() as any;state.discovered=list.totalItems;state.totalPages=list.totalPages;atomicJson(stateFile,state);
const records:any[]=[];let pageCursor=0;
await Promise.all(Array.from({length:4},async()=>{while(true){const page=pageCursor++;if(page>=list.totalPages)return;
 const path=join(root,'pages',page+'.json');let value:any;
 if(existsSync(path))value=JSON.parse(readFileSync(path,'utf8'));else {const url=new URL(list._links.firstPage.href,'https://api.phylopic.org');url.searchParams.set('page',String(page));for(const key of ['embed_items','embed_nodes','embed_contributor','embed_specificNode'])url.searchParams.set(key,'true');value=await(await request(url.href)).json();atomicJson(path,value);}
 if(value.build!==state.build)throw new Error('Inconsistent build');records.push(...value._embedded.items);state.pages[page]=true;if(page%20===0){atomicJson(stateFile,state);console.log('PhyloPic metadata pages',page+1,'/',list.totalPages);}
}}));
records.sort((a,b)=>a.uuid.localeCompare(b.uuid));
atomicJson(join(root,'inventory.json'),{provider:'PhyloPic',build:state.build,discovered:list.totalItems,records});
let cursor=0,stopped=false;let completed=0;
try{await Promise.all(Array.from({length:4},async()=>{while(!stopped){const record=records[cursor++];if(!record)return;const id=record.uuid,license=record._links.license?.href;
 if(!license || !/^https?:\/\/(creativecommons.org|phylopic.org)\//.test(license)){state.images[id]={status:'license-review',license};continue;}
 if(/\/by(?:-[a-z]+)*-nd\//i.test(license)){state.images[id]={status:'skipped-license-no-derivatives',license};continue;}
 const url=record._links.vectorFile?.href;if(!url || new URL(url).hostname!=='images.phylopic.org'){state.images[id]={status:'no-svg'};continue;}
 try{const receipt=await download(url,join(root,'svg',id+'.svg'));state.images[id]={status:'downloaded',sha256:receipt.sha256,license,sourceUrl:record._links.self.href};}
 catch(error){state.images[id]={status:'failed',error:(error as Error).message};if(error instanceof AccessStopped){stopped=true;throw error;}}
 if(++completed%50===0){atomicJson(stateFile,state);console.log('PhyloPic SVG files',completed,'/',records.length);}
}}));}finally{state.completed=!stopped&&records.every(r=>state.images[r.uuid]);state.updatedAt=new Date().toISOString();atomicJson(stateFile,state);}
console.log(JSON.stringify({discovered:records.length,statuses:Object.values(state.images).reduce((a:any,r:any)=>(a[r.status]=(a[r.status]||0)+1,a),{})}));
