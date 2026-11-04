import{analyzeArrows}from'./arrow-layout.ts';
import{contentMetrics,decorativeBackground}from'./artboard.ts';
import {bounds,isLocked,world} from '../core/model.ts';
import type {FigureDocument,Operation} from '../core/model.ts';
import type {Box,Measurement} from './figure-renderer.ts';
export type LayoutIssue={code:string;objectIds:string[];message:string;severity:'warning'|'error'};
const union=(boxes:Box[]):Box=>{const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));return{x,y,width:Math.max(...boxes.map(b=>b.x+b.width))-x,height:Math.max(...boxes.map(b=>b.y+b.height))-y};};
function contrast(a:string,b:string){function luminance(color:string){if(!/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(color))return null;const c=color.length===4?color.slice(1).split('').map(v=>v+v).join(''):color.slice(1);return [0,.2126,.7152,.0722].slice(1).reduce((sum,weight,i)=>{const v=parseInt(c.slice(i*2,i*2+2),16)/255;return sum+weight*(v<=.04045?v/12.92:((v+.055)/1.055)**2.4);},0);}const x=luminance(a),y=luminance(b);return x===null||y===null?null:(Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
export function analyzeLayout(doc:FigureDocument,measurements:Measurement[],options:{margin:number;minFontSize:number;clearance?:number}){
 const native=new Map(measurements.map(m=>[m.id,m])),boxes=new Map<string,Box>(),issues:LayoutIssue[]=[],proposals=new Map<string,Operation>();let issueCount=0;
 const warn=(issue:LayoutIssue)=>{issueCount++;if(issues.length<250)issues.push(issue);};
 const visible=(id:string):boolean=>{const n=doc.nodes[id];return n.visible && n.style.opacity>0 && (!n.parentId||visible(n.parentId));};
 function box(id:string):Box{if(boxes.has(id))return boxes.get(id)!;const n=doc.nodes[id];const children=n.children.filter(visible);const b=n.type==='group'&&children.length?union(children.map(box)):n.type==='icon'?bounds(doc,id):native.get(id)?.world || bounds(doc,id);boxes.set(id,b);return b;}
 const visibleNodes=Object.values(doc.nodes).filter(n=>visible(n.id));
 for(const n of visibleNodes){box(n.id);if(n.type!=='text')continue;const m=native.get(n.id),matrix=world(doc,n.id),fontScale=Math.min(Math.hypot(matrix[0],matrix[1]),Math.hypot(matrix[2],matrix[3]));
  if(n.style.fontSize*fontScale<options.minFontSize)warn({code:'small_text',objectIds:[n.id],severity:'warning',message:`Text is ${(n.style.fontSize*fontScale).toFixed(1)} document pixels; minimum requested ${options.minFontSize}.`});
  if(m && (m.local.x+m.local.width>n.width+1 || m.local.y+m.local.height>n.height+1)){
   warn({code:'text_overflow',objectIds:[n.id],severity:'warning',message:'Browser-measured glyphs extend beyond the declared text box.'});
   const ratio=Math.min(1,n.width/Math.max(1,m.local.x+m.local.width),n.height/Math.max(1,m.local.y+m.local.height)),size=Math.floor(n.style.fontSize*ratio*.98*10)/10;
   if(size>=6 && size*fontScale>=options.minFontSize && !isLocked(doc,n.id))proposals.set(n.id,{type:'update',id:n.id,patch:{style:{fontSize:size}}});
  }
  const c=contrast(n.style.fill,doc.background);if(c!==null&&c<(n.style.fontSize*fontScale>=18?3:4.5))warn({code:'possible_low_contrast',objectIds:[n.id],severity:'warning',message:`Text/document-background contrast is ${c.toFixed(2)}:1; intervening objects and alpha are not assessed.`});
 }
 const arrowNodes=visibleNodes.filter(n=>n.type==='arrow'),linkedRoots=new Set<string>();
 const ambiguousArrows=arrowNodes.some(n=>!n.relationship||!doc.nodes[n.relationship.sourceId]||!doc.nodes[n.relationship.targetId]||n.relationship.labelIds===undefined);
 for(const a of arrowNodes){for(const key of [a.id,a.relationship?.sourceId,a.relationship?.targetId,...(a.relationship?.labelIds||[])]){let n=key?doc.nodes[key]:undefined;while(n){linkedRoots.add(n.id);n=n.parentId?doc.nodes[n.parentId]:undefined;}}}
 for(const id of doc.roots.filter(visible)){
  if(decorativeBackground(doc,id))continue;
  const n=doc.nodes[id],b=box(id),margin=options.margin;
  if(b.x<margin-.5||b.y<margin-.5||b.x+b.width>doc.width-margin+.5||b.y+b.height>doc.height-margin+.5){
   warn({code:'outside_canvas_margin',objectIds:[id],severity:'error',message:'Visible content extends beyond the requested canvas margin.'});
   function lockedSubtree(key:string):boolean{return isLocked(doc,key)||doc.nodes[key].children.some(lockedSubtree);}
   if(!ambiguousArrows&&!linkedRoots.has(id)&&b.width<=doc.width-2*margin&&b.height<=doc.height-2*margin&&!lockedSubtree(id)){
    const dx=Math.max(margin,Math.min(b.x,doc.width-margin-b.width))-b.x,dy=Math.max(margin,Math.min(b.y,doc.height-margin-b.height))-b.y;
    const transform=[...n.transform] as typeof n.transform;transform[4]+=dx;transform[5]+=dy;
    const existing=proposals.get(id);proposals.set(id,{type:'update',id,patch:{...(existing?.type==='update'?existing.patch:{}),transform}});
   }
  }
 }
 const arrows=analyzeArrows(doc,visibleNodes,measurements,box,options.clearance??8,options.margin);
 for(const issue of arrows.issues)warn(issue);
 for(const op of arrows.corrections){if(op.type==='update'){const old=proposals.get(op.id);proposals.set(op.id,{...op,patch:{...(old?.type==='update'?old.patch:{}),...op.patch}});}}
 const whitespace=contentMetrics(doc,visibleNodes.map(n=>n.id),id=>{const b=box(id),n=doc.nodes[id],m=world(doc,id),pad=n.type==='text'?1:n.type==='icon'||n.style.stroke==='none'?0:n.style.strokeWidth*Math.hypot(...m.slice(0,4))/2;return{x:b.x-pad,y:b.y-pad,width:b.width+2*pad,height:b.height+2*pad};},options.margin);
 const leaves=visibleNodes.filter(n=>n.type!=='group'&&n.type!=='arrow'),compared=leaves.slice(0,500);
 for(let i=0;i<compared.length;i++)for(let j=i+1;j<compared.length;j++){
  const a=box(compared[i].id),b=box(compared[j].id),w=Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x),h=Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y);
  const contains=(a:Box,b:Box)=>a.x<=b.x&&a.y<=b.y&&a.x+a.width>=b.x+b.width&&a.y+a.height>=b.y+b.height;
  if(w>2&&h>2&&!contains(a,b)&&!contains(b,a))warn({code:'possible_overlap',objectIds:[compared[i].id,compared[j].id],severity:'warning',message:'Axis-aligned visible bounds overlap; this may be intentional. No automatic separation is performed.'});
 }
 // Do not apply a local font correction and move one of its ancestors based on
 // the old glyph bounds in the same pass; measure the font change first.
 for(const id of [...proposals.keys()]){let p=doc.nodes[id].parentId;while(p){if(proposals.has(p))proposals.delete(p);p=doc.nodes[p].parentId;}}
 return {documentId:doc.id,revision:doc.revision,method:'Chromium glyph measurements plus document viewport geometry',measuredObjects:measurements.length,visibleObjects:visibleNodes.length,whitespace,arrowCheckComplete:arrows.complete,intentionalArrowLabels:arrows.intentionalContacts,issueCount,issues,truncatedIssues:issueCount>issues.length,overlapCheckComplete:leaves.length<=500,corrections:[...proposals.values()].slice(0,500),limitations:['Not a scientific or semantic image assessment.','Bounds are axis-aligned; intentional overlap, clipping and alpha can affect diagnostics.','Icon bounds use the preserved SVG viewport; internal SVG paths are not individually diagnosed.','Contrast compares opaque text hex colors with the document background only.','Arrow contacts use transformed shaft/head polygons and conservative object bounds; unknown relationships are not inferred.','Overlap comparisons are limited to 500 visible non-arrow leaves; diagnostics to 250 issues.']};
}
