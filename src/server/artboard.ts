import{bounds,world}from'../core/model.ts';
import type{FigureDocument}from'../core/model.ts';
import type{Box,Measurement}from'./figure-renderer.ts';
export function decorativeBackground(doc:FigureDocument,id:string){const n=doc.nodes[id],m=world(doc,id);return n.layoutRole==='decoration'&&n.type==='shape'&&n.shape!=='ellipse'&&!n.parentId&&m[0]===1&&m[1]===0&&m[2]===0&&m[3]===1&&m[4]===0&&m[5]===0&&Math.abs(n.width-doc.width)<.01&&Math.abs(n.height-doc.height)<.01;}
export function contentMetrics(doc:FigureDocument,nodes:string[],box:(id:string)=>Box,margin:number){
 const included=nodes.filter(id=>doc.nodes[id].type!=='group'&&!(doc.nodes[id].type==='shape'&&doc.nodes[id].layoutRole==='decoration'));
 if(!included.length)return{contentBounds:null,unusedMargins:{left:doc.width,right:doc.width,top:doc.height,bottom:doc.height},unusedCanvasPercentage:100,suggestedArtboard:null,excludedDecorations:nodes.filter(id=>!included.includes(id)&&doc.nodes[id].type!=='group'),whitespaceMayBeIntentional:true,estimate:'Area outside content bounding box, not a pixel occupancy measure.'};
 const bs=included.map(box),x=Math.min(...bs.map(b=>b.x)),y=Math.min(...bs.map(b=>b.y)),right=Math.max(...bs.map(b=>b.x+b.width)),bottom=Math.max(...bs.map(b=>b.y+b.height)),area=Math.max(0,Math.min(doc.width,right)-Math.max(0,x))*Math.max(0,Math.min(doc.height,bottom)-Math.max(0,y));
 const preserved=Object.values(doc.nodes).filter(n=>n.type!=='group'&&!decorativeBackground(doc,n.id)).map(n=>box(n.id)),safeRight=Math.max(right,...preserved.map(b=>b.x+b.width)),safeBottom=Math.max(bottom,...preserved.map(b=>b.y+b.height));
 return{contentBounds:{x,y,width:right-x,height:bottom-y},unusedMargins:{left:x,right:doc.width-right,top:y,bottom:doc.height-bottom},unusedCanvasPercentage:100*(1-area/(doc.width*doc.height)),suggestedArtboard:{width:Math.max(100,Math.ceil(safeRight+margin)),height:Math.max(100,Math.ceil(safeBottom+margin)),origin:'unchanged; left/top whitespace retained',withinDocumentLimits:safeRight+margin<=10000&&safeBottom+margin<=10000},excludedDecorations:nodes.filter(id=>doc.nodes[id].type!=='group'&&!included.includes(id)),whitespaceMayBeIntentional:true,estimate:'Area outside content bounding box, not a pixel occupancy measure.'};
}
// Resize only on explicit request. Conservative bounds include hidden objects,
// glyph overflow, stroke padding and attribution/footer text, regardless of role.
export function resizedDocument(doc:FigureDocument,size:{width:number;height:number},measurements:Measurement[],options:{preserveContent?:boolean;visibleOnly?:boolean}={}){
 const native=new Map(measurements.map(m=>[m.id,m]));const next=structuredClone(doc),preserve=options.preserveContent!==false;
 const visible=(id:string):boolean=>{const n=doc.nodes[id];return n.visible&&n.style.opacity>0&&(!n.parentId||visible(n.parentId));};
 for(const n of Object.values(doc.nodes)){
  if(options.visibleOnly&&!visible(n.id))continue;
  if(decorativeBackground(doc,n.id)){if(n.locked){if(preserve&&(size.width!==doc.width||size.height!==doc.height))throw Error('Resize would alter a locked decorative background. Unlock it explicitly first.');continue;}next.nodes[n.id].width=size.width;next.nodes[n.id].height=size.height;continue;}
  if(n.type==='group'||!preserve)continue;
  const b=n.type==='icon'?bounds(doc,n.id):native.get(n.id)?.world || bounds(doc,n.id),m=world(doc,n.id),pad=n.type==='text'?1:n.type==='icon'||n.style.stroke==='none'?0:n.style.strokeWidth*Math.hypot(...m.slice(0,4))/2;
  if(options.visibleOnly){
   // Preserve what is visible now. Already-clipped or off-canvas geometry
   // must not block an enlargement or count as newly cropped content.
   const left=Math.max(0,b.x-pad),top=Math.max(0,b.y-pad),right=Math.min(doc.width,b.x+b.width+pad),bottom=Math.min(doc.height,b.y+b.height+pad);
   if(right>left&&bottom>top&&(right>size.width+.01||bottom>size.height+.01))throw Error(`Artboard resize would crop visible content of object ${n.id} or its attribution. Use larger dimensions or explicitly set preserveContent=false.`);
   continue;
  }
  if(b.x-pad<-.01||b.y-pad<-.01||b.x+b.width+pad>size.width+.01||b.y+b.height+pad>size.height+.01)throw Error(`Artboard resize would crop object ${n.id} or its attribution. Move content explicitly before resizing.`);
 }
 next.width=size.width;next.height=size.height;return next;
}
