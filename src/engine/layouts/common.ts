import { text, wrap, textWidth, textBlockHeight, el, f, INK, roundRect } from '../svg.ts';
import { resolveVisual, fitScale, type Drawable, type VisualEnv, type VisualRef } from '../visual.ts';
import { HUES, resolveColor, tone } from '../color.ts';

export type Block = { w: number; h: number; svg: string };
export type Ctx = VisualEnv & { maxWidth: number };

export const T = {
    title: 21, subtitle: 13.5, label: 13.5, detail: 11.5, header: 14.5, small: 10.5,
    labelWeight: 700, gutter: 28,
};

/** Label + detail stack, centred on cx. Returns svg and height. */
export function caption(label: string | undefined, detail: string | undefined, cx: number, y: number, width: number, opts: { anchor?: 'middle' | 'start'; labelColor?: string } = {}) {
    let svg = '', h = 0;
    const anchor = opts.anchor ?? 'middle', x = anchor === 'middle' ? cx : cx - width / 2;
    if (label) {
        const lines = wrap(label, T.label, width, T.labelWeight);
        svg += text(lines, x, y, { size: T.label, weight: T.labelWeight, anchor, color: opts.labelColor ?? INK.text });
        h += textBlockHeight(lines.length, T.label);
    }
    if (detail) {
        const lines = wrap(detail, T.detail, width);
        svg += text(lines, x, y + h + (label ? 3 : 0), { size: T.detail, anchor, color: INK.muted, lineHeight: 1.3 });
        h += (label ? 3 : 0) + textBlockHeight(lines.length, T.detail, 1.3);
    }
    return { svg, h };
}
export function captionHeight(label: string | undefined, detail: string | undefined, width: number) {
    return caption(label, detail, 0, 0, width).h;
}

/** Place drawables side by side inside a box, scaled to a common height, centred. */
/** Natural scale cluster() would choose for a single drawable, so callers can share one across a row. */
export const clusterScale = (d: Drawable, maxW: number, maxH: number) => fitScale(d, maxW, maxH, 2.2);

export function cluster(ds: Drawable[], cx: number, cy: number, maxW: number, maxH: number, opts: { scale?: number } = {}) {
    if (!ds.length) return { svg: '', w: 0, h: 0, x: cx, y: cy };
    if (ds.length === 1) {
        const d = ds[0], s = opts.scale ?? fitScale(d, maxW, maxH, 2.2), w = d.w * s, h = d.h * s;
        return { svg: d.draw(cx - w / 2, cy - h / 2, s), w, h, x: cx - w / 2, y: cy - h / 2 };
    }
    const gap = 8, h0 = maxH * 0.86;
    let scales = ds.map(d => Math.min(h0 / d.h, 2.2));
    let total = ds.reduce((a, d, i) => a + d.w * scales[i], 0) + gap * (ds.length - 1);
    if (total > maxW * 1.15) { const k = (maxW * 1.15 - gap * (ds.length - 1)) / (total - gap * (ds.length - 1)); scales = scales.map(s => s * k); total = maxW * 1.15; }
    let x = cx - total / 2, svg = '';
    const H = Math.max(...ds.map((d, i) => d.h * scales[i]));
    ds.forEach((d, i) => { const s = scales[i], w = d.w * s, h = d.h * s; svg += d.draw(x, cy - h / 2, s); x += w + gap; });
    return { svg, w: total, h: H, x: cx - total / 2, y: cy - H / 2 };
}

export function visuals(ctx: Ctx, refs: Array<VisualRef | undefined>, color?: string, seed?: string) {
    return refs.map((r, i) => resolveVisual(ctx, r as VisualRef, { color, seed: (seed ?? 's') + i })).filter((d): d is Drawable => !!d);
}

export function stepBadge(n: number, x: number, y: number, color = HUES.navy) {
    const t = tone(color);
    return el('g', { 'data-part': 'badge', 'data-name': `Step ${n} badge` }, el('circle', { cx: x, cy: y, r: 11, fill: t.stroke }) + text(String(n), x, y + 0.5, { size: 11.5, weight: 700, anchor: 'middle', baseline: 'middle', color: '#fff' }));
}

export function tint(color: string | undefined, fallback: string) { return tone(resolveColor(color, fallback)); }

export function band(x: number, y: number, w: number, h: number, color: string, label?: string) {
    const t = tone(color);
    let svg = el('path', { d: roundRect(x, y, w, h, 14), fill: t.pale, stroke: t.light, 'stroke-width': 1.2 });
    if (label) {
        const tw = textWidth(label, 12, 700) + 22;
        svg += el('path', { d: roundRect(x + w / 2 - tw / 2, y - 11, tw, 22, 11), fill: t.stroke });
        svg += text(label.toUpperCase(), x + w / 2, y, { size: 11, weight: 700, anchor: 'middle', baseline: 'middle', color: '#fff', letterSpacing: 0.6 });
    }
    return svg;
}

export { f, el, text, wrap, textWidth, INK };
