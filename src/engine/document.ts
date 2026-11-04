// Turns a generated figure into an editable Helix document: every illustration, label, arrow and
// background piece becomes its own object (an SVG asset placed at its measured position), so the
// figure can be nudged, recoloured (Element Mode) or deleted piece by piece in the editor.
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { createHash, randomUUID } from 'node:crypto';
import { sanitizeSvg } from '../assets/sanitize.ts';

type M = [number, number, number, number, number, number];
const I: M = [1, 0, 0, 1, 0, 0];
const mul = (a: M, b: M): M => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];

export function parseTransform(t: string | null): M {
    if (!t) return I;
    let m = I;
    const re = /(matrix|translate|scale|rotate)\s*\(([^)]*)\)/g;
    let x: RegExpExecArray | null;
    while ((x = re.exec(t))) {
        const v = x[2].trim().split(/[\s,]+/).map(Number);
        let n: M = I;
        if (x[1] === 'matrix' && v.length === 6) n = v as M;
        else if (x[1] === 'translate') n = [1, 0, 0, 1, v[0] || 0, v[1] || 0];
        else if (x[1] === 'scale') n = [v[0], 0, 0, v.length > 1 ? v[1] : v[0], 0, 0];
        else if (x[1] === 'rotate') {
            const a = (v[0] || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
            n = [c, s, -s, c, 0, 0];
            if (v.length === 3) n = mul(mul([1, 0, 0, 1, v[1], v[2]], n), [1, 0, 0, 1, -v[1], -v[2]]);
        }
        m = mul(m, n);
    }
    return m;
}

export type Part = { id: string; kind: string; name: string; xml: string; matrix: M; refs: string[] };

/** Marks the outermost parts with data-object-id and returns the marked SVG plus part fragments. */
export function splitParts(svg: string): { marked: string; parts: Part[]; defs: Map<string, string>; width: number; height: number } {
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const root = doc.documentElement as any;
    const ser = new XMLSerializer();
    const defs = new Map<string, string>();
    const parts: Part[] = [];
    const vb = String(root.getAttribute('viewBox')).split(/\s+/).map(Number);
    const hasPart = (el: any): boolean => { for (let c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 1 && (c.getAttribute('data-part') || hasPart(c))) return true; return false; };
    let n = 0;
    const visit = (el: any, m: M) => {
        for (let c = el.firstChild; c; c = c.nextSibling) {
            if (c.nodeType !== 1) continue;
            if (c.localName === 'defs') { for (let d = c.firstChild; d; d = d.nextSibling) if (d.nodeType === 1 && d.getAttribute('id')) defs.set(d.getAttribute('id'), ser.serializeToString(d)); continue; }
            const isPart = !!c.getAttribute('data-part');
            if (isPart || !hasPart(c)) {
                // Skip the full-canvas background rectangle.
                if (c.localName === 'rect' && el === root && Number(c.getAttribute('width')) >= vb[2] - 1 && Number(c.getAttribute('height')) >= vb[3] - 1) continue;
                const id = 'p' + (++n);
                c.setAttribute('data-object-id', id);
                const kind = c.getAttribute('data-part') || 'background', name = c.getAttribute('data-name') || kind;
                const clone = c.cloneNode(true);
                stripData(clone);
                const xml = ser.serializeToString(clone);
                const refs = [...xml.matchAll(/url\(#([^)]+)\)|href="#([^"]+)"/g)].map(r => r[1] ?? r[2]);
                parts.push({ id, kind, name, xml, matrix: m, refs });
            } else visit(c, mul(m, parseTransform(c.getAttribute('transform'))));
        }
    };
    visit(root, I);
    return { marked: ser.serializeToString(doc), parts, defs, width: vb[2], height: vb[3] };
}

function stripData(el: any) {
    if (el.nodeType !== 1) return;
    for (const a of [...Array.from(el.attributes as ArrayLike<any>)]) {
        if (a.name.startsWith('data-') && a.name !== 'data-name') el.removeAttribute(a.name);
        // Attributes the library sanitizer does not accept; visually minor.
        if (a.name === 'letter-spacing' || a.name === 'baseline-shift' || a.name === 'xmlns:xlink') el.removeAttribute(a.name);
        if (a.name === 'xlink:href') { el.setAttribute('href', a.value); el.removeAttribute(a.name); }
    }
    for (let c = el.firstChild; c; c = c.nextSibling) stripData(c);
}

export type Box = { x: number; y: number; width: number; height: number };

/** Standalone SVG for one part, cropped to its measured world box. */
export function partSvg(p: Part, defs: Map<string, string>, box: Box, pad = 3) {
    const used = new Set<string>(); const queue = [...p.refs];
    while (queue.length) { const id = queue.pop()!; if (used.has(id) || !defs.has(id)) continue; used.add(id); for (const r of defs.get(id)!.matchAll(/href="#([^"]+)"/g)) queue.push(r[1]); }
    const x = box.x - pad, y = box.y - pad, w = box.width + 2 * pad, h = box.height + 2 * pad;
    const m = p.matrix.map(v => Math.round(v * 1e4) / 1e4).join(' ');
    const d = used.size ? `<defs>${[...used].map(id => defs.get(id)).join('')}</defs>` : '';
    const strip = (v: string) => v.replace(/ xmlns(:xlink)?="[^"]*"/g, '');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r2(x)} ${r2(y)} ${r2(w)} ${r2(h)}">${strip(d)}<g transform="matrix(${m})">${strip(p.xml)}</g></svg>`;
    return { svg, x, y, w, h };
}
const r2 = (v: number) => Math.round(v * 100) / 100;

export type DocTarget = {
    addAsset(svg: string, meta: { name: string; category: string; tags: string[]; description: string; viewBox: string; license: string; provider: string; sourceFile: string; sourceHash: string }): string;
    createDocument(title: string, width: number, height: number, nodes: Array<{ id: string; type: 'icon'; name: string; iconId: string; transform: M; width: number; height: number; layoutRole?: 'content' | 'decoration' }>, existingId?: string): { id: string; revision: number };
};

export function buildDocument(target: DocTarget, title: string, split: ReturnType<typeof splitParts>, boxes: Map<string, Box>, opts: { license: string; existingId?: string }) {
    const nodes: Parameters<DocTarget['createDocument']>[3] = [];
    const skipped: string[] = [];
    for (const p of split.parts) {
        const b = boxes.get(p.id);
        if (!b || b.width <= 0.5 || b.height <= 0.5) continue;
        const ps = partSvg(p, split.defs, b);
        let clean: string;
        try { clean = sanitizeSvg(ps.svg).svg; } catch (e) { skipped.push(`${p.name}: ${(e as Error).message}`); continue; }
        const hash = createHash('sha256').update(clean).digest('hex');
        const iconId = target.addAsset(clean, { name: `Figure part: ${p.name}`, category: 'Generated figure parts', tags: ['generated', p.kind], description: `Generated by the Helix figure engine for "${title}"`, viewBox: `${r2(ps.x)} ${r2(ps.y)} ${r2(ps.w)} ${r2(ps.h)}`, license: opts.license, provider: 'Helix figure engine', sourceFile: `engine://${hash.slice(0, 16)}`, sourceHash: hash });
        nodes.push({ id: randomUUID(), type: 'icon', name: p.name.slice(0, 280), iconId, transform: [1, 0, 0, 1, r2(ps.x), r2(ps.y)], width: r2(ps.w), height: r2(ps.h), layoutRole: p.kind === 'background' ? 'decoration' : 'content' });
    }
    const doc = target.createDocument(title, Math.ceil(split.width), Math.ceil(split.height), nodes, opts.existingId);
    return { ...doc, objects: nodes.length, skipped };
}
