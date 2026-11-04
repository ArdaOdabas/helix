// Low-level SVG building blocks shared by glyphs, layouts and connectors.
import { tone, type Tone } from './color.ts';
import { measureText } from '../core/text-metrics.ts';

export const f = (n: number) => (Math.round(n * 100) / 100).toString();
export const esc = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));

export type Attrs = Record<string, string | number | undefined | null | false>;
export function attrs(a: Attrs) {
    return Object.entries(a).filter(([, v]) => v !== undefined && v !== null && v !== false)
        .map(([k, v]) => ` ${k}="${typeof v === 'number' ? f(v) : esc(String(v))}"`).join('');
}
export const el = (tag: string, a: Attrs = {}, children?: string) =>
    children === undefined ? `<${tag}${attrs(a)}/>` : `<${tag}${attrs(a)}>${children}</${tag}>`;
export const g = (children: string, a: Attrs = {}) => el('g', a, children);
export const translate = (x: number, y: number, s = 1) => s === 1 ? `translate(${f(x)} ${f(y)})` : `translate(${f(x)} ${f(y)}) scale(${f(s)})`;

/** Collects <defs> (gradients, clip paths, filters) with collision-free ids for one figure. */
export class Defs {
    private items: string[] = [];
    private keyed = new Map<string, string>();
    private n = 0;
    prefix: string;
    constructor(prefix = 'hx') { this.prefix = prefix; }
    id(base = 'd') { return `${this.prefix}-${base}${++this.n}`; }
    add(svg: string) { this.items.push(svg); }
    /** Vertical (default) or angled linear gradient. Returns a paint reference. */
    linear(stops: Array<[number, string, number?]>, opts: { x1?: number; y1?: number; x2?: number; y2?: number; units?: 'objectBoundingBox' | 'userSpaceOnUse' } = {}) {
        const key = 'L' + JSON.stringify([stops, opts]);
        const hit = this.keyed.get(key); if (hit) return hit;
        const id = this.id('lg');
        this.items.push(`<linearGradient id="${id}" x1="${opts.x1 ?? 0}" y1="${opts.y1 ?? 0}" x2="${opts.x2 ?? 0}" y2="${opts.y2 ?? 1}"${opts.units ? ` gradientUnits="${opts.units}"` : ''}>${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ''}/>`).join('')}</linearGradient>`);
        const ref = `url(#${id})`; this.keyed.set(key, ref); return ref;
    }
    /** Radial gradient with an off-centre focal point: gives soft 3-D shading to blobs. */
    radial(stops: Array<[number, string, number?]>, opts: { cx?: number; cy?: number; r?: number; fx?: number; fy?: number } = {}) {
        const key = 'R' + JSON.stringify([stops, opts]);
        const hit = this.keyed.get(key); if (hit) return hit;
        const id = this.id('rg');
        this.items.push(`<radialGradient id="${id}" cx="${opts.cx ?? 0.5}" cy="${opts.cy ?? 0.5}" r="${opts.r ?? 0.6}" fx="${opts.fx ?? opts.cx ?? 0.5}" fy="${opts.fy ?? opts.cy ?? 0.5}">${stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ''}/>`).join('')}</radialGradient>`);
        const ref = `url(#${id})`; this.keyed.set(key, ref); return ref;
    }
    /** Standard "lit from upper left" body shading for a tone. */
    body(t: Tone) { return this.radial([[0, t.light], [0.55, t.base], [1, t.shadow]], { cx: 0.42, cy: 0.38, r: 0.75, fx: 0.35, fy: 0.3 }); }
    /** Flatter variant for large shapes, where strong radial shading looks heavy. */
    soft(t: Tone) { return this.radial([[0, t.light], [1, t.base]], { cx: 0.45, cy: 0.4, r: 0.8, fx: 0.4, fy: 0.3 }); }
    /** Vertical cylinder shading (tubes, helices). */
    cylinder(t: Tone, horizontal = false) {
        return this.linear([[0, t.shadow], [0.3, t.light], [0.55, t.base], [1, t.shadow]], horizontal ? { x1: 0, y1: 0, x2: 0, y2: 1 } : { x1: 0, y1: 0, x2: 1, y2: 0 });
    }
    clip(content: string) { const id = this.id('cp'); this.items.push(`<clipPath id="${id}">${content}</clipPath>`); return `url(#${id})`; }
    shadowFilter() {
        const key = 'shadow'; const hit = this.keyed.get(key); if (hit) return hit;
        const id = this.id('sh');
        this.items.push(`<filter id="${id}" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="1.5" stdDeviation="2.2" flood-color="#1b2a3a" flood-opacity="0.16"/></filter>`);
        const ref = `url(#${id})`; this.keyed.set(key, ref); return ref;
    }
    render() { return this.items.length ? `<defs>${this.items.join('')}</defs>` : ''; }
}

/** Deterministic PRNG so the same spec always draws the same figure. */
export function rng(seed: number | string) {
    let a = typeof seed === 'number' ? seed >>> 0 : [...seed].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 2654435761) >>> 0, 2166136261);
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export type Pt = { x: number; y: number };
/** Closed smooth curve through points (Catmull-Rom converted to cubic Béziers). */
export function smoothClosed(pts: Pt[], tension = 1) {
    const n = pts.length; let d = `M${f(pts[0].x)} ${f(pts[0].y)}`;
    for (let i = 0; i < n; i++) {
        const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
        const c1 = { x: p1.x + (p2.x - p0.x) / 6 * tension, y: p1.y + (p2.y - p0.y) / 6 * tension };
        const c2 = { x: p2.x - (p3.x - p1.x) / 6 * tension, y: p2.y - (p3.y - p1.y) / 6 * tension };
        d += ` C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(p2.x)} ${f(p2.y)}`;
    }
    return d + 'Z';
}
/** Open smooth curve through points. */
export function smoothOpen(pts: Pt[], tension = 1) {
    if (pts.length < 2) return '';
    let d = `M${f(pts[0].x)} ${f(pts[0].y)}`;
    for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
        const c1 = { x: p1.x + (p2.x - p0.x) / 6 * tension, y: p1.y + (p2.y - p0.y) / 6 * tension };
        const c2 = { x: p2.x - (p3.x - p1.x) / 6 * tension, y: p2.y - (p3.y - p1.y) / 6 * tension };
        d += ` C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(p2.x)} ${f(p2.y)}`;
    }
    return d;
}
/** Organic blob: points on an ellipse with seeded radial jitter. */
export function blobPoints(cx: number, cy: number, rx: number, ry: number, opts: { n?: number; jitter?: number; seed?: number | string; rot?: number; spikes?: number[] } = {}) {
    const n = opts.n ?? 10, r = rng(opts.seed ?? 1), j = opts.jitter ?? 0.06, rot = opts.rot ?? r() * Math.PI * 2;
    return Array.from({ length: n }, (_, i) => {
        const a = rot + (i / n) * Math.PI * 2, k = 1 + (r() * 2 - 1) * j + (opts.spikes?.[i] ?? 0);
        return { x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k };
    });
}
export const blob = (cx: number, cy: number, rx: number, ry: number, opts: Parameters<typeof blobPoints>[4] = {}) => smoothClosed(blobPoints(cx, cy, rx, ry, opts));

export function roundRect(x: number, y: number, w: number, h: number, r: number) {
    r = Math.min(r, w / 2, h / 2);
    return `M${f(x + r)} ${f(y)}H${f(x + w - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + w)} ${f(y + r)}V${f(y + h - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + w - r)} ${f(y + h)}H${f(x + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x)} ${f(y + h - r)}V${f(y + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + r)} ${f(y)}Z`;
}
export const capsule = (x: number, y: number, w: number, h: number) => roundRect(x, y, w, h, Math.min(w, h) / 2);

/** Typography tokens used everywhere. */
export const FONT = `'Helvetica Neue', Helvetica, Arial, sans-serif`;
export const INK = { text: '#1F2A37', muted: '#5B6675', faint: '#8A94A3', line: '#3D4A5A', rule: '#D5DBE3' };

export type TextOpts = { size?: number; weight?: number | string; color?: string; anchor?: 'start' | 'middle' | 'end'; italic?: boolean; halo?: string | false; lineHeight?: number; baseline?: 'top' | 'middle' | 'alphabetic'; letterSpacing?: number };
/** Multi-line text. (x,y) is the top (default) of the first line box. Lines are pre-wrapped by the caller. */
export function text(lines: string | string[], x: number, y: number, o: TextOpts = {}) {
    const arr = Array.isArray(lines) ? lines : [lines];
    const size = o.size ?? 13, lh = (o.lineHeight ?? 1.25) * size;
    const total = lh * (arr.length - 1);
    const y0 = o.baseline === 'middle' ? y - total / 2 + size * 0.35 : o.baseline === 'alphabetic' ? y : y + size * 0.8;
    const halo = o.halo ? { stroke: o.halo, 'stroke-width': Math.max(2.5, size * 0.28), 'stroke-linejoin': 'round', 'paint-order': 'stroke' } : {};
    return el('text', { 'data-part': 'text', 'data-name': 'Text: ' + plain(arr.join(' ')).slice(0, 60), x, y: y0, 'font-family': FONT, 'font-size': size, 'font-weight': o.weight ?? 400, 'font-style': o.italic ? 'italic' : undefined, fill: o.color ?? INK.text, 'text-anchor': o.anchor ?? 'start', 'letter-spacing': o.letterSpacing, ...halo },
        arr.map((l, i) => `<tspan x="${f(x)}"${i ? ` dy="${f(lh)}"` : ''}>${richText(l)}</tspan>`).join(''));
}
/** Short runs subscript anywhere (Ca_v_1.2); longer ones only at a word end, so snake_case is safe. */
const SUB = /_([A-Za-z0-9+.,-]{1,2})_|_([A-Za-z0-9+.,-]{3,5})_(?![A-Za-z0-9_])/g;

/** Minimal inline markup: *italic*, ^sup^, _sub_ (e.g. "Ca^2+^", "CO_2_", "*TP53*"). */
export function richText(s: string) {
    let out = esc(s);
    out = out.replace(/\^([^^]+)\^/g, '<tspan baseline-shift="super" font-size="70%">$1</tspan>');
    // Short trailing-delimited runs only, so ordinary snake_case identifiers are left alone.
    out = out.replace(SUB, '<tspan baseline-shift="sub" font-size="70%">$1$2</tspan>');
    out = out.replace(/\*([^*]+)\*/g, '<tspan font-style="italic">$1</tspan>');
    return out;
}
export const plain = (s: string) => s.replace(/\^([^^]+)\^/g, '$1').replace(SUB, '$1$2').replace(/\*([^*]+)\*/g, '$1');
/** Width estimate. Bold text is ~7% wider than regular. */
export const textWidth = (s: string, size: number, weight: number | string = 400) => measureText(plain(s), size) * (Number(weight) >= 600 ? 1.07 : 1);
export function wrap(s: string, size: number, maxWidth: number, weight: number | string = 400): string[] {
    const out: string[] = [];
    for (const para of s.split('\n')) {
        let line = '';
        for (const word of para.split(/\s+/).filter(Boolean)) {
            const cand = line ? line + ' ' + word : word;
            if (line && textWidth(cand, size, weight) > maxWidth) { out.push(line); line = word; } else line = cand;
        }
        out.push(line);
    }
    return out.length ? out : [''];
}
export const textBlockHeight = (lines: number, size: number, lh = 1.25) => lines ? size + (lines - 1) * size * lh + size * 0.25 : 0;

export { tone };
export type { Tone };
