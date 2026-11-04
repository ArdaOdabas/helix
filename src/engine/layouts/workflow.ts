// Experimental workflow / protocol layout: illustrated steps joined by labelled arrows, wrapping in a
// serpentine when long, optional tinted stage bands and numbered badges; or a layered DAG when
// explicit branching edges are supplied.
import type { WorkflowSpec } from '../spec.ts';
import { arrow, blockArrow, curveArrow, cubicPoints, sampleCubic, edgeKind, elbow, type Box } from '../connectors.ts';
import { roundRect, tone } from '../svg.ts';
import { HUES, resolveColor } from '../color.ts';
import { caption, captionHeight, cluster, visuals, stepBadge, band, type Block, type Ctx, el, text, wrap, textWidth, INK, T } from './common.ts';

const STAGE_COLORS = ['blue', 'teal', 'orange', 'purple', 'green', 'pink', 'yellow', 'gray'];

type Prepared = { i: number; id: string; s: WorkflowSpec['steps'][number]; ds: ReturnType<typeof visuals> };

export function workflow(ctx: Ctx, spec: WorkflowSpec): Block {
    const VS = spec.visualSize ?? 104, VW = Math.round(VS * 1.45);
    const steps: Prepared[] = spec.steps.map((s, i) => ({ i, id: s.id ?? String(i), s, ds: visuals(ctx, s.visuals ?? (s.visual !== undefined ? [s.visual] : []), s.color, `wf${i}`) }));
    const branching = (spec.edges?.length ?? 0) > 0;
    return branching ? dag(ctx, spec, steps, VS, VW) : sequence(ctx, spec, steps, VS, VW);
}

function drawStep(ctx: Ctx, p: Prepared, cx: number, vy: number, VS: number, VW: number, colW: number, numbered: boolean, badgeColor?: string) {
    let svg = '';
    let vis: { x: number; w: number; y: number; h: number };
    if (p.ds.length) {
        const c = cluster(p.ds, cx, vy + VS / 2, VW, VS);
        svg += c.svg; vis = { x: c.x, w: c.w, y: c.y, h: c.h };
    } else {
        // Text-only step: a tinted card holding the label.
        const t = tone(resolveColor(p.s.color, HUES.blue)), w = Math.min(colW, Math.max(110, textWidth(p.s.label ?? '', T.label, 700) + 30)), h = Math.min(VS, 64);
        svg += el('path', { d: roundRect(cx - w / 2, vy + VS / 2 - h / 2, w, h, 12), fill: t.pale, stroke: t.base, 'stroke-width': 1.6 });
        const lines = wrap(p.s.label ?? '', T.label, w - 20, 700);
        svg += text(lines, cx, vy + VS / 2, { size: T.label, weight: 700, anchor: 'middle', baseline: 'middle', color: t.dark });
        vis = { x: cx - w / 2, w, y: vy + VS / 2 - h / 2, h };
    }
    if (numbered) svg += stepBadge(p.i + 1, Math.max(cx - colW / 2 + 10, vis.x - 4), vy + 8, badgeColor);
    const cap = p.ds.length ? caption(p.s.label, p.s.detail, cx, vy + VS + 12, colW + 12) : caption(undefined, p.s.detail, cx, vy + VS + 12, colW + 12);
    svg += cap.svg;
    return { svg, vis, capH: cap.h };
}

function sequence(ctx: Ctx, spec: WorkflowSpec, steps: Prepared[], VS: number, VW: number): Block {
    const n = steps.length;
    const colW = Math.max(VW, 128);
    const block = spec.arrowStyle === 'block';
    const gap = Math.min(158, Math.max(block ? 74 : 66, ...steps.slice(0, -1).map(p => p.s.action ? Math.min(150, textWidth(p.s.action, 11.5) * 0.62 + 34) : 0)));
    const maxW = ctx.maxWidth;
    let perRow = spec.perRow ?? n;
    if (!spec.perRow) while (perRow > 1 && perRow * colW + (perRow - 1) * gap > maxW) perRow--;
    // Balance rows (7 steps at 4/row -> 4+3, not 6+1).
    const rowsN = Math.ceil(n / perRow); perRow = Math.ceil(n / rowsN);
    const hasStages = !!spec.stages?.length;
    const topPad = hasStages ? 30 : spec.numbered ? 6 : 0;
    const rows: Prepared[][] = [];
    for (let r = 0; r < rowsN; r++) rows.push(steps.slice(r * perRow, (r + 1) * perRow));
    const capH = steps.map(p => p.ds.length ? captionHeight(p.s.label, p.s.detail, colW + 12) : captionHeight(undefined, p.s.detail, colW + 12));
    const turnLabelH = (r: number) => { const last = rows[r][rows[r].length - 1]; return last?.s.action && r < rowsN - 1 ? wrap(last.s.action, 11.5, colW / 2 - 6).length * 14.5 : 0; };
    const rowGap = (r: number) => Math.max(hasStages ? 44 : 34, turnLabelH(r) + 22);
    const W = perRow * colW + (perRow - 1) * gap + (hasStages ? 24 : 0);
    const ox = hasStages ? 12 : 0;
    const colX = (r: number, k: number) => ox + (r % 2 === 0 ? k : perRow - 1 - k) * (colW + gap); // serpentine
    let y = hasStages ? 12 : 0, svg = '', under = '';
    const rowY: number[] = [], rowH: number[] = [];
    const placed: Array<{ cx: number; vy: number; vis: { x: number; w: number; y: number; h: number }; capBottom: number; row: number }> = [];
    rows.forEach((row, r) => {
        const h = topPad + VS + 12 + Math.max(...row.map(p => capH[p.i])) + (hasStages ? 16 : 6);
        rowY.push(y); rowH.push(h);
        row.forEach((p, k) => {
            const cx = colX(r, k) + colW / 2, vy = y + topPad;
            const d = drawStep(ctx, p, cx, vy, VS, VW, colW, !!spec.numbered);
            svg += d.svg;
            placed.push({ cx, vy, vis: d.vis, capBottom: vy + VS + 12 + d.capH, row: r });
        });
        y += h + (r < rowsN - 1 ? rowGap(r) : 0);
    });
    // Stage bands (behind everything).
    (spec.stages ?? []).forEach((st, si) => {
        const idx = (v: string | number) => typeof v === 'number' ? v : steps.findIndex(p => p.id === v || p.s.label === v);
        const a = Math.max(0, idx(st.from)), b = Math.min(n - 1, Math.max(a, idx(st.to)));
        const color = resolveColor(st.color, HUES[STAGE_COLORS[si % STAGE_COLORS.length]]);
        let first = true;
        for (let r = 0; r < rowsN; r++) {
            const inRow = placed.map((p, i) => ({ p, i })).filter(({ p, i }) => p.row === r && i >= a && i <= b);
            if (!inRow.length) continue;
            const xs = inRow.map(({ p }) => p.cx);
            const x0 = Math.min(...xs) - colW / 2 - 10, x1 = Math.max(...xs) + colW / 2 + 10;
            under += band(x0, rowY[r] + 4, x1 - x0, rowH[r] - 4, color, first ? st.label : undefined);
            first = false;
        }
    });
    // Arrows.
    for (let i = 0; i < n - 1; i++) {
        const A = placed[i], B = placed[i + 1], label = steps[i].s.action;
        if (A.row === B.row) {
            const dir = B.cx > A.cx ? 1 : -1, ay = A.vy + VS / 2;
            const ax = dir > 0 ? Math.max(A.vis.x + A.vis.w, A.cx + 10) + 8 : Math.min(A.vis.x, A.cx - 10) - 8;
            const bx = dir > 0 ? Math.min(B.vis.x, B.cx - 10) - 8 : Math.max(B.vis.x + B.vis.w, B.cx + 10) + 8;
            const a = { x: Math.min(Math.max(ax, A.cx + dir * colW / 2 - dir * 6), ax), y: ay };
            const sx = dir > 0 ? Math.min(ax, A.cx + colW / 2 + 4) : Math.max(ax, A.cx - colW / 2 - 4), ex = dir > 0 ? Math.max(bx, B.cx - colW / 2 - 4) : Math.min(bx, B.cx + colW / 2 + 4);
            void a;
            if (block) svg += blockArrow({ x: sx, y: ay }, { x: ex, y: ay }, { label, labelMax: gap + 30 }).svg;
            else svg += arrow({ x: sx, y: ay }, { x: ex, y: ay }, { label, labelMax: gap + 24 }).svg;
        } else {
            // Row turn: straight down from below the caption to above the next illustration.
            const x = A.cx, y0 = A.capBottom + 6, y1 = B.vy + Math.max(0, (B.vis.y - B.vy)) - 6;
            const r = arrow({ x, y: y0 }, { x, y: Math.max(y0 + 20, y1) }, {});
            svg += r.svg;
            if (label) svg += text(wrap(label, 11.5, colW / 2 - 6), x + 10, (y0 + y1) / 2 - 7, { size: 11.5, color: INK.muted, weight: 500, halo: '#fff' });
        }
    }
    return { w: W, h: y + (hasStages ? 4 : 0), svg: under + svg };
}

function dag(ctx: Ctx, spec: WorkflowSpec, steps: Prepared[], VS: number, VW: number): Block {
    const ids = new Map(steps.map(p => [p.id, p] as const));
    for (const p of steps) if (p.s.label && !ids.has(p.s.label)) ids.set(p.s.label, p);
    const edges = (spec.edges ?? []).map(e => ({ e, a: ids.get(e.from), b: ids.get(e.to) })).filter(x => x.a && x.b) as Array<{ e: any; a: Prepared; b: Prepared }>;
    const missing = (spec.edges ?? []).filter(e => !ids.get(e.from) || !ids.get(e.to));
    if (missing.length) ctx.warnings.push(`Workflow edges reference unknown step ids: ${missing.map(e => `${e.from}->${e.to}`).join(', ')}`);
    const layer = new Map<Prepared, number>(steps.map(p => [p, 0]));
    for (let it = 0; it < steps.length; it++) for (const { a, b } of edges) if (layer.get(b)! < layer.get(a)! + 1 && a.i !== b.i) layer.set(b, layer.get(a)! + 1);
    const L = Math.max(...layer.values()) + 1;
    const cols: Prepared[][] = Array.from({ length: L }, () => []);
    for (const p of steps) cols[layer.get(p)!].push(p);
    // Order nodes in each layer by mean parent position to reduce crossings.
    const pos = new Map<Prepared, number>();
    cols.forEach((col, li) => {
        if (li > 0) col.sort((x, y) => mean(edges.filter(e => e.b === x).map(e => pos.get(e.a) ?? 0)) - mean(edges.filter(e => e.b === y).map(e => pos.get(e.a) ?? 0)));
        col.forEach((p, k) => pos.set(p, k - (col.length - 1) / 2));
    });
    const colW = Math.max(VW, 128), gap = 120;
    const cellH = (p: Prepared) => VS + 12 + captionHeight(p.s.label, p.s.detail, colW + 12) + 28;
    const colHeights = cols.map(c => c.reduce((a, p) => a + cellH(p), 0));
    const H = Math.max(...colHeights);
    let svg = '';
    const box = new Map<Prepared, { cx: number; vy: number; vis: { x: number; w: number; y: number; h: number } }>();
    cols.forEach((col, li) => {
        let y = (H - colHeights[li]) / 2;
        for (const p of col) {
            const cx = li * (colW + gap) + colW / 2, d = drawStep(ctx, p, cx, y, VS, VW, colW, !!spec.numbered);
            svg += d.svg; box.set(p, { cx, vy: y, vis: d.vis }); y += cellH(p);
        }
    });
    const cellBox = (p: Prepared): Box => { const q = box.get(p)!; return { x: q.vis.x - 10, y: q.vis.y - 10, w: q.vis.w + 20, h: q.vis.h + 20 }; };
    const inside = (pt: { x: number; y: number }, q: Box) => pt.x > q.x && pt.x < q.x + q.w && pt.y > q.y && pt.y < q.y + q.h;
    let arrows = '';
    for (const { e, a, b } of edges) {
        const A = box.get(a)!, B = box.get(b)!;
        const from = { x: Math.max(A.vis.x + A.vis.w, A.cx + 20) + 8, y: A.vy + VS / 2 }, to = { x: Math.min(B.vis.x, B.cx - 20) - 8, y: B.vy + VS / 2 };
        const others = steps.filter(p => p !== a && p !== b).map(cellBox);
        // An edge that skips a layer is bowed around whatever stands between its ends.
        const skip = Math.abs(layer.get(b)! - layer.get(a)!) > 1;
        const clear = (bow: number) => !sampleCubic(cubicPoints(from, to, bow)).some(pt => others.some(q => inside(pt, q)));
        const bow = !skip || clear(0) ? 0 : [90, -90, 150, -150].find(clear) ?? 0;
        arrows += curveArrow(from, to, { label: e.label, kind: edgeKind(e.type ?? 'flow'), dashed: e.dashed, labelMax: gap, bow, labelT: bow ? 0.5 : 0.5 }).svg;
    }
    return { w: L * colW + (L - 1) * gap, h: H, svg: arrows + svg };
}
const mean = (a: number[]) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
