// Nucleic-acid drawing primitives.
//
// A duplex is not two lines with rungs between them: each strand carries its own bases, drawn as
// short ticks off its backbone, and paired bases meet in the middle. Unpaired stretches keep their
// ticks but have nothing to meet, which is what makes an open bubble read as single-stranded.
// Everything here works along an arbitrary curve, so a strand can bulge, loop or fold and still
// carry correctly oriented bases.
import { el, f, type Pt } from './svg.ts';
import { tone, type Tone } from './color.ts';

/** Dense polyline through control points (Catmull-Rom), so curves can be measured and ticked. */
export function densify(pts: Pt[], perSegment = 14): Pt[] {
    if (pts.length < 2) return pts.slice();
    const out: Pt[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
        for (let s = 0; s < perSegment; s++) {
            const t = s / perSegment, t2 = t * t, t3 = t2 * t;
            out.push({
                x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
                y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
            });
        }
    }
    out.push(pts[pts.length - 1]);
    return out;
}
export const polyline = (pts: Pt[]) => 'M' + pts.map(p => `${f(p.x)} ${f(p.y)}`).join(' L');

/** Cumulative arc length, used to space bases evenly however the strand curves. */
function arcLengths(pts: Pt[]) {
    const acc = [0];
    for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    return acc;
}
/** Point and unit normal at a given distance along the strand. */
export function atLength(pts: Pt[], acc: number[], d: number) {
    let i = 1;
    while (i < acc.length - 1 && acc[i] < d) i++;
    const t = (d - acc[i - 1]) / Math.max(1e-6, acc[i] - acc[i - 1]);
    const p = { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t };
    const dx = pts[i].x - pts[i - 1].x, dy = pts[i].y - pts[i - 1].y, L = Math.hypot(dx, dy) || 1;
    return { p, tangent: { x: dx / L, y: dy / L }, normal: { x: -dy / L, y: dx / L } };
}
export const strandLength = (pts: Pt[]) => arcLengths(pts).at(-1)!;

export type StrandStyle = { color: Tone; backbone?: number; tick?: number; step?: number; opacity?: number };

/**
 * One strand: a backbone plus its bases. `side` is which way the bases point (+1 along the normal).
 * `from`/`to` limit the ticked (base-carrying) stretch, as a fraction of the strand.
 */
export function strandWithBases(control: Pt[], side: 1 | -1, s: StrandStyle, range: { from?: number; to?: number } = {}) {
    const pts = densify(control), acc = arcLengths(pts), total = acc.at(-1)!;
    const step = s.step ?? 6, tick = s.tick ?? 6, bw = s.backbone ?? 3.4;
    const a = total * (range.from ?? 0), b = total * (range.to ?? 1);
    let ticks = '';
    for (let d = a + step / 2; d < b; d += step) {
        const { p, normal } = atLength(pts, acc, d);
        ticks += `M${f(p.x)} ${f(p.y)} L${f(p.x + normal.x * tick * side)} ${f(p.y + normal.y * tick * side)}`;
    }
    return el('path', { d: ticks, stroke: s.color.base, 'stroke-width': 1.7, 'stroke-linecap': 'round', opacity: s.opacity ?? 1 }) +
        el('path', { d: polyline(pts), fill: 'none', stroke: s.color.stroke, 'stroke-width': bw, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: s.opacity ?? 1 });
}

/** A double helix stretch: two backbones whose bases meet in the middle. */
export function duplex(top: Pt[], bottom: Pt[], a: Tone, b: Tone, opts: { gap?: number; step?: number; backbone?: number } = {}) {
    const gap = opts.gap ?? 16, tick = gap / 2 - 0.8;
    return strandWithBases(top, 1, { color: a, tick, step: opts.step, backbone: opts.backbone }) +
        strandWithBases(bottom, -1, { color: b, tick, step: opts.step, backbone: opts.backbone });
}

/** Straight horizontal duplex, the common case. */
export function straightDuplex(x0: number, x1: number, yTop: number, yBot: number, a: Tone, b: Tone, opts: { step?: number; backbone?: number } = {}) {
    return duplex([{ x: x0, y: yTop }, { x: x1, y: yTop }], [{ x: x0, y: yBot }, { x: x1, y: yBot }], a, b, { gap: yBot - yTop, ...opts });
}

/** 5′ / 3′ end marker, set just off the end of a strand. */
export function endLabel(p: Pt, text5: string, opts: { dx?: number; dy?: number; color?: string; size?: number } = {}) {
    return el('text', { x: p.x + (opts.dx ?? -9), y: p.y + (opts.dy ?? 3.5), 'font-family': `'Helvetica Neue', Helvetica, Arial, sans-serif`, 'font-size': opts.size ?? 10, 'font-weight': 600, fill: opts.color ?? '#5B6675', 'text-anchor': 'middle' }, text5);
}

/** An RNA stem loop standing on the strand at `p`, pointing along `dir`. */
export function stemLoop(p: Pt, dir: Pt, height: number, t: Tone, width = 9) {
    const n = { x: -dir.y, y: dir.x };
    const tipA = { x: p.x + dir.x * height - n.x * width * 0.35, y: p.y + dir.y * height - n.y * width * 0.35 };
    const tipB = { x: p.x + dir.x * height + n.x * width * 0.35, y: p.y + dir.y * height + n.y * width * 0.35 };
    const left = [{ x: p.x - n.x * width / 2, y: p.y - n.y * width / 2 }, { x: tipA.x - n.x * width * 0.2, y: tipA.y - n.y * width * 0.2 }];
    const right = [{ x: tipB.x + n.x * width * 0.2, y: tipB.y + n.y * width * 0.2 }, { x: p.x + n.x * width / 2, y: p.y + n.y * width / 2 }];
    const d = `M${f(left[0].x)} ${f(left[0].y)} L${f(left[1].x)} ${f(left[1].y)} A${f(width * 0.55)} ${f(width * 0.55)} 0 0 1 ${f(right[0].x)} ${f(right[0].y)} L${f(right[1].x)} ${f(right[1].y)}`;
    // the paired stem: short rungs across the two sides
    let rungs = '';
    for (let k = 0.18; k < 0.92; k += 0.2) {
        const ax = left[0].x + (left[1].x - left[0].x) * k, ay = left[0].y + (left[1].y - left[0].y) * k;
        const bx = right[1].x + (right[0].x - right[1].x) * k, by = right[1].y + (right[0].y - right[1].y) * k;
        rungs += `M${f(ax)} ${f(ay)} L${f(bx)} ${f(by)}`;
    }
    return el('path', { d: rungs, stroke: t.base, 'stroke-width': 1.5, 'stroke-linecap': 'round' }) +
        el('path', { d, fill: 'none', stroke: t.stroke, 'stroke-width': 3.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
}

export const NUC = {
    dna: tone('#4A72B8'),        // template / target strand
    dna2: tone('#7D93B5'),       // the other strand of the duplex
    newDna: tone('#2E4A7D'),     // newly synthesised DNA
    rna: tone('#E09B3D'),        // guide RNA
    edit: tone('#D2423F'),       // the base being changed, and cut marks
};
