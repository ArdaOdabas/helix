// Render the authoritative vector export, never the editor DOM or UI overlays.
import {existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {exportSvg} from '../core/render.ts';
import type {FigureDocument} from '../core/model.ts';
import type {Catalog} from '../assets/catalog.ts';
export type Box={x:number;y:number;width:number;height:number};
export type Measurement={id:string;local:Box;world:Box};
export type FigureRender={documentId:string;revision:number;width:number;height:number;scale:number;requestedScale:number;actualScale:number;actualWidth:number;actualHeight:number;maxDimension:number;warnings:string[];svgSha256:string;image:{type:'image';mimeType:'image/png';data:string};measurements:Measurement[]};
let active=0;const waiting:Array<()=>void>=[];
const cache=new Map<string,FigureRender>();
export type RenderBackend=(svg:string,width:number,height:number)=>Promise<{png:Buffer;measurements:Measurement[]}>;
/** Hosts such as Helix.app replace the default Chrome/Playwright renderer with their own Chromium. */
let customBackend:RenderBackend|undefined;
export function setRenderBackend(backend:RenderBackend|undefined){customBackend=backend;cache.clear();}
export const renderPage='<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; img-src data:; font-src \'none\'; script-src \'none\'"><style>html,body{margin:0;padding:0;overflow:hidden}body>svg{display:block;width:100vw;height:100vh}</style>';
/** Runs inside the page; must stay self-contained so hosts can serialize it. */
export async function measureRenderedPage():Promise<Measurement[]>{
 await document.fonts.ready;await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
 const root=document.querySelector('body>svg') as SVGSVGElement,rootInverse=root.getScreenCTM()!.inverse();
 return Array.from(root.querySelectorAll<SVGGraphicsElement>('[data-object-id]')).map(el=>{
  const b=el.getBBox(),m=rootInverse.multiply(el.getScreenCTM()!),points=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(m));
  const x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y));
  return {id:el.getAttribute('data-object-id')!,local:{x:b.x,y:b.y,width:b.width,height:b.height},world:{x,y,width:Math.max(...points.map(p=>p.x))-x,height:Math.max(...points.map(p=>p.y))-y}};
 });
}
const playwrightBackend:RenderBackend=async(svg,width,height)=>{
 const executablePath=browserExecutable(),{chromium}=await import('playwright-core');
 const browser=await chromium.launch({executablePath,headless:true,timeout:15000});
 try{
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:1,serviceWorkers:'block'});
  await context.route('**/*',route=>route.abort());
  const page=await context.newPage();page.setDefaultTimeout(15000);
  await page.setContent(renderPage+svg,{waitUntil:'load',timeout:15000});
  const measurements=await page.evaluate(measureRenderedPage);
  const png=await page.screenshot({type:'png',animations:'disabled',timeout:15000});
  return {png,measurements};
 }finally{await browser.close();}
};
const activeBackend:RenderBackend=(svg,width,height)=>(customBackend??playwrightBackend)(svg,width,height);
export function browserExecutable(){if(customBackend)return 'helix-host-renderer';const executable=process.env.CHROME_PATH || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/usr/bin/google-chrome','/usr/bin/chromium','/usr/bin/chromium-browser'].find(existsSync);if(!executable || !existsSync(executable))throw Error('PNG rendering requires installed Chrome/Chromium. Set CHROME_PATH to its executable. No browser is downloaded automatically.');return executable;}
export async function renderFigure(doc:FigureDocument,catalog:Catalog,scale=1,strictScale=false):Promise<FigureRender>{
 if(Object.keys(doc.nodes).length>2000)throw Error('Visual feedback limit: 2000 document objects. Vector export remains available.');
 const svg=exportSvg(doc,id=>({...catalog.get(id),sourceAttributions:catalog.attributions(id)}));
 if(Buffer.byteLength(svg)>12000000)throw Error('Visual feedback limit: 12 MB SVG and 2000 document objects. Vector export remains available.');
 const maxDimension=2048,factor=Math.min(scale,maxDimension/doc.width,maxDimension/doc.height);
 if(strictScale&&factor<scale-1e-10)throw Error(`Requested scale ${scale} exceeds maxDimension ${maxDimension}; maximum achievable scale is ${factor}.`);
 const warnings=factor<scale-1e-10?[`PNG scale capped from ${scale} to ${factor} by maxDimension ${maxDimension}.`]:[];
 const width=Math.max(1,Math.round(doc.width*factor)),height=Math.max(1,Math.round(doc.height*factor));
 if(Math.abs(width-doc.width*factor)>1e-6||Math.abs(height-doc.height*factor)>1e-6){if(strictScale)throw Error('Requested scale requires fractional PNG dimensions; use a scale producing integer dimensions or disable strictScale.');warnings.push('PNG dimensions rounded to integer pixels; actualWidth/actualHeight are authoritative.');}
 const svgSha256=createHash('sha256').update(svg).digest('hex'),key=[doc.id,doc.revision,svgSha256,width,height,scale].join(':');
 const saved=cache.get(key);if(saved){cache.delete(key);cache.set(key,saved);return structuredClone(saved);}
 browserExecutable();
 if(active>=2){if(waiting.length>=6)throw Error('Renderer busy; retry after the current renders finish.');await new Promise<void>((resolve,reject)=>{const wake=()=>{clearTimeout(timer);resolve();};const timer=setTimeout(()=>{waiting.splice(waiting.indexOf(wake),1);reject(Error('Renderer queue timed out; retry later.'));},15000);waiting.push(wake);});}else active++;
 try{
  const {png,measurements}=await activeBackend(svg,width,height);
  if(png.length>4000000)throw Error('PNG exceeds MCP image size budget; retry with a smaller scale.');
  const result:FigureRender={documentId:doc.id,revision:doc.revision,width,height,scale:factor,requestedScale:scale,actualScale:factor,actualWidth:width,actualHeight:height,maxDimension,warnings,svgSha256,image:{type:'image',mimeType:'image/png',data:png.toString('base64')},measurements};
  cache.set(key,result);while(cache.size>4)cache.delete(cache.keys().next().value!);return structuredClone(result);
 }finally{const next=waiting.shift();if(next)next();else active--;}
}
/** Rasterize an arbitrary standalone SVG (used by the figure engine). Width/height are output pixels; the SVG scales to fill them. */
export async function rasterizeSvg(svg:string,width:number,height:number):Promise<{png:Buffer;measurements:Measurement[]}>{
 width=Math.max(1,Math.round(width));height=Math.max(1,Math.round(height));
 if(active>=2){if(waiting.length>=6)throw Error('Renderer busy; retry after the current renders finish.');await new Promise<void>((resolve,reject)=>{const wake=()=>{clearTimeout(timer);resolve();};const timer=setTimeout(()=>{waiting.splice(waiting.indexOf(wake),1);reject(Error('Renderer queue timed out; retry later.'));},30000);waiting.push(wake);});}else active++;
 try{return await activeBackend(svg,width,height);}finally{const next=waiting.shift();if(next)next();else active--;}
}
