import {existsSync,mkdirSync,readFileSync,writeFileSync,renameSync,statSync,createWriteStream} from 'node:fs';
import {dirname} from 'node:path';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createHash} from 'node:crypto';
export function atomicJson(path:string,value:unknown){mkdirSync(dirname(path),{recursive:true});writeFileSync(path+'.tmp',JSON.stringify(value,null,2));renameSync(path+'.tmp',path);}
export const sha256=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
export class AccessStopped extends Error{}
let next=0;
export async function request(url:string,options:RequestInit={},interval=250){
 for(let attempt=0;attempt<3;attempt++){
  const delay=Math.max(0,next-Date.now());next=Math.max(next,Date.now())+interval;if(delay)await new Promise(r=>setTimeout(r,delay));
  let response:Response;
  try{response=await fetch(url,{...options,signal:AbortSignal.timeout(60000),headers:{'User-Agent':'Helix scientific SVG library client (official API/download links)',...options.headers}});}catch(error){if(attempt===2)throw error;await new Promise(r=>setTimeout(r,1000*2**attempt));continue;}
  if([401,403,429].includes(response.status))throw new AccessStopped('Stopped on HTTP '+response.status+' at '+url+'; Retry-After: '+(response.headers.get('retry-after') || 'not specified'));
  if([408,500,502,503,504].includes(response.status)&&attempt<2){const retry=response.headers.get('retry-after');const ms=retry?Math.max(Number(retry)*1000 || Date.parse(retry)-Date.now(),1000*2**attempt):1000*2**attempt;if(ms>60000)throw new AccessStopped('Server requested long Retry-After at '+url);await response.body?.cancel();await new Promise(r=>setTimeout(r,ms));continue;}
  if(!response.ok)throw new Error('HTTP '+response.status+' at '+url);return response;
 }throw new Error('Request attempts exhausted');
}
export async function download(url:string,path:string){
 mkdirSync(dirname(path),{recursive:true});const receipt=path+'.download.json';
 if(existsSync(path)&&existsSync(receipt)){const r=JSON.parse(readFileSync(receipt,'utf8'));if(r.url===url&&r.sha256===sha256(path))return r;}
 const partial=path+'.part',partialMeta=partial+'.json';const previous=existsSync(partialMeta)?JSON.parse(readFileSync(partialMeta,'utf8')):undefined;
 const size=existsSync(partial)&&previous?.url===url?statSync(partial).size:0;
 const response=await request(url,{headers:size?{Range:'bytes='+size+'-',...(previous.etag?{'If-Range':previous.etag}:{})}:{}},new URL(url).hostname==='images.phylopic.org'?125:250);
 const append=size>0&&response.status===206;
 if(append&&!response.headers.get('content-range')?.startsWith('bytes '+size+'-'))throw new Error('Invalid resumable Content-Range');
 atomicJson(partialMeta,{url,etag:response.headers.get('etag')});if(!response.body)throw new Error('Empty response body');
 await pipeline(Readable.fromWeb(response.body as any),createWriteStream(partial,{flags:append?'a':'w'}));
 renameSync(partial,path);const result={url,sha256:sha256(path),bytes:statSync(path).size,downloadedAt:new Date().toISOString(),etag:response.headers.get('etag')};atomicJson(receipt,result);return result;
}
