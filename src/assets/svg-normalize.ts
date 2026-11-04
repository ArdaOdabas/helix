// Narrow, lossless normalization for exported SVG namespace aliases and simple class paint rules.
// No selector engine, external styles, stylesheet imports or script execution.
const SVG='http://www.w3.org/2000/svg';
export function normalizeSvgNamespaces(document:any,root:any) {
    function prefixed(el:any):boolean{return (el.namespaceURI===SVG && !!el.prefix) || Array.from(el.childNodes).some((n:any)=>n.nodeType===1 && prefixed(n));}
    if(!prefixed(root))return root;
    function copy(el:any):any {
        if(el.namespaceURI!==SVG)return el.cloneNode(true);
        const node=document.createElementNS(SVG,el.localName);
        for(const attr of Array.from(el.attributes) as any[]){
            if(attr.name.startsWith('xmlns:') && attr.value===SVG)continue;
            if(attr.namespaceURI)node.setAttributeNS(attr.namespaceURI,attr.name,attr.value);
            else node.setAttribute(attr.name,attr.value);
        }
        for(const child of Array.from(el.childNodes) as any[])node.appendChild(child.nodeType===1 ? copy(child) : child.cloneNode(true));
        return node;
    }
    const normalized=copy(root);normalized.setAttribute('xmlns',SVG);document.replaceChild(normalized,root);return normalized;
}
const RENDER_BLOCKING=new Set(['foreignObject','script','style','switch']);
/**
 * Unwraps presentational containers that carry no geometry of their own.
 *
 * `<switch>` is how exporters offer alternatives (a `foreignObject` for editors, a `<g>` for
 * renderers); the renderable branch is kept and the rest dropped. `<a>` is a link around artwork;
 * the artwork is kept and the link discarded. `<filter>` definitions are removed outright together
 * with the references to them, so a drop shadow is lost but the illustration survives — and no
 * filter primitive, some of which can pull in external images, is ever carried into the library.
 */
export function normalizeSvgWrappers(root:any){
    function visit(el:any,depth:number){
        if(depth>60)throw new Error('SVG complexity limit exceeded');
        for(const child of Array.from(el.childNodes) as any[]){
            if(child.nodeType!==1)continue;
            if(child.namespaceURI===SVG && child.localName==='filter'){el.removeChild(child);continue;}
            if(child.namespaceURI===SVG && child.localName==='switch'){
                const branches=(Array.from(child.childNodes) as any[]).filter(n=>n.nodeType===1);
                const chosen=branches.find(n=>n.namespaceURI===SVG && !RENDER_BLOCKING.has(n.localName)
                    && !n.hasAttribute('requiredExtensions') && !n.hasAttribute('requiredFeatures'));
                if(chosen){el.replaceChild(chosen,child);visit(chosen,depth+1);}
                else el.removeChild(child);
                continue;
            }
            if(child.namespaceURI===SVG && child.localName==='a'){
                for(const grand of Array.from(child.childNodes) as any[])el.insertBefore(grand,child);
                el.removeChild(child);continue;
            }
            visit(child,depth+1);
        }
    }
    visit(root,0);
    // References to the filters that were just removed would otherwise dangle.
    function stripFilterRefs(el:any){
        if(el.hasAttribute?.('filter'))el.removeAttribute('filter');
        for(const child of Array.from(el.childNodes) as any[])if(child.nodeType===1)stripFilterRefs(child);
    }
    stripFilterRefs(root);
}

export function normalizeSimpleSvgCss(root:any,allowed:Set<string>,safeValue:(value:string)=>string) {
    const elements:any[]=[],styles:any[]=[];
    function collect(el:any,depth=0){if(el.localName==='metadata')return;if(depth>60 || elements.length>=20000)throw new Error('SVG complexity limit exceeded');elements.push(el);if(el.localName==='style' && el.namespaceURI===SVG)styles.push(el);for(const child of Array.from(el.childNodes) as any[])if(child.nodeType===1)collect(child,depth+1);}
    collect(root);if(!styles.length)return;
    const rules:{classes:string[];declarations:[string,string][]}[]=[],known=new Set<string>();
    for(const style of styles){
        // A stylesheet limited to another medium must not be inlined for screen use; anything else
        // on the element (id, class, an empty or text/css type) has no effect and is ignored.
        let skip=false;
        for(const attr of Array.from(style.attributes) as any[]){
            if(attr.name==='type'){if(attr.value && attr.value!=='text/css')throw new Error('Unsupported SVG stylesheet type');continue;}
            if(attr.name==='media'){if(!/^\s*(all|screen)\s*$/i.test(attr.value))skip=true;continue;}
            if(['id','class'].includes(attr.name) || attr.namespaceURI)continue;
            throw new Error('Unsupported SVG stylesheet attribute: '+attr.name);
        }
        if(skip)continue;
        const css=style.textContent.replace(/\/\*[\s\S]*?\*\//g,'');
        const pattern=/([^{}]+)\{([^{}]*)\}/g;
        if(css.replace(pattern,'').trim())throw new Error('Unsupported SVG stylesheet syntax');
        for(const match of css.matchAll(pattern)){
            const classes=match[1].split(',').map((s:string)=>s.trim());
            if(classes.some((s:string)=>!/^\.[A-Za-z_][\w-]*$/.test(s)))throw new Error('Unsupported SVG CSS selector');
            const declarations:[string,string][]=[];
            for(const declaration of match[2].split(';').filter((s:string)=>s.trim())){
                const colon=declaration.indexOf(':'),property=declaration.slice(0,colon).trim(),value=declaration.slice(colon+1).trim();
                // Unimplemented cosmetic properties are dropped, as they are for inline styles.
                if(colon<0 || !value || !allowed.has(property))continue;
                declarations.push([property,safeValue(value.replace(/\s*!important\s*$/i,''))]);
            }
            if(rules.length>=2000)throw new Error('SVG CSS complexity limit exceeded');
            const names=classes.map((s:string)=>s.slice(1));names.forEach((s:string)=>known.add(s));rules.push({classes:names,declarations});
        }
    }
    const byClass=new Map<string,number[]>();rules.forEach((r,i)=>r.classes.forEach(c=>byClass.set(c,[...(byClass.get(c)||[]),i])));
    for(const el of elements){
        if(!el.hasAttribute('class'))continue;
        const classes=el.getAttribute('class').trim().split(/\s+/).filter(Boolean);
        if(classes.some((c:string)=>!known.has(c)))throw new Error('Unsupported SVG class without a resolved rule');
        const styleDeclarations:string[]=[];
        const applicable=[...new Set<number>(classes.flatMap((c:string)=>byClass.get(c) || []))].sort((a,b)=>a-b);
        for(const index of applicable)for(const [property,value]of rules[index].declarations){
            if(property==='isolation' || property==='mix-blend-mode' || property==='mask-type')styleDeclarations.push(property+':'+value);
            else el.setAttribute(property,value);
        }
        if(styleDeclarations.length)el.setAttribute('style',styleDeclarations.join(';')+';'+(el.getAttribute('style') || ''));
        el.removeAttribute('class');
    }
    for(const style of styles)style.parentNode.removeChild(style);
}
