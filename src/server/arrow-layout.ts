import{world,point,inverse,isLocked,multiply,identity}from'../core/model.ts';
import type{FigureDocument,FigureNode,Operation,Matrix}from'../core/model.ts';
import{arrowLocalGeometry}from'../core/arrow-geometry.ts';
import type{Box,Measurement}from'./figure-renderer.ts';
type P={x:number;y:number};
export type ArrowIssue={code:string;objectIds:string[];message:string;severity:'warning'|'error';relationship:string;uncertainty:string};
const distance=(a:P,b:P)=>Math.hypot(a.x-b.x,a.y-b.y);
const cross=(a:P,b:P,c:P)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function on(a:P,b:P,p:P){return Math.abs(cross(a,b,p))<1e-7&&p.x>=Math.min(a.x,b.x)-1e-7&&p.x<=Math.max(a.x,b.x)+1e-7&&p.y>=Math.min(a.y,b.y)-1e-7&&p.y<=Math.max(a.y,b.y)+1e-7;}
function intersects(a:P,b:P,c:P,d:P){return(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b);}
function pointSegment(p:P,a:P,b:P){const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));return distance(p,{x:a.x+t*dx,y:a.y+t*dy});}
function inside(p:P,poly:P[]){let result=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if(on(a,b,p))return true;if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)result=!result;}return result;}
function linePoly(a:P,b:P,poly:P[]){if(inside(a,poly)||inside(b,poly))return 0;let d=Infinity;for(let i=0;i<poly.length;i++){const c=poly[i],e=poly[(i+1)%poly.length];if(intersects(a,b,c,e))return 0;d=Math.min(d,pointSegment(a,c,e),pointSegment(b,c,e),pointSegment(c,a,b),pointSegment(e,a,b));}return d;}
export function polygonDistance(a:P[],b:P[]){if(a.some(p=>inside(p,b))||b.some(p=>inside(p,a)))return 0;return Math.min(...a.map((p,i)=>linePoly(p,a[(i+1)%a.length],b)));}
const rect=(b:Box)=>[{x:b.x,y:b.y},{x:b.x+b.width,y:b.y},{x:b.x+b.width,y:b.y+b.height},{x:b.x,y:b.y+b.height}];
const maxScale=(m:Matrix)=>{const s=m[0]**2+m[1]**2+m[2]**2+m[3]**2,d=m[0]*m[3]-m[1]*m[2];return Math.sqrt((s+Math.sqrt(Math.max(0,s*s-4*d*d)))/2);};
export function arrowShape(doc:FigureDocument,n:FigureNode,m:Matrix=world(doc,n.id)){const local=arrowLocalGeometry(n.width,n.height);return{start:point(m,local.start.x,local.start.y),end:point(m,local.shaftEnd.x,local.shaftEnd.y),tip:point(m,local.tip.x,local.tip.y),head:local.headPoints.map(p=>point(m,p.x,p.y)),radius:n.style.strokeWidth*maxScale(m)/2};}
export function analyzeArrows(doc:FigureDocument,nodes:FigureNode[],measurements:Measurement[],box:(id:string)=>Box,clearance:number,margin:number){
 const native=new Map(measurements.map(m=>[m.id,m])),arrows=nodes.filter(n=>n.type==='arrow'&&n.style.stroke!=='none'),leaves=nodes.filter(n=>n.type!=='arrow'&&n.type!=='group'&&n.layoutRole!=='decoration');
 const polygons=new Map<string,P[]>(),shapes=new Map(arrows.map(a=>[a.id,arrowShape(doc,a)]));
 const issues:ArrowIssue[]=[],intentionalContacts:any[]=[],corrections=new Map<string,Operation>();
 function polygon(n:FigureNode){if(polygons.has(n.id))return polygons.get(n.id)!;const b=n.type==='text'?native.get(n.id)?.local:undefined;const result=n.type==='group'?rect(box(n.id)):rect(b||{x:0,y:0,width:n.width,height:n.height}).map(p=>point(world(doc,n.id),p.x,p.y));polygons.set(n.id,result);return result;}
 function belongs(id:string,root:string){let n:FigureNode|undefined=doc.nodes[id];while(n){if(n.id===root)return true;n=n.parentId?doc.nodes[n.parentId]:undefined;}return false;}
 function validRelationship(a:FigureNode){const r=a.relationship;return !!r&&r.sourceId!==r.targetId&&!!doc.nodes[r.sourceId]&&!!doc.nodes[r.targetId]&&doc.nodes[r.sourceId].type!=='arrow'&&doc.nodes[r.targetId].type!=='arrow'&&(r.labelIds||[]).every(id=>doc.nodes[id]?.type==='text');}
 function relation(a:FigureNode,n:FigureNode){const r=a.relationship;if(r&&validRelationship(a)){if(r.labelIds?.includes(n.id))return'label';if(belongs(n.id,r.sourceId))return'source';if(belongs(n.id,r.targetId))return'target';if(n.type==='text'&&r.labelIds===undefined)return a.name!=='Relationship'&&a.name.trim()===n.text?.trim()?'inferred_label':'unknown';return'unrelated';}if(!r&&n.type==='text'&&a.name!=='Relationship'&&a.name.trim()===n.text?.trim())return'inferred_label';return'unknown';}
 const gap=(a:ReturnType<typeof arrowShape>,p:P[])=>({shaft:Math.max(0,linePoly(a.start,a.end,p)-a.radius),head:polygonDistance(a.head,p)});
 function moveLabel(a:FigureNode,n:FigureNode){if(corrections.has(n.id)||isLocked(doc,n.id))return;const shape=shapes.get(a.id)!,len=distance(shape.start,shape.tip),nx=-(shape.tip.y-shape.start.y)/len,ny=(shape.tip.x-shape.start.x)/len,poly=polygon(n);for(const amount of [clearance+8,clearance+20,clearance+36,clearance+48])for(const sign of [1,-1]){const dx=nx*amount*sign,dy=ny*amount*sign,candidate=poly.map(p=>({x:p.x+dx,y:p.y+dy}));if(candidate.some(p=>p.x<margin||p.y<margin||p.x>doc.width-margin||p.y>doc.height-margin))continue;
   if(arrows.some(other=>{const g=gap(shapes.get(other.id)!,candidate);return g.head<clearance+.25||g.shaft<clearance+.25;}))continue;
   if(leaves.some(other=>other.id!==n.id&&polygonDistance(candidate,polygon(other))<2))continue;
   const parent=n.parentId?inverse(world(doc,n.parentId)):[1,0,0,1,0,0] as Matrix,t=[...n.transform] as Matrix;t[4]+=parent[0]*dx+parent[2]*dy;t[5]+=parent[1]*dx+parent[3]*dy;corrections.set(n.id,{type:'update',id:n.id,patch:{transform:t}});return;
  }}
 for(const a of arrows.slice(0,200)){
  const shape=shapes.get(a.id)!,r=a.relationship;
  if(r&&!validRelationship(a))issues.push({code:'invalid_arrow_relationship',objectIds:[a.id],severity:'warning',relationship:'unknown',uncertainty:'Endpoint or label metadata is missing, self-referential or invalid.',message:'No endpoint correction is safe until relationship metadata is repaired.'});
  for(const n of leaves.slice(0,500)){
   const p=polygon(n),g=gap(shape,p),kind=relation(a,n),head=g.head<Math.max(.1,clearance-.1),shaft=g.shaft<Math.max(.1,clearance-.1);if(!head&&!shaft)continue;
   if((kind==='label'||kind==='inferred_label')&&!head){intentionalContacts.push({arrowId:a.id,labelId:n.id,relationship:kind,shaftClearance:g.shaft});continue;}
   const related=kind==='source'||kind==='target';const code=related?'arrow_endpoint_clearance':head?(n.type==='text'?'arrowhead_obscured':'arrowhead_contact'):g.shaft<=.1?(n.type==='text'?'text_arrow_overlap':n.type==='icon'?'arrow_icon_intersection':'arrow_object_intersection'):'arrow_insufficient_clearance';
   issues.push({code,objectIds:[a.id,n.id],severity:'warning',relationship:kind,uncertainty:n.type==='icon'?'Conservative transformed SVG viewport; internal scientific paths may not occupy the whole area.':n.type==='text'?'Transformed glyph bounds, not individual glyph outlines.':'Transformed object bounds; complex shapes may leave empty interior space.',message:`${code.replaceAll('_',' ')}: head clearance ${g.head.toFixed(1)}, shaft clearance ${g.shaft.toFixed(1)} px; requested ${clearance}. ${kind==='unknown'?'Relationship is unspecified; no automatic semantic inference.':''}`});
   if(n.type==='text'&&(kind==='label'||kind==='unrelated'&&n.parentId===null)&&!related)moveLabel(a,n);
  }
  // Only trim known endpoints on the same line. Never reroute across an unrelated
  // object or infer a biological source/target from proximity.
  if(!r||!validRelationship(a)||isLocked(doc,a.id))continue;
  const source=polygon(doc.nodes[r.sourceId]),target=polygon(doc.nodes[r.targetId]),length=distance(shape.start,shape.tip),worldPerLocal=length/a.width;
  const endpointGap=(candidate:FigureNode,p:P[])=>{const s=arrowShape(doc,candidate,multiply(a.parentId?world(doc,a.parentId):identity(),candidate.transform)),g=gap(s,p);return Math.min(g.head,g.shaft);};
  const make=(start:number,end:number)=>{const n=structuredClone(a);n.width-= (start+end)/worldPerLocal;n.transform[4]+=a.transform[0]*start/worldPerLocal;n.transform[5]+=a.transform[1]*start/worldPerLocal;return n;};
  let start=0,end=0;const limit=Math.min(60,length*.3);if(endpointGap(a,source)<clearance-.1){while(start<limit&&endpointGap(make(start,0),source)<clearance+.5)start+=1;}
  if(endpointGap(make(start,0),target)<clearance-.1){while(end<limit&&endpointGap(make(start,end),target)<clearance+.5)end+=1;}
  const candidate=make(start,end);if((start||end)&&candidate.width>=30&&endpointGap(candidate,source)>=clearance&&endpointGap(candidate,target)>=clearance){
   const changed=arrowShape(doc,candidate,multiply(a.parentId?world(doc,a.parentId):identity(),candidate.transform));
   if(!leaves.some(n=>relation(a,n)==='unrelated'&&Math.min(...Object.values(gap(changed,polygon(n)) ))<clearance))corrections.set(a.id,{type:'update',id:a.id,patch:{width:candidate.width,transform:candidate.transform}});
  }
 }
 return{issues,intentionalContacts,corrections:[...corrections.values()],complete:arrows.length<=200&&leaves.length<=500};
}
