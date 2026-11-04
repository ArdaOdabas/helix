import {arrowLocalGeometry} from './arrow-geometry.ts';
import { applySvgPalette, editSvgElements } from './svg-elements.ts';
import type { FigureDocument, FigureNode } from './model.ts';
import type { IconAsset } from './icons.ts';
export const escapeXml = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));
export function renderNode(n: FigureNode, resolveIcon: (id: string) => IconAsset, options: {editable?:boolean;selectedKey?:string} = {}): string {
    const s = n.style, w = n.width, h = n.height, attrs = `fill="${s.fill}" stroke="${s.stroke}" stroke-width="${s.strokeWidth}"`;
    if (n.type === 'group')
        return '';
    if (n.type === 'icon') {
        const a = resolveIcon(n.iconId!);
        const recolored = applySvgPalette(a.svg,n.colorMap);
        const styled = n.elementStyles || options.editable ? editSvgElements(recolored,n.elementStyles,options.editable,options.selectedKey).svg : recolored;
        const svg = styled.replace(/\bid="([^"]+)"/g, (_, id) => `id="${n.id}-${id}"`).replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${n.id}-${id})`).replace(/\bhref="#([^"]+)"/g, (_, id) => `href="#${n.id}-${id}"`).replace(/\b(aria-labelledby|aria-describedby)="([^"]+)"/g,(_,attr,ids)=>`${attr}="${ids.trim().split(/\s+/).map((id:string)=>n.id+'-'+id).join(' ')}"`).replace('<svg ', `<svg width="${w}" height="${h}" `);
        const attributions = a.sourceAttributions?.length ? a.sourceAttributions : a.attribution ? [{name:a.name,provider:a.provider,author:a.author,authorReference:a.authorReference,attribution:a.attribution,license:a.license,licenseReference:a.licenseReference,licenseUrl:a.licenseUrl,sourceUrl:a.sourceUrl}] : [];
        const metadata = !options.editable && attributions.length ? `<metadata>${escapeXml(JSON.stringify({assetId:a.id,attributions,modifications:{palette: n.colorMap || {},elements:n.elementStyles || {}},normalization:'Sanitized vector SVG; non-rendering editor metadata removed; safe inline styles normalized.'}))}</metadata>` : '';
        return `<g color="${s.fill}">${metadata}${svg}</g>`;
    }
    if (n.type === 'text')
        return `<text x="0" y="${s.fontSize}" fill="${s.fill}" font-family="Arial, Helvetica, sans-serif" font-size="${s.fontSize}">${(n.text ?? '').split('\n').map((line, i) => `<tspan x="0" dy="${i ? s.fontSize * 1.3 : 0}">${escapeXml(line)}</tspan>`).join('')}</text>`;
    if (n.type === 'arrow') {
        const {head}=arrowLocalGeometry(w,h);
        return `<path d="M0 ${h / 2} H${w - head}" fill="none" stroke="${s.stroke}" stroke-width="${s.strokeWidth}"/><path d="M${w - head} ${h / 2 - head / 2} L${w} ${h / 2} L${w - head} ${h / 2 + head / 2} Z" fill="${s.stroke}"/>`;
    }
    if (n.shape === 'ellipse')
        return `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" ${attrs}/>`;
    return `<rect width="${w}" height="${h}" rx="${n.shape === 'roundrect' ? Math.min(w, h) * .12 : 0}" ${attrs}/>`;
}
export function exportSvg(d: FigureDocument, resolveIcon: (id: string) => IconAsset) { function node(id: string): string { const n = d.nodes[id]; if (!n.visible)
    return ''; return `<g data-object-id="${n.id}" transform="matrix(${n.transform.join(' ')})" opacity="${n.style.opacity}">${n.type === 'group' ? n.children.map(node).join('') : renderNode(n, resolveIcon)}</g>`; } return `<svg xmlns="http://www.w3.org/2000/svg" width="${d.width}" height="${d.height}" viewBox="0 0 ${d.width} ${d.height}"><title>${escapeXml(d.title)}</title><rect width="100%" height="100%" fill="${d.background}"/>${d.roots.map(node).join('')}</svg>`; }
