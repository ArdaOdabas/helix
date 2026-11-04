// Connectors: arrows, inhibition bars, block arrows and elbow routes with consistent heads and
// halo-backed labels. Geometry is computed from endpoints only; callers never draw paths by hand.
import { el, f, g, text, wrap, textWidth, INK, type Pt } from './svg.ts';

export type EdgeKind = 'activate' | 'inhibit' | 'bind' | 'translocate' | 'produce' | 'flow' | 'release' | 'convert' | 'bidirectional';
export type ArrowOpts = {
    kind?: EdgeKind; color?: string; width?: number; dashed?: boolean; curve?: number; label?: string; labelSize?: number;
    labelSide?: 1 | -1; head?: number; startGap?: number; endGap?: number; labelMax?: number; labelColor?: string; italicLabel?: boolean;
};

const part = (svg: string, name?: string) => g(svg, { 'data-part': 'connector', 'data-name': name ? `Arrow: ${name}` : 'Arrow' });

export type Box = { x: number; y: number; w: number; h: number; shape?: 'ellipse' | 'rect' };

/** Point on the boundary of a box (ellipse or rect) in the direction of `toward`. */
export function boundary(b: Box, toward: Pt, pad = 0): Pt {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, dx = toward.x - cx, dy = toward.y - cy;
    if (!dx && !dy) return { x: cx, y: cy };
    if (b.shape === 'ellipse') {
        const rx = b.w / 2 + pad, ry = b.h / 2 + pad, t = 1 / Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
        return { x: cx + dx * t, y: cy + dy * t };
    }
    const hw = b.w / 2 + pad, hh = b.h / 2 + pad, t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
    return { x: cx + dx * t, y: cy + dy * t };
}
export const center = (b: Box): Pt => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

function headPath(tip: Pt, ang: number, size: number) {
    const back = { x: tip.x - Math.cos(ang) * size, y: tip.y - Math.sin(ang) * size };
    const nx = -Math.sin(ang), ny = Math.cos(ang), w = size * 0.52;
    const notch = { x: tip.x - Math.cos(ang) * size * 0.72, y: tip.y - Math.sin(ang) * size * 0.72 };
    return `M${f(tip.x)} ${f(tip.y)} L${f(back.x + nx * w)} ${f(back.y + ny * w)} L${f(notch.x)} ${f(notch.y)} L${f(back.x - nx * w)} ${f(back.y - ny * w)}Z`;
}

/** Arrow between two points; returns svg and the label box (for collision checks). */
export function arrow(a: Pt, b: Pt, o: ArrowOpts = {}) {
    const kind = o.kind ?? 'activate', color = o.color ?? INK.line, w = o.width ?? 2.2, head = o.head ?? Math.max(9, w * 4.4);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 4) return { svg: '', label: undefined as Box | undefined };
    let ang = Math.atan2(b.y - a.y, b.x - a.x);
    const sg = o.startGap ?? 0, eg = o.endGap ?? 0;
    const A = { x: a.x + Math.cos(ang) * sg, y: a.y + Math.sin(ang) * sg }, B = { x: b.x - Math.cos(ang) * eg, y: b.y - Math.sin(ang) * eg };
    const curve = o.curve ?? 0;
    const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
    const nx = -Math.sin(ang), ny = Math.cos(ang);
    const ctrl = { x: mid.x + nx * curve * len, y: mid.y + ny * curve * len };
    const endAng = curve ? Math.atan2(B.y - ctrl.y, B.x - ctrl.x) : ang;
    const startAng = curve ? Math.atan2(ctrl.y - A.y, ctrl.x - A.x) : ang;
    const hasHead = kind !== 'bind' && kind !== 'inhibit';
    const twoHeads = kind === 'bidirectional' || kind === 'convert';
    // Shorten the line under the arrow head so the round cap never pokes through the tip.
    const shorten = hasHead ? head * 0.7 : kind === 'inhibit' ? w * 0.5 : 0;
    const B2 = { x: B.x - Math.cos(endAng) * shorten, y: B.y - Math.sin(endAng) * shorten };
    const A2 = twoHeads ? { x: A.x + Math.cos(startAng) * head * 0.7, y: A.y + Math.sin(startAng) * head * 0.7 } : A;
    const d = curve ? `M${f(A2.x)} ${f(A2.y)} Q${f(ctrl.x)} ${f(ctrl.y)} ${f(B2.x)} ${f(B2.y)}` : `M${f(A2.x)} ${f(A2.y)} L${f(B2.x)} ${f(B2.y)}`;
    const dash = o.dashed || kind === 'translocate' || kind === 'release' ? `${f(w * 2.6)} ${f(w * 2)}` : kind === 'bind' ? `${f(w * 1.2)} ${f(w * 1.8)}` : undefined;
    let svg = el('path', { d, fill: 'none', stroke: color, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-dasharray': dash });
    if (hasHead) svg += el('path', { d: headPath(B, endAng, head), fill: color, stroke: color, 'stroke-width': 0.6, 'stroke-linejoin': 'round' });
    if (twoHeads) svg += el('path', { d: headPath(A, startAng + Math.PI, head), fill: color, stroke: color, 'stroke-width': 0.6, 'stroke-linejoin': 'round' });
    if (kind === 'inhibit') {
        const bw = Math.max(9, w * 4.5), px = -Math.sin(endAng), py = Math.cos(endAng);
        svg += el('path', { d: `M${f(B.x + px * bw)} ${f(B.y + py * bw)} L${f(B.x - px * bw)} ${f(B.y - py * bw)}`, stroke: color, 'stroke-width': w * 1.5, 'stroke-linecap': 'round' });
    }
    let labelBox: Box | undefined;
    if (o.label) {
        const size = o.labelSize ?? 11.5, maxW = o.labelMax ?? Math.max(70, Math.min(160, len * 0.9));
        const lines = wrap(o.label, size, maxW);
        const tw = Math.max(...lines.map(l => textWidth(l, size))), th = lines.length * size * 1.25;
        const lm = curve ? { x: (A.x + 2 * ctrl.x + B.x) / 4, y: (A.y + 2 * ctrl.y + B.y) / 4 } : mid;
        const horizontal = Math.abs(Math.cos(ang)) > 0.6;
        const side = o.labelSide ?? -1;
        let lx: number, ly: number, anchor: 'middle' | 'start' | 'end' = 'middle';
        if (horizontal) { lx = lm.x; ly = side < 0 ? lm.y - 8 - th : lm.y + 8; }
        else { anchor = side < 0 ? 'end' : 'start'; lx = lm.x + (side < 0 ? -10 : 10); ly = lm.y - th / 2; }
        svg += text(lines, lx, ly, { size, anchor, color: o.labelColor ?? INK.muted, italic: o.italicLabel, halo: '#ffffff', weight: 500 });
        labelBox = { x: anchor === 'middle' ? lx - tw / 2 : anchor === 'end' ? lx - tw : lx, y: ly, w: tw, h: th };
    }
    return { svg: part(svg, o.label), label: labelBox };
}

/** Chunky block arrow (workflow "next step" connector). Label sits above. */
export function blockArrow(a: Pt, b: Pt, o: { color?: string; stroke?: string; thickness?: number; label?: string; labelSize?: number; labelMax?: number } = {}) {
    const ang = Math.atan2(b.y - a.y, b.x - a.x), len = Math.hypot(b.x - a.x, b.y - a.y), t = o.thickness ?? 14, hl = Math.min(len * 0.45, t * 1.35), hw = t * 1.05;
    const P = (u: number, v: number) => `${f(a.x + Math.cos(ang) * u - Math.sin(ang) * v)} ${f(a.y + Math.sin(ang) * u + Math.cos(ang) * v)}`;
    const d = `M${P(0, -t / 2)} L${P(len - hl, -t / 2)} L${P(len - hl, -hw)} L${P(len, 0)} L${P(len - hl, hw)} L${P(len - hl, t / 2)} L${P(0, t / 2)}Z`;
    let svg = el('path', { d, fill: o.color ?? '#DCE2EA', stroke: o.stroke ?? '#B4BFCC', 'stroke-width': 1, 'stroke-linejoin': 'round' });
    let label: Box | undefined;
    if (o.label) {
        const size = o.labelSize ?? 11.5, lines = wrap(o.label, size, o.labelMax ?? Math.max(70, len + 20));
        const th = lines.length * size * 1.25, tw = Math.max(...lines.map(l => textWidth(l, size)));
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2 - hw - 6 - th;
        svg += text(lines, mx, my, { size, anchor: 'middle', color: INK.muted, weight: 500 });
        label = { x: mx - tw / 2, y: my, w: tw, h: th };
    }
    return { svg: part(svg, o.label), label };
}

/** Orthogonal route with rounded corners through the given points, arrow head at the end. */
export function elbow(points: Pt[], o: { color?: string; width?: number; radius?: number; dashed?: boolean; head?: boolean; label?: string; labelAt?: number } = {}) {
    const color = o.color ?? INK.line, w = o.width ?? 2.2, r = o.radius ?? 14, head = Math.max(9, w * 4.4);
    const pts = points.slice();
    const last = pts[pts.length - 1], prev = pts[pts.length - 2], ang = Math.atan2(last.y - prev.y, last.x - prev.x);
    if (o.head !== false) pts[pts.length - 1] = { x: last.x - Math.cos(ang) * head * 0.7, y: last.y - Math.sin(ang) * head * 0.7 };
    let d = `M${f(pts[0].x)} ${f(pts[0].y)}`;
    for (let i = 1; i < pts.length - 1; i++) {
        const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
        const l1 = Math.hypot(p1.x - p0.x, p1.y - p0.y), l2 = Math.hypot(p2.x - p1.x, p2.y - p1.y), rr = Math.min(r, l1 / 2, l2 / 2);
        const a = { x: p1.x - (p1.x - p0.x) / l1 * rr, y: p1.y - (p1.y - p0.y) / l1 * rr }, b = { x: p1.x + (p2.x - p1.x) / l2 * rr, y: p1.y + (p2.y - p1.y) / l2 * rr };
        d += ` L${f(a.x)} ${f(a.y)} Q${f(p1.x)} ${f(p1.y)} ${f(b.x)} ${f(b.y)}`;
    }
    d += ` L${f(pts[pts.length - 1].x)} ${f(pts[pts.length - 1].y)}`;
    let svg = el('path', { d, fill: 'none', stroke: color, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-dasharray': o.dashed ? `${f(w * 2.6)} ${f(w * 2)}` : undefined });
    if (o.head !== false) svg += el('path', { d: headPath(last, ang, head), fill: color, stroke: color, 'stroke-width': 0.6, 'stroke-linejoin': 'round' });
    return part(svg);
}

/** Circular arc arrow (cycle diagrams). Angles in radians, clockwise. */
export function arcArrow(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, o: { color?: string; width?: number } = {}) {
    const color = o.color ?? INK.line, w = o.width ?? 2.4, head = Math.max(10, w * 4.4);
    const pts: Pt[] = [];
    const n = 24;
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry }); }
    const tip = pts[n], pre = pts[n - 2], ang = Math.atan2(tip.y - pre.y, tip.x - pre.x);
    // trim the polyline under the head
    let trimmed = pts.slice(0, n - 1);
    const d = 'M' + trimmed.map(p => `${f(p.x)} ${f(p.y)}`).join(' L');
    return part(el('path', { d, fill: 'none', stroke: color, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }) + el('path', { d: headPath(tip, ang, head), fill: color }));
}

export function edgeKind(s: string | undefined): EdgeKind {
    const k = (s ?? '').toLowerCase();
    if (/inhib|block|suppress|repress|antagon|⊣|degrad|neutrali/.test(k)) return 'inhibit';
    if (/bind|complex|associat|interact|dock/.test(k)) return 'bind';
    if (/transloc|import|enter|nuclear|migrat|traffic|shuttle|export/.test(k)) return 'translocate';
    if (/secret|release|exocyt|efflux/.test(k)) return 'release';
    if (/express|transcri|translat|produc|synthes|encode|generat|yield/.test(k)) return 'produce';
    if (/convert|revers|equilib|exchange/.test(k)) return 'convert';
    if (/bidirect|both/.test(k)) return 'bidirectional';
    return 'activate';
}

/** S-curve with horizontal (or vertical) tangents, for branching flows. */
export function cubicPoints(a: Pt, b: Pt, bow = 0, vertical = false): [Pt, Pt, Pt, Pt] {
    const k = vertical ? Math.abs(b.y - a.y) * 0.5 : Math.abs(b.x - a.x) * 0.5;
    const c1 = vertical ? { x: a.x, y: a.y + k } : { x: a.x + k, y: a.y + bow };
    const c2 = vertical ? { x: b.x, y: b.y - k } : { x: b.x - k, y: b.y + bow };
    return [a, c1, c2, b];
}
/** Samples a cubic Bézier, for routing checks. */
export function sampleCubic(p: [Pt, Pt, Pt, Pt], n = 16): Pt[] {
    const out: Pt[] = [];
    for (let i = 0; i <= n; i++) {
        const t = i / n, u = 1 - t;
        out.push({
            x: u * u * u * p[0].x + 3 * u * u * t * p[1].x + 3 * u * t * t * p[2].x + t * t * t * p[3].x,
            y: u * u * u * p[0].y + 3 * u * u * t * p[1].y + 3 * u * t * t * p[2].y + t * t * t * p[3].y,
        });
    }
    return out;
}

export function curveArrow(a: Pt, b: Pt, o: ArrowOpts & { vertical?: boolean; bow?: number; labelT?: number } = {}) {
    const color = o.color ?? INK.line, w = o.width ?? 2.2, head = o.head ?? Math.max(9, w * 4.4), kind = o.kind ?? 'activate';
    const v = !!o.vertical;
    const [, c1, c2] = cubicPoints(a, b, o.bow ?? 0, v);
    const ang = Math.atan2(b.y - c2.y, b.x - c2.x);
    const B2 = kind === 'inhibit' || kind === 'bind' ? b : { x: b.x - Math.cos(ang) * head * 0.7, y: b.y - Math.sin(ang) * head * 0.7 };
    const dash = o.dashed || kind === 'translocate' || kind === 'release' ? `${f(w * 2.6)} ${f(w * 2)}` : kind === 'bind' ? `${f(w * 1.2)} ${f(w * 1.8)}` : undefined;
    let svg = el('path', { d: `M${f(a.x)} ${f(a.y)} C${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(B2.x)} ${f(B2.y)}`, fill: 'none', stroke: color, 'stroke-width': w, 'stroke-linecap': 'round', 'stroke-dasharray': dash });
    if (kind === 'inhibit') { const px = -Math.sin(ang), py = Math.cos(ang), bw = Math.max(9, w * 4.5); svg += el('path', { d: `M${f(b.x + px * bw)} ${f(b.y + py * bw)} L${f(b.x - px * bw)} ${f(b.y - py * bw)}`, stroke: color, 'stroke-width': w * 1.5, 'stroke-linecap': 'round' }); }
    else if (kind !== 'bind') svg += el('path', { d: headPath(b, ang, head), fill: color, stroke: color, 'stroke-width': 0.6, 'stroke-linejoin': 'round' });
    let label: Box | undefined;
    if (o.label) {
        const size = o.labelSize ?? 11.5, lines = wrap(o.label, size, o.labelMax ?? 120), th = lines.length * size * 1.25, tw = Math.max(...lines.map(l => textWidth(l, size)));
        const t = o.labelT ?? 0.5, u = 1 - t;
        const at = (p0: number, p1: number, p2: number, p3: number) => u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
        const mx = at(a.x, c1.x, c2.x, b.x), my = at(a.y, c1.y, c2.y, b.y);
        // Steeper curves rise through the midpoint, so the label is lifted further clear of the line.
        const lift = th + 5 + Math.min(16, Math.abs(b.y - a.y) * 0.12);
        svg += text(lines, mx, my - lift, { size, anchor: 'middle', color: o.labelColor ?? INK.muted, halo: '#ffffff', weight: 500 });
        label = { x: mx - tw / 2, y: my - lift, w: tw, h: th };
    }
    return { svg: part(svg, o.label), label };
}
