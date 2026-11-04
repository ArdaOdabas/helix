import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {request,download,atomicJson,AccessStopped} from '../src/assets/acquire.ts';
const root=resolve('data/collections/reactome');mkdirSync(root,{recursive:true});
const checkpoint=join(root,'checkpoint.json'),state:any=existsSync(checkpoint)?JSON.parse(readFileSync(checkpoint,'utf8')):{records:{},pages:{},downloads:{}};
const decode=(s:string)=>s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#0?39;|&apos;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)));
const home=await(await request('https://reactome.org/icon-lib')).text();atomicJson(join(root,'source.json'),{sourceUrl:'https://reactome.org/icon-lib',license:'CC-BY-4.0',licenseReference:'https://reactome.org/icon-lib',attribution:'Reactome Icon Library — CSHL, OICR and EBI; CC BY 4.0',bulkDownload:'https://reactome.org/icon/icon-lib-svg.tgz',bulkStatus:'404 observed; using official individual links'});
const categories=[...new Set([...home.matchAll(/href="(\/icon-lib\/[^"?#]+)"/g)].map(m=>m[1]))];
for(const path of categories){let queue=[new URL(path,'https://reactome.org').href],visited=new Set<string>();
 while(queue.length){const url=queue.shift()!;if(visited.has(url))continue;visited.add(url);let html:string;
 const key=Buffer.from(url).toString('base64url'),cache=join(root,'pages',key+'.json');
 if(existsSync(cache))html=JSON.parse(readFileSync(cache,'utf8')).html;else{html=await(await request(url)).text();atomicJson(cache,{url,html});}
 for(const match of html.matchAll(/<img\s+[^>]*src="(\/icon\/([^"/]+)\.svg)"[^>]*alt="([^"]*)"/g)){const [,svg,id,title]=match;const category=path.split('/').pop()!.replaceAll('_',' ');state.records[id]={id,title:decode(title),category:state.records[id]?.category || category,categories:[...new Set([...(state.records[id]?.categories || []),category])],sourceUrl:'https://reactome.org/content/detail/'+id,downloadUrl:new URL(svg,'https://reactome.org').href};}
 // Follow all actually linked page numbers, including the last-page shortcut.
 const numbers=[...html.matchAll(/href="([^"<>]*\?page=(\d+))"/g)];for(const m of numbers){const target=new URL(decode(m[1]),url);if(target.origin==='https://reactome.org'&&decodeURIComponent(target.pathname).replace(/[ _]/g,'').toLowerCase()===decodeURIComponent(new URL(url).pathname).replace(/[ _]/g,'').toLowerCase()&&!visited.has(target.href))queue.push(target.href);}
 state.pages[url]=true;atomicJson(checkpoint,state);console.log('Reactome',path,'discovered',Object.keys(state.records).length);
 }
}
const records=Object.values(state.records) as any[];atomicJson(join(root,'inventory.json'),{provider:'Reactome',records,discovered:records.length});
let cursor=0,stopped=false,completed=0;
try{await Promise.all(Array.from({length:3},async()=>{while(!stopped){const r=records[cursor++];if(!r)return;try{const receipt=await download(r.downloadUrl,join(root,'svg',r.id+'.svg'));state.downloads[r.id]={status:'downloaded',...receipt};}catch(error){state.downloads[r.id]={status:'failed',error:(error as Error).message};if(error instanceof AccessStopped){stopped=true;throw error;}}if(++completed%50===0){atomicJson(checkpoint,state);console.log('Reactome downloaded',completed,'/',records.length);}}}));}finally{state.completed=!stopped;atomicJson(checkpoint,state);}
