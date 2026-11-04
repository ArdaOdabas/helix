import {it} from 'vitest';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtempSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {download,request,AccessStopped,sha256} from '../src/assets/acquire.ts';
import {collectionNames} from '../src/assets/collection-names.ts';
it('keeps case/Unicode-colliding official filenames distinct and deterministic without losing originals',()=>{
 const records=[{filename:'Sample.svg',downloadUrl:'https://official.example/Sample.svg'},{filename:'sample.svg',downloadUrl:'https://official.example/sample.svg'},{filename:'normal.svg',downloadUrl:'https://official.example/normal.svg'}];const a=collectionNames(records);assert.notEqual(a[0].filename.toLowerCase(),a[1].filename.toLowerCase());assert.equal(a[2].filename,'normal.svg');assert.equal(a[0].originalFilename,'Sample.svg');assert.deepEqual(collectionNames(records.slice().reverse()).reverse(),a);assert.throws(()=>collectionNames([{filename:'../escape.svg',downloadUrl:'https://official.example/a.svg'}]));
});
it('resumes actual HTTP Range transfers, verifies receipts and repairs a corrupted cached download',async()=>{
 const body=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M0 0L20 20"/></svg>');let calls=0,range='';
 const server=createServer((req,res)=>{calls++;range=req.headers.range || '';assert.equal(req.headers['if-range'],calls===1?'"official-v1"':undefined);const start=Number(range.match(/bytes=(\d+)-/)?.[1] || 0);res.writeHead(start?206:200,{'Content-Type':'image/svg+xml','ETag':'"official-v1"',...(start?{'Content-Range':`bytes ${start}-${body.length-1}/${body.length}`}:{})});res.end(body.subarray(start));});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 const url='http://127.0.0.1:'+(server.address() as any).port+'/official.svg',root=mkdtempSync(join(tmpdir(),'helix-range-')),path=join(root,'official.svg');
 try{writeFileSync(path+'.part',body.subarray(0,12));writeFileSync(path+'.part.json',JSON.stringify({url,etag:'"official-v1"'}));const receipt=await download(url,path);assert.equal(range,'bytes=12-');assert.deepEqual(readFileSync(path),body);assert.equal(receipt.sha256,sha256(path));await download(url,path);assert.equal(calls,1);writeFileSync(path,'corrupted');await download(url,path);assert.equal(calls,2);assert.deepEqual(readFileSync(path),body);}finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
it('stops on access denial and rate limiting without retrying or bypassing restrictions',async()=>{
 let calls=0;const server=createServer((req,res)=>{calls++;res.writeHead(req.url==='/denied'?403:429,{'Retry-After':'60'});res.end('Stop');});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+(server.address() as any).port;
 try{await assert.rejects(request(base+'/denied',{},0),AccessStopped);assert.equal(calls,1);await assert.rejects(request(base+'/limited',{},0),AccessStopped);assert.equal(calls,2);}finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
});
