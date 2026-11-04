import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import type { FigureNode } from './model.ts';

export interface SvgElementInfo {
    key: string;
    tag: 'path' | 'g' | 'rect' | 'circle' | 'ellipse' | 'line' | 'polyline' | 'polygon';
    id: string | null;
    elementId: string;
    editable: boolean;
    parentKey: string | null;
    transform: string | null;
    fill: string | null;
    stroke: string | null;
    strokeWidth: string | null;
    opacity: string | null;
}

export function applySvgPalette(svg: string, colorMap: FigureNode['colorMap']) {
    return svg.replace(/\b(fill|stroke|stop-color|color)="([^"]*)"/g, (full, attr, value) => {
        if (!colorMap || !Object.hasOwn(colorMap,value)) return full;
        const color = colorMap[value].replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!));
        return `${attr}="${color}"`;
    });
}

// Source must come from the sanitized catalog. Keys use element-child positions,
// including noneditable children, so IDs and geometry never need to be rewritten.
export function editSvgElements(svg: string, styles: FigureNode['elementStyles'] = {}, annotate = false, selectedKey?: string) {
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    if(!doc.documentElement) throw new Error('Missing SVG root');
    const root=doc.documentElement;
    const elements: SvgElementInfo[] = [];
    const definitions = new Set(['defs', 'symbol', 'clipPath', 'mask', 'marker', 'pattern']);
    function visit(el: any, key: string, parentKey: string | null, excluded: boolean) {
        excluded ||= definitions.has(el.localName);
        const editable = !excluded && ['path','g','rect','circle','ellipse','line','polyline','polygon'].includes(el.localName);
        if (editable) {
            const style = styles[key];
            for (const attr of ['fill', 'stroke','strokeWidth','opacity'] as const) {
                if (style?.[attr] !== undefined) el.setAttribute(attr==='strokeWidth'?'stroke-width':attr, String(style[attr]));
            }
            elements.push({key, tag: el.localName, id: el.getAttribute('id'),elementId:el.getAttribute('id') || '@svg:'+key,editable:true, parentKey,
                transform: el.getAttribute('transform'), fill: el.getAttribute('fill'), stroke: el.getAttribute('stroke'),strokeWidth:el.getAttribute('stroke-width'),opacity:el.getAttribute('opacity')});
            if (annotate) {
                el.setAttribute('data-svg-element-key', key);
                if (key === selectedKey) el.setAttribute('data-svg-selected', 'true');
            }
            parentKey = key;
        }
        let index = 0;
        for (const child of Array.from(el.childNodes) as any[]) {
            if (child.nodeType === 1) visit(child, key ? `${key}/${index++}` : String(index++), parentKey, excluded);
        }
    }
    visit(root, '', null, false);
    return {svg: new XMLSerializer().serializeToString(root), elements};
}

export type SvgElementChange = {elementId?:string;elementKey?:string;fill?:string|null;stroke?:string|null;strokeWidth?:number|null;opacity?:number|null};
export function updateSvgElementStyles(elements:SvgElementInfo[], current:FigureNode['elementStyles'], changes:SvgElementChange[]) {
    const styles=structuredClone(current || {});
    for(const change of changes) {
        const target=elements.find(e=>change.elementKey!==undefined ? e.key===change.elementKey : e.elementId===change.elementId || e.id===change.elementId);
        if(!target)throw new Error('Unknown or unsupported SVG element: '+(change.elementId || change.elementKey));
        const style={...styles[target.key]};
        for(const property of ['fill','stroke','strokeWidth','opacity'] as const) {
            if(change[property]===null)delete style[property];
            else if(change[property]!==undefined)(style as Record<string,string|number>)[property]=change[property]!;
        }
        if(Object.keys(style).length)styles[target.key]=style;
        else delete styles[target.key];
    }
    return styles;
}
