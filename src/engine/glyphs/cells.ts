// Procedural cells and organelles. Every drawing uses the same lighting model (upper-left highlight,
// same-hue darker outline) so cells from different glyphs read as one illustration set.
import { blob, blobPoints, smoothClosed, smoothOpen, capsule, rng, f, el, g, tone, type Tone, type Pt, type Defs } from '../svg.ts';
import { HUES } from '../color.ts';
import type { GlyphDef, GlyphOut } from './types.ts';

const SW = 1.8;

export function mitochondrion(defs: Defs, cx: number, cy: number, len: number, wid: number, angle: number, t: Tone) {
    const x = -len / 2, y = -wid / 2;
    const inner = capsule(x + wid * 0.16, y + wid * 0.16, len - wid * 0.32, wid * 0.68);
    const n = Math.max(3, Math.round(len / (wid * 0.55)));
    const folds: string[] = [];
    for (let i = 0; i < n; i++) {
        const fx = x + wid * 0.5 + (i + 0.5) * (len - wid) / n, top = i % 2 === 0;
        const y1 = top ? y + wid * 0.16 : y + wid * 0.84, y2 = top ? y + wid * 0.62 : y + wid * 0.38;
        folds.push(`M${f(fx - wid * 0.09)} ${f(y1)} L${f(fx - wid * 0.07)} ${f(y2)} Q${f(fx)} ${f(y2 + (top ? 1 : -1) * wid * 0.12)} ${f(fx + wid * 0.07)} ${f(y2)} L${f(fx + wid * 0.09)} ${f(y1)}`);
    }
    return g(
        el('path', { d: capsule(x, y, len, wid), fill: defs.body(t), stroke: t.stroke, 'stroke-width': SW * 0.8 }) +
        el('path', { d: inner, fill: t.light, stroke: t.stroke, 'stroke-width': 0.9, opacity: 0.95 }) +
        el('path', { d: folds.join(' '), fill: t.light, stroke: t.stroke, 'stroke-width': 0.9, 'stroke-linejoin': 'round' }),
        { transform: `translate(${f(cx)} ${f(cy)}) rotate(${f(angle)})` });
}

export function nucleusShape(defs: Defs, cx: number, cy: number, rx: number, ry: number, t: Tone, seed: number | string, opts: { nucleoli?: number; lobes?: number; jitter?: number; pores?: boolean } = {}) {
    const r = rng(String(seed) + 'n');
    let body: string;
    if (opts.lobes && opts.lobes > 1) {
        const parts: string[] = [];
        for (let i = 0; i < opts.lobes; i++) {
            const a = -Math.PI * 0.8 + (i / (opts.lobes - 1)) * Math.PI * 0.6 + Math.PI / 2;
            const lx = cx + Math.cos(a + Math.PI) * rx * 0.55 * (i - (opts.lobes - 1) / 2) / ((opts.lobes - 1) / 2 || 1);
            const ly = cy + Math.sin(i * 1.7) * ry * 0.25;
            parts.push(el('path', { d: blob(lx, ly, rx * 0.42, ry * 0.5, { n: 8, jitter: 0.08, seed: String(seed) + i }), fill: defs.body(t), stroke: t.stroke, 'stroke-width': SW * 0.8 }));
            if (i < opts.lobes - 1) {
                const nx = cx + Math.cos(a + Math.PI) * rx * 0.55 * (i + 1 - (opts.lobes - 1) / 2) / ((opts.lobes - 1) / 2 || 1);
                parts.push(el('path', { d: `M${f(lx)} ${f(ly)} L${f(nx)} ${f(cy + Math.sin((i + 1) * 1.7) * ry * 0.25)}`, stroke: t.stroke, 'stroke-width': ry * 0.22, 'stroke-linecap': 'round' }));
                parts.push(el('path', { d: `M${f(lx)} ${f(ly)} L${f(nx)} ${f(cy + Math.sin((i + 1) * 1.7) * ry * 0.25)}`, stroke: t.base, 'stroke-width': ry * 0.22 - SW * 1.4, 'stroke-linecap': 'round' }));
            }
        }
        return g(parts.join(''));
    }
    body = el('path', { d: blob(cx, cy, rx, ry, { n: 9, jitter: opts.jitter ?? 0.05, seed: String(seed) + 'nuc' }), fill: defs.body(t), stroke: t.stroke, 'stroke-width': SW * 0.85 });
    let extra = '';
    // Chromatin speckles.
    for (let i = 0; i < Math.round(rx * ry / 60); i++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.75;
        extra += el('circle', { cx: cx + Math.cos(a) * rx * d, cy: cy + Math.sin(a) * ry * d, r: 0.6 + r() * 1.1, fill: t.stroke, opacity: 0.22 });
    }
    for (let i = 0; i < (opts.nucleoli ?? 1); i++) {
        const nx = cx + (r() - 0.5) * rx * 0.6, ny = cy + (r() - 0.5) * ry * 0.5;
        extra += el('path', { d: blob(nx, ny, rx * 0.24, ry * 0.22, { n: 7, jitter: 0.1, seed: String(seed) + 'nl' + i }), fill: t.shadow, stroke: t.stroke, 'stroke-width': 0.8 });
    }
    if (opts.pores) {
        for (let i = 0; i < 10; i++) {
            const a = (i / 10) * Math.PI * 2;
            extra += el('circle', { cx: cx + Math.cos(a) * rx, cy: cy + Math.sin(a) * ry, r: 1.6, fill: '#fff', stroke: t.stroke, 'stroke-width': 0.8 });
        }
    }
    return body + extra;
}

function nucleusTone(cell: Tone, accent?: Tone) {
    if (accent) return accent;
    return tone(HUES.purple);
}

function organelles(defs: Defs, cx: number, cy: number, rx: number, ry: number, seed: string, avoid: { x: number; y: number; r: number }, t: Tone) {
    const r = rng(seed + 'org');
    const mito = tone(HUES.orange), ves = tone(HUES.yellow), er = tone(HUES.sky);
    let out = '';
    // ER as concentric partial arcs hugging the nucleus.
    for (let k = 0; k < 2; k++) {
        const rr = avoid.r * (1.25 + k * 0.18), a0 = r() * Math.PI * 2, a1 = a0 + Math.PI * (0.5 + r() * 0.3);
        const pts: Pt[] = [];
        for (let i = 0; i <= 8; i++) { const a = a0 + (a1 - a0) * i / 8; pts.push({ x: avoid.x + Math.cos(a) * rr * (1 + Math.sin(i * 2.1) * 0.04), y: avoid.y + Math.sin(a) * rr * 0.95 }); }
        out += el('path', { d: smoothOpen(pts), fill: 'none', stroke: er.stroke, 'stroke-width': 2.6, 'stroke-linecap': 'round', opacity: 0.55 });
        out += el('path', { d: smoothOpen(pts), fill: 'none', stroke: er.light, 'stroke-width': 1.2, 'stroke-linecap': 'round' });
    }
    const place = (minR: number) => {
        for (let tries = 0; tries < 40; tries++) {
            const a = r() * Math.PI * 2, d = 0.35 + r() * 0.45, x = cx + Math.cos(a) * rx * d, y = cy + Math.sin(a) * ry * d;
            if (Math.hypot(x - avoid.x, y - avoid.y) > avoid.r * 1.25 + minR) return { x, y };
        }
        return null;
    };
    for (let i = 0; i < 3; i++) { const p = place(rx * 0.14); if (p) out += mitochondrion(defs, p.x, p.y, rx * 0.3, rx * 0.12, r() * 180, mito); }
    for (let i = 0; i < 4; i++) { const p = place(rx * 0.05); if (p) out += el('circle', { cx: p.x, cy: p.y, r: rx * (0.035 + r() * 0.03), fill: ves.light, stroke: ves.stroke, 'stroke-width': 0.8 }); }
    return out;
}

function cellBody(defs: Defs, d: string, t: Tone, sw = SW) {
    return el('path', { d, fill: defs.soft(t), stroke: t.stroke, 'stroke-width': sw }) +
        // inner rim highlight gives the membrane a little volume
        el('path', { d, fill: 'none', stroke: '#fff', 'stroke-width': sw * 0.9, opacity: 0.35, transform: 'translate(0.8 0.8)' });
}

const animalCell: GlyphDef = {
    name: 'cell', aliases: ['animal cell', 'eukaryotic cell', 'mammalian cell', 'generic cell', 'somatic cell', 'fibroblast', 'hepatocyte', 'epithelial cell', 'cultured cell'],
    category: 'cell', color: 'peach', description: 'Eukaryotic cell with nucleus; detail:"high" adds ER, mitochondria and vesicles. variant: round | flat | fibroblast.',
    variants: ['round', 'flat', 'fibroblast'],
    draw({ defs }, o, t, a) {
        const seed = String(o.seed ?? 'cell');
        if (o.variant === 'fibroblast') {
            const W = 160, H = 80, pts = [{ x: 4, y: 44 }, { x: 40, y: 26 }, { x: 70, y: 16 }, { x: 104, y: 22 }, { x: 156, y: 10 }, { x: 126, y: 44 }, { x: 150, y: 74 }, { x: 96, y: 60 }, { x: 62, y: 66 }, { x: 30, y: 56 }];
            const d = smoothClosed(pts, 0.85);
            return { w: W, h: H, svg: cellBody(defs, d, t) + nucleusShape(defs, 80, 41, 20, 12, nucleusTone(t, o.accent ? a : undefined), seed), shape: 'ellipse' };
        }
        const W = 120, H = o.variant === 'flat' ? 80 : 110, cx = W / 2, cy = H / 2;
        const rx = W / 2 - 3, ry = H / 2 - 3;
        const d = blob(cx, cy, rx, ry, { n: 11, jitter: 0.045, seed });
        const nt = nucleusTone(t, o.accent ? a : undefined);
        const nx = cx + rx * 0.06, ny = cy + ry * 0.04, nr = Math.min(rx, ry) * 0.36;
        let inside = '';
        if (o.detail !== 'low') inside += organelles(defs, cx, cy, rx, ry, seed, { x: nx, y: ny, r: nr }, t);
        return { w: W, h: H, svg: cellBody(defs, d, t) + inside + nucleusShape(defs, nx, ny, nr * 1.05, nr * 0.95, nt, seed), shape: 'ellipse' };
    },
};

const roundCell = (name: string, aliases: string[], color: string, description: string, opts: { surface?: 'villi' | 'antibody' | 'granules' | 'none'; nucleus?: number; lobes?: number; jitter?: number; nucleusColor?: string; nucleoli?: number } = {}): GlyphDef => ({
    name, aliases, category: 'cell', color, description,
    draw({ defs }, o, t, a) {
        const seed = String(o.seed ?? name), R = 44, W = 100, H = 100, cx = 50, cy = 50, r = rng(seed);
        const d = blob(cx, cy, R, R, { n: 12, jitter: opts.jitter ?? 0.025, seed });
        let surface = '';
        if (opts.surface === 'villi') {
            for (let i = 0; i < 26; i++) {
                const ang = (i / 26) * Math.PI * 2 + r() * 0.1, x1 = cx + Math.cos(ang) * R * 0.98, y1 = cy + Math.sin(ang) * R * 0.98, L = 4 + r() * 2.5;
                surface += el('path', { d: `M${f(x1)} ${f(y1)} l${f(Math.cos(ang) * L)} ${f(Math.sin(ang) * L)}`, stroke: t.stroke, 'stroke-width': 2.2, 'stroke-linecap': 'round' });
            }
        }
        if (opts.surface === 'antibody') {
            const ab = tone(HUES.yellow);
            for (let i = 0; i < 9; i++) {
                const ang = (i / 9) * Math.PI * 2 + 0.3, x1 = cx + Math.cos(ang) * R, y1 = cy + Math.sin(ang) * R, L = 7;
                const x2 = x1 + Math.cos(ang) * L, y2 = y1 + Math.sin(ang) * L, s = 4.5;
                const p = (da: number) => `${f(x2 + Math.cos(ang + da) * s)} ${f(y2 + Math.sin(ang + da) * s)}`;
                surface += el('path', { d: `M${f(x1)} ${f(y1)} L${f(x2)} ${f(y2)} M${p(-0.7)} L${f(x2)} ${f(y2)} L${p(0.7)}`, stroke: ab.stroke, 'stroke-width': 2, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
            }
        }
        const nt = o.accent ? a : tone(opts.nucleusColor ? HUES[opts.nucleusColor] : HUES.purple);
        const nr = R * (opts.nucleus ?? 0.6);
        let granules = '';
        if (opts.surface === 'granules') {
            const gt = tone(HUES.red);
            for (let i = 0; i < 9; i++) { const ang = r() * Math.PI * 2, dd = R * (0.62 + r() * 0.25); granules += el('circle', { cx: cx + Math.cos(ang) * dd, cy: cy + Math.sin(ang) * dd, r: 2.6, fill: gt.base, stroke: gt.stroke, 'stroke-width': 0.7 }); }
        }
        return { w: W + 12, h: H + 12, shape: 'ellipse', svg: g(surface + cellBody(defs, d, t) + granules + nucleusShape(defs, cx + 3, cy + 2, nr, nr * 0.94, nt, seed, { lobes: opts.lobes, nucleoli: opts.nucleoli ?? 1 }), { transform: 'translate(6 6)' }) };
    },
});

const macrophage: GlyphDef = {
    name: 'macrophage', aliases: ['monocyte-derived macrophage', 'phagocyte', 'microglia', 'kupffer cell'], category: 'cell', color: 'coral',
    description: 'Irregular phagocyte with pseudopods and vacuoles.',
    draw({ defs }, o, t, a) {
        const seed = String(o.seed ?? 'mac'), r = rng(seed), n = 14;
        const spikes = Array.from({ length: n }, (_, i) => (i % 3 === 0 ? 0.28 + r() * 0.2 : 0));
        const d = smoothClosed(blobPoints(65, 55, 48, 40, { n, jitter: 0.08, seed, spikes }), 0.9);
        const nt = o.accent ? a : tone(HUES.purple);
        const nuc = el('path', { d: 'M48 46 C52 34 76 32 82 44 C86 54 78 66 70 60 C64 56 58 60 54 64 C46 66 44 54 48 46Z', fill: defs.body(nt), stroke: nt.stroke, 'stroke-width': 1.5 });
        let vac = '';
        for (let i = 0; i < 4; i++) vac += el('circle', { cx: 40 + r() * 50, cy: 66 + r() * 12, r: 3 + r() * 3, fill: t.light, stroke: t.stroke, 'stroke-width': 0.9 });
        return { w: 130, h: 110, svg: cellBody(defs, d, t) + vac + nuc, shape: 'ellipse' };
    },
};

const dendritic: GlyphDef = {
    name: 'dendritic cell', aliases: ['dc', 'antigen presenting cell', 'apc', 'langerhans cell'], category: 'cell', color: 'lavender',
    description: 'Star-shaped antigen-presenting cell with long dendrites.',
    draw({ defs }, o, t, a) {
        const seed = String(o.seed ?? 'dc'), r = rng(seed), n = 16;
        const spikes = Array.from({ length: n }, (_, i) => (i % 2 === 0 ? 0.55 + r() * 0.35 : -0.12));
        const d = smoothClosed(blobPoints(60, 60, 30, 30, { n, jitter: 0.05, seed, spikes, rot: 0.2 }), 0.75);
        const nt = o.accent ? a : tone(HUES.indigo);
        return { w: 120, h: 120, svg: cellBody(defs, d, t) + nucleusShape(defs, 61, 60, 15, 13, nt, seed), shape: 'ellipse' };
    },
};

const neuron: GlyphDef = {
    name: 'neuron', aliases: ['nerve cell', 'neural cell', 'motor neuron', 'brain cell', 'pyramidal neuron'], category: 'cell', color: 'yellow',
    description: 'Neuron with branching dendrites, myelinated axon and synaptic terminals.',
    draw({ defs }, o, t, a) {
        const seed = String(o.seed ?? 'neuron'), r = rng(seed);
        const W = 230, H = 110, sx = 52, sy = 55;
        const outline: string[] = [], fill: string[] = [];
        const branch = (x: number, y: number, ang: number, len: number, w: number, depth: number) => {
            const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
            const mx = (x + x2) / 2 + Math.cos(ang + Math.PI / 2) * len * 0.15 * (r() - 0.5), my = (y + y2) / 2 + Math.sin(ang + Math.PI / 2) * len * 0.15 * (r() - 0.5);
            const d = `M${f(x)} ${f(y)} Q${f(mx)} ${f(my)} ${f(x2)} ${f(y2)}`;
            outline.push(el('path', { d, stroke: t.stroke, 'stroke-width': w + 2.4, fill: 'none', 'stroke-linecap': 'round' }));
            fill.push(el('path', { d, stroke: t.base, 'stroke-width': w, fill: 'none', 'stroke-linecap': 'round' }));
            if (depth > 0) for (const da of [-0.45, 0.45]) branch(x2, y2, ang + da + (r() - 0.5) * 0.3, len * 0.66, Math.max(1.4, w * 0.62), depth - 1);
        };
        for (const ang of [Math.PI * 0.82, Math.PI * 1.05, Math.PI * 1.32, Math.PI * 0.6, Math.PI * 1.55]) branch(sx, sy, ang + (r() - 0.5) * 0.2, 22 + r() * 6, 5.5, 2);
        // axon
        const ax = `M${sx} ${sy} C${sx + 50} ${sy - 6} ${sx + 90} ${sy + 8} ${W - 30} ${sy}`;
        outline.push(el('path', { d: ax, stroke: t.stroke, 'stroke-width': 6.4, fill: 'none', 'stroke-linecap': 'round' }));
        fill.push(el('path', { d: ax, stroke: t.base, 'stroke-width': 4, fill: 'none', 'stroke-linecap': 'round' }));
        const my = o.accent ? a : tone(HUES.sky);
        let myelin = '';
        for (let i = 0; i < 4; i++) {
            const x = sx + 38 + i * 30, y = sy + Math.sin((x - sx) / 60) * 2 + 1;
            myelin += el('path', { d: capsule(x, y - 7, 25, 14), fill: defs.cylinder(my, true), stroke: my.stroke, 'stroke-width': 1.2 });
        }
        let term = '';
        for (const da of [-0.6, -0.15, 0.3, 0.7]) {
            const x2 = W - 30 + Math.cos(da) * 22, y2 = sy + Math.sin(da) * 26;
            term += el('path', { d: `M${W - 30} ${sy} Q${f(W - 20)} ${f(sy + Math.sin(da) * 8)} ${f(x2)} ${f(y2)}`, stroke: t.stroke, 'stroke-width': 3.2, fill: 'none', 'stroke-linecap': 'round' });
            term += el('path', { d: `M${W - 30} ${sy} Q${f(W - 20)} ${f(sy + Math.sin(da) * 8)} ${f(x2)} ${f(y2)}`, stroke: t.base, 'stroke-width': 1.6, fill: 'none', 'stroke-linecap': 'round' });
            term += el('circle', { cx: x2, cy: y2, r: 4.2, fill: defs.body(t), stroke: t.stroke, 'stroke-width': 1.2 });
        }
        const soma = el('path', { d: blob(sx, sy, 19, 17, { n: 8, jitter: 0.08, seed }), fill: defs.body(t), stroke: t.stroke, 'stroke-width': SW });
        const nt = tone(HUES.purple);
        return { w: W, h: H, svg: outline.join('') + fill.join('') + myelin + term + soma + el('circle', { cx: sx + 1, cy: sy, r: 7.5, fill: defs.body(nt), stroke: nt.stroke, 'stroke-width': 1.2 }), shape: 'rect' };
    },
};

const rbc: GlyphDef = {
    name: 'red blood cell', aliases: ['rbc', 'erythrocyte', 'red cell', 'blood cell'], category: 'cell', color: 'red',
    description: 'Biconcave erythrocyte (3/4 view). count:3 draws a small group.',
    draw({ defs }, o, t) {
        const one = (cx: number, cy: number, s: number, rot: number) => g(
            el('ellipse', { cx: 0, cy: 0, rx: 40, ry: 30, fill: defs.radial([[0, t.shadow], [0.45, t.base], [0.8, t.base], [1, t.light]], { r: 0.55 }), stroke: t.stroke, 'stroke-width': SW }) +
            el('ellipse', { cx: 1, cy: 1.5, rx: 22, ry: 15, fill: defs.radial([[0, t.shadow], [1, t.base]], { cx: 0.55, cy: 0.6, r: 0.6 }), stroke: t.stroke, 'stroke-width': 0.8, opacity: 0.8 }) +
            el('path', { d: 'M-26 -14 Q-12 -26 10 -24', stroke: '#fff', 'stroke-width': 3, fill: 'none', opacity: 0.4, 'stroke-linecap': 'round' }),
            { transform: `translate(${f(cx)} ${f(cy)}) rotate(${rot}) scale(${s})` });
        if ((o.count ?? 1) > 1) return { w: 150, h: 110, svg: one(48, 72, 0.9, -20) + one(104, 38, 0.85, 15) + one(108, 82, 0.6, -5), shape: 'rect' };
        return { w: 84, h: 64, svg: one(42, 32, 1, 0), shape: 'ellipse' };
    },
};

const platelet: GlyphDef = {
    name: 'platelet', aliases: ['thrombocyte'], category: 'cell', color: 'gold', description: 'Activated platelet.',
    draw({ defs }, o, t) {
        const seed = String(o.seed ?? 'plt'), r = rng(seed), n = 12;
        const spikes = Array.from({ length: n }, () => (r() > 0.6 ? 0.35 : 0));
        const d = smoothClosed(blobPoints(40, 32, 30, 22, { n, jitter: 0.08, seed, spikes }), 0.8);
        let gr = ''; for (let i = 0; i < 5; i++) gr += el('circle', { cx: 28 + r() * 24, cy: 26 + r() * 12, r: 2, fill: t.stroke, opacity: 0.5 });
        return { w: 80, h: 64, svg: cellBody(defs, d, t) + gr, shape: 'ellipse' };
    },
};

const bacterium: GlyphDef = {
    name: 'bacterium', aliases: ['bacteria', 'e. coli', 'microbe', 'pathogen', 'bacillus', 'microbiome', 'gut bacteria', 'coccus', 'staphylococcus', 'streptococcus'], aliasVariants: { coccus: 'coccus', staphylococcus: 'coccus', streptococcus: 'coccus' }, category: 'cell', color: 'green',
    description: 'Rod-shaped bacterium with flagellum and pili. variant: rod | coccus. count:3 draws a cluster.',
    variants: ['rod', 'coccus'],
    draw({ defs }, o, t) {
        const one = (x: number, y: number, rot: number, s: number, seed: number) => {
            const r = rng(seed); let pili = '';
            if (o.variant === 'coccus') {
                return g(el('circle', { cx: 0, cy: 0, r: 22, fill: defs.body(t), stroke: t.stroke, 'stroke-width': SW }) + el('path', { d: 'M-8 -2 C-2 -10 4 6 10 -2', stroke: t.stroke, 'stroke-width': 1.2, fill: 'none', opacity: 0.6 }), { transform: `translate(${f(x)} ${f(y)}) scale(${s})` });
            }
            for (let i = 0; i < 10; i++) { const px = -30 + i * 6.6, top = r() > 0.5; pili += el('path', { d: `M${f(px)} ${top ? -15 : 15} l${f(r() * 3 - 1.5)} ${top ? -5 : 5}`, stroke: t.stroke, 'stroke-width': 1, 'stroke-linecap': 'round' }); }
            const flag = el('path', { d: 'M36 2 C46 -8 52 12 62 2 S78 -8 88 2', stroke: t.stroke, 'stroke-width': 1.6, fill: 'none', 'stroke-linecap': 'round' });
            return g(pili + flag + el('path', { d: capsule(-40, -16, 80, 32), fill: defs.cylinder(t, true), stroke: t.stroke, 'stroke-width': SW }) +
                el('path', { d: 'M-22 2 C-14 -8 -4 10 6 -2 S20 6 24 0', stroke: t.stroke, 'stroke-width': 1.3, fill: 'none', opacity: 0.55 }), { transform: `translate(${f(x)} ${f(y)}) rotate(${rot}) scale(${s})` });
        };
        if ((o.count ?? 1) > 1) return { w: 180, h: 120, svg: one(60, 40, -15, 0.85, 1) + one(110, 85, 10, 0.8, 2) + one(150, 38, 70, 0.6, 3), shape: 'rect' };
        return { w: 140, h: 50, svg: one(46, 25, 0, 1, 1), shape: 'rect' };
    },
};

const virus: GlyphDef = {
    name: 'virus', aliases: ['virion', 'coronavirus', 'sars-cov-2', 'influenza', 'viral particle', 'hiv', 'aav', 'lentivirus', 'viral vector', 'phage', 'bacteriophage'], category: 'cell', color: 'red',
    description: 'Enveloped virus with spike proteins. variant: enveloped | capsid (icosahedral, e.g. AAV) | phage.',
    variants: ['enveloped', 'capsid', 'phage'],
    aliasVariants: { aav: 'capsid', 'viral vector': 'capsid', phage: 'phage', bacteriophage: 'phage' },
    draw({ defs }, o, t, a) {
        if (o.variant === 'capsid') {
            const pts = Array.from({ length: 6 }, (_, i) => ({ x: 50 + Math.cos(i * Math.PI / 3 + Math.PI / 6) * 42, y: 50 + Math.sin(i * Math.PI / 3 + Math.PI / 6) * 42 }));
            const hex = 'M' + pts.map(p => `${f(p.x)} ${f(p.y)}`).join(' L') + 'Z';
            let facets = ''; for (const p of pts) facets += el('path', { d: `M50 50 L${f(p.x)} ${f(p.y)}`, stroke: t.stroke, 'stroke-width': 1, opacity: 0.6 });
            let caps = ''; for (let i = 0; i < 6; i++) { const ang = i * Math.PI / 3 + Math.PI / 6; caps += el('circle', { cx: 50 + Math.cos(ang) * 42, cy: 50 + Math.sin(ang) * 42, r: 5, fill: t.base, stroke: t.stroke, 'stroke-width': 1.2 }); }
            return { w: 100, h: 100, svg: el('path', { d: hex, fill: defs.body(t), stroke: t.stroke, 'stroke-width': SW, 'stroke-linejoin': 'round' }) + facets + el('circle', { cx: 50, cy: 50, r: 14, fill: t.light, stroke: t.stroke, 'stroke-width': 1 }) + caps, shape: 'ellipse' };
        }
        if (o.variant === 'phage') {
            const head = 'M40 4 L62 16 L62 40 L40 52 L18 40 L18 16Z';
            let legs = ''; for (const dx of [-1, 1]) for (const k of [0, 1]) legs += el('path', { d: `M40 104 l${dx * (12 + k * 8)} ${10 - k * 2} l${dx * 4} ${12}`, stroke: t.stroke, 'stroke-width': 2, fill: 'none', 'stroke-linejoin': 'round' });
            return { w: 80, h: 130, svg: legs + el('rect', { x: 34, y: 52, width: 12, height: 50, fill: defs.cylinder(t), stroke: t.stroke, 'stroke-width': 1.4 }) + el('rect', { x: 26, y: 100, width: 28, height: 6, rx: 2, fill: t.base, stroke: t.stroke, 'stroke-width': 1.4 }) + el('path', { d: head, fill: defs.body(t), stroke: t.stroke, 'stroke-width': SW, 'stroke-linejoin': 'round' }) + el('path', { d: 'M18 16 L40 28 L62 16 M40 28 V52', stroke: t.stroke, 'stroke-width': 1, fill: 'none', opacity: 0.6 }), shape: 'rect' };
        }
        const cx = 60, cy = 60, R = 36, n = 16, sp = o.accent ? a : tone(HUES.orange);
        let spikes = '';
        for (let i = 0; i < n; i++) {
            const ang = (i / n) * Math.PI * 2, x1 = cx + Math.cos(ang) * R, y1 = cy + Math.sin(ang) * R, x2 = cx + Math.cos(ang) * (R + 13), y2 = cy + Math.sin(ang) * (R + 13);
            spikes += el('path', { d: `M${f(x1)} ${f(y1)} L${f(x2)} ${f(y2)}`, stroke: sp.stroke, 'stroke-width': 3, 'stroke-linecap': 'round' });
            spikes += g(el('path', { d: 'M-6 -3 Q0 -9 6 -3 L3 3 L-3 3Z', fill: defs.body(sp), stroke: sp.stroke, 'stroke-width': 1, 'stroke-linejoin': 'round' }), { transform: `translate(${f(x2)} ${f(y2)}) rotate(${f(ang * 180 / Math.PI + 90)})` });
        }
        const rna = el('path', { d: 'M42 58 C48 44 56 72 62 56 S74 50 78 64', stroke: t.stroke, 'stroke-width': 1.6, fill: 'none', opacity: 0.6 });
        let dots = ''; const r = rng('v'); for (let i = 0; i < 8; i++) { const ang = r() * 6.28, d = 12 + r() * 16; dots += el('circle', { cx: cx + Math.cos(ang) * d, cy: cy + Math.sin(ang) * d, r: 2, fill: t.stroke, opacity: 0.25 }); }
        return { w: 120, h: 120, svg: spikes + el('circle', { cx, cy, r: R, fill: defs.body(t), stroke: t.stroke, 'stroke-width': SW }) + dots + rna, shape: 'ellipse' };
    },
};

const cancer: GlyphDef = {
    name: 'cancer cell', aliases: ['tumor cell', 'tumour cell', 'malignant cell', 'cancer', 'tumor', 'carcinoma cell', 'metastatic cell'], category: 'cell', color: 'magenta',
    description: 'Irregular malignant cell with enlarged, multi-nucleolar nucleus.',
    draw({ defs }, o, t, a) {
        const seed = String(o.seed ?? 'ca'), r = rng(seed), n = 14;
        const spikes = Array.from({ length: n }, () => (r() > 0.7 ? 0.14 : 0));
        const d = smoothClosed(blobPoints(60, 55, 52, 46, { n, jitter: 0.12, seed, spikes }), 0.9);
        const nt = o.accent ? a : tone(HUES.indigo);
        return { w: 124, h: 114, svg: cellBody(defs, d, t) + nucleusShape(defs, 62, 56, 26, 22, nt, seed, { nucleoli: 3, jitter: 0.14 }), shape: 'ellipse' };
    },
};

const yeast: GlyphDef = {
    name: 'yeast', aliases: ['s. cerevisiae', 'budding yeast', 'fungus', 'fungal cell'], category: 'cell', color: 'tan', description: 'Budding yeast cell.',
    draw({ defs }, o, t) {
        return { w: 120, h: 90, svg: el('ellipse', { cx: 82, cy: 34, rx: 22, ry: 19, fill: defs.body(t), stroke: t.stroke, 'stroke-width': SW }) + el('ellipse', { cx: 48, cy: 52, rx: 40, ry: 34, fill: defs.body(t), stroke: t.stroke, 'stroke-width': SW }) + el('circle', { cx: 44, cy: 54, r: 12, fill: t.light, stroke: t.stroke, 'stroke-width': 1.2 }) + el('ellipse', { cx: 60, cy: 36, rx: 6, ry: 4, fill: t.shadow, opacity: 0.6 }), shape: 'ellipse' };
    },
};

const epithelium: GlyphDef = {
    name: 'epithelium', aliases: ['epithelial layer', 'monolayer', 'tissue layer', 'intestinal epithelium', 'endothelium', 'barrier', 'cell monolayer'], category: 'cell', color: 'pink',
    description: 'Row of columnar epithelial cells with microvilli and basement membrane. count = number of cells (default 6).',
    draw({ defs }, o, t, a) {
        const n = Math.max(3, Math.min(12, o.count ?? 6)), cw = 30, H = 70, W = n * cw + 8;
        const nt = o.accent ? a : tone(HUES.purple);
        let cells = '', villi = '';
        for (let i = 0; i < n; i++) {
            const x = 4 + i * cw;
            cells += el('path', { d: `M${x} 14 Q${x + cw / 2} 8 ${x + cw} 14 V${H - 6} H${x} Z`, fill: defs.linear([[0, t.light], [1, t.base]]), stroke: t.stroke, 'stroke-width': 1.4, 'stroke-linejoin': 'round' });
            cells += el('ellipse', { cx: x + cw / 2, cy: H - 22, rx: 7, ry: 9, fill: defs.body(nt), stroke: nt.stroke, 'stroke-width': 1 });
            for (let k = 0; k < 5; k++) villi += el('path', { d: `M${f(x + 4 + k * (cw - 8) / 4)} ${f(12.5 - Math.sin((k / 4) * Math.PI) * 2.5)} v-6`, stroke: t.stroke, 'stroke-width': 1.8, 'stroke-linecap': 'round' });
        }
        const bm = el('rect', { x: 2, y: H - 6, width: W - 4, height: 5, rx: 2.5, fill: tone(HUES.gray).base, stroke: tone(HUES.gray).stroke, 'stroke-width': 1 });
        return { w: W, h: H, svg: villi + cells + bm, shape: 'rect' };
    },
};

const organoid: GlyphDef = {
    name: 'organoid', aliases: ['spheroid organoid', 'intestinal organoid', 'cyst', 'acinus', 'mini-organ'], category: 'cell', color: 'pink',
    description: 'Polarised epithelial ring around a lumen (organoid cross-section).',
    draw({ defs }, o, t, a) {
        const n = 16, cx = 60, cy = 60, R1 = 26, R2 = 52, nt = o.accent ? a : tone(HUES.purple), r = rng(String(o.seed ?? 'org'));
        let cells = '';
        for (let i = 0; i < n; i++) {
            const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, j = 1 + (r() - 0.5) * 0.08;
            const p = (ang: number, rr: number) => `${f(cx + Math.cos(ang) * rr)} ${f(cy + Math.sin(ang) * rr)}`;
            cells += el('path', { d: `M${p(a0, R1)} A${R1} ${R1} 0 0 1 ${p(a1, R1)} L${p(a1, R2 * j)} A${R2} ${R2} 0 0 0 ${p(a0, R2 * j)} Z`, fill: defs.radial([[0, t.light], [1, t.base]], { cx: 0.5, cy: 0.5, r: 0.7 }), stroke: t.stroke, 'stroke-width': 1.2, 'stroke-linejoin': 'round' });
            const am = (a0 + a1) / 2;
            cells += el('ellipse', { cx: cx + Math.cos(am) * (R2 - 10), cy: cy + Math.sin(am) * (R2 - 10), rx: 4.5, ry: 6, transform: `rotate(${f(am * 180 / Math.PI + 90)} ${f(cx + Math.cos(am) * (R2 - 10))} ${f(cy + Math.sin(am) * (R2 - 10))})`, fill: nt.base, stroke: nt.stroke, 'stroke-width': 0.8 });
        }
        return { w: 120, h: 120, svg: cells + el('circle', { cx, cy, r: R1 - 1, fill: '#FBF7F2', stroke: t.stroke, 'stroke-width': 0.8, opacity: 0.9 }), shape: 'ellipse' };
    },
};

const cluster: GlyphDef = {
    name: 'cell cluster', aliases: ['spheroid', 'cell aggregate', 'colony', 'cell colony', 'tissue', 'embryoid body', 'cell population', 'cells', 'ipsc colony', 'tumor spheroid', 'blastocyst', 'morula'], category: 'cell', color: 'teal',
    description: 'Compact cluster of round cells (colony / spheroid / population). count = number of cells (default 14).',
    draw({ defs }, o, t, a) {
        const seed = String(o.seed ?? 'cl'), r = rng(seed), n = Math.max(3, Math.min(40, o.count ?? 14));
        const pts: Array<{ x: number; y: number }> = [];
        // Phyllotaxis packing gives an even, organic arrangement.
        const s = 13;
        for (let i = 0; i < n; i++) { const rad = s * Math.sqrt(i + 0.5), th = i * 2.39996; pts.push({ x: Math.cos(th) * rad, y: Math.sin(th) * rad * 0.9 }); }
        const R = Math.max(...pts.map(p => Math.hypot(p.x, p.y))) + 14, W = R * 2 + 4, c = W / 2;
        const nt = o.accent ? a : tone(HUES.purple);
        let out = '';
        pts.sort((p, q) => p.y - q.y);
        for (const p of pts) {
            const cr = 12 + r() * 2.5;
            out += el('path', { d: blob(c + p.x, c + p.y, cr, cr * 0.94, { n: 8, jitter: 0.05, seed: seed + p.x }), fill: defs.body(t), stroke: t.stroke, 'stroke-width': 1.3 });
            out += el('circle', { cx: c + p.x + 1, cy: c + p.y + 1, r: cr * 0.42, fill: nt.base, stroke: nt.stroke, 'stroke-width': 0.8, opacity: 0.9 });
        }
        return { w: W, h: W, svg: out, shape: 'ellipse' };
    },
};

const stem = roundCell('stem cell', ['ipsc', 'ips cell', 'induced pluripotent stem cell', 'esc', 'embryonic stem cell', 'progenitor', 'hsc', 'hematopoietic stem cell', 'pluripotent stem cell', 'msc', 'mesenchymal stem cell'], 'teal', 'Round stem / progenitor cell with large nucleus.', { nucleus: 0.62, nucleoli: 2 });
const tcell = roundCell('t cell', ['t-cell', 't lymphocyte', 'cd4 t cell', 'cd8 t cell', 'cytotoxic t cell', 'helper t cell', 'treg', 'car-t cell', 'car t cell', 'lymphocyte'], 'sky', 'T lymphocyte with surface microvilli.', { surface: 'villi', nucleus: 0.68 });
const bcell = roundCell('b cell', ['b-cell', 'b lymphocyte', 'plasma cell'], 'green', 'B lymphocyte with surface antibodies (BCR).', { surface: 'antibody', nucleus: 0.64 });
const nk = roundCell('nk cell', ['natural killer cell', 'nk'], 'orange', 'Natural killer cell with cytotoxic granules.', { surface: 'granules', nucleus: 0.5 });
const neutrophil = roundCell('neutrophil', ['granulocyte', 'pmn', 'eosinophil', 'basophil'], 'lavender', 'Neutrophil with multi-lobed nucleus.', { lobes: 3, nucleus: 0.5 });
const monocyte = roundCell('monocyte', ['white blood cell', 'leukocyte', 'immune cell', 'pbmc'], 'blue', 'Monocyte / generic leukocyte.', { nucleus: 0.55, jitter: 0.04 });

// ---- Organelles ------------------------------------------------------------------------------

const mito: GlyphDef = {
    name: 'mitochondrion', aliases: ['mitochondria', 'mito', 'mitochondrial'], category: 'organelle', color: 'orange', description: 'Mitochondrion with cristae.',
    draw({ defs }, o, t) { return { w: 120, h: 56, svg: mitochondrion(defs, 60, 28, 112, 48, 0, t), shape: 'ellipse' }; },
};
const nucleus: GlyphDef = {
    name: 'nucleus', aliases: ['cell nucleus', 'nuclear envelope', 'chromatin'], category: 'organelle', color: 'purple', description: 'Nucleus with nucleolus and nuclear pores.',
    draw({ defs }, o, t) { return { w: 100, h: 90, svg: nucleusShape(defs, 50, 45, 46, 41, t, String(o.seed ?? 'nuc'), { pores: true, nucleoli: 1 }), shape: 'ellipse' }; },
};
const vesicle: GlyphDef = {
    name: 'vesicle', aliases: ['exosome', 'extracellular vesicle', 'ev', 'endosome', 'lysosome', 'liposome', 'secretory vesicle', 'microvesicle'], category: 'organelle', color: 'yellow',
    description: 'Lipid-bilayer vesicle with cargo (exosome, endosome, lysosome, liposome).',
    draw({ defs }, o, t, a) {
        const cx = 40, cy = 40, R = 34, r = rng(String(o.seed ?? 'ves')); let heads = '';
        for (let i = 0; i < 30; i++) { const ang = (i / 30) * Math.PI * 2; heads += el('circle', { cx: cx + Math.cos(ang) * R, cy: cy + Math.sin(ang) * R, r: 2.6, fill: t.base, stroke: t.stroke, 'stroke-width': 0.7 }); }
        for (let i = 0; i < 24; i++) { const ang = (i / 24) * Math.PI * 2 + 0.1; heads += el('circle', { cx: cx + Math.cos(ang) * (R - 8), cy: cy + Math.sin(ang) * (R - 8), r: 2.2, fill: t.base, stroke: t.stroke, 'stroke-width': 0.7 }); }
        let cargo = ''; const ct = o.accent ? a : tone(HUES.pink);
        for (let i = 0; i < 5; i++) { const ang = r() * 6.28, d = r() * 12; cargo += el('path', { d: blob(cx + Math.cos(ang) * d, cy + Math.sin(ang) * d, 4.5, 4, { n: 6, seed: i }), fill: ct.base, stroke: ct.stroke, 'stroke-width': 0.8 }); }
        return { w: 80, h: 80, svg: el('circle', { cx, cy, r: R - 4, fill: t.pale, stroke: t.light, 'stroke-width': 6 }) + heads + cargo, shape: 'ellipse' };
    },
};
const er: GlyphDef = {
    name: 'endoplasmic reticulum', aliases: ['er', 'rough er', 'rer', 'golgi', 'golgi apparatus'], aliasVariants: { golgi: 'golgi', 'golgi apparatus': 'golgi' }, category: 'organelle', color: 'sky', description: 'Stacked membrane cisternae (ER / Golgi).',
    draw({ defs }, o, t) {
        let out = '';
        for (let i = 0; i < 4; i++) {
            const y = 14 + i * 16, w = 100 - Math.abs(i - 1.5) * 14, x = (110 - w) / 2;
            out += el('path', { d: `M${f(x)} ${f(y + 6)} Q${f(x + w / 2)} ${f(y - 8)} ${f(x + w)} ${f(y + 6)} Q${f(x + w + 4)} ${f(y + 12)} ${f(x + w - 4)} ${f(y + 12)} Q${f(x + w / 2)} ${f(y)} ${f(x + 4)} ${f(y + 12)} Q${f(x - 4)} ${f(y + 12)} ${f(x)} ${f(y + 6)}Z`, fill: defs.body(t), stroke: t.stroke, 'stroke-width': 1.3 });
            if (o.variant !== 'golgi') for (let k = 0; k < 7; k++) out += el('circle', { cx: x + 8 + k * (w - 16) / 6, cy: y + 13.5 - Math.sin((k / 6) * Math.PI) * 6, r: 1.4, fill: t.dark });
        }
        return { w: 110, h: 84, svg: out, shape: 'rect' };
    },
};

export const cellGlyphs: GlyphDef[] = [animalCell, stem, tcell, bcell, nk, neutrophil, monocyte, macrophage, dendritic, neuron, rbc, platelet, cancer, bacterium, virus, yeast, epithelium, organoid, cluster, mito, nucleus, vesicle, er];
