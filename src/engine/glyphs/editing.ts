// Genome-editing effectors, drawn around one shared scene.
//
// The scene follows the mechanism rather than a cartoon: Cas9 recognises the PAM and unwinds the
// duplex from there, so the R-loop is drawn immediately 5′ of the PAM; the guide RNA pairs with the
// target strand inside the bubble while the non-target strand is displaced and unpaired; and the
// nuclease silhouette is translucent, so the nucleic acids it holds stay visible — which they must
// be for the figure to explain anything. Which strand is nicked differs by effector and is drawn
// accordingly: a D10A nickase (base editors) cleaves the target strand, an H840A nickase (prime
// editing) cleaves the displaced strand, and that freed 3′ end is what the reverse transcriptase
// extends.
//
// Every scene-based effector reports the same canvas, so two of them side by side share one DNA
// baseline with their PAM boxes in line.
import { blob, roundRect, f, el, g, text, tone, type Tone, type Defs, type Pt } from '../svg.ts';
import { HUES } from '../color.ts';
import { NUC, strandWithBases, straightDuplex, stemLoop, densify, endLabel } from '../nucleic.ts';
import type { GlyphDef, GlyphOpts } from './types.ts';

const SW = 1.7;

const S = {
    W: 420, H: 272,
    yTop: 182, yBot: 200,        // displaced (non-target) strand above, target strand below
    x1: 118, x2: 296,            // the R-loop: the protospacer, opened from the PAM leftwards
    lift: 46,
    pamX: 308, pamW: 26,
    cutX: 278,                   // three bases 5′ of the PAM
    guideY: 184,
    lobe: { cx: 214, cy: 128, rx: 92, ry: 58 },
};
const FAMILY_H = S.H + 40;

/** The displaced strand: duplex, up over the protospacer, back down at the PAM, duplex again. */
function displacedPath(): Pt[] {
    const { x1, x2, yTop, lift, W } = S;
    return [{ x: 4, y: yTop }, { x: x1 - 14, y: yTop }, { x: x1 + 16, y: yTop - lift * 0.7 },
    { x: (x1 + x2) / 2, y: yTop - lift }, { x: x2 - 16, y: yTop - lift * 0.66 }, { x: x2 + 12, y: yTop }, { x: W - 4, y: yTop }];
}
/** Just the open stretch of the displaced strand, between the two duplex flanks. */
function bubblePath(): Pt[] { return displacedPath().slice(1, -1); }

/** Where a given x falls on the displaced strand, for pinning markers to the bubble. */
function onDisplaced(x: number): Pt {
    const pts = densify(bubblePath());
    let best = pts[0], bestD = 1e9;
    for (const p of pts) { const d = Math.abs(p.x - x); if (d < bestD) { bestD = d; best = p; } }
    return best;
}

/** Duplex, R-loop, guide RNA and PAM, plus the translucent protein outline as a separate layer. */
function scene(defs: Defs, o: GlyphOpts, cas: Tone, opts: { pam?: string; pamColor?: string } = {}) {
    const { W, yTop, yBot, x1, x2, guideY, pamX, pamW } = S;
    let svg = '';
    svg += straightDuplex(6, x1 - 12, yTop, yBot, NUC.dna2, NUC.dna);
    svg += straightDuplex(x2 + 14, W - 6, yTop, yBot, NUC.dna2, NUC.dna);
    // target strand runs straight through; inside the bubble its bases pair with the guide
    svg += strandWithBases([{ x: x1 - 12, y: yBot }, { x: x2 + 14, y: yBot }], -1, { color: NUC.dna, tick: (yBot - guideY) / 2 - 0.8 });
    // displaced strand bulges away over the protospacer, its bases unpaired inside the bubble
    svg += strandWithBases(bubblePath(), 1, { color: NUC.dna2, tick: 5 }, { from: 0.12, to: 0.88 });
    // guide RNA: spacer paired with the target strand, scaffold leaving the protein at the top
    const gA = x1 + 6, gB = x2 + 2;
    svg += strandWithBases([{ x: gA, y: guideY }, { x: gB, y: guideY }], 1, { color: NUC.rna, tick: (yBot - guideY) / 2 - 0.8 });
    const tail: Pt[] = [{ x: gB, y: guideY }, { x: gB + 24, y: guideY - 26 }, { x: S.lobe.cx + S.lobe.rx * 0.5, y: S.lobe.cy - 12 }, { x: S.lobe.cx + S.lobe.rx * 0.34, y: S.lobe.cy - S.lobe.ry - 14 }];
    svg += strandWithBases(tail, 1, { color: NUC.rna, tick: 0, step: 1e6 });
    const tip = densify(tail).at(-1)!;
    svg += stemLoop(tip, { x: 0.16, y: -0.99 }, 26, NUC.rna, 13);
    svg += stemLoop({ x: tip.x + 27, y: tip.y + 14 }, { x: 0.42, y: -0.91 }, 23, NUC.rna, 11);
    // PAM, immediately 3′ of the protospacer on the displaced strand
    const pt = tone(opts.pamColor ?? HUES.green);
    svg += el('rect', { x: pamX - pamW / 2, y: yTop - 9, width: pamW, height: yBot - yTop + 18, rx: 5, fill: pt.light, stroke: pt.stroke, 'stroke-width': 1.4, opacity: 0.95 });
    svg += text(opts.pam ?? 'PAM', pamX, yBot + 20, { size: 10, weight: 700, anchor: 'middle', color: pt.dark });
    svg += endLabel({ x: 12, y: yTop }, '5′', { dx: 0, dy: -10 }) + endLabel({ x: 12, y: yBot }, '3′', { dx: 0, dy: 14 });
    svg += endLabel({ x: W - 12, y: yTop }, '3′', { dx: 0, dy: -10 }) + endLabel({ x: W - 12, y: yBot }, '5′', { dx: 0, dy: 14 });
    return { svg, silhouette: silhouette(defs, cas, o) };
}

/** Translucent nuclease outline: it holds the nucleic acids without hiding them. */
function silhouette(_defs: Defs, cas: Tone, o: GlyphOpts) {
    const { lobe } = S;
    const body = blob(lobe.cx, lobe.cy, lobe.rx, lobe.ry, { n: 12, jitter: 0.05, seed: String(o.seed ?? 'cas') });
    const lower = blob(lobe.cx + 6, lobe.cy + lobe.ry * 0.78, lobe.rx * 0.76, lobe.ry * 0.5, { n: 10, jitter: 0.07, seed: String(o.seed ?? 'cas') + 'l' });
    return el('path', { d: lower, fill: cas.base, 'fill-opacity': 0.32, stroke: cas.base, 'stroke-width': SW, 'stroke-opacity': 0.75 }) +
        el('path', { d: body, fill: cas.base, 'fill-opacity': 0.4, stroke: cas.base, 'stroke-width': SW, 'stroke-opacity': 0.85 });
}

function lobeLabel(name: string, sub: string | undefined, t: Tone) {
    const { lobe } = S, y = lobe.cy - lobe.ry * 0.5;
    return text(name, lobe.cx, y, { size: 15, weight: 700, anchor: 'middle', baseline: 'middle', color: t.dark, halo: '#ffffff' }) +
        (sub ? text(sub, lobe.cx, y + 17, { size: 9.5, anchor: 'middle', baseline: 'middle', color: t.dark, halo: '#ffffff' }) : '');
}

/** A cut through one strand: opposed triangles, the usual "cleaved here" mark. */
function cutMark(x: number, y: number, size = 5.5) {
    const tri = (dir: number) => `M${f(x - size)} ${f(y + dir * (size + 3))} L${f(x + size)} ${f(y + dir * (size + 3))} L${f(x)} ${f(y + dir * 2)}Z`;
    return el('path', { d: tri(-1) + tri(1), fill: NUC.edit.stroke });
}
/** Label set away from the drawing, joined to it by a thin leader. */
function leader(from: Pt, to: Pt, label: string, color: string, anchor: 'start' | 'middle' | 'end' = 'middle') {
    return el('path', { d: `M${f(from.x)} ${f(from.y)} L${f(to.x)} ${f(to.y)}`, stroke: color, 'stroke-width': 1.1, opacity: 0.75 }) +
        text(label, to.x, to.y + (to.y < from.y ? -5 : 12), { size: 9.5, weight: 700, anchor, color, baseline: 'alphabetic', halo: '#ffffff' });
}
function fusedDomain(defs: Defs, dx: number, dy: number, rx: number, ry: number, label: string, t: Tone, cas: Tone, size = 10) {
    return el('path', { d: `M${f(dx + rx * 0.5)} ${f(dy + 4)} L${f(S.lobe.cx - S.lobe.rx * 0.8)} ${f(dy - 6)}`, stroke: cas.base, 'stroke-width': 7, 'stroke-linecap': 'round', opacity: 0.7 }) +
        el('path', { d: blob(dx, dy, rx, ry, { n: 9, jitter: 0.06, seed: label }), fill: defs.body(t), stroke: t.stroke, 'stroke-width': SW }) +
        text(label, dx, dy, { size, weight: 700, anchor: 'middle', baseline: 'middle', color: t.dark, halo: t.light });
}

// ---- Nucleases ---------------------------------------------------------------------------------

const cas9: GlyphDef = {
    name: 'cas9', aliases: ['crispr', 'crispr-cas9', 'crispr cas9', 'cas9 rnp', 'ribonucleoprotein', 'rnp', 'gene editing', 'genome editing', 'nickase', 'ncas9', 'dcas9', 'dead cas9'],
    category: 'nucleic', color: 'sky',
    description: 'Cas9 engaging its target: the R-loop opened from the PAM, the guide RNA paired with the target strand, and the cut three bases 5′ of the PAM. variant: wt (blunt double-strand break, default) | nickase (D10A, target strand only) | dcas9 (catalytically dead, no cut).',
    variants: ['wt', 'nickase', 'dcas9'],
    aliasVariants: { nickase: 'nickase', ncas9: 'nickase', dcas9: 'dcas9', 'dead cas9': 'dcas9' },
    draw({ defs }, o, t) {
        const v = o.variant ?? 'wt';
        const sc = scene(defs, o, t);
        let svg = sc.svg + sc.silhouette;
        if (v === 'wt') svg += cutMark(S.cutX, S.yBot) + cutMark(S.cutX, onDisplaced(S.cutX).y);
        else if (v === 'nickase') svg += cutMark(S.cutX, S.yBot);
        svg += lobeLabel(o.label ?? (v === 'dcas9' ? 'dCas9' : v === 'nickase' ? 'nCas9 (D10A)' : 'Cas9'),
            v === 'wt' ? 'blunt double-strand break' : v === 'nickase' ? 'nicks the target strand' : 'binds without cutting', t);
        return { w: S.W, h: FAMILY_H, svg, shape: 'rect' };
    },
};

const cas12a: GlyphDef = {
    name: 'cas12a', aliases: ['cpf1', 'cas12', 'cas12a rnp'], category: 'nucleic', color: 'teal',
    description: 'Cas12a: a T-rich PAM and a staggered cut distal to it, leaving 5′ overhangs.',
    draw({ defs }, o, t) {
        const sc = scene(defs, o, t, { pam: 'TTTV', pamColor: HUES.gold });
        const cx = S.x1 + 42;
        const svg = sc.svg + sc.silhouette + cutMark(cx, onDisplaced(cx).y) + cutMark(cx + 16, S.yBot) +
            lobeLabel(o.label ?? 'Cas12a', 'staggered cut, 5′ overhangs', t);
        return { w: S.W, h: FAMILY_H, svg, shape: 'rect' };
    },
};

// ---- Fused-domain effectors --------------------------------------------------------------------

const baseEditor: GlyphDef = {
    name: 'base editor', aliases: ['cbe', 'abe', 'cytosine base editor', 'adenine base editor', 'base editing', 'deaminase'],
    category: 'nucleic', color: 'sky', accent: 'coral',
    description: 'Base editor: a D10A nickase carrying a deaminase that acts on the displaced strand in the PAM-distal editing window, with the nick on the opposite, unedited strand. variant: cbe (C→T, default) | abe (A→G).',
    variants: ['cbe', 'abe'],
    aliasVariants: { abe: 'abe', 'adenine base editor': 'abe', cbe: 'cbe', 'cytosine base editor': 'cbe' },
    draw({ defs }, o, t, a) {
        const abe = o.variant === 'abe';
        const dea = o.accent ? a : tone(abe ? HUES.purple : HUES.coral);
        const sc = scene(defs, o, t);
        const edit = onDisplaced(S.x1 + 42);
        let svg = sc.svg + sc.silhouette;
        svg += fusedDomain(defs, 54, 150, 32, 27, abe ? 'TadA' : 'APOBEC', dea, t, abe ? 12 : 10);
        svg += el('path', { d: `M${f(64)} ${f(174)} Q${f(edit.x - 24)} ${f(edit.y + 30)} ${f(edit.x - 3)} ${f(edit.y + 12)}`, fill: 'none', stroke: dea.stroke, 'stroke-width': 1.7, 'stroke-dasharray': '4 3' });
        svg += el('circle', { cx: edit.x, cy: edit.y + 7, r: 7.5, fill: NUC.edit.base, stroke: NUC.edit.stroke, 'stroke-width': 1.5 });
        svg += leader({ x: edit.x, y: edit.y - 2 }, { x: edit.x - 10, y: edit.y - 34 }, abe ? 'A → G' : 'C → T', NUC.edit.stroke);
        svg += cutMark(S.cutX, S.yBot);
        svg += leader({ x: S.cutX, y: S.yBot + 10 }, { x: S.cutX + 20, y: S.yBot + 40 }, 'nick on the unedited strand', '#6B7785');
        if (!abe) {
            const ugi = tone(HUES.gold), ux = S.lobe.cx + S.lobe.rx - 30, uy = S.lobe.cy + 4;
            svg += el('path', { d: blob(ux, uy, 19, 17, { n: 8, jitter: 0.07, seed: 'ugi' }), fill: defs.body(ugi), stroke: ugi.stroke, 'stroke-width': 1.4 });
            svg += text('UGI', ux, uy, { size: 8.5, weight: 700, anchor: 'middle', baseline: 'middle', color: ugi.dark });
        }
        svg += lobeLabel(o.label ?? (abe ? 'ABE' : 'CBE'), 'nCas9 (D10A)', t);
        return { w: S.W, h: FAMILY_H, svg, shape: 'rect' };
    },
};

const primeEditor: GlyphDef = {
    name: 'prime editor', aliases: ['pe', 'pe2', 'pe3', 'prime editing', 'pegrna editor', 'reverse transcriptase fusion'],
    category: 'nucleic', color: 'sky', accent: 'teal',
    description: 'Prime editor: an H840A nickase fused to a reverse transcriptase. The nick frees a 3′ end on the displaced strand, which anneals to the primer-binding site of the pegRNA and is extended along its reverse-transcription template, writing the edit into new DNA.',
    draw({ defs }, o, t, a) {
        const rt = o.accent ? a : tone(HUES.teal);
        const sc = scene(defs, o, t);
        let svg = sc.svg + sc.silhouette;
        svg += fusedDomain(defs, 56, 150, 30, 26, 'RT', rt, t, 13);
        const nick = onDisplaced(S.cutX);
        svg += cutMark(S.cutX, nick.y);
        // pegRNA 3′ extension (PBS + RT template) with the new DNA written along it
        const ey = 96, ex0 = S.pamX - 2, ex1 = S.W - 16;
        svg += strandWithBases([{ x: S.lobe.cx + S.lobe.rx * 0.34 + 28, y: S.lobe.cy - S.lobe.ry - 2 }, { x: ex1 - 16, y: ey - 26 }, { x: ex1, y: ey }], 1, { color: NUC.rna, tick: 0, step: 1e6 });
        svg += strandWithBases([{ x: ex1, y: ey }, { x: ex0, y: ey }], 1, { color: NUC.rna, tick: 7.2 });
        svg += strandWithBases([{ x: ex0 + 8, y: ey + 16 }, { x: ex1 - 10, y: ey + 16 }], -1, { color: NUC.newDna, tick: 7.2 });
        const edX = ex0 + 44;
        svg += el('rect', { x: edX - 7, y: ey + 9, width: 14, height: 15, rx: 3, fill: NUC.edit.base, stroke: NUC.edit.stroke, 'stroke-width': 1.4 });
        svg += leader({ x: edX, y: ey + 25 }, { x: edX - 4, y: ey + 50 }, 'edit', NUC.edit.stroke);
        svg += leader({ x: ex0 + 14, y: ey - 8 }, { x: ex0 + 6, y: ey - 34 }, 'PBS', NUC.rna.dark);
        svg += leader({ x: ex0 + 76, y: ey - 8 }, { x: ex0 + 96, y: ey - 34 }, 'RT template', NUC.rna.dark);
        // the 3′ end freed by the nick, joining the newly written strand
        svg += el('path', { d: `M${f(S.cutX + 5)} ${f(nick.y - 4)} C${f(S.pamX + 6)} ${f(nick.y - 40)} ${f(ex0 - 16)} ${f(ey + 54)} ${f(ex0 + 8)} ${f(ey + 16)}`, fill: 'none', stroke: NUC.newDna.stroke, 'stroke-width': 3.4, 'stroke-linecap': 'round' });
        svg += leader({ x: ex1 - 30, y: ey + 24 }, { x: ex1 - 18, y: ey + 48 }, 'new DNA', NUC.newDna.stroke);
        svg += lobeLabel(o.label ?? 'Prime editor', 'nCas9 (H840A)–RT', t);
        return { w: S.W, h: FAMILY_H, svg, shape: 'rect' };
    },
};

const dcasEffector: GlyphDef = {
    name: 'dcas9 effector', aliases: ['crispra', 'crispri', 'crispr activation', 'crispr interference', 'dcas9-vp64', 'dcas9-krab', 'epigenome editing'],
    category: 'nucleic', color: 'sky', accent: 'green',
    description: 'Catalytically dead Cas9 carrying a transcriptional effector at a promoter, with no cut. variant: crispra (VP64, activation, default) | crispri (KRAB, repression).',
    variants: ['crispra', 'crispri'],
    aliasVariants: { crispri: 'crispri', 'crispr interference': 'crispri', 'dcas9-krab': 'crispri', crispra: 'crispra', 'crispr activation': 'crispra', 'dcas9-vp64': 'crispra' },
    draw({ defs }, o, t, a) {
        const off = o.variant === 'crispri';
        const eff = o.accent ? a : tone(off ? HUES.red : HUES.green);
        const sc = scene(defs, o, t);
        let svg = sc.svg + sc.silhouette;
        svg += fusedDomain(defs, 54, 150, 31, 26, off ? 'KRAB' : 'VP64', eff, t, 11);
        const px = S.pamX + 30, py = S.yBot + 46, tip = S.W - 54;
        svg += el('path', { d: `M${f(px)} ${f(py)} H${f(tip - 10)} M${f(px)} ${f(py)} V${f(py - 18)}`, fill: 'none', stroke: eff.stroke, 'stroke-width': 2.2, 'stroke-linecap': 'round' });
        svg += el('path', { d: `M${f(tip - 12)} ${f(py - 6)} L${f(tip)} ${f(py)} L${f(tip - 12)} ${f(py + 6)}Z`, fill: eff.stroke });
        svg += text('promoter', px + 2, py + 16, { size: 9.5, weight: 700, color: '#6B7785' });
        svg += text(off ? 'OFF' : 'ON', tip + 8, py, { size: 12.5, weight: 700, baseline: 'middle', color: eff.dark });
        svg += lobeLabel(o.label ?? (off ? 'CRISPRi' : 'CRISPRa'), 'dCas9, no cleavage', t);
        return { w: S.W, h: FAMILY_H, svg, shape: 'rect' };
    },
};

const cas13: GlyphDef = {
    name: 'cas13', aliases: ['cas13a', 'rna targeting crispr', 'rna knockdown crispr'], category: 'nucleic', color: 'indigo',
    description: 'Cas13 bound to a target RNA through its crRNA, with collateral cleavage of bystander RNAs.',
    draw({ defs }, o, t) {
        const W = 330, H = 220, y = 156, lobe = { cx: 162, cy: 102, rx: 78, ry: 52 };
        const target = tone(HUES.orange);
        const wave: Pt[] = []; for (let x = 8; x <= W - 8; x += 26) wave.push({ x, y: y + Math.sin(x / 42) * 7 });
        let svg = strandWithBases(wave, 1, { color: target, tick: 5.5 });
        svg += strandWithBases([{ x: lobe.cx - 56, y: y - 20 }, { x: lobe.cx + 56, y: y - 20 }], -1, { color: NUC.rna, tick: 6 });
        svg += el('path', { d: blob(lobe.cx, lobe.cy, lobe.rx, lobe.ry, { n: 12, jitter: 0.05, seed: String(o.seed ?? 'c13') }), fill: t.base, 'fill-opacity': 0.4, stroke: t.base, 'stroke-width': SW, 'stroke-opacity': 0.85 });
        svg += cutMark(lobe.cx + 72, y + Math.sin((lobe.cx + 72) / 42) * 7);
        for (const [bx, by] of [[46, 56], [276, 44], [292, 126]] as Array<[number, number]>) {
            svg += strandWithBases([{ x: bx - 20, y: by }, { x: bx + 20, y: by + 4 }], 1, { color: target, tick: 4.5 });
            svg += cutMark(bx, by + 2, 4);
        }
        svg += text(o.label ?? 'Cas13', lobe.cx, lobe.cy - 16, { size: 15, weight: 700, anchor: 'middle', baseline: 'middle', color: t.dark, halo: '#ffffff' });
        svg += text('cuts target and bystander RNA', lobe.cx, lobe.cy + 2, { size: 9.5, anchor: 'middle', baseline: 'middle', color: t.dark, halo: '#ffffff' });
        svg += text('crRNA', lobe.cx - 62, y - 20, { size: 9.5, weight: 700, anchor: 'end', baseline: 'middle', color: NUC.rna.dark });
        return { w: W, h: H, svg, shape: 'rect' };
    },
};

// ---- Programmable nucleases without a guide RNA --------------------------------------------------

const dimericNuclease = (name: string, aliases: string[], moduleShape: 'finger' | 'block', description: string): GlyphDef => ({
    name, aliases, category: 'nucleic', color: 'purple', accent: 'orange', description,
    draw({ defs }, o, t, a) {
        const W = 340, H = 200, yTop = 124, yBot = 142, fok = o.accent ? a : tone(HUES.orange);
        const n = moduleShape === 'finger' ? 4 : 7, mw = moduleShape === 'finger' ? 22 : 12;
        let svg = straightDuplex(8, W - 8, yTop, yBot, NUC.dna2, NUC.dna);
        const span = n * (mw + 3), cx = W / 2;
        const arm = (x0: number, above: boolean) => {
            let s = '';
            for (let i = 0; i < n; i++) {
                const x = x0 + i * (mw + 3), y = above ? yTop - 42 : yBot + 20;
                s += moduleShape === 'finger'
                    ? el('path', { d: blob(x + mw / 2, y + 10, mw / 2, 13, { n: 8, jitter: 0.05, seed: name + i + String(above) }), fill: defs.body(t), stroke: t.stroke, 'stroke-width': 1.3 })
                    : el('path', { d: roundRect(x, y - 2, mw, 24, 5), fill: defs.cylinder(t), stroke: t.stroke, 'stroke-width': 1.2 });
                s += el('path', { d: `M${f(x + mw / 2)} ${f(above ? y + 23 : y - 2)} V${f(above ? yTop - 5 : yBot + 5)}`, stroke: t.base, 'stroke-width': 1.5, opacity: 0.8 });
            }
            return s;
        };
        svg += arm(cx - 52 - span, true) + arm(cx + 52, false);
        for (const [fx, fy] of [[cx - 20, yTop - 44], [cx + 20, yBot + 26]] as Array<[number, number]>)
            svg += el('path', { d: blob(fx, fy, 24, 20, { n: 9, jitter: 0.06, seed: 'fok' + fx }), fill: defs.body(fok), stroke: fok.stroke, 'stroke-width': SW }) +
                text('FokI', fx, fy, { size: 10, weight: 700, anchor: 'middle', baseline: 'middle', color: fok.dark });
        svg += cutMark(cx - 9, yTop) + cutMark(cx + 9, yBot);
        svg += leader({ x: cx + 12, y: yBot + 10 }, { x: cx + 62, y: yBot + 62 }, 'FokI dimer cuts the spacer', '#6B7785');
        svg += text(o.label ?? name.toUpperCase(), cx, 16, { size: 14, weight: 700, anchor: 'middle', color: t.dark });
        return { w: W, h: H, svg, shape: 'rect' };
    },
});
const zfn = dimericNuclease('zinc finger nuclease', ['zfn', 'zinc finger'], 'finger', 'Zinc-finger nuclease pair: two triplet-recognising finger arrays on opposite strands flanking a spacer, each fused to FokI, which dimerises and cuts.');
const talen = dimericNuclease('talen', ['tal effector nuclease', 'tale nuclease'], 'block', 'TALEN pair: two single-base-recognising TALE repeat arrays on opposite strands flanking a spacer, each fused to FokI, which dimerises and cuts.');

// ---- Standalone pieces ---------------------------------------------------------------------------

const sgrna: GlyphDef = {
    name: 'sgrna', aliases: ['guide rna', 'grna', 'single guide rna', 'crrna', 'pegrna', 'spacer'],
    category: 'nucleic', color: 'gold',
    description: 'Guide RNA on its own: spacer plus scaffold stem loops. variant: sgrna (default) | pegrna (adds the 3′ primer-binding site and RT template) | crrna (short, Cas12a-style).',
    variants: ['sgrna', 'pegrna', 'crrna'],
    aliasVariants: { crrna: 'crrna', pegrna: 'pegrna' },
    draw(_c, o) {
        const v = o.variant ?? 'sgrna', W = v === 'pegrna' ? 310 : 250, H = 128, y = 84;
        const sEnd = 132, loops = v === 'crrna' ? 1 : 3;
        let svg = strandWithBases([{ x: 20, y }, { x: sEnd, y }], -1, { color: NUC.rna, tick: 6 });
        svg += text('spacer', (20 + sEnd) / 2, y + 24, { size: 10, weight: 700, anchor: 'middle', color: NUC.rna.dark });
        const last = sEnd + 14 + (loops - 1) * 30;
        svg += strandWithBases([{ x: sEnd, y }, { x: last + 12, y }], 1, { color: NUC.rna, tick: 0, step: 1e6 });
        for (let i = 0; i < loops; i++) svg += stemLoop({ x: sEnd + 14 + i * 30, y }, { x: 0, y: -1 }, 30, NUC.rna, 13);
        svg += text(v === 'crrna' ? 'repeat' : 'scaffold', (sEnd + last) / 2 + 8, y + 24, { size: 10, weight: 700, anchor: 'middle', color: NUC.rna.dark });
        if (v === 'pegrna') {
            svg += strandWithBases([{ x: last + 12, y }, { x: last + 46, y: y + 18 }, { x: W - 14, y: y + 18 }], -1, { color: NUC.rna, tick: 6 });
            svg += text('PBS + RT template', W - 16, y + 46, { size: 9.5, weight: 700, anchor: 'end', color: NUC.rna.dark });
        }
        svg += endLabel({ x: 20, y }, '5′', { dx: -14, dy: 3 });
        return { w: W, h: H, svg, shape: 'rect' };
    },
};

const dsb: GlyphDef = {
    name: 'double strand break', aliases: ['dsb', 'dna break', 'cut site', 'cleavage'],
    category: 'nucleic', color: 'navy',
    description: 'A cleaved DNA duplex. variant: blunt (default) | staggered (5′ overhangs).',
    variants: ['blunt', 'staggered'],
    draw(_c, o) {
        const W = 270, H = 92, yTop = 32, yBot = 50, mid = W / 2, stag = o.variant === 'staggered';
        let svg = straightDuplex(10, mid - 14, yTop, yBot, NUC.dna2, NUC.dna) + straightDuplex(mid + 14, W - 10, yTop, yBot, NUC.dna2, NUC.dna);
        if (stag) {
            svg += strandWithBases([{ x: mid - 14, y: yBot }, { x: mid + 5, y: yBot }], -1, { color: NUC.dna, tick: 5 });
            svg += strandWithBases([{ x: mid - 5, y: yTop }, { x: mid + 14, y: yTop }], 1, { color: NUC.dna2, tick: 5 });
        }
        svg += text(stag ? 'staggered cut, 5′ overhangs' : 'blunt cut', mid, H - 10, { size: 10, weight: 700, anchor: 'middle', color: '#5B6675' });
        return { w: W, h: H, svg, shape: 'rect' };
    },
};

const repair: GlyphDef = {
    name: 'dna repair', aliases: ['nhej', 'hdr', 'homology directed repair', 'non-homologous end joining', 'repair outcome', 'knock-in', 'knockin', 'indel'],
    category: 'nucleic', color: 'navy', accent: 'green',
    description: 'Repair outcome after a double-strand break. variant: nhej (error-prone end joining leaves an indel, default) | hdr (a donor template with homology arms gives a precise knock-in).',
    variants: ['nhej', 'hdr'],
    aliasVariants: { hdr: 'hdr', 'homology directed repair': 'hdr', 'knock-in': 'hdr', knockin: 'hdr', nhej: 'nhej', 'non-homologous end joining': 'nhej', indel: 'nhej' },
    draw(_c, o, _t, a) {
        const hdr = o.variant === 'hdr', W = 280, yTop = 28, yBot = 46, mid = W / 2;
        const ins = o.accent ? a : tone(hdr ? HUES.green : HUES.red);
        const arm = tone(HUES.purple);
        let svg = straightDuplex(12, mid - 16, yTop, yBot, NUC.dna2, NUC.dna) + straightDuplex(mid + 16, W - 12, yTop, yBot, NUC.dna2, NUC.dna);
        const ry = hdr ? 134 : 100;
        if (hdr) {
            svg += el('path', { d: roundRect(mid - 86, 74, 66, 18, 5), fill: arm.base, stroke: arm.stroke, 'stroke-width': 1.2 });
            svg += el('path', { d: roundRect(mid - 16, 74, 32, 18, 5), fill: ins.base, stroke: ins.stroke, 'stroke-width': 1.2 });
            svg += el('path', { d: roundRect(mid + 20, 74, 66, 18, 5), fill: arm.base, stroke: arm.stroke, 'stroke-width': 1.2 });
            svg += text('5′ homology arm', mid - 53, 83, { size: 8, weight: 700, anchor: 'middle', baseline: 'middle', color: arm.dark });
            svg += text('3′ homology arm', mid + 53, 83, { size: 8, weight: 700, anchor: 'middle', baseline: 'middle', color: arm.dark });
            svg += text('donor template', mid, 110, { size: 9.5, weight: 700, anchor: 'middle', color: '#5B6675' });
        }
        svg += g(straightDuplex(12, mid - 12, 0, 18, NUC.dna2, NUC.dna) + straightDuplex(mid + 12, W - 12, 0, 18, NUC.dna2, NUC.dna) +
            el('path', { d: roundRect(mid - (hdr ? 16 : 10), -2, hdr ? 32 : 20, 22, 5), fill: ins.base, stroke: ins.stroke, 'stroke-width': 1.3 }), { transform: `translate(0 ${f(ry)})` });
        svg += text(hdr ? 'precise knock-in' : 'indel of unpredictable length', mid, ry + 34, { size: 10, weight: 700, anchor: 'middle', color: ins.dark });
        const ay0 = hdr ? 116 : 62;
        svg += el('path', { d: `M${f(mid)} ${f(ay0)} V${f(ry - 10)}`, stroke: '#5B6675', 'stroke-width': 2, 'stroke-linecap': 'round' });
        svg += el('path', { d: `M${f(mid - 5)} ${f(ry - 15)} L${f(mid)} ${f(ry - 6)} L${f(mid + 5)} ${f(ry - 15)}Z`, fill: '#5B6675' });
        svg += text(hdr ? 'HDR' : 'NHEJ', mid + 10, (ay0 + ry) / 2 - 4, { size: 10.5, weight: 700, baseline: 'middle', color: '#5B6675' });
        return { w: W, h: ry + 48, svg, shape: 'rect' };
    },
};

export const editingGlyphs: GlyphDef[] = [cas9, cas12a, cas13, baseEditor, primeEditor, dcasEffector, zfn, talen, sgrna, dsb, repair];
