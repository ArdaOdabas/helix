import {DOMParser} from '@xmldom/xmldom';
import {createHash} from 'node:crypto';
export {scientificCategories} from '../core/scientific-categories.ts';
export const SCIENCE_PROFILE=1;
// A conservative exact-structure fingerprint. Ignore paint, metadata, author IDs,
// and non-rendering group wrappers; retain geometry, transforms and local references.
// This detects color-only variants, not arbitrary rotated/scaled/re-traced near duplicates.
export function geometryFingerprint(svg:string){
 const root=new DOMParser().parseFromString(svg,'image/svg+xml').documentElement;
 const ids=new Map<string,string>();let n=0;
 function collect(e:any){if(['metadata','title','desc','linearGradient','radialGradient','stop','style'].includes(e.localName))return;const id=e.getAttribute('id');if(id)ids.set(id,String(n++));for(const c of Array.from(e.childNodes) as any[])if(c.nodeType===1)collect(c);}collect(root);
 const numeric=(v:string)=>v.replace(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi,s=>String(Number(s))).replace(/[\s,]+/g,' ').trim();
 const attrs=['viewBox','d','points','transform','x','y','width','height','cx','cy','r','rx','ry','x1','x2','y1','y2','dx','dy','preserveAspectRatio','clipPathUnits','maskUnits','maskContentUnits','markerWidth','markerHeight','refX','refY','orient','font-family','font-size','font-weight','text-anchor','fill-rule','clip-rule'];
 function walk(e:any):any[]{if(['metadata','title','desc','linearGradient','radialGradient','stop','style'].includes(e.localName))return[];const values:any={};for(const a of attrs)if(e.hasAttribute(a))values[a]=numeric(e.getAttribute(a));for(const a of ['href','clip-path','mask','marker-start','marker-end','marker-mid'])if(e.hasAttribute(a))values[a]=e.getAttribute(a).replace(/#([^\)\s]+)/g,(_:string,id:string)=>'#'+(ids.get(id) || 'missing'));
 const children=(Array.from(e.childNodes) as any[]).flatMap(c=>c.nodeType===1?walk(c):['text','tspan'].includes(e.localName)&&c.nodeType===3?[c.data]:[]);
 if(['g','defs'].includes(e.localName)&&!Object.keys(values).length)return children;
 return [[e.localName,values,children]];}
 return createHash('sha256').update(JSON.stringify(walk(root))).digest('hex');
}
export function inferScientificCategory(meta:any){
 const text=[meta.name,meta.category,meta.description,meta.scientificName,...(meta.tags || []),...(meta.officialCategories || [])].join(' ').toLowerCase();
 const rules:[string,RegExp][]=[['Stem cells and development',/\bstem cell|pluripotent|embryo|\bipsc\b/],['Virology',/virus|viral|virion|bacteriophage/],['Immunology',/immune|immuno|antibody|lymph|leukoc|macrophage|neutrophil/],['Neuroscience',/neuron|neural|brain|nervous|astrocyte|synapse/],['Genetics and genomics',/\bdna\b|\brna\b|genom|gene\b|chromosom|plasmid|genetics/],['Proteins and receptors',/protein|receptor|transporter|enzyme|ribosom|kinase/],['Microbiology',/bacteri|microb|fung|parasite|mold/],['Cell biology',/\bcell|organelle|mitochond|membrane|nucle(us|i)|golgi|reticulum/],['Laboratory equipment',/equipment|pipet|microscop|flask|tube|syringe|plate|vial|beaker|lab apparatus|petri dish/],['Chemistry and compounds',/compound|chemical|chemistry|benzene|molecule|reaction|ligand|therapeutic|medication/],['Experimental methods',/method|technique|experiment|workflow|sequenc|assay|centrifug|machine learning|bioinformatics/],['Anatomy and physiology',/anatom|physiolog|tissue|organ\b|heart|lung|liver|human|blood|body/]];
 const categories:Record<string,string>={animals:'Organisms and taxonomy','plants algae':'Organisms and taxonomy',plants:'Organisms and taxonomy',arthropods:'Organisms and taxonomy','other organisms':'Organisms and taxonomy',mouse:'Organisms and taxonomy',rat:'Organisms and taxonomy',fish:'Organisms and taxonomy',bird:'Organisms and taxonomy',drosophila:'Organisms and taxonomy',people:'Anatomy and physiology',devices:'Laboratory equipment',diagnostics:'Experimental methods',specialties:'Anatomy and physiology',conditions:'Anatomy and physiology',nutrition:'Anatomy and physiology',contraceptives:'Anatomy and physiology',ppe:'Experimental methods',zoonoses:'Microbiology','intracellular components':'Cell biology',oncology:'Molecular biology'};
 if(meta.provider==='PhyloPic')return 'Organisms and taxonomy';return rules.find(([,re])=>re.test(text))?.[0] || categories[String(meta.category || '').toLowerCase()] || (meta.scientificName || meta.taxonomyIds?.length?'Organisms and taxonomy':'Unclassified');
}
export function assessScience(svg:string,meta:any){
 const root=new DOMParser().parseFromString(svg,'image/svg+xml').documentElement;let vectors=0,groups=0;
 function count(e:any,excluded=false){excluded ||= ['defs','symbol','clipPath','mask','marker'].includes(e.localName);if(!excluded){if(['path','rect','circle','ellipse','line','polyline','polygon'].includes(e.localName))vectors++;if(e.localName==='g')groups++;}for(const c of Array.from(e.childNodes) as any[])if(c.nodeType===1)count(c,excluded);}count(root);
 const quality=meta.provider==='PhyloPic'?'C':vectors>=20&&groups>=2?'A':vectors>=3?'B':'C';
 return {geometryHash:geometryFingerprint(svg),quality,scientificCategory:meta.scientificCategory || inferScientificCategory(meta),metadata:{profile:SCIENCE_PROFILE,method:'Structural heuristic; not scientific peer review',vectors,groups}};
}
