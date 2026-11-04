import{applyCommands}from'../core/model.ts';
import{resizedDocument}from'./artboard.ts';
import type {Store} from './store.ts';
import type {Catalog} from '../assets/catalog.ts';
import {renderFigure} from './figure-renderer.ts';
import {analyzeLayout} from './figure-layout.ts';
export type FeedbackOptions={documentId:string;expectedRevision?:number;scale:number;margin:number;minFontSize:number;maxIterations:number;apply:boolean;clearance?:number;strictScale?:boolean;resizeArtboard?:{width:number;height:number}};
export async function inspectFigure(store:Store,catalog:Catalog,args:FeedbackOptions){
 let doc=store.read(args.documentId).document;store.check({document:doc,past:[],future:[]},args.expectedRevision);
 let rendered=await renderFigure(doc,catalog,args.scale,args.strictScale),analysis=analyzeLayout(doc,rendered.measurements,args);
 let resizeRequested=args.resizeArtboard;
 if(resizeRequested){if(!args.apply||args.expectedRevision===undefined)throw Error('Artboard resizing requires apply=true and expectedRevision.');resizedDocument(doc,resizeRequested,rendered.measurements);}
 let unsafe=false;
 const passes:Array<{beforeRevision:number;afterRevision:number;operations:typeof analysis.corrections;beforeIssues:number;afterIssues:number;artboard?:{width:number;height:number}}>=[];
 if(args.apply && args.expectedRevision===undefined)throw Error('Applying automated corrections requires expectedRevision.');
 for(let i=0;args.apply&&i<args.maxIterations&&(analysis.corrections.length||resizeRequested);i++){
  // A browser render is asynchronous. Never overwrite concurrent UI/MCP edits.
  const beforeRevision=doc.revision,beforeIssues=analysis.issueCount,operations=resizeRequested?[]:analysis.corrections;
  const original=doc,artboard=resizeRequested;
  let candidate=operations.length?applyCommands(doc,operations):structuredClone(doc);if(resizeRequested)candidate=resizedDocument(candidate,resizeRequested,rendered.measurements);
  const preview=await renderFigure(candidate,catalog,args.scale,args.strictScale),checked=analyzeLayout(candidate,preview.measurements,args);
  const known=new Set(analysis.issues.map(issue=>issue.code+':'+issue.objectIds.join('|')));
  if(!resizeRequested&&checked.issues.some(issue=>!known.has(issue.code+':'+issue.objectIds.join('|')) && issue.code!=='possible_low_contrast')){unsafe=true;break;}
  doc=resizeRequested?store.replace(doc.id,candidate,original.revision):store.mutate(doc.id,operations,original.revision);
  resizeRequested=undefined;
  try{rendered=await renderFigure(doc,catalog,args.scale,args.strictScale);}catch(e){throw Error(`Layout pass committed document ${doc.id} revision ${doc.revision}, but re-render failed: ${(e as Error).message}. The pass can be undone with undo; reload before further edits.`);}analysis=analyzeLayout(doc,rendered.measurements,args);
  passes.push({artboard,beforeRevision,afterRevision:doc.revision,operations,beforeIssues,afterIssues:analysis.issueCount});if(artboard)break;
 }
 return {document:doc,analysis,passes,stopReason:passes.some(p=>p.artboard)?'artboard_resized':unsafe?'unsafe_corrections_rejected':!args.apply?'inspection_only':!analysis.corrections.length?'no_safe_corrections':'iteration_limit',image:rendered.image,render:{documentId:doc.id,revision:doc.revision,width:rendered.width,height:rendered.height,requestedScale:rendered.requestedScale,actualScale:rendered.actualScale,actualWidth:rendered.actualWidth,actualHeight:rendered.actualHeight,maxDimension:rendered.maxDimension,warnings:rendered.warnings,svgSha256:rendered.svgSha256},snapshotCurrent:store.read(doc.id).document.revision===doc.revision};
}

// The standalone MCP tool uses the same geometry guard and Store.replace as
// refine_figure_layout's existing resize path, without invoking layout correction.
export async function resizeArtboard(store:Store,catalog:Catalog,args:{documentId:string;width:number;height:number;expectedRevision:number;preserveContent:boolean}){
 const doc=store.read(args.documentId).document;store.check({document:doc,past:[],future:[]},args.expectedRevision);
 if(doc.width===args.width&&doc.height===args.height)return doc;
 const measurements=args.preserveContent&&Object.keys(doc.nodes).length?(await renderFigure(doc,catalog,1)).measurements:[];
 const next=resizedDocument(doc,args,measurements,{preserveContent:args.preserveContent,visibleOnly:true});
 return store.replace(doc.id,next,doc.revision);
}
