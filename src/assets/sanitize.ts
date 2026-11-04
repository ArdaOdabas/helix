import { normalizeSvgNamespaces, normalizeSimpleSvgCss, normalizeSvgWrappers } from './svg-normalize.ts';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
export const SVG_SANITIZER_PROFILE=7;
/**
 * Expands an internal general-entity subset and removes it.
 *
 * Exporters put constant string entities in the DOCTYPE (`<!ENTITY ns_svg "http://...">`) and then
 * use them in namespace declarations. Refusing those files costs a large part of several libraries,
 * so they are expanded here under rules that make expansion attacks impossible: the subset must be
 * internal (an external SYSTEM/PUBLIC identifier is still refused, so nothing is ever fetched), a
 * value may not itself contain an entity reference (no nesting, so no exponential growth), and both
 * the number of entities and the size after expansion are capped.
 */
export function expandInternalEntities(source:string){
    const doctype=source.match(/<!DOCTYPE[^>[]*\[([\s\S]*?)\]\s*>/i);
    if(!doctype)return source;
    const subset=doctype[1];
    if(/<!ENTITY\s+%/.test(subset))throw new Error('Parameter entities are not supported');
    if(/\b(SYSTEM|PUBLIC)\b/i.test(subset))throw new Error('External entities are not supported');
    if(/<!(?!ENTITY)/i.test(subset.trim()))throw new Error('Only entity declarations are supported in an internal subset');
    const entities=new Map<string,string>();
    for(const m of subset.matchAll(/<!ENTITY\s+([\w.:-]+)\s+(["'])([\s\S]*?)\2\s*>/g)){
        const [,name,,value]=m;
        if(entities.size>=200)throw new Error('Too many entity declarations');
        if(value.length>4096 || /[&<]/.test(value))throw new Error('Unsupported entity value');
        entities.set(name,value);
    }
    if(subset.replace(/<!ENTITY\s+[\w.:-]+\s+(["'])[\s\S]*?\1\s*>/g,'').trim())throw new Error('Unsupported internal subset content');
    let body=source.slice(doctype.index!+doctype[0].length);
    body=body.replace(/&([\w.:-]+);/g,(whole,name)=>{
        if(['amp','lt','gt','quot','apos'].includes(name))return whole;
        const value=entities.get(name);
        if(value===undefined)throw new Error('Undeclared entity: '+name);
        return value;
    });
    return source.slice(0,doctype.index!)+body;
}
export function normalizeSvgProlog(source:string){
    // Legacy Illustrator SVGs declare this fixed external DTD. Remove the declaration
    // before XML parsing; never fetch a DTD. An internal subset of constant entities is expanded.
    source=expandInternalEntities(source);
    if(/<!ENTITY/i.test(source))throw new Error('XML entities are not supported');
    return source.replace(/<!DOCTYPE\s+svg\s+PUBLIC\s+(["'])-\/\/W3C\/\/DTD SVG 1\.[01]\/\/EN\1\s+(["'])https?:\/\/www\.w3\.org\/Graphics\/SVG\/1\.[01]\/DTD\/svg1[01]\.dtd\2\s*>/gi,'').replace(/<!DOCTYPE\s+svg\s+PUBLIC\s+(["'])-\/\/W3C\/\/DTD SVG 20010904\/\/EN\1\s+(["'])https?:\/\/www\.w3\.org\/TR\/2001\/REC-SVG-20010904\/DTD\/svg10\.dtd\2\s*>/gi,'');
}
const tags = new Set(['svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'defs', 'linearGradient', 'radialGradient', 'stop', 'clipPath', 'title', 'desc', 'text', 'tspan', 'symbol', 'use', 'mask', 'marker']);
const attributes = new Set(['id', 'viewBox', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'd', 'points', 'transform', 'fill', 'stroke', 'stroke-width', 'fill-opacity', 'stroke-opacity', 'opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-miterlimit', 'fill-rule', 'clip-rule', 'clip-path', 'offset', 'stop-color', 'stop-opacity', 'gradientUnits', 'gradientTransform', 'spreadMethod', 'fx', 'fy', 'fr', 'font-size', 'font-family', 'font-weight', 'text-anchor', 'dominant-baseline', 'dx', 'dy', 'color', 'preserveAspectRatio', 'href', 'mask', 'maskUnits', 'maskContentUnits', 'marker-start', 'marker-mid', 'marker-end', 'markerWidth', 'markerHeight', 'refX', 'refY', 'orient', 'markerUnits', 'vector-effect', 'version', 'baseProfile', 'clipPathUnits', 'paint-order', 'shape-rendering', 'display', 'overflow', 'data-name', 'role', 'aria-label', 'aria-hidden', 'font-style', 'enable-background']);
const styleAttributes = new Set(['fill', 'stroke', 'stroke-width', 'fill-opacity', 'stroke-opacity', 'opacity', 'stroke-linecap', 'stroke-linejoin', 'fill-rule', 'clip-rule', 'stop-color', 'stop-opacity', 'font-size', 'font-weight', 'color', 'stroke-dasharray', 'stroke-dashoffset', 'stroke-miterlimit', 'font-family', 'font-style', 'text-anchor', 'dominant-baseline', 'display', 'overflow', 'vector-effect', 'paint-order', 'shape-rendering', 'enable-background', 'mask', 'clip-path', 'isolation', 'mix-blend-mode', 'mask-type']);
export function sanitizeSvg(source: string) {
    // Detailed illustrations legitimately exceed 2 MB. The complexity caps below (20,000 elements,
    // bounded attribute values, bounded reference expansion) are what actually limit the work done.
    if (Buffer.byteLength(source) > 6000000)
        throw new Error('SVG exceeds 6 MB limit');
    source=normalizeSvgProlog(source);
    if (/<!DOCTYPE|<!ENTITY|<\?/i.test(source.replace(/^\s*<\?xml[^?]*\?>/, '')))
        throw new Error('DTD, entities, and processing instructions are not supported');
    const problems: string[] = [];
    const document = new DOMParser({ onError: (level: string, message: string) => { problems.push(message); } } as never).parseFromString(source, 'image/svg+xml');
    if (problems.length || !document?.documentElement)
        throw new Error('Malformed SVG XML');
    let root = document.documentElement;
    if (root.localName !== 'svg' || root.namespaceURI !== 'http://www.w3.org/2000/svg')
        throw new Error('Expected SVG namespace and root');
    root=normalizeSvgNamespaces(document,root);
    let count = 0, vectorElements = 0;
    const elementIds=new Map<string,any>();
    const ids = new Set<string>();
    const refs: string[] = [];
    let title = '', description = '';
    const palette = new Set<string>();
    // Editors store a private, non-rendering copy of the artwork alongside the SVG (Illustrator's
    // PGF blocks, Inkscape's namedview). None of it draws anything, so it is removed with the rest
    // of the metadata rather than failing the file.
    const editorNamespaces = new Set(['http://www.inkscape.org/namespaces/inkscape','http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd',
        'http://ns.adobe.com/AdobeIllustrator/10.0/','http://ns.adobe.com/AdobeSVGViewerExtensions/3.0/','http://ns.adobe.com/ImageReplacement/1.0/',
        'http://ns.adobe.com/Graphs/1.0/','http://ns.adobe.com/Variables/1.0/','http://ns.adobe.com/SaveForWeb/1.0/','http://ns.adobe.com/Extensibility/1.0/',
        'http://ns.adobe.com/Flows/1.0/','http://ns.adobe.com/GenericCustomNamespace/1.0/','http://ns.adobe.com/XPath/1.0/']);
    const metadataNamespaces = new Set([...editorNamespaces,'http://purl.org/dc/elements/1.1/','http://www.w3.org/1999/02/22-rdf-syntax-ns#','http://creativecommons.org/ns#','http://web.resource.org/cc/']);
    function safeValue(v: string) { if (v.length > 500000 || /[<>\\\x00-\x08\x0b\x0c\x0e-\x1f]/.test(v) || /javascript:|data:|https?:|file:|expression\s*\(|@import|var\s*\(/i.test(v))
        throw new Error('Unsafe attribute value'); if (/url\s*\(/i.test(v)) {
        if (!/^url\(#[\p{L}_][\p{L}\p{N}_.:-]*\)$/u.test(v))
            throw new Error('Only local fragment references are supported');
        refs.push(v.slice(5, -1));
    } return v; }
    function walk(el: any, depth: number) {
        if (++count > 20000 || depth > 60)
            throw new Error('SVG complexity limit exceeded');
        if (!tags.has(el.localName) || el.namespaceURI !== 'http://www.w3.org/2000/svg')
            throw new Error(`Unsupported SVG element: ${el.localName}`);
        if (['path','rect','circle','ellipse','line','polyline','polygon','text','use'].includes(el.localName)) vectorElements++;
        const attrs = Array.from(el.attributes ?? []) as any[];
        for (const a of attrs) {
            if (a.name === 'xmlns') {
                if (el !== root || a.value !== 'http://www.w3.org/2000/svg')
                    throw new Error('Invalid namespace');
                continue;
            }
            if (a.name === 'xmlns:svg' && a.value === 'http://www.w3.org/2000/svg') continue;
            // Namespace prefixes are arbitrary. Keep xlink semantics by URI, not its spelling.
            // Adobe's declaration alone has no rendering effect; actual unknown Adobe
            // elements/attributes still fail the strict checks below.
            if(a.name.startsWith('xmlns:') && ['http://www.w3.org/1999/xlink','http://ns.adobe.com/AdobeIllustrator/10.0/'].includes(a.value)){el.removeAttribute(a.name);continue;}
            if (a.name.startsWith('xmlns:') && metadataNamespaces.has(a.value)) { el.removeAttribute(a.name); continue; }
            if (editorNamespaces.has(a.namespaceURI)) { el.removeAttribute(a.name); continue; }
            if (a.name === 'xml:space' && a.namespaceURI === 'http://www.w3.org/XML/1998/namespace') {
                if (!['default','preserve'].includes(a.value)) throw new Error('Invalid xml:space');
                continue;
            }
            if(a.name==='aria-labelledby' || a.name==='aria-describedby'){
                const labels=a.value.trim().split(/\s+/);if(!labels.length || labels.some((id:string)=>!/^[_\p{L}][\p{L}\p{N}_.:-]*$/u.test(id)))throw new Error('Invalid accessibility ID references');refs.push(...labels);continue;
            }
            if (a.name === 'style') {
                const retained:string[]=[];
                for (const decl of a.value.split(';').filter((v: string) => v.trim())) {
                    const i = decl.indexOf(':'), k = decl.slice(0, i).trim(), v = decl.slice(i + 1).trim();
                    // Cosmetic properties this renderer does not implement (line-height, font-variant,
                    // -inkscape-stroke, filter…) are dropped. Removing a declaration can only change
                    // appearance, never what the file is allowed to reach.
                    if (i < 0 || !styleAttributes.has(k)) continue;
                    if(k==='mask-type'){if(!['alpha','luminance'].includes(v))throw new Error('Unsupported SVG mask type');retained.push(k+':'+v);}
                    else if(k==='isolation' || k==='mix-blend-mode'){
                        const values=k==='isolation'?['auto','isolate']:['normal','multiply','screen','overlay','darken','lighten','color-dodge','color-burn','hard-light','soft-light','difference','exclusion','hue','saturation','color','luminosity'];
                        if(!values.includes(v))throw new Error('Unsupported SVG blend value');
                        retained.push(k+':'+v);
                    }else el.setAttribute(k, safeValue(v));
                }
                el.removeAttribute('style');
                if(retained.length)el.setAttribute('style',retained.join(';'));
                continue;
            }
            if (/^on/i.test(a.name)) { el.removeAttribute(a.name); continue; }
            if (a.name === 'href' || a.localName==='href' && a.namespaceURI==='http://www.w3.org/1999/xlink') { if (!/^#[\p{L}_][\p{L}\p{N}_.:-]*$/u.test(a.value)) throw new Error('Only local fragment references are supported'); refs.push(a.value.slice(1)); el.removeAttribute(a.name); el.setAttribute('href', a.value); continue; }
            if (a.name === 'xmlns:xlink' && a.value === 'http://www.w3.org/1999/xlink') { el.removeAttribute(a.name); continue; }
            // Editor bookkeeping (xmlns:serif, xmlns:psvg, typeof, about…) is dropped. Everything
            // that can execute or fetch is handled above: event handlers, href and url() references
            // are checked before this point, and unknown ELEMENTS are still rejected outright.
            if (a.namespaceURI || !attributes.has(a.name)) { el.removeAttribute(a.name); continue; }
            safeValue(a.value);
            if (a.name === 'id') {
                if (!/^[\p{L}_][\p{L}\p{N}_.:-]*$/u.test(a.value) || ids.has(a.value))
                    throw new Error('Invalid or duplicate SVG ID');
                ids.add(a.value); elementIds.set(a.value,el);
            }
        }
        for (const child of Array.from(el.childNodes) as any[]) {
            if (child.nodeType === 1 && ((child.localName === 'metadata' && (!child.namespaceURI || child.namespaceURI === 'http://www.w3.org/2000/svg')) || editorNamespaces.has(child.namespaceURI))) { el.removeChild(child); continue; }
            if (child.nodeType === 1 && child.localName === 'script') { el.removeChild(child); continue; }
            if (child.nodeType === 1)
                walk(child, depth + 1);
            else if (child.nodeType === 8)
                el.removeChild(child);
            else if (child.nodeType !== 3 && child.nodeType !== 4)
                throw new Error('Unsupported XML node');
        }
        for (const attr of ['fill', 'stroke', 'stop-color', 'color']) { const value = el.getAttribute(attr); if (value && !/^(none|url\()/i.test(value)) palette.add(value); }
        if (el.localName === 'title')
            title = (el.textContent ?? '').slice(0, 300);
        if (el.localName === 'desc')
            description = (el.textContent ?? '').slice(0, 2000);
    }
    normalizeSvgWrappers(root);
    normalizeSimpleSvgCss(root,styleAttributes,safeValue);
    walk(root, 0);
    for (const id of refs)
        if (!ids.has(id))
            throw new Error(`Unresolved SVG reference: ${id}`);
    // Reject recursive or explosively expanding local use graphs before rendering.
    let expanded=0;
    function expand(el:any, path:Set<any>, depth:number) {
        if(++expanded>100000 || depth>100 || path.has(el)) throw new Error('SVG reference complexity limit exceeded');
        const next=new Set(path);next.add(el);
        if(el.localName==='use') expand(elementIds.get(el.getAttribute('href').slice(1)),next,depth+1);
        for(const child of Array.from(el.childNodes) as any[]) if(child.nodeType===1) expand(child,next,depth+1);
    }
    for(const el of elementIds.values()) if(el.localName==='use' && !el.getAttribute('href')) throw new Error('use requires a local href');
    // Walk all nodes, including anonymous use elements.
    function checkUses(el:any) {if(el.localName==='use' && !el.getAttribute('href')) throw new Error('use requires a local href'); for(const c of Array.from(el.childNodes) as any[]) if(c.nodeType===1) checkUses(c);}
    checkUses(root); expand(root,new Set(),0);
    let vb = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    if (vb.length !== 4 || vb.some(v => !Number.isFinite(v)) || vb[2] <= 0 || vb[3] <= 0) {
        const w = Number(root.getAttribute('width')), h = Number(root.getAttribute('height'));
        if (!(w > 0 && h > 0))
            throw new Error('A positive viewBox or numeric dimensions are required');
        vb = [0, 0, w, h];
    }
    if (vb.some(v => Math.abs(v) > 100000))
        throw new Error('SVG dimensions exceed bounds');
    root.setAttribute('viewBox', vb.join(' '));
    root.removeAttribute('width');
    root.removeAttribute('height');
    return { svg: new XMLSerializer().serializeToString(root), viewBox: vb.join(' '), width: vb[2], height: vb[3], title, description, elements: count, vectorElements, palette: [...palette] };
}
