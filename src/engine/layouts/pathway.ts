// Cell-signalling scene: extracellular space, a lipid bilayer with embedded receptors, a cytoplasmic
// cascade laid out in layers under the receptor that drives it, and a nucleus with target genes.
// The caller only lists molecules, where they live and how they interact.
import type { PathwaySpec } from '../spec.ts';
import { resolveVisual, type Drawable } from '../visual.ts';
import { arrow, boundary, edgeKind, type Box } from '../connectors.ts';
import { el, g, f, text, wrap, textWidth, roundRect, INK, rng, tone } from '../svg.ts';
import { HUES, resolveColor, mix } from '../color.ts';
import type { Block, Ctx } from './common.ts';

type Loc = 'extracellular' | 'membrane' | 'cytoplasm' | 'nucleus' | 'output';
type N = {
    id: string; label: string; kind: string; loc: Loc; color: string; d: Drawable; s: number;
    x: number; y: number; // centre
    row: number; side?: N; dockedOn?: N; beside?: N; labelPos: 'inside' | 'below' | 'above' | 'right';
};

const CYCLE = ['blue', 'teal', 'orange', 'purple', 'green', 'pink', 'gold', 'sky', 'coral', 'lavender', 'red', 'indigo'];
const MEMBRANE_KINDS: Record<string, string> = { receptor: 'receptor', gpcr: 'gpcr', rtk: 'rtk', channel: 'ion channel', 'ion channel': 'ion channel', transporter: 'transporter', pump: 'transporter' };
const LIGAND_SHAPES = ['circle', 'triangle', 'diamond', 'hexagon', 'square', 'star'];

function defaultLoc(kind: string): Loc {
    if (kind in MEMBRANE_KINDS) return 'membrane';
    if (kind === 'ligand' || kind === 'antibody' || kind === 'virus') return 'extracellular';
    if (kind === 'gene' || kind === 'dna') return 'nucleus';
    return 'cytoplasm';
}

function guessKind(n: PathwaySpec['nodes'][number]): string {
    if (n.kind) return n.kind.toLowerCase();
    const l = (n.label ?? n.id).toLowerCase();
    if (n.location === 'membrane') return /gpcr|adrenergic|muscarinic|opioid|frizzled|smoothened|cxcr|ccr|s1p/.test(l) ? 'gpcr' : /egfr|her2|vegfr|pdgfr|fgfr|igf|insulin r|trk|kit|met\b|alk|ret/.test(l) ? 'rtk' : /channel|trp|piezo|nav|cav|kv|nmda|ampa/.test(l) ? 'channel' : 'receptor';
    if (n.location === 'extracellular') return 'ligand';
    if (n.location === 'nucleus' && /^[A-Za-z0-9-]+$/.test(n.label ?? '') && /gene|target/.test(n.note ?? '')) return 'gene';
    if (/kinase|mek|erk|raf|akt|pi3k|jak|mtor|pka|pkc|cdk|mapk|ras|src|ikk|jnk|p38|stat\d? ?p/.test(l)) return 'kinase';
    if (/ca\^?2\+|ca2\+|na\+|k\+|cl-|zn|ion/.test(l)) return 'ion';
    if (/camp|cgmp|ip3|dag|ros|no\b|atp|nad/.test(l)) return 'messenger';
    return 'protein';
}

export function pathway(ctx: Ctx, spec: PathwaySpec): Block {
    const span = 34;
    const nodes: N[] = [];
    const byId = new Map<string, N>();
    let ligandIdx = 0;
    spec.nodes.forEach((sn, i) => {
        const kind = guessKind(sn);
        const loc: Loc = (sn.location as Loc) ?? defaultLoc(kind);
        // Drugs and chemical structures read better in neutral ink than in a palette hue.
        const neutral = kind === 'drug' || kind === 'inhibitor' || kind === 'small molecule';
        const color = resolveColor(sn.color, neutral ? '#54606E' : HUES[CYCLE[i % CYCLE.length]]);
        const label = sn.label ?? sn.id;
        let ref: any = sn.visual;
        let labelPos: N['labelPos'] = 'below';
        if (!ref) {
            if (kind in MEMBRANE_KINDS) ref = { glyph: MEMBRANE_KINDS[kind], color, mods: sn.mods, seed: sn.id, span };
            else if (kind === 'ligand') ref = { glyph: 'ligand', variant: LIGAND_SHAPES[ligandIdx++ % LIGAND_SHAPES.length], color, count: 1 };
            else if (kind === 'gene' || kind === 'dna') ref = { glyph: 'dna', count: 2, color: 'blue', accent: 'orange' };
            else if (kind === 'mrna' || kind === 'rna') ref = { glyph: 'mrna', color };
            else if (kind === 'ion') ref = { glyph: 'ion', color, count: 3 };
            else if (kind === 'drug' || kind === 'inhibitor' || kind === 'small molecule') ref = { glyph: 'small molecule', color };
            else if (kind === 'antibody') ref = { glyph: 'antibody', color };
            else if (kind === 'gprotein' || kind === 'g protein') ref = { glyph: 'g protein' };
            else if (kind === 'vesicle') ref = { glyph: 'vesicle', color };
            else if (kind === 'messenger') ref = { glyph: 'ligand', variant: 'pentagon', color, count: 3 };
            else {
                const variant = kind === 'kinase' ? 'kinase' : kind === 'tf' || kind === 'transcription factor' ? 'tf' : kind === 'complex' ? 'complex' : kind === 'dimer' ? 'dimer' : 'globular';
                ref = { glyph: 'protein', variant, color, label: label.length <= 12 ? label : undefined, mods: sn.mods, seed: sn.id };
                labelPos = label.length <= 12 ? 'inside' : 'below';
            }
        }
        const d = resolveVisual(ctx, typeof ref === 'object' && kind in MEMBRANE_KINDS ? { ...ref } : ref, { color, seed: sn.id })!;
        if (kind in MEMBRANE_KINDS || loc === 'membrane') labelPos = 'right';
        if (loc === 'extracellular') labelPos = 'above';
        // Library illustrations get a sensible size; procedural glyphs are drawn at native scale.
        const s = d.source === 'asset' ? Math.min(90 / d.w, 70 / d.h) : (kind === 'gene' || kind === 'dna' ? 0.8 : 1);
        // Membrane glyphs from procedural set already include the bilayer span.
        const n: N = { id: sn.id, label, kind, loc, color, d, s, x: 0, y: 0, row: 0, labelPos };
        nodes.push(n); byId.set(sn.id, n); if (sn.label) byId.set(sn.label, n);
    });
    const edges = spec.edges.map(e => ({ e, a: byId.get(e.from)!, b: byId.get(e.to)!, kind: edgeKind(e.type ?? e.label) })).filter(x => {
        if (!x.a || !x.b) { ctx.warnings.push(`Pathway edge ${x.e.from} -> ${x.e.to} references an unknown node id.`); return false; }
        return true;
    });
    const W0 = (n: N) => n.d.w * n.s, H0 = (n: N) => n.d.h * n.s;
    const labelW = (n: N) => n.labelPos === 'inside' ? 0 : textWidth(n.label, 12.5, 700);

    // ---- horizontal lanes from membrane order -------------------------------------------------
    const membrane = nodes.filter(n => n.loc === 'membrane');
    let x = 0;
    for (const m of membrane) { m.x = x + W0(m) / 2 + 20; x = m.x + W0(m) / 2 + labelW(m) + 70; }
    const laneW = Math.max(x, 300);
    const preds = (n: N) => edges.filter(e => e.b === n).map(e => e.a);
    const succs = (n: N) => edges.filter(e => e.a === n).map(e => e.b);
    const meanX = (ns: N[], fb: number) => ns.length ? ns.reduce((a, n) => a + n.x, 0) / ns.length : fb;

    // Docked ligands: an extracellular node whose only partner is a membrane node sits on its binding site.
    for (const n of nodes.filter(n => n.loc === 'extracellular')) {
        const partners = [...succs(n), ...preds(n)];
        const mem = partners.find(p => p.loc === 'membrane');
        if (mem) n.dockedOn = mem;
    }
    const dockCount = new Map<N, number>();
    // A drug with no inputs that acts on one receptor belongs beside that receptor, not in the cascade.
    for (const n of nodes) {
        if (n.loc === 'membrane' || n.dockedOn) continue;
        if (!preds(n).length && succs(n).length === 1 && succs(n)[0].loc === 'membrane') { n.loc = 'extracellular'; n.beside = succs(n)[0]; continue; }
        const out = succs(n), inn = preds(n);
        if (!inn.length && out.length === 1 && out[0].loc !== 'membrane' && (n.loc === out[0].loc || n.kind === 'drug' || n.kind === 'inhibitor' || n.kind === 'small molecule')) { n.side = out[0]; n.loc = out[0].loc; }
    }
    // ---- layering in cytoplasm and nucleus -----------------------------------------------------
    const layered = (loc: Loc) => {
        const set = nodes.filter(n => n.loc === loc && !n.side);
        const depth = new Map<N, number>(set.map(n => [n, 0]));
        for (let it = 0; it < set.length + 1; it++) for (const n of set) {
            let dmax = 0;
            for (const p of preds(n)) if (depth.has(p) && p !== n && !(p.side)) dmax = Math.max(dmax, depth.get(p)! + 1);
            depth.set(n, dmax);
        }
        if (loc === 'nucleus') { const maxD = Math.max(0, ...depth.values()); for (const n of set) if (n.kind === 'gene' || n.kind === 'dna') depth.set(n, Math.max(maxD, 1)); }
        // Avoid cycles exploding depth.
        for (const n of set) depth.set(n, Math.min(depth.get(n)!, set.length));
        const rows: N[][] = [];
        for (const n of set) { const d = depth.get(n)!; (rows[d] ??= []).push(n); n.row = d; }
        return rows.filter(Boolean);
    };
    // Linear stretches of the cascade (A -> B -> C with no branching) are packed into horizontal
    // runs that snake left/right, which keeps long cascades compact like hand-made figures.
    const MAXRUN = 3;
    type Group = { nodes: N[]; run: boolean; dir: number };
    const mainSuccs = (n: N) => succs(n).filter(s => !s.side && s.loc !== 'membrane');
    const pack = (rows: N[][], prevTail?: N): Group[] => {
        const groups: Group[] = [];
        for (const row of rows) {
            const last = groups[groups.length - 1];
            if (row.length === 1 && last?.run && last.nodes.length < MAXRUN) {
                const n = row[0], tail = last.nodes[last.nodes.length - 1], p = preds(n).filter(q => !q.side);
                if (p.length === 1 && p[0] === tail && mainSuccs(tail).length === 1) { last.nodes.push(n); continue; }
            }
            groups.push({ nodes: row.slice(), run: row.length === 1, dir: 1 });
        }
        return groups;
    };
    const cytoRows = pack(layered('cytoplasm'));
    const nucRows = pack(layered('nucleus'));
    const runSpacing = (a: N, b: N) => W0(a) / 2 + W0(b) / 2 + 74 + Math.max(0, labelW(a) - W0(a)) / 2 * (a.labelPos === 'below' ? 1 : 0) + Math.max(0, labelW(b) - W0(b)) / 2 * (b.labelPos === 'below' ? 1 : 0);
    let lastDir = -1;
    const placeRow = (row: N[], fallbackIdx: (n: N, i: number) => number) => {
        row.forEach((n, i) => { const p = preds(n).filter(p => p.x || p.loc === 'membrane'); n.x = meanX(p, fallbackIdx(n, i)); });
        row.sort((a, b) => a.x - b.x);
        const target = row.reduce((a, n) => a + n.x, 0) / row.length;
        // spread to minimum spacing
        for (let i = 1; i < row.length; i++) {
            const a = row[i - 1], b = row[i];
            const sideOfA = nodes.find(s => s.side === a);
            const extraA = (sideOfA ? W0(sideOfA) + 52 : 0) + (a.labelPos === 'below' ? Math.max(0, labelW(a) - W0(a)) / 2 : 0);
            const min = W0(a) / 2 + W0(b) / 2 + 46 + extraA + (b.labelPos === 'below' ? Math.max(0, labelW(b) - W0(b)) / 2 : 0);
            if (b.x - a.x < min) b.x = a.x + min;
        }
        const mid = (row[0].x + row[row.length - 1].x) / 2, shift = target - mid;
        for (const n of row) n.x += shift;
    };
    const placeGroup = (gr: Group) => {
        if (!gr.run || gr.nodes.length === 1) { placeRow(gr.nodes, (n, i) => laneW * (i + 1) / (gr.nodes.length + 1)); return; }
        const first = gr.nodes[0];
        first.x = meanX(preds(first).filter(p => p.x || p.loc === 'membrane'), laneW / 2);
        gr.dir = -lastDir; lastDir = gr.dir;
        for (let i = 1; i < gr.nodes.length; i++) gr.nodes[i].x = gr.nodes[i - 1].x + gr.dir * runSpacing(gr.nodes[i - 1], gr.nodes[i]);
    };
    cytoRows.forEach(placeGroup);
    lastDir = -1;
    nucRows.forEach(placeGroup);
    // Side modulators: beside a lone target, below a target that sits inside a horizontal run.
    const inRun = new Set<N>([...cytoRows, ...nucRows].filter(g => g.run && g.nodes.length > 1).flatMap(g => g.nodes));
    // Side modulators to the right of their target.
    for (const n of nodes) if (n.side) n.x = inRun.has(n.side) ? n.side.x : n.side.x + W0(n.side) / 2 + W0(n) / 2 + 52;
    // Docked ligands above receptors; free extracellular nodes above their partners.
    for (const n of nodes.filter(n => n.loc === 'extracellular')) {
        const host = n.dockedOn;
        if (host) { const k = dockCount.get(host) ?? 0; dockCount.set(host, k + 1); n.x = host.x + (k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (W0(n) + 10)); }
        else if (n.beside) n.x = n.beside.x + W0(n.beside) / 2 + W0(n) / 2 + 44;
        else n.x = meanX([...succs(n), ...preds(n)].filter(p => p.x), laneW / 2);
    }

    // ---- normalise horizontal extent ---------------------------------------------------------
    const all = nodes;
    let minX = Math.min(...all.map(n => n.x - W0(n) / 2 - (n.labelPos === 'below' || n.labelPos === 'above' ? Math.max(0, labelW(n) - W0(n)) / 2 : 0)));
    let maxX = Math.max(...all.map(n => n.x + W0(n) / 2 + (n.labelPos === 'right' ? labelW(n) + 14 : n.labelPos === 'inside' ? 0 : Math.max(0, labelW(n) - W0(n)) / 2)));
    const marginX = 70;
    const shiftX = marginX - minX;
    for (const n of all) n.x += shiftX;
    let W = Math.max(maxX - minX + marginX * 2, 560);
    if (W < ctx.maxWidth * 0.55) { const extra = (Math.min(ctx.maxWidth * 0.6, 760) - W) / 2; if (extra > 0) { for (const n of all) n.x += extra; W += extra * 2; } }

    // ---- vertical positions ----------------------------------------------------------------
    const memAbove = Math.max(30, ...membrane.map(m => (m.d.membraneY ?? H0(m) / 2) * m.s));
    const memBelow = Math.max(30, ...membrane.map(m => H0(m) - (m.d.membraneY ?? H0(m) / 2) * m.s));
    const extra = nodes.filter(n => n.loc === 'extracellular');
    const ligH = Math.max(0, ...extra.map(n => H0(n) + 22));
    const freeExtra = extra.filter(n => !n.dockedOn);
    const topPad = 26 + ligH + (freeExtra.length ? 50 : 0);
    const memMid = topPad + memAbove;
    for (const m of membrane) m.y = memMid - (m.d.membraneY ?? H0(m) / 2) * m.s + H0(m) / 2;
    for (const n of extra) {
        if (n.dockedOn) { const h = n.dockedOn, top = h.y - H0(h) / 2 + (h.d.anchors?.top?.y ?? 0) * h.s; n.y = top - H0(n) / 2 + 3; }
        else n.y = memMid - span / 2 - memAbove - 40 - H0(n) / 2;
    }
    if (!membrane.length) for (const n of extra) n.y = 40;
    let y = memMid + span / 2 + Math.max(memBelow - span / 2, 10) + 56;
    const rowGap = 54;
    const placeRows = (groups: Group[]) => {
        for (const gr of groups) {
            const row = gr.nodes;
            const h = Math.max(...row.map(n => H0(n)), ...nodes.filter(s => s.side && row.includes(s.side) && !inRun.has(s.side)).map(s => H0(s)));
            for (const n of row) n.y = y + h / 2;
            let below = 0;
            for (const sd of nodes.filter(s => s.side && row.includes(s.side))) {
                if (inRun.has(sd.side!)) { sd.y = y + h + 46 + H0(sd) / 2; below = Math.max(below, 46 + H0(sd) + 22); }
                else sd.y = y + h / 2;
            }
            const lab = Math.max(0, ...row.map(n => n.labelPos === 'below' ? 22 : 0));
            y += h + Math.max(lab, below) + rowGap;
        }
    };
    placeRows(cytoRows);
    const cytoBottom = y - rowGap;
    let nuc: { x: number; y: number; w: number; h: number } | undefined;
    const wantNucleus = spec.nucleus ?? nucRows.length > 0;
    if (wantNucleus) {
        y += 4;
        const ny0 = y;
        y += 42;
        placeRows(nucRows);
        const nucNodes = nodes.filter(n => n.loc === 'nucleus');
        const xs = nucNodes.length ? nucNodes.flatMap(n => [n.x - W0(n) / 2 - Math.max(0, labelW(n) - W0(n)) / 2, n.x + W0(n) / 2 + Math.max(0, labelW(n) - W0(n)) / 2]) : [W * 0.3, W * 0.7];
        const nx0 = Math.max(20, Math.min(...xs) - 70), nx1 = Math.min(W - 20, Math.max(...xs) + 70);
        const nw = Math.max(nx1 - nx0, Math.min(W - 40, 320));
        const ncx = (nx0 + nx1) / 2;
        nuc = { x: Math.max(20, ncx - nw / 2), y: ny0, w: nw, h: Math.max(110, y - rowGap - ny0 + 24) };
        y = nuc.y + nuc.h;
    } else y = cytoBottom;
    const outputs = spec.outputs ?? [];
    const outY = y + 58;
    const H = outputs.length ? outY + 40 : y + 30;

    // ---- drawing ------------------------------------------------------------------------------
    let bg = '', mem = '', body = '', labels = '', arrows = '';
    const cytoTop = memMid + span / 2;
    bg += el('rect', { x: 0, y: 0, width: W, height: memMid, fill: ctx.defs.linear([[0, '#FFFFFF'], [1, '#F3F8FC']]) });
    bg += el('rect', { x: 0, y: cytoTop, width: W, height: H - cytoTop, fill: ctx.defs.linear([[0, '#FDF6EF'], [0.6, '#FEFAF6'], [1, '#FFFFFF']]) });
    if (membrane.length || extra.length) mem += bilayer(0, memMid, W, span, membrane.map(m => [m.x - W0(m) / 2 + 4, m.x + W0(m) / 2 - 4] as [number, number]));
    if (spec.compartmentLabels !== false) {
        const cl = (s: string, yy: number) => text(s.toUpperCase(), 12, yy, { size: 10, weight: 700, color: '#9AA6B4', letterSpacing: 1.2 });
        if (membrane.length) { labels += cl('Extracellular', 10); labels += cl('Cytoplasm', cytoTop + 14); }
    }
    if (nuc) {
        const t = tone(HUES.lavender);
        bg += el('path', { d: roundRect(nuc.x - 5, nuc.y - 5, nuc.w + 10, nuc.h + 10, 46), fill: 'none', stroke: t.base, 'stroke-width': 2.5 });
        bg += el('path', { d: roundRect(nuc.x, nuc.y, nuc.w, nuc.h, 42), fill: ctx.defs.linear([[0, mix(t.pale, '#ffffff', 0.2)], [1, t.pale]]), stroke: t.base, 'stroke-width': 2.5 });
        // nuclear pores on the top edge
        for (let px = nuc.x + 70; px < nuc.x + nuc.w - 60; px += 90) bg += el('rect', { x: px - 6, y: nuc.y - 8, width: 12, height: 11, rx: 3, fill: '#FFFFFF', stroke: t.stroke, 'stroke-width': 1.2 });
        labels += text('NUCLEUS', nuc.x + 22, nuc.y + 16, { size: 10, weight: 700, color: t.stroke, letterSpacing: 1.2 });
    }
    const boxOf = (n: N): Box => ({ x: n.x - W0(n) / 2, y: n.y - H0(n) / 2, w: W0(n), h: H0(n), shape: n.d.shape });
    for (const n of nodes) body += n.d.draw(n.x - W0(n) / 2, n.y - H0(n) / 2, n.s);
    for (const n of nodes) {
        if (n.labelPos === 'inside') continue;
        const b = boxOf(n);
        if (n.labelPos === 'right') labels += text(n.label, b.x + b.w + 8, memMid - span / 2 - 22, { size: 12.5, weight: 700, color: INK.text, halo: '#ffffff' });
        else if (n.labelPos === 'above') labels += text(n.label, n.x, b.y - 6, { size: 12, weight: 700, anchor: 'middle', baseline: 'alphabetic', color: INK.text, halo: '#ffffff' });
        else labels += text(wrap(n.label, 12.5, Math.max(110, b.w + 40), 700), n.x, b.y + b.h + 5, { size: 12.5, weight: 700, anchor: 'middle', color: INK.text, halo: '#ffffff' });
    }
    // Edges
    const pairCount = new Map<string, number>();
    for (const { e, a, b, kind } of edges) {
        if (a.dockedOn === b || b.dockedOn === a) continue; // ligand already sits on its receptor
        const A = boxOf(a), B = boxOf(b);
        let pa: { x: number; y: number }, pb: { x: number; y: number };
        if (a.loc === 'membrane' && b.loc !== 'membrane' && b.y > a.y) pa = { x: a.x, y: A.y + A.h - 2 };
        else pa = boundary(A, { x: b.x, y: b.y }, 2);
        if (b.loc === 'membrane' && a.loc !== 'membrane' && a.y > b.y) pb = { x: b.x, y: B.y + B.h };
        else pb = boundary(B, { x: a.x, y: a.y }, 2);
        // Re-aim from the adjusted points.
        if (!(a.loc === 'membrane' && b.y > a.y)) pa = boundary(A, pb, 2);
        if (!(b.loc === 'membrane' && a.y > b.y)) pb = boundary(B, pa, 2);
        const key = [a.id, b.id].sort().join('|'); const k = pairCount.get(key) ?? 0; pairCount.set(key, k + 1);
        const dx = pb.x - pa.x, dy = pb.y - pa.y;
        const curve = k ? 0.22 * (k % 2 ? 1 : -1) : Math.abs(dx) > 30 && Math.abs(dy) > 30 ? 0.1 * Math.sign(dx * dy || 1) : 0;
        const side: 1 | -1 = Math.abs(dy) < 24 ? -1 : dx < -10 ? -1 : 1;
        const opts = { kind, label: e.label, curve, startGap: 3, endGap: kind === 'inhibit' ? 6 : 4, dashed: e.dashed, labelMax: 130, color: kind === 'inhibit' ? '#B23A48' : INK.line };
        let r = arrow(pa, pb, { ...opts, labelSide: side });
        // A label that lands on another molecule is moved to the other side of the arrow.
        if (r.label && nodes.some(n => n !== a && n !== b && overlaps(r.label!, boxOf(n)))) {
            const alt = arrow(pa, pb, { ...opts, labelSide: side === 1 ? -1 : 1 });
            if (!alt.label || !nodes.some(n => n !== a && n !== b && overlaps(alt.label!, boxOf(n)))) r = alt;
        }
        arrows += r.svg;
    }
    // Outputs
    if (outputs.length) {
        const pills = outputs.map(o => ({ o, w: textWidth(o, 12.5, 700) + 30 }));
        const total = pills.reduce((a, p) => a + p.w, 0) + 14 * (pills.length - 1);
        let px = W / 2 - total / 2;
        const src = nuc ? { x: nuc.x + nuc.w / 2, y: nuc.y + nuc.h + 4 } : { x: W / 2, y: cytoBottom };
        for (const p of pills) {
            const t = tone(HUES.navy);
            body += el('path', { d: roundRect(px, outY - 15, p.w, 30, 15), fill: t.pale, stroke: t.base, 'stroke-width': 1.5 }) + text(p.o, px + p.w / 2, outY, { size: 12.5, weight: 700, anchor: 'middle', baseline: 'middle', color: t.dark });
            arrows += arrow(src, { x: px + p.w / 2, y: outY - 17 }, { width: 1.8 }).svg;
            px += p.w + 14;
        }
    }
    return { w: W, h: H, svg: el('g', {}, bg + mem + arrows + body + labels) };
}

function bilayer(x0: number, mid: number, W: number, span: number, holes: Array<[number, number]>) {
    const head = '#F4BE86', headStroke = '#D08A47', tail = '#E9C8A4';
    const r = 4.3, step = 9.6;
    let tails = '', heads = '';
    const top = mid - span / 2 + r, bot = mid + span / 2 - r;
    for (let x = x0 + step / 2; x < x0 + W; x += step) {
        if (holes.some(([a, b]) => x > a && x < b)) continue;
        tails += `M${f(x - 1.6)} ${f(top + r)} L${f(x - 1.9)} ${f(mid - 1.5)} M${f(x + 1.6)} ${f(top + r)} L${f(x + 1.9)} ${f(mid - 1.5)}`;
        tails += `M${f(x - 1.6)} ${f(bot - r)} L${f(x - 1.9)} ${f(mid + 1.5)} M${f(x + 1.6)} ${f(bot - r)} L${f(x + 1.9)} ${f(mid + 1.5)}`;
        heads += `<circle cx="${f(x)}" cy="${f(top)}" r="${r}"/><circle cx="${f(x)}" cy="${f(bot)}" r="${r}"/>`;
    }
    return el('path', { d: tails, stroke: tail, 'stroke-width': 1.4, 'stroke-linecap': 'round', fill: 'none' }) + `<g fill="${head}" stroke="${headStroke}" stroke-width="0.9">${heads}</g>`;
}
const overlaps = (p: Box, q: Box) => p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
