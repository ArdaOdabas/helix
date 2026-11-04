// Comparison grids, cycles and multiscale zoom figures.
import type { ComparisonSpec, CycleSpec, ZoomSpec } from '../spec.ts';
import { arrow, arcArrow, blockArrow } from '../connectors.ts';
import { roundRect, tone, wrap, textWidth, textBlockHeight } from '../svg.ts';
import { HUES, resolveColor } from '../color.ts';
import { resolveVisual } from '../visual.ts';
import { caption, captionHeight, cluster, clusterScale, visuals, type Block, type Ctx, el, f, text, INK, T } from './common.ts';

const COLS = ['blue', 'red', 'teal', 'orange'];

export function comparison(ctx: Ctx, spec: ComparisonSpec): Block {
    const k = spec.columns.length, VS = spec.visualSize ?? 112;
    const hasRowLabels = spec.rows.some(r => r.label);
    const rowLabelW = hasRowLabels ? Math.min(150, Math.max(...spec.rows.map(r => textWidth(r.label ?? '', 13, 700))) + 16) : 0;
    const gap = spec.transition ? 96 : 26;
    // A large visualSize means detailed mechanisms, which need columns wide enough to show them.
    const cap = Math.max(270, VS * 2.4);
    const cw = Math.max(170, Math.min(cap, (ctx.maxWidth - rowLabelW - gap * (k - 1)) / k));
    const norm = (c: any) => c === null || c === undefined ? null : typeof c === 'string' || c.glyph || c.search || c.asset ? { visual: c, label: undefined, detail: undefined } : c;
    const cells = spec.rows.map(r => Array.from({ length: k }, (_, i) => norm(r.cells[i])));
    // Resolve every cell up front: illustrations in one row share a scale, so related drawings
    // (the same mechanism under three effectors, say) stay directly comparable across columns.
    const drawn = cells.map((row, ri) => row.map((c, i) => c ? visuals(ctx, Array.isArray(c.visual) ? c.visual : [c.visual], undefined, `cmp${ri}${i}`) : []));
    const headH = Math.max(...spec.columns.map(c => 34 + (c.subtitle ? textBlockHeight(wrap(c.subtitle, 11.5, cw - 24).length, 11.5) + 4 : 0)));
    const rowH = cells.map(r => VS + 20 + Math.max(0, ...r.map(c => c ? captionHeight(c.label, c.detail, cw - 24) : 0)) + 12);
    const W = rowLabelW + k * cw + (k - 1) * gap, H = headH + 14 + rowH.reduce((a, b) => a + b, 0) + 8;
    let svg = '';
    spec.columns.forEach((c, i) => {
        const t = tone(resolveColor(c.color, HUES[COLS[i % COLS.length]]));
        const x = rowLabelW + i * (cw + gap);
        svg += el('path', { d: roundRect(x, 0, cw, H, 16), fill: t.pale, stroke: t.light, 'stroke-width': 1.4 });
        svg += el('path', { d: roundRect(x, 0, cw, headH, 16) + roundRect(x, headH - 16, cw, 16, 0), fill: t.base });
        svg += text(c.title, x + cw / 2, 10, { size: 15, weight: 700, anchor: 'middle', color: '#FFFFFF' });
        if (c.subtitle) svg += text(wrap(c.subtitle, 11.5, cw - 24), x + cw / 2, 32, { size: 11.5, anchor: 'middle', color: '#FFFFFF' });
    });
    let y = headH + 14;
    cells.forEach((row, ri) => {
        const lab = spec.rows[ri].label;
        if (lab) svg += text(wrap(lab, 13, rowLabelW - 12, 700), rowLabelW - 14, y + VS / 2, { size: 13, weight: 700, anchor: 'end', baseline: 'middle', color: INK.text });
        if (ri > 0) svg += el('path', { d: `M${rowLabelW} ${f(y - 8)} H${f(W)}`, stroke: '#E3E8EE', 'stroke-width': 1, 'stroke-dasharray': '3 4' });
        const singles = drawn[ri].filter(ds => ds.length === 1).map(ds => clusterScale(ds[0], cw - 34, VS));
        const rowScale = singles.length > 1 ? Math.min(...singles) : undefined;
        row.forEach((c, i) => {
            if (!c) return;
            const x = rowLabelW + i * (cw + gap) + cw / 2;
            const ds = drawn[ri][i];
            svg += cluster(ds, x, y + 6 + VS / 2, cw - 34, VS, { scale: ds.length === 1 ? rowScale : undefined }).svg;
            svg += caption(c.label, c.detail, x, y + VS + 14, cw - 24).svg;
        });
        y += rowH[ri];
    });
    if (spec.transition) for (let i = 0; i < k - 1; i++) {
        const x0 = rowLabelW + (i + 1) * cw + i * gap + 10, x1 = x0 + gap - 20, yy = headH + 14 + VS / 2 + 6;
        svg += blockArrow({ x: x0, y: yy }, { x: x1, y: yy }, { label: spec.transition, labelMax: gap + 10 }).svg;
    }
    return { w: W, h: H, svg };
}

export function cycle(ctx: Ctx, spec: CycleSpec): Block {
    const n = spec.stages.length, VS = 92;
    const rx = Math.max(190, n * 46), ry = Math.max(140, rx * 0.68);
    const items = spec.stages.map((s, i) => ({ s, i, ds: visuals(ctx, s.visuals ?? (s.visual !== undefined ? [s.visual] : []), s.color, 'cy' + i), ang: -Math.PI / 2 + (i / n) * Math.PI * 2 }));
    const capW = 170;
    let svg = '', arcs = '';
    const pad = { l: 0, r: 0, t: 0, b: 0 };
    const placed = items.map(it => {
        const cx = Math.cos(it.ang) * rx, cy = Math.sin(it.ang) * ry;
        const c = it.ds.length ? cluster(it.ds, cx, cy, VS * 1.3, VS) : { svg: '', w: 70, h: 40, x: cx - 35, y: cy - 20 };
        const capH = captionHeight(it.s.label, it.s.detail, capW);
        const cos = Math.cos(it.ang), sin = Math.sin(it.ang);
        let cap: string;
        if (!it.ds.length) {
            const t = tone(resolveColor(it.s.color, HUES.blue)), w = Math.max(100, textWidth(it.s.label ?? '', 13.5, 700) + 26);
            cap = el('path', { d: roundRect(cx - w / 2, cy - 20, w, 40, 20), fill: t.pale, stroke: t.base, 'stroke-width': 1.6 }) + text(it.s.label ?? '', cx, cy, { size: 13.5, weight: 700, anchor: 'middle', baseline: 'middle', color: t.dark });
            if (it.s.detail) cap += caption(undefined, it.s.detail, cx, cy + 26, capW).svg;
        } else if (cos > 0.4) { cap = caption(it.s.label, it.s.detail, cx + c.w / 2 + 12 + capW / 2, cy - capH / 2, capW, { anchor: 'start' }).svg; pad.r = Math.max(pad.r, capW + 12); }
        else if (cos < -0.4) { const lines = it.s.label ? wrap(it.s.label, T.label, capW, 700) : []; cap = textRight(it.s.label, it.s.detail, cx - c.w / 2 - 12, cy - capH / 2, capW); pad.l = Math.max(pad.l, capW + 12); void lines; }
        else if (sin < 0) { cap = caption(it.s.label, it.s.detail, cx, cy - c.h / 2 - 8 - capH, capW).svg; pad.t = Math.max(pad.t, capH + 10); }
        else { cap = caption(it.s.label, it.s.detail, cx, cy + c.h / 2 + 8, capW).svg; pad.b = Math.max(pad.b, capH + 10); }
        svg += c.svg + cap;
        return { cx, cy, r: Math.max(c.w, c.h) / 2 + 10 };
    });
    for (let i = 0; i < n; i++) {
        const a = placed[i], b = placed[(i + 1) % n];
        const R = (rx + ry) / 2;
        const a0 = items[i].ang + a.r / R + 0.03, a1 = items[i].ang + (Math.PI * 2) / n - b.r / R - 0.03;
        if (a1 > a0) arcs += arcArrow(0, 0, rx, ry, a0, a1, { width: 2.6 });
        const act = items[i].s.action;
        if (act) {
            const am = (a0 + a1) / 2, lx = Math.cos(am) * (rx - 16), ly = Math.sin(am) * (ry - 16);
            const cos = Math.cos(am);
            arcs += text(wrap(act, 11.5, 120), lx, ly, { size: 11.5, color: INK.muted, anchor: cos > 0.3 ? 'end' : cos < -0.3 ? 'start' : 'middle', baseline: 'middle', halo: '#fff', weight: 500 });
        }
    }
    if (spec.center) {
        const ds = visuals(ctx, spec.center.visual ? [spec.center.visual] : [], undefined, 'center');
        const c = cluster(ds, 0, -14, rx * 0.7, ry * 0.6);
        svg += c.svg + caption(spec.center.label, spec.center.detail, 0, ds.length ? c.y + c.h + 8 : -10, rx * 0.9).svg;
    }
    const left = rx + VS * 0.75 + pad.l, right = rx + VS * 0.75 + pad.r, top = ry + VS / 2 + pad.t + 6, bottom = ry + VS / 2 + pad.b + 6;
    return { w: left + right, h: top + bottom, svg: el('g', { transform: `translate(${f(left)} ${f(top)})` }, arcs + svg) };
}

function textRight(label: string | undefined, detail: string | undefined, xRight: number, y: number, width: number) {
    let svg = '', h = 0;
    if (label) { const l = wrap(label, T.label, width, 700); svg += text(l, xRight, y, { size: T.label, weight: 700, anchor: 'end', color: INK.text }); h += textBlockHeight(l.length, T.label) + 3; }
    if (detail) { const l = wrap(detail, T.detail, width); svg += text(l, xRight, y + h, { size: T.detail, anchor: 'end', color: INK.muted, lineHeight: 1.3 }); }
    return svg;
}

export function zoom(ctx: Ctx, spec: ZoomSpec): Block {
    const L = spec.levels.length;
    const D = Math.min(230, Math.max(150, (ctx.maxWidth - 90 * (L - 1)) / L));
    const gap = Math.max(70, Math.min(120, (ctx.maxWidth - D * L) / Math.max(1, L - 1)));
    const capW = D + 30;
    const capH = Math.max(...spec.levels.map(l => captionHeight(l.label, l.detail, capW)));
    let svg = '', cones = '';
    const frames: Array<{ cx: number; cy: number; r: number; box?: { x: number; y: number; w: number; h: number } }> = [];
    spec.levels.forEach((lv, i) => {
        const d = resolveVisual(ctx, lv.visual as any, { seed: 'z' + i });
        const cx = i * (D + gap) + D / 2, cy = D / 2;
        if (i === 0) {
            if (d) { const c = cluster([d], cx, cy, D, D); svg += c.svg; frames.push({ cx, cy, r: D / 2, box: { x: c.x, y: c.y, w: c.w, h: c.h } }); }
            else frames.push({ cx, cy, r: D / 2 });
        } else {
            const r = D / 2;
            const clip = ctx.defs.clip(`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r - 1)}"/>`);
            svg += el('circle', { cx, cy, r, fill: '#FBFCFE' });
            if (d) { const c = cluster([d], cx, cy, D * 0.86, D * 0.86); svg += el('g', { 'clip-path': clip }, c.svg); frames.push({ cx, cy, r, box: { x: c.x, y: c.y, w: c.w, h: c.h } }); }
            else frames.push({ cx, cy, r });
            svg += el('circle', { cx, cy, r, fill: 'none', stroke: '#5B6675', 'stroke-width': 2.2 });
        }
        svg += caption(lv.label, lv.detail, cx, D + 16, capW).svg;
    });
    // Zoom cones from the focus of level i to the frame of level i+1.
    for (let i = 0; i < L - 1; i++) {
        const fr = frames[i], nx = frames[i + 1], focus = spec.levels[i].focus ?? [0.5, 0.5];
        const b = fr.box ?? { x: fr.cx - fr.r, y: fr.cy - fr.r, w: fr.r * 2, h: fr.r * 2 };
        const px = b.x + b.w * focus[0], py = b.y + b.h * focus[1], pr = Math.max(9, Math.min(b.w, b.h) * 0.11);
        // outer tangents between two circles (approximate with the vertical extremes, good for side-by-side)
        const t1 = tangents(px, py, pr, nx.cx, nx.cy, nx.r);
        cones += el('path', { d: `M${f(t1[0].x)} ${f(t1[0].y)} L${f(t1[1].x)} ${f(t1[1].y)} A${f(nx.r)} ${f(nx.r)} 0 0 0 ${f(t1[3].x)} ${f(t1[3].y)} L${f(t1[2].x)} ${f(t1[2].y)} Z`, fill: '#E9EEF5', opacity: 0.75 });
        cones += el('path', { d: `M${f(t1[0].x)} ${f(t1[0].y)} L${f(t1[1].x)} ${f(t1[1].y)} M${f(t1[2].x)} ${f(t1[2].y)} L${f(t1[3].x)} ${f(t1[3].y)}`, stroke: '#7D8896', 'stroke-width': 1.3, 'stroke-dasharray': '4 3', fill: 'none' });
        svg += el('circle', { cx: px, cy: py, r: pr, fill: 'none', stroke: '#3D4A5A', 'stroke-width': 2, 'stroke-dasharray': '3.5 2.5' });
    }
    return { w: L * D + (L - 1) * gap, h: D + 16 + capH, svg: cones + svg };
}

/** External tangent points between circle (x1,y1,r1) and (x2,y2,r2): [top on 1, top on 2, bottom on 1, bottom on 2]. */
function tangents(x1: number, y1: number, r1: number, x2: number, y2: number, r2: number) {
    const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx), b = Math.acos(Math.max(-1, Math.min(1, (r1 - r2) / d)));
    const p = (ang: number) => [{ x: x1 + Math.cos(ang) * r1, y: y1 + Math.sin(ang) * r1 }, { x: x2 + Math.cos(ang) * r2, y: y2 + Math.sin(ang) * r2 }];
    const [t1, t2] = p(a - b), [b1, b2] = p(a + b);
    return [t1, t2, b1, b2];
}
