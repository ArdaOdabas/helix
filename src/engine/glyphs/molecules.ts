// Procedural molecules: proteins, receptors, ligands, nucleic acids and small molecules.
import { blob, smoothClosed, smoothOpen, capsule, roundRect, rng, f, el, g, text, tone, FONT, type Tone, type Defs, type Pt } from '../svg.ts';
import { HUES, mix } from '../color.ts';
import { NUC, strandWithBases, straightDuplex } from '../nucleic.ts';
import type { GlyphDef, GlyphOpts } from './types.ts';

const SW = 1.6;

function labelInside(label: string | undefined, cx: number, cy: number, t: Tone, size = 13) {
    if (!label) return '';
    return text(label, cx, cy, { size, weight: 700, anchor: 'middle', baseline: 'middle', color: t.dark, halo: t.light });
}

export function modBadge(cx: number, cy: number, kind: string, defs: Defs) {
    const k = kind.toLowerCase();
    const spec: Record<string, [string, string]> = { p: ['P', HUES.yellow], ub: ['Ub', HUES.lime], me: ['Me', HUES.sky], ac: ['Ac', HUES.coral], gly: ['G', HUES.pink], sumo: ['S', HUES.lavender] };
    const [lab, col] = spec[k] ?? [kind.slice(0, 3), HUES.gray];
    const t = tone(col), r = lab.length > 1 ? 9 : 8;
    return el('circle', { cx, cy, r, fill: defs.body(t), stroke: t.stroke, 'stroke-width': 1.2 }) + text(lab, cx, cy, { size: lab.length > 1 ? 8.5 : 10, weight: 700, anchor: 'middle', baseline: 'middle', color: t.dark });
}

function mods(o: GlyphOpts, pts: Pt[], defs: Defs) {
    return (o.mods ?? []).slice(0, pts.length).map((m, i) => modBadge(pts[i].x, pts[i].y, m, defs)).join('');
}

const protein: GlyphDef = {
    name: 'protein', aliases: ['enzyme', 'factor', 'molecule', 'effector', 'adaptor', 'signaling protein', 'cytokine', 'growth factor', 'hormone', 'interleukin', 'chemokine', 'complex', 'protein complex', 'dimer', 'kinase', 'transcription factor', 'tf'],
    category: 'molecule', color: 'blue',
    description: 'Globular protein drawn as a shaded blob; label is written inside. variant: globular | kinase (bilobed) | dimer | complex | elongated | tf (with DNA-binding foot). mods: ["P","Ub",...] add modification badges.',
    variants: ['globular', 'kinase', 'dimer', 'complex', 'elongated', 'tf'],
    aliasVariants: { kinase: 'kinase', 'transcription factor': 'tf', tf: 'tf', dimer: 'dimer', complex: 'complex', 'protein complex': 'complex' },
    draw({ defs }, o, t, a) {
        const seed = String(o.seed ?? o.label ?? 'p');
        const lab = o.label ?? '';
        const lw = Math.max(0, lab.length * 7.6 - 24);
        let svg = '', w = 76 + lw, h = 56, badge: Pt[] = [];
        const v = o.variant ?? 'globular';
        if (v === 'kinase') {
            w = 84 + lw; h = 62;
            svg += el('path', { d: blob(w * 0.36, 34, w * 0.33, 26, { n: 8, jitter: 0.05, seed: seed + 'a' }), fill: defs.body(t), stroke: t.stroke, 'stroke-width': SW });
            svg += el('path', { d: blob(w * 0.66, 29, w * 0.31, 25, { n: 8, jitter: 0.05, seed: seed + 'b' }), fill: defs.body(t), stroke: t.stroke, 'stroke-width': SW });
            badge = [{ x: w - 6, y: 10 }, { x: w - 4, y: 48 }, { x: 8, y: 12 }];
        } else if (v === 'dimer') {
            w = 100 + lw; h = 58;
            const t2 = o.accent ? a : t;
            svg += el('path', { d: blob(w * 0.3, 29, w * 0.28, 25, { n: 8, jitter: 0.06, seed: seed + 'a' }), fill: defs.body(t), stroke: t.stroke, 'stroke-width': SW });
            svg += el('path', { d: blob(w * 0.7, 29, w * 0.28, 25, { n: 8, jitter: 0.06, seed: seed + 'b' }), fill: defs.body(t2), stroke: t2.stroke, 'stroke-width': SW });
            badge = [{ x: w - 6, y: 8 }, { x: 6, y: 8 }];
        } else if (v === 'complex') {
            w = 104 + lw; h = 74;
            const tt = [t, o.accent ? a : tone(HUES.teal), tone(HUES.yellow)];
            svg += el('path', { d: blob(w * 0.3, 44, w * 0.25, 24, { n: 8, jitter: 0.07, seed: seed + 'a' }), fill: defs.body(tt[1]), stroke: tt[1].stroke, 'stroke-width': SW });
            svg += el('path', { d: blob(w * 0.7, 46, w * 0.25, 23, { n: 8, jitter: 0.07, seed: seed + 'b' }), fill: defs.body(tt[2]), stroke: tt[2].stroke, 'stroke-width': SW });
            svg += el('path', { d: blob(w * 0.5, 30, w * 0.3, 25, { n: 8, jitter: 0.06, seed: seed + 'c' }), fill: defs.body(tt[0]), stroke: tt[0].stroke, 'stroke-width': SW });
            badge = [{ x: w - 6, y: 10 }];
            return { w, h, svg: svg + labelInside(lab, w / 2, 30, t) + mods(o, badge, defs), shape: 'ellipse', anchors: { top: { x: w / 2, y: 6 }, bottom: { x: w / 2, y: h - 4 } } };
        } else if (v === 'elongated') {
            w = 110 + lw; h = 40;
            svg += el('path', { d: capsule(2, 4, w - 4, 32), fill: defs.body(t), stroke: t.stroke, 'stroke-width': SW });
            badge = [{ x: w - 6, y: 6 }];
        } else if (v === 'tf') {
            w = 86 + lw; h = 74;
            svg += el('path', { d: `M${f(w * 0.36)} 46 L${f(w * 0.3)} 70 M${f(w * 0.64)} 46 L${f(w * 0.7)} 70`, stroke: t.stroke, 'stroke-width': 7, 'stroke-linecap': 'round' });
            svg += el('path', { d: `M${f(w * 0.36)} 46 L${f(w * 0.3)} 70 M${f(w * 0.64)} 46 L${f(w * 0.7)} 70`, stroke: t.base, 'stroke-width': 4, 'stroke-linecap': 'round' });
            svg += el('path', { d: blob(w / 2, 30, w / 2 - 4, 26, { n: 9, jitter: 0.05, seed }), fill: defs.body(t), stroke: t.stroke, 'stroke-width': SW });
            badge = [{ x: w - 8, y: 8 }, { x: 8, y: 8 }];
            return { w, h, svg: svg + labelInside(lab, w / 2, 30, t) + mods(o, badge, defs), shape: 'ellipse', anchors: { top: { x: w / 2, y: 4 }, bottom: { x: w / 2, y: h } } };
        } else {
            svg += el('path', { d: blob(w / 2, h / 2, w / 2 - 3, h / 2 - 3, { n: 9, jitter: 0.06, seed }), fill: defs.body(t), stroke: t.stroke, 'stroke-width': SW });
            badge = [{ x: w - 7, y: 9 }, { x: w - 4, y: h - 10 }, { x: 7, y: 9 }];
        }
        return { w, h, svg: svg + labelInside(lab, w / 2, h / 2, t) + mods(o, badge, defs), shape: 'ellipse', anchors: { top: { x: w / 2, y: 3 }, bottom: { x: w / 2, y: h - 3 } } };
    },
};

const LIG_SHAPES = ['circle', 'triangle', 'diamond', 'square', 'hexagon', 'star', 'pentagon'];
function ligandShape(defs: Defs, kind: string, cx: number, cy: number, r: number, t: Tone) {
    const poly = (n: number, rot = -Math.PI / 2, k = 1) => 'M' + Array.from({ length: n }, (_, i) => { const a = rot + (i / n) * Math.PI * 2; return `${f(cx + Math.cos(a) * r * k)} ${f(cy + Math.sin(a) * r * k)}`; }).join(' L') + 'Z';
    let d: string;
    switch (kind) {
        case 'triangle': d = poly(3, -Math.PI / 2, 1.15); break;
        case 'diamond': d = poly(4, -Math.PI / 2, 1.1); break;
        case 'square': d = roundRect(cx - r * 0.85, cy - r * 0.85, r * 1.7, r * 1.7, r * 0.3); break;
        case 'hexagon': d = poly(6, 0); break;
        case 'pentagon': d = poly(5); break;
        case 'star': d = 'M' + Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + (i / 10) * Math.PI * 2, rr = i % 2 ? r * 0.5 : r * 1.15; return `${f(cx + Math.cos(a) * rr)} ${f(cy + Math.sin(a) * rr)}`; }).join(' L') + 'Z'; break;
        default: return el('circle', { cx, cy, r, fill: defs.body(t), stroke: t.stroke, 'stroke-width': 1.3 });
    }
    return el('path', { d, fill: defs.body(t), stroke: t.stroke, 'stroke-width': 1.3, 'stroke-linejoin': 'round' });
}
const ligand: GlyphDef = {
    name: 'ligand', aliases: ['agonist', 'antigen', 'signal molecule', 'substrate', 'metabolite', 'neurotransmitter', 'peptide'], category: 'molecule', color: 'orange',
    description: 'Small ligand symbol. variant: circle | triangle | diamond | square | hexagon | star | pentagon. count>1 scatters several.',
    variants: LIG_SHAPES,
    draw({ defs }, o, t) {
        const kind = o.variant ?? 'circle', n = Math.max(1, Math.min(9, o.count ?? 1));
        if (n === 1) return { w: 26, h: 26, svg: ligandShape(defs, kind, 13, 13, 10, t), shape: 'ellipse' };
        const r = rng(String(o.seed ?? 'lig')); let svg = '';
        const W = 34 + n * 12, H = 46;
        for (let i = 0; i < n; i++) svg += ligandShape(defs, kind, 12 + i * ((W - 24) / Math.max(1, n - 1)), 12 + r() * (H - 24), 8, t);
        return { w: W, h: H, svg, shape: 'rect' };
    },
};

const ion: GlyphDef = {
    name: 'ion', aliases: ['ions', 'calcium', 'ca2+', 'na+', 'k+', 'cl-', 'sodium', 'potassium', 'chloride', 'h+', 'proton', 'zinc', 'iron'], category: 'molecule', color: 'yellow',
    description: 'Ion cloud; label sets the symbol (e.g. "Ca^2+^"). count = number of ions.',
    draw({ defs }, o, t) {
        const n = Math.max(1, Math.min(8, o.count ?? 3)), r = rng(String(o.seed ?? 'ion')); let svg = '';
        const W = n === 1 ? 26 : 30 + n * 9, H = n === 1 ? 26 : 40;
        for (let i = 0; i < n; i++) { const x = n === 1 ? 13 : 11 + i * (W - 22) / Math.max(1, n - 1), y = n === 1 ? 13 : 11 + r() * (H - 22); svg += el('circle', { cx: x, cy: y, r: 7, fill: defs.body(t), stroke: t.stroke, 'stroke-width': 1.1 }) + text('+', x, y + 0.5, { size: 10, weight: 700, anchor: 'middle', baseline: 'middle', color: t.dark }); }
        return { w: W, h: H, svg, shape: 'rect' };
    },
};

const smallMolecule: GlyphDef = {
    name: 'small molecule', aliases: ['drug', 'compound', 'inhibitor', 'chemical', 'molecule structure', 'chemical structure', 'small-molecule inhibitor', 'atp', 'glucose'], category: 'molecule', color: 'slate',
    description: 'Skeletal chemical structure (fused rings with substituents).',
    draw({ defs }, o, t) {
        const hex = (cx: number, cy: number, r: number) => Array.from({ length: 6 }, (_, i) => ({ x: cx + Math.cos(Math.PI / 6 + i * Math.PI / 3) * r, y: cy + Math.sin(Math.PI / 6 + i * Math.PI / 3) * r }));
        const r = 16, A = hex(30, 34, r), B = hex(30 + r * Math.sqrt(3), 34, r);
        const ring = (P: Pt[]) => 'M' + P.map(p => `${f(p.x)} ${f(p.y)}`).join(' L') + 'Z';
        const inner = (P: Pt[], idx: number[]) => idx.map(i => { const p = P[i], q = P[(i + 1) % 6], c = { x: (P[0].x + P[3].x) / 2, y: (P[0].y + P[3].y) / 2 }; const k = 0.78; return `M${f(c.x + (p.x - c.x) * k)} ${f(c.y + (p.y - c.y) * k)} L${f(c.x + (q.x - c.x) * k)} ${f(c.y + (q.y - c.y) * k)}`; }).join(' ');
        const col = o.color ? t.stroke : '#3D4A5A';
        const side = `M${f(B[5].x)} ${f(B[5].y)} l14 -8 l14 8 M${f(B[5].x + 28)} ${f(B[5].y)} l0 -15 M${f(A[3].x)} ${f(A[3].y)} l-13 -7`;
        return {
            w: 120, h: 70, shape: 'rect', svg:
                el('path', { d: ring(A) + ring(B) + ' ' + inner(A, [1, 3, 5]) + ' ' + inner(B, [0, 2]) + ' ' + side, fill: 'none', stroke: col, 'stroke-width': 2.2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }) +
                text('OH', B[5].x + 28, B[5].y - 30, { size: 11, weight: 600, anchor: 'middle', color: '#C9475A' })
        };
    },
};

const pill: GlyphDef = {
    name: 'pill', aliases: ['capsule', 'tablet', 'medication', 'medicine', 'oral drug', 'treatment', 'therapy', 'drug treatment'], category: 'molecule', color: 'red', accent: 'white',
    description: 'Two-tone drug capsule. variant: capsule | tablet.',
    draw({ defs }, o, t, a) {
        if (o.variant === 'tablet') return { w: 70, h: 50, svg: el('ellipse', { cx: 35, cy: 30, rx: 32, ry: 17, fill: t.shadow, stroke: t.stroke, 'stroke-width': SW }) + el('ellipse', { cx: 35, cy: 24, rx: 32, ry: 17, fill: defs.body(t), stroke: t.stroke, 'stroke-width': SW }) + el('path', { d: 'M14 24 H56', stroke: t.stroke, 'stroke-width': 1.4, opacity: 0.6 }), shape: 'ellipse' };
        const b = o.accent ? a : tone('#F4F6F8');
        return { w: 100, h: 50, svg: g(el('path', { d: 'M50 4 H28 A21 21 0 0 0 28 46 H50Z', fill: defs.cylinder(t, true), stroke: t.stroke, 'stroke-width': SW }) + el('path', { d: 'M50 4 H72 A21 21 0 0 1 72 46 H50Z', fill: defs.cylinder(b, true), stroke: b.stroke, 'stroke-width': SW }) + el('path', { d: 'M22 13 H44', stroke: '#fff', 'stroke-width': 4, 'stroke-linecap': 'round', opacity: 0.55 }), { transform: 'rotate(-20 50 25)' }), shape: 'ellipse' };
    },
};

// ---- Membrane proteins ------------------------------------------------------------------------
// All membrane glyphs are drawn around a membrane of thickness `span`; membraneY is the mid-plane.

const gpcr: GlyphDef = {
    name: 'gpcr', aliases: ['g protein-coupled receptor', 'g-protein coupled receptor', '7tm receptor', 'seven transmembrane receptor', 'serpentine receptor', 'adrenergic receptor', 'chemokine receptor', 'opioid receptor', 'dopamine receptor'],
    category: 'membrane', color: 'purple', description: 'Seven-transmembrane GPCR with extracellular and intracellular loops.',
    draw({ defs }, o, t) {
        const span = o.span ?? 36, hw = 10, gap = 3.2, n = 7, W = n * hw + (n - 1) * gap + 24, top = 24, H = span + 48;
        const cyl = defs.cylinder(t);
        let loops = '', helices = '';
        for (let i = 0; i < n; i++) {
            const x = 12 + i * (hw + gap);
            helices += el('path', { d: capsule(x, top - 6, hw, span + 12), fill: cyl, stroke: t.stroke, 'stroke-width': 1.3 });
            if (i < n - 1) {
                const up = i % 2 === 1, x1 = x + hw / 2, x2 = x1 + hw + gap, y = up ? top - 4 : top + span + 4, dy = up ? -12 - (i % 3) * 3 : 11 + (i % 3) * 2;
                loops += el('path', { d: `M${f(x1)} ${f(y)} C${f(x1)} ${f(y + dy)} ${f(x2)} ${f(y + dy)} ${f(x2)} ${f(y)}`, fill: 'none', stroke: t.stroke, 'stroke-width': 3.6, 'stroke-linecap': 'round' });
                loops += el('path', { d: `M${f(x1)} ${f(y)} C${f(x1)} ${f(y + dy)} ${f(x2)} ${f(y + dy)} ${f(x2)} ${f(y)}`, fill: 'none', stroke: t.base, 'stroke-width': 1.8, 'stroke-linecap': 'round' });
            }
        }
        const nterm = `M${12 + hw / 2} ${top - 4} C${4} ${top - 14} ${10} ${top - 22} ${2} ${top - 22}`;
        const xl = 12 + 6 * (hw + gap) + hw / 2, cterm = `M${f(xl)} ${top + span + 4} C${f(xl + 4)} ${top + span + 16} ${f(xl + 12)} ${top + span + 12} ${f(xl + 10)} ${top + span + 22}`;
        for (const d of [nterm, cterm]) loops += el('path', { d, fill: 'none', stroke: t.stroke, 'stroke-width': 3.6, 'stroke-linecap': 'round' }) + el('path', { d, fill: 'none', stroke: t.base, 'stroke-width': 1.8, 'stroke-linecap': 'round' });
        return { w: W, h: H, svg: loops + helices, shape: 'rect', membraneY: top + span / 2, anchors: { top: { x: W / 2, y: top - 14 }, bottom: { x: W / 2, y: top + span + 16 } } };
    },
};

const rtk: GlyphDef = {
    name: 'rtk', aliases: ['receptor tyrosine kinase', 'egfr', 'her2', 'vegfr', 'insulin receptor', 'growth factor receptor', 'pdgfr', 'fgfr', 'met', 'kit', 'trk'],
    category: 'membrane', color: 'teal', accent: 'yellow',
    description: 'Dimeric receptor tyrosine kinase: Ig-like extracellular domains, TM helix, intracellular kinase domains; mods:["P"] adds phospho-tyrosines.',
    draw({ defs }, o, t, a) {
        const span = o.span ?? 36, ext = 64, top = ext + 4, H = top + span + 52, W = 84;
        let svg = '';
        for (const side of [-1, 1]) {
            const cx = W / 2 + side * 14;
            svg += el('rect', { x: cx - 3.5, y: top - 4, width: 7, height: span + 8, rx: 3.5, fill: defs.cylinder(t), stroke: t.stroke, 'stroke-width': 1.2 });
            for (let k = 0; k < 3; k++) svg += el('ellipse', { cx: cx + side * (k === 0 ? 5 : 2), cy: top - 14 - k * 18, rx: 12, ry: 10, fill: defs.body(t), stroke: t.stroke, 'stroke-width': 1.3 });
            const kt = tone(t.base);
            svg += el('path', { d: blob(cx + side * 3, top + span + 22, 14, 18, { n: 8, jitter: 0.06, seed: 'k' + side }), fill: defs.body(kt), stroke: kt.stroke, 'stroke-width': 1.3 });
        }
        const P = (o.mods ?? []).map((m, i) => modBadge(i % 2 ? W - 8 : 8, top + span + 14 + Math.floor(i / 2) * 18, m, defs)).join('');
        return { w: W, h: H, svg: svg + P, shape: 'rect', membraneY: top + span / 2, anchors: { top: { x: W / 2, y: 2 }, bottom: { x: W / 2, y: H - 4 } } };
    },
};

const receptor: GlyphDef = {
    name: 'receptor', aliases: ['membrane receptor', 'cytokine receptor', 'cell surface receptor', 'tcr', 't cell receptor', 'bcr', 'tlr', 'toll-like receptor', 'pd-1', 'pd-l1', 'checkpoint', 'integrin', 'ace2', 'car', 'chimeric antigen receptor', 'cd19', 'cd3', 'notch'],
    category: 'membrane', color: 'blue',
    description: 'Generic single-pass / heterodimeric surface receptor with ligand-binding cup.',
    draw({ defs }, o, t, a) {
        const span = o.span ?? 36, top = 50, H = top + span + 38, W = 64;
        const t2 = o.accent ? a : tone(t.base);
        let svg = '';
        svg += el('rect', { x: W / 2 - 11, y: top - 4, width: 7, height: span + 8, rx: 3.5, fill: defs.cylinder(t), stroke: t.stroke, 'stroke-width': 1.2 });
        svg += el('rect', { x: W / 2 + 4, y: top - 4, width: 7, height: span + 8, rx: 3.5, fill: defs.cylinder(t2), stroke: t2.stroke, 'stroke-width': 1.2 });
        // binding cup
        svg += el('path', { d: `M${W / 2 - 8} ${top - 2} C${W / 2 - 28} ${top - 16} ${W / 2 - 26} ${top - 44} ${W / 2 - 12} ${top - 46} C${W / 2 - 4} ${top - 34} ${W / 2 - 4} ${top - 22} ${W / 2 - 1} ${top - 14} Z`, fill: defs.body(t), stroke: t.stroke, 'stroke-width': 1.4, 'stroke-linejoin': 'round' });
        svg += el('path', { d: `M${W / 2 + 8} ${top - 2} C${W / 2 + 28} ${top - 16} ${W / 2 + 26} ${top - 44} ${W / 2 + 12} ${top - 46} C${W / 2 + 4} ${top - 34} ${W / 2 + 4} ${top - 22} ${W / 2 + 1} ${top - 14} Z`, fill: defs.body(t2), stroke: t2.stroke, 'stroke-width': 1.4, 'stroke-linejoin': 'round' });
        svg += el('path', { d: capsule(W / 2 - 12, top + span + 2, 10, 30), fill: defs.body(t), stroke: t.stroke, 'stroke-width': 1.2 });
        svg += el('path', { d: capsule(W / 2 + 2, top + span + 2, 10, 26), fill: defs.body(t2), stroke: t2.stroke, 'stroke-width': 1.2 });
        const P = (o.mods ?? []).map((m, i) => modBadge(i % 2 ? W - 6 : 6, top + span + 14 + Math.floor(i / 2) * 18, m, defs)).join('');
        return { w: W, h: H, svg: svg + P, shape: 'rect', membraneY: top + span / 2, anchors: { top: { x: W / 2, y: top - 30 }, bottom: { x: W / 2, y: H - 4 } } };
    },
};

const channel: GlyphDef = {
    name: 'ion channel', aliases: ['channel', 'pore', 'calcium channel', 'sodium channel', 'potassium channel', 'chloride channel', 'trp channel', 'piezo', 'nmda receptor', 'ampa receptor', 'ligand-gated channel', 'aquaporin', 'gap junction'],
    category: 'membrane', color: 'green', accent: 'yellow',
    description: 'Ion channel: four subunits around a central pore with ions passing through.',
    draw({ defs }, o, t, a) {
        const span = o.span ?? 36, top = 18, H = top + span + 22, W = 80, it = o.accent ? a : tone(HUES.yellow);
        let svg = '';
        const sub = (x: number, w: number, back: boolean) => el('path', { d: roundRect(x, top - 10, w, span + 20, 8), fill: back ? t.shadow : defs.cylinder(t), stroke: t.stroke, 'stroke-width': 1.3 });
        svg += sub(14, 16, true) + sub(50, 16, true);
        for (const y of [top - 8, top + span / 2, top + span + 12]) svg += el('circle', { cx: W / 2, cy: y, r: 5, fill: defs.body(it), stroke: it.stroke, 'stroke-width': 1 });
        svg += sub(4, 20, false) + sub(56, 20, false);
        return { w: W, h: H, svg, shape: 'rect', membraneY: top + span / 2, anchors: { top: { x: W / 2, y: 2 }, bottom: { x: W / 2, y: H - 2 } } };
    },
};

const transporter: GlyphDef = {
    name: 'transporter', aliases: ['pump', 'carrier', 'symporter', 'antiporter', 'abc transporter', 'slc transporter', 'efflux pump', 'glut', 'glucose transporter', 'na/k atpase'],
    category: 'membrane', color: 'orange',
    description: 'Membrane transporter (two-domain carrier with central cavity).',
    draw({ defs }, o, t) {
        const span = o.span ?? 36, top = 16, H = top + span + 24, W = 76;
        const L = `M38 ${top - 12} C14 ${top - 14} 6 ${top} 6 ${top + span / 2} C6 ${top + span + 4} 14 ${top + span + 18} 34 ${top + span + 16} L36 ${top + span / 2} Z`;
        const R = `M38 ${top - 12} C62 ${top - 14} 70 ${top} 70 ${top + span / 2} C70 ${top + span + 4} 62 ${top + span + 18} 42 ${top + span + 16} L40 ${top + span / 2} Z`;
        return { w: W, h: H, svg: el('path', { d: L, fill: defs.body(t), stroke: t.stroke, 'stroke-width': 1.4, 'stroke-linejoin': 'round' }) + el('path', { d: R, fill: defs.body(t), stroke: t.stroke, 'stroke-width': 1.4, 'stroke-linejoin': 'round' }) + el('ellipse', { cx: 38, cy: top + span / 2 + 6, rx: 6, ry: 12, fill: t.pale, stroke: t.stroke, 'stroke-width': 1 }), shape: 'rect', membraneY: top + span / 2, anchors: { top: { x: W / 2, y: 2 }, bottom: { x: W / 2, y: H - 4 } } };
    },
};

const gprotein: GlyphDef = {
    name: 'g protein', aliases: ['heterotrimeric g protein', 'gαβγ', 'g alpha', 'gs', 'gi', 'gq', 'g-protein'], category: 'molecule', color: 'yellow',
    description: 'Heterotrimeric G protein (α, β, γ subunits), labelled.',
    draw({ defs }, o) {
        const A = tone(HUES.gold), B = tone(HUES.teal), G = tone(HUES.pink);
        return {
            w: 100, h: 60, shape: 'ellipse', svg:
                el('path', { d: blob(30, 32, 26, 24, { n: 8, seed: 'ga' }), fill: defs.body(A), stroke: A.stroke, 'stroke-width': SW }) +
                el('path', { d: blob(66, 34, 22, 22, { n: 8, seed: 'gb' }), fill: defs.body(B), stroke: B.stroke, 'stroke-width': SW }) +
                el('path', { d: blob(88, 22, 10, 12, { n: 7, seed: 'gg' }), fill: defs.body(G), stroke: G.stroke, 'stroke-width': SW }) +
                text('α', 30, 33, { size: 15, weight: 700, anchor: 'middle', baseline: 'middle', color: A.dark }) + text('β', 66, 35, { size: 15, weight: 700, anchor: 'middle', baseline: 'middle', color: B.dark }) + text('γ', 88, 23, { size: 11, weight: 700, anchor: 'middle', baseline: 'middle', color: G.dark })
        };
    },
};

const antibody: GlyphDef = {
    name: 'antibody', aliases: ['igg', 'immunoglobulin', 'monoclonal antibody', 'mab', 'nanobody', 'neutralizing antibody', 'primary antibody', 'secondary antibody', 'bispecific antibody', 'adc', 'antibody-drug conjugate'],
    category: 'molecule', color: 'blue', accent: 'sky',
    description: 'IgG antibody: heavy chains (color) and light chains (accent) in a Y.',
    draw({ defs }, o, t, a) {
        const L = o.accent ? a : tone(HUES.sky);
        const H = tone(t.base);
        const dom = (cx: number, cy: number, ang: number, tt: Tone) => el('ellipse', { cx, cy, rx: 7, ry: 10, transform: `rotate(${f(ang)} ${f(cx)} ${f(cy)})`, fill: defs.body(tt), stroke: tt.stroke, 'stroke-width': 1.2 });
        let svg = '';
        // Fc stem
        for (const dx of [-7, 7]) for (let k = 0; k < 2; k++) svg += dom(50 + dx, 92 - k * 20, 0, H);
        // hinge
        svg += el('path', { d: 'M43 60 L36 52 M57 60 L64 52', stroke: H.stroke, 'stroke-width': 3, 'stroke-linecap': 'round' });
        for (const side of [-1, 1]) {
            const ang = 40 * Math.PI / 180, ux = side * Math.sin(ang), uy = -Math.cos(ang), nx = side * Math.cos(ang), ny = Math.sin(ang);
            for (let k = 0; k < 2; k++) {
                const bx = 50 + side * 9 + ux * (k * 19 + 12), by = 56 + uy * (k * 19 + 12);
                svg += dom(bx, by, side * 40, H);
                svg += dom(bx + nx * 13, by + ny * 13, side * 40, L);
            }
        }
        return { w: 100, h: 106, svg, shape: 'rect', anchors: { top: { x: 50, y: 4 }, bottom: { x: 50, y: 104 } } };
    },
};

// ---- Nucleic acids ---------------------------------------------------------------------------

const dna: GlyphDef = {
    name: 'dna', aliases: ['double helix', 'genome', 'genomic dna', 'gene', 'dsdna', 'chromatin dna', 'dna helix', 'genetic material', 'cdna'], category: 'nucleic', color: 'blue', accent: 'slate',
    description: 'DNA duplex. variant: helix (twisted, default) | ladder (flat, drawn exactly like the duplex in the genome-editing glyphs, so they sit together). count = number of turns / length (default 3).',
    variants: ['helix', 'ladder'],
    aliasVariants: { dsdna: 'ladder' },
    draw({ defs }, o, t, a) {
        // Both strands take their colour from the shared nucleic palette unless the caller overrides.
        const A = o.color ? t : NUC.dna, B = o.accent ? a : NUC.dna2;
        const turns = Math.max(1, Math.min(8, o.count ?? 3)), P = 52;
        if (o.variant === 'ladder') {
            const W = turns * P + 12, H = 34;
            return { w: W, h: H, shape: 'rect', svg: straightDuplex(6, W - 6, 9, 25, B, A) };
        }
        const W = turns * P + 8, H = 48, amp = 15, cy = H / 2;
        const yA = (x: number) => cy + Math.sin((x - 4) / P * Math.PI * 2) * amp, yB = (x: number) => cy - Math.sin((x - 4) / P * Math.PI * 2) * amp;
        // One tone for every base pair: splitting each rung between the two strand colours made the
        // crossings alternate dark/pale and read as stripes rather than as a ladder.
        const pair = mix(A.base, '#FFFFFF', 0.22);
        let rungs = '';
        for (let x = 4 + P / 12; x < W - 4; x += P / 6) {
            rungs += el('path', { d: `M${f(x)} ${f(yA(x))} V${f(yB(x))}`, stroke: pair, 'stroke-width': 3.8, 'stroke-linecap': 'round' });
        }
        // Split the strands into front/back half-periods so the crossings read correctly.
        const seg = (fy: (x: number) => number, x0: number, x1: number) => { const pts: Pt[] = []; for (let x = x0; x <= x1 + 0.01; x += 2) pts.push({ x, y: fy(x) }); return smoothOpen(pts); };
        const casing = (d: string, c: Tone) => el('path', { d, fill: 'none', stroke: c.stroke, 'stroke-width': 7, 'stroke-linecap': 'round' }) + el('path', { d, fill: 'none', stroke: c.base, 'stroke-width': 4.4, 'stroke-linecap': 'round' });
        let back = '', front = '';
        for (let k = 0; k < turns * 2; k++) {
            const x0 = 4 + k * P / 2, x1 = x0 + P / 2, aFront = k % 2 === 0;
            const sA = casing(seg(yA, x0, x1), A), sB = casing(seg(yB, x0, x1), B);
            if (aFront) { back += sB; front += sA; } else { back += sA; front += sB; }
        }
        return { w: W, h: H, svg: back + rungs + front, shape: 'rect' };
    },
};

const mrna: GlyphDef = {
    name: 'mrna', aliases: ['rna', 'transcript', 'messenger rna', 'sirna', 'mirna', 'microrna', 'lncrna', 'ssrna', 'mrna transcript', 'rna strand', 'antisense oligonucleotide', 'aso'], category: 'nucleic', color: 'gold',
    description: 'Single-stranded RNA carrying its bases, with a 5′ cap and poly(A) tail. variant: mrna (default) | plain (no cap or tail).',
    variants: ['mrna', 'plain'],
    draw({ defs }, o, t) {
        const R = o.color ? t : NUC.rna;
        const W = 168, H = 48, pts: Pt[] = [];
        for (let x = 22; x <= 126; x += 13) pts.push({ x, y: 28 + Math.sin(x / 26) * 7 });
        const plain = o.variant === 'plain';
        let svg = strandWithBases(pts, -1, { color: R, tick: 7, step: 7 });
        if (!plain) {
            const cap = tone(HUES.slate);
            svg += el('circle', { cx: 13, cy: pts[0].y, r: 7, fill: defs.body(cap), stroke: cap.stroke, 'stroke-width': 1.3 });
            svg += text('5′ cap', 13, pts[0].y + 18, { size: 8.5, weight: 700, anchor: 'middle', color: cap.dark });
            svg += text('AAAA', 132, pts[pts.length - 1].y, { size: 11, weight: 700, baseline: 'middle', color: R.dark });
        }
        return { w: W, h: H, shape: 'rect', svg };
    },
};

const chromosome: GlyphDef = {
    name: 'chromosome', aliases: ['chromosomes', 'sister chromatids', 'karyotype', 'x chromosome'], category: 'nucleic', color: 'purple',
    description: 'Metaphase chromosome (X shape) with bands.',
    draw({ defs }, o, t) {
        const arm = (rot: number) => g(el('path', { d: capsule(-9, -50, 18, 50), fill: defs.cylinder(t), stroke: t.stroke, 'stroke-width': 1.5 }) + el('path', { d: 'M-9 -38 H9 M-9 -26 H9 M-9 -14 H9', stroke: t.stroke, 'stroke-width': 2.5, opacity: 0.35 }), { transform: `rotate(${rot})` });
        return { w: 80, h: 100, shape: 'rect', svg: g(arm(-22) + arm(22) + arm(180 - 18) + arm(180 + 18) + el('circle', { r: 6, fill: t.shadow, stroke: t.stroke, 'stroke-width': 1.2 }), { transform: 'translate(40 50) scale(0.95)' }) };
    },
};

const plasmid: GlyphDef = {
    name: 'plasmid', aliases: ['vector', 'expression vector', 'plasmid dna', 'construct', 'circular dna', 'transfer plasmid', 'donor plasmid'], category: 'nucleic', color: 'blue',
    description: 'Circular plasmid: a double-stranded backbone with coloured feature arcs (promoter, gene, marker, origin).',
    draw({ defs }, o, t) {
        const cx = 54, cy = 54, R = 38;
        const A = o.color ? t : NUC.dna, B = NUC.dna2;
        const arc = (a0: number, a1: number, c: string, w = 9) => { const p = (a: number) => `${f(cx + Math.cos(a) * R)} ${f(cy + Math.sin(a) * R)}`; return el('path', { d: `M${p(a0)} A${R} ${R} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)}`, fill: 'none', stroke: c, 'stroke-width': w, 'stroke-linecap': 'butt' }); };
        const T = (a: number) => a * Math.PI / 180;
        const head = (a: number, c: string) => { const x = cx + Math.cos(T(a)) * R, y = cy + Math.sin(T(a)) * R, d = T(a + 90); return el('path', { d: `M${f(x - Math.cos(T(a)) * 9)} ${f(y - Math.sin(T(a)) * 9)} L${f(x + Math.cos(d) * 9)} ${f(y + Math.sin(d) * 9)} L${f(x + Math.cos(T(a)) * 9)} ${f(y + Math.sin(T(a)) * 9)}Z`, fill: c }); };
        // the two strands of the circular backbone
        const ring = (r: number, c: Tone, w: number) => el('circle', { cx, cy, r, fill: 'none', stroke: c.stroke, 'stroke-width': w });
        let svg = ring(R + 2.6, B, 3.2) + ring(R - 2.6, A, 3.2);
        svg += arc(T(-80), T(10), HUES.green) + head(14, HUES.green) + arc(T(30), T(120), HUES.orange) + head(124, HUES.orange) + arc(T(150), T(200), HUES.purple) + arc(T(220), T(250), HUES.red);
        return { w: 108, h: 108, shape: 'ellipse', svg };
    },
};

const nucleosome: GlyphDef = {
    name: 'nucleosome', aliases: ['histone', 'histones', 'chromatin fiber', 'epigenetic', 'histone modification'], category: 'nucleic', color: 'pink',
    description: 'Histone octamer with DNA wrapped around it; mods add epigenetic marks on the tails.',
    draw({ defs }, o, t) {
        const D = NUC.dna;
        const wrap = 'M44 16 C70 14 84 24 80 34 C76 46 30 50 22 38 C16 28 40 22 60 24 C80 26 92 36 96 40';
        const lead = 'M4 40 C20 40 22 18 44 16';
        const strandPair = (d: string) => el('path', { d, fill: 'none', stroke: D.stroke, 'stroke-width': 6.4, 'stroke-linecap': 'round' }) + el('path', { d, fill: 'none', stroke: D.base, 'stroke-width': 3.6, 'stroke-linecap': 'round' });
        const svg = strandPair(lead) +
            el('ellipse', { cx: 50, cy: 44, rx: 30, ry: 12, fill: t.shadow, stroke: t.stroke, 'stroke-width': 1.4 }) + el('rect', { x: 20, y: 28, width: 60, height: 16, fill: t.shadow }) + el('path', { d: 'M20 28 V44 M80 28 V44', stroke: t.stroke, 'stroke-width': 1.4 }) +
            el('ellipse', { cx: 50, cy: 28, rx: 30, ry: 12, fill: defs.body(t), stroke: t.stroke, 'stroke-width': 1.4 }) +
            strandPair(wrap);
        const M = (o.mods ?? []).map((m, i) => el('path', { d: `M${36 + i * 14} 18 v-8`, stroke: '#7D8896', 'stroke-width': 1.4 }) + modBadge(36 + i * 14, 6, m, defs)).join('');
        return { w: 100, h: 60, svg: svg + M, shape: 'rect' };
    },
};

const lnp: GlyphDef = {
    name: 'lipid nanoparticle', aliases: ['lnp', 'nanoparticle', 'mrna vaccine', 'mrna-lnp', 'drug delivery', 'nanocarrier', 'micelle'], category: 'molecule', color: 'teal', accent: 'red',
    description: 'Lipid nanoparticle with PEG-lipid corona and encapsulated mRNA.',
    draw({ defs }, o, t, a) {
        const cx = 50, cy = 50, R = 36, M = o.accent ? a : tone(HUES.red); let s = '';
        for (let i = 0; i < 14; i++) { const ang = (i / 14) * Math.PI * 2; s += el('path', { d: `M${f(cx + Math.cos(ang) * R)} ${f(cy + Math.sin(ang) * R)} q${f(Math.cos(ang + 0.6) * 6)} ${f(Math.sin(ang + 0.6) * 6)} ${f(Math.cos(ang) * 10)} ${f(Math.sin(ang) * 10)}`, stroke: '#9AA5B1', 'stroke-width': 1.4, fill: 'none' }); }
        s += el('circle', { cx, cy, r: R, fill: defs.body(t), stroke: t.stroke, 'stroke-width': SW });
        for (let i = 0; i < 36; i++) { const ang = (i / 36) * Math.PI * 2; s += el('circle', { cx: cx + Math.cos(ang) * (R - 3), cy: cy + Math.sin(ang) * (R - 3), r: 2.6, fill: t.light, stroke: t.stroke, 'stroke-width': 0.6 }); }
        s += el('path', { d: 'M30 50 C36 38 42 62 50 48 S62 40 70 54', fill: 'none', stroke: M.stroke, 'stroke-width': 4, 'stroke-linecap': 'round' }) + el('path', { d: 'M30 50 C36 38 42 62 50 48 S62 40 70 54', fill: 'none', stroke: M.base, 'stroke-width': 2.2, 'stroke-linecap': 'round' });
        return { w: 100, h: 100, svg: s, shape: 'ellipse' };
    },
};

export const moleculeGlyphs: GlyphDef[] = [protein, gprotein, ligand, ion, smallMolecule, pill, antibody, lnp, gpcr, rtk, receptor, channel, transporter, dna, mrna, chromosome, plasmid, nucleosome];
