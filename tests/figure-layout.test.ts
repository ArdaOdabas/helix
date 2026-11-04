import {describe,it,expect} from 'vitest';
import {analyzeLayout} from '../src/server/figure-layout.ts';
import {createDocument,applyCommands,nodeSchema} from '../src/core/model.ts';
import {executeTool} from '../src/server/tools.ts';
import {Store} from '../src/server/store.ts';
import {Catalog} from '../src/assets/catalog.ts';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const options={margin:12,minFontSize:12};
const make=(objects:any[])=>applyCommands(createDocument('test','Isolated feedback',500,400),objects.map(o=>({type:'add',node:nodeSchema.parse({name:'Object',...o})})));
describe('measured layout diagnostics and conservative proposals',()=>{
 it('uses real glyph measurements to fit text and excludes hidden content',()=>{
  const d=make([{id:'label',type:'text',text:'Long title',width:100,height:50,transform:[1,0,0,1,50,50],style:{fontSize:20,fill:'#222222'}},{id:'hidden',type:'shape',visible:false,transform:[1,0,0,1,-100,-100]}]);
  const r=analyzeLayout(d,[{id:'label',local:{x:0,y:0,width:150,height:24},world:{x:50,y:50,width:150,height:24}}],options);
  expect(r.issues.map(i=>i.code)).toEqual(['text_overflow']);expect(r.corrections).toEqual([{type:'update',id:'label',patch:{style:{fontSize:13}}}]);expect(r.visibleObjects).toBe(1);
 });
 it('translates a fitting unlocked root, preserves its affine geometry and never moves locked descendants',()=>{
  let d=make([{id:'root',type:'group',transform:[1,0,0,1,0,0]},{id:'child',parentId:'root',type:'shape',width:100,height:80,transform:[1,0,0,1,-30,30]}]);
  const r=analyzeLayout(d,[],options);expect(r.corrections).toEqual([{type:'update',id:'root',patch:{transform:[1,0,0,1,42,0]}}]);
  d=applyCommands(d,[{type:'update',id:'child',patch:{locked:true}}]);expect(analyzeLayout(d,[],options).corrections).toEqual([]);
 });
 it('warns about possible overlap and small/low-contrast text without inventing semantic corrections',()=>{
  const d=make([{id:'a',type:'shape',width:100,height:80,transform:[1,0,0,1,30,30]},{id:'b',type:'text',text:'label',width:80,height:50,transform:[1,0,0,1,100,50],style:{fontSize:8,fill:'#eeeeee'}}]);
  const r=analyzeLayout(d,[],options);expect(r.issues.map(i=>i.code)).toEqual(expect.arrayContaining(['possible_overlap','small_text','possible_low_contrast']));expect(r.corrections).toEqual([]);
 });
 it('does not shrink labels below the minimum or pretend an oversized object fits',()=>{
  const d=make([{id:'big',type:'shape',width:900,height:500},{id:'text',type:'text',width:10,height:10,style:{fontSize:14}}]);const r=analyzeLayout(d,[{id:'text',local:{x:0,y:0,width:500,height:20},world:{x:0,y:0,width:500,height:20}}],options);expect(r.corrections).toEqual([]);expect(r.issueCount).toBeGreaterThan(0);
 });
 it('reuses viewport bounds for clipped icons rather than moving hidden source geometry',()=>{
  const d=make([{id:'icon',type:'icon',iconId:'mitochondrion',width:100,height:100,transform:[1,0,0,1,30,30]}]);const r=analyzeLayout(d,[{id:'icon',local:{x:-500,y:-500,width:2000,height:2000},world:{x:-500,y:-500,width:2000,height:2000}}],options);expect(r.issues).toEqual([]);expect(r.corrections).toEqual([]);
 });
 it('bounds overlap checks and explicitly reports incomplete coverage',()=>{
  const d=make(Array.from({length:501},(_,i)=>({id:'n'+i,type:'shape',width:5,height:5,transform:[1,0,0,1,20+i%50*8,20+Math.floor(i/50)*8]})));const r=analyzeLayout(d,[],options);expect(r.overlapCheckComplete).toBe(false);expect(r.visibleObjects).toBe(501);
 });
 it('validates new tool schemas and rejects stale revisions before launching a browser',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'helix-feedback-unit-')),store=new Store(dir),catalog=new Catalog(dir),doc=store.create('New',500,400);
  try{expect(()=>executeTool('refine_figure_layout',{documentId:doc.id,apply:true},store,catalog)).toThrow('expectedRevision');expect(()=>executeTool('render_figure',{documentId:doc.id,scale:100},store,catalog)).toThrow();expect(()=>executeTool('render_figure',{documentId:doc.id,expectedRevision:99},store,catalog)).toThrow('Revision conflict');expect(store.read(doc.id).document.revision).toBe(doc.revision);}finally{catalog.close();}
 });
});
