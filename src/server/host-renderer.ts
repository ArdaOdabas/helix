// Utility-process side of Helix.app rendering: PNG work is delegated to the Electron main process,
// which owns Chromium. Outside Electron this is a no-op and the Chrome/Playwright renderer is used.
import {randomUUID} from 'node:crypto';
import {setRenderBackend} from './figure-renderer.ts';
import type {Measurement} from './figure-renderer.ts';
type Reply={type:'render-result';id:string;png?:string;measurements?:Measurement[];error?:string};
export function installHostRenderer(){
 const port=(process as any).parentPort;
 if(!port)return false;
 const pending=new Map<string,{resolve:(r:Reply)=>void;timer:NodeJS.Timeout}>();
 port.on('message',(event:{data:Reply})=>{const r=event.data;if(r?.type!=='render-result')return;const p=pending.get(r.id);if(!p)return;pending.delete(r.id);clearTimeout(p.timer);p.resolve(r);});
 setRenderBackend((svg,width,height)=>new Promise((resolve,reject)=>{
  const id=randomUUID();
  const timer=setTimeout(()=>{pending.delete(id);reject(Error('Renderer timed out; retry later.'));},30000);
  pending.set(id,{timer,resolve:r=>r.error||!r.png?reject(Error(r.error||'Renderer returned no image')):resolve({png:Buffer.from(r.png,'base64'),measurements:r.measurements??[]})});
  port.postMessage({type:'render',id,svg,width,height});
 }));
 return true;
}
