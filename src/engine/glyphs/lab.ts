// Laboratory equipment and data read-outs. Read-outs are drawn as small chart "cards" so analysis
// steps in a workflow look like real results rather than generic icons.
import { blob, roundRect, capsule, smoothOpen, rng, f, el, g, text, tone, INK, type Tone, type Defs, type Pt } from '../svg.ts';
import { HUES, mix } from '../color.ts';
import type { GlyphDef } from './types.ts';

const SW = 1.6;
const GLASS = '#EAF3FA', GLASS_STROKE = '#8DA3B8';

const tube: GlyphDef = {
    name: 'tube', aliases: ['eppendorf', 'microcentrifuge tube', 'microtube', 'sample tube', 'sample', 'lysate', 'pcr tube', 'eppendorf tube', 'extraction', 'rna extraction', 'dna extraction', 'protein extraction'], category: 'lab', color: 'sky',
    description: 'Microcentrifuge tube with coloured liquid (color = liquid).',
    draw({ defs }, o, t) {
        const body = 'M14 26 H50 V58 C50 74 40 92 32 98 C24 92 14 74 14 58 Z';
        const liquid = 'M15.5 56 H48.5 V58 C48.5 73 39 90 32 96 C25 90 15.5 73 15.5 58 Z';
        return {
            w: 64, h: 102, shape: 'rect', svg:
                el('path', { d: 'M50 22 C62 18 64 6 54 4 C46 3 44 10 48 14', fill: 'none', stroke: GLASS_STROKE, 'stroke-width': 3 }) +
                el('path', { d: liquid, fill: defs.cylinder(t), stroke: 'none' }) + el('ellipse', { cx: 32, cy: 56, rx: 16.5, ry: 2.6, fill: t.light, stroke: t.stroke, 'stroke-width': 0.8 }) +
                el('path', { d: body, fill: GLASS, 'fill-opacity': 0.35, stroke: GLASS_STROKE, 'stroke-width': SW, 'stroke-linejoin': 'round' }) +
                el('rect', { x: 10, y: 18, width: 44, height: 9, rx: 3, fill: '#F4F7FA', stroke: GLASS_STROKE, 'stroke-width': SW }) +
                el('path', { d: 'M19 32 V58', stroke: '#fff', 'stroke-width': 3, opacity: 0.8, 'stroke-linecap': 'round' })
        };
    },
};

const falcon: GlyphDef = {
    name: 'falcon tube', aliases: ['conical tube', '50 ml tube', '15 ml tube', 'centrifuge tube', 'blood sample', 'blood draw', 'serum', 'plasma sample', 'tube rack'], category: 'lab', color: 'red',
    description: 'Conical centrifuge tube with screw cap (color = contents). count:3 draws a rack.',
    draw({ defs }, o, t) {
        const one = (x: number, liquidTop: number, tt: Tone) => g(
            el('path', { d: `M4 ${liquidTop} H36 V96 L24 118 H16 L4 96 Z`, fill: defs.cylinder(tt) }) +
            el('path', { d: 'M4 20 H36 V96 L24 118 H16 L4 96 Z', fill: GLASS, 'fill-opacity': 0.3, stroke: GLASS_STROKE, 'stroke-width': SW, 'stroke-linejoin': 'round' }) +
            el('rect', { x: 1, y: 4, width: 38, height: 18, rx: 3, fill: defs.cylinder(tone(HUES.blue)), stroke: tone(HUES.blue).stroke, 'stroke-width': SW }) +
            el('path', { d: 'M9 28 V92', stroke: '#fff', 'stroke-width': 3, opacity: 0.7, 'stroke-linecap': 'round' }) +
            [40, 56, 72].map(y => el('path', { d: `M26 ${y} H36`, stroke: GLASS_STROKE, 'stroke-width': 1 })).join(''), { transform: `translate(${x} 0)` });
        if ((o.count ?? 1) > 1) return { w: 140, h: 122, shape: 'rect', svg: one(4, 58, t) + one(50, 46, tone(HUES.yellow)) + one(96, 64, tone(HUES.purple)) };
        return { w: 42, h: 122, shape: 'rect', svg: one(1, 50, t) };
    },
};

const petri: GlyphDef = {
    name: 'petri dish', aliases: ['culture dish', 'dish', 'cell culture', 'plate culture', 'agar plate', 'colonies', 'in vitro culture', 'culture', 'in vitro', 'cultured cells', 'cell culture dish'], category: 'lab', color: 'pink', accent: 'teal',
    description: 'Petri dish in perspective with medium (color) and cells/colonies (accent). variant: cells | colonies | empty.',
    draw({ defs }, o, t, a) {
        const cx = 70, W = 140, H = 70, r = rng(String(o.seed ?? 'petri'));
        const medium = o.color ? t : tone(HUES.peach);
        let inside = '';
        const v = o.variant ?? 'cells', ct = o.accent ? a : tone(HUES.teal);
        if (v !== 'empty') for (let i = 0; i < (v === 'colonies' ? 9 : 22); i++) {
            const ang = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.8, x = cx + Math.cos(ang) * 56 * d, y = 30 + Math.sin(ang) * 17 * d;
            inside += v === 'colonies' ? el('ellipse', { cx: x, cy: y, rx: 5 + r() * 3, ry: 2.4 + r() * 1.2, fill: ct.base, stroke: ct.stroke, 'stroke-width': 0.8 })
                : el('ellipse', { cx: x, cy: y, rx: 3.6, ry: 2, fill: ct.base, stroke: ct.stroke, 'stroke-width': 0.6 });
        }
        return {
            w: W, h: H, shape: 'rect', svg:
                el('path', { d: `M4 30 V44 A66 22 0 0 0 136 44 V30`, fill: mix(medium.base, '#ffffff', 0.35), stroke: GLASS_STROKE, 'stroke-width': SW }) +
                el('ellipse', { cx, cy: 30, rx: 66, ry: 22, fill: defs.radial([[0, medium.light], [1, medium.base]], { r: 0.7 }), stroke: GLASS_STROKE, 'stroke-width': SW }) + inside +
                el('ellipse', { cx, cy: 30, rx: 66, ry: 22, fill: 'none', stroke: '#fff', 'stroke-width': 2, opacity: 0.5 }) +
                el('path', { d: 'M20 22 Q40 12 70 10', stroke: '#fff', 'stroke-width': 3, fill: 'none', opacity: 0.6, 'stroke-linecap': 'round' })
        };
    },
};

const wellplate: GlyphDef = {
    name: 'well plate', aliases: ['96-well plate', 'multiwell plate', 'microplate', 'plate', '384-well plate', 'screening', 'high-throughput screening', 'hts', 'elisa', 'drug screen', 'compound screen', 'assay plate', 'assay'], category: 'lab', color: 'gray', accent: 'purple',
    description: 'Multi-well plate in perspective; some wells filled with a gradient of accent colour (dose response).',
    draw({ defs }, o, t, a) {
        const cols = 8, rows = 5, W = 170, H = 96, r = rng(String(o.seed ?? 'plate')), at = o.accent ? a : tone(HUES.purple);
        const sk = (x: number, y: number) => ({ x: 22 + x + y * 0.35 * -1 + 20, y: 10 + y });
        let wells = '';
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
            const p = sk(i * 16, j * 13), on = r() > 0.25;
            const c = on ? mix(at.light, at.stroke, Math.min(1, (i / cols) * 0.9 + r() * 0.15)) : '#FFFFFF';
            wells += el('ellipse', { cx: p.x, cy: p.y + 6, rx: 6, ry: 4.2, fill: c, stroke: '#9AA5B1', 'stroke-width': 0.9 });
        }
        const top = `M30 4 H${W - 6} L${W - 26} 76 H6 Z`;
        return {
            w: W, h: H, shape: 'rect', svg:
                el('path', { d: `M6 76 H${W - 26} V88 H6 Z`, fill: '#D5DCE4', stroke: '#8A97A6', 'stroke-width': SW, 'stroke-linejoin': 'round' }) +
                el('path', { d: `M${W - 26} 76 L${W - 6} 4 V16 L${W - 26} 88 Z`, fill: '#C3CCD6', stroke: '#8A97A6', 'stroke-width': SW, 'stroke-linejoin': 'round' }) +
                el('path', { d: top, fill: defs.linear([[0, '#FBFCFD'], [1, '#E8EDF2']]), stroke: '#8A97A6', 'stroke-width': SW, 'stroke-linejoin': 'round' }) + wells
        };
    },
};

const flask: GlyphDef = {
    name: 'culture flask', aliases: ['t-flask', 't75 flask', 'cell culture flask', 'tissue culture flask', 'expansion', 'cell expansion'], category: 'lab', color: 'pink',
    description: 'Tissue-culture flask with pink medium.',
    draw({ defs }, o, t) {
        const m = o.color ? t : tone('#F4A3B4');
        return {
            w: 150, h: 76, shape: 'rect', svg: g(
                el('path', { d: 'M4 40 H96 V66 Q96 72 90 72 H10 Q4 72 4 66 Z', fill: defs.linear([[0, m.light], [1, m.base]]) }) +
                el('path', { d: 'M4 10 Q4 4 10 4 H90 Q96 4 96 10 V66 Q96 72 90 72 H10 Q4 72 4 66 Z', fill: GLASS, 'fill-opacity': 0.3, stroke: GLASS_STROKE, 'stroke-width': SW }) +
                el('path', { d: 'M96 26 L118 18 V40 L96 50 Z', fill: GLASS, 'fill-opacity': 0.4, stroke: GLASS_STROKE, 'stroke-width': SW, 'stroke-linejoin': 'round' }) +
                el('rect', { x: 116, y: 13, width: 18, height: 32, rx: 4, transform: 'rotate(-20 125 29)', fill: defs.cylinder(tone(HUES.blue)), stroke: tone(HUES.blue).stroke, 'stroke-width': SW }) +
                el('path', { d: 'M12 12 H70', stroke: '#fff', 'stroke-width': 3, opacity: 0.7, 'stroke-linecap': 'round' }), { transform: 'translate(2 2)' })
        };
    },
};

const pipette: GlyphDef = {
    name: 'pipette', aliases: ['micropipette', 'pipetting', 'transfer', 'add', 'dispense', 'transfection', 'treatment addition', 'dropper'], category: 'lab', color: 'blue',
    description: 'Micropipette with tip and droplet (color = droplet).',
    draw({ defs }, o, t) {
        const B = tone(HUES.gray);
        return {
            w: 52, h: 140, shape: 'rect', svg:
                el('rect', { x: 18, y: 0, width: 16, height: 14, rx: 4, fill: defs.cylinder(tone(HUES.blue)), stroke: tone(HUES.blue).stroke, 'stroke-width': SW }) +
                el('path', { d: 'M12 18 Q12 14 16 14 H36 Q40 14 40 18 V74 Q40 82 34 84 H18 Q12 82 12 74 Z', fill: defs.cylinder(B), stroke: B.stroke, 'stroke-width': SW }) +
                el('rect', { x: 17, y: 30, width: 18, height: 10, rx: 2, fill: '#fff', stroke: B.stroke, 'stroke-width': 1 }) +
                el('path', { d: 'M20 84 H32 L30 98 H22 Z', fill: defs.cylinder(B), stroke: B.stroke, 'stroke-width': SW, 'stroke-linejoin': 'round' }) +
                el('path', { d: 'M22 98 H30 L27 126 H25 Z', fill: '#F7F3D8', stroke: '#B9AE6A', 'stroke-width': 1.2, 'stroke-linejoin': 'round' }) +
                el('path', { d: 'M26 128 C22 134 22 138 26 139 C30 138 30 134 26 128Z', fill: defs.body(t), stroke: t.stroke, 'stroke-width': 1 })
        };
    },
};

const syringe: GlyphDef = {
    name: 'syringe', aliases: ['injection', 'inject', 'vaccine', 'vaccination', 'iv injection', 'intravenous', 'administration', 'dosing', 'immunization', 'needle'], category: 'lab', color: 'sky',
    description: 'Syringe (horizontal, needle to the right) with coloured contents.',
    draw({ defs }, o, t) {
        return {
            w: 150, h: 40, shape: 'rect', svg:
                el('rect', { x: 2, y: 8, width: 6, height: 24, rx: 2, fill: '#C9D2DC', stroke: GLASS_STROKE, 'stroke-width': SW }) + el('rect', { x: 8, y: 17, width: 26, height: 6, fill: '#C9D2DC', stroke: GLASS_STROKE, 'stroke-width': 1.2 }) +
                el('rect', { x: 52, y: 10, width: 54, height: 20, fill: defs.cylinder(t, true) }) +
                el('rect', { x: 34, y: 8, width: 74, height: 24, rx: 3, fill: GLASS, 'fill-opacity': 0.35, stroke: GLASS_STROKE, 'stroke-width': SW }) +
                el('rect', { x: 46, y: 9, width: 6, height: 22, fill: '#4B5563' }) + el('rect', { x: 30, y: 4, width: 4, height: 32, rx: 1.5, fill: '#C9D2DC', stroke: GLASS_STROKE, 'stroke-width': 1.2 }) +
                [62, 74, 86, 98].map(x => el('path', { d: `M${x} 8 V14`, stroke: GLASS_STROKE, 'stroke-width': 1 })).join('') +
                el('path', { d: 'M108 14 L118 17 V23 L108 26 Z', fill: '#C9D2DC', stroke: GLASS_STROKE, 'stroke-width': 1.2, 'stroke-linejoin': 'round' }) + el('path', { d: 'M118 20 H148', stroke: '#8A97A6', 'stroke-width': 1.6, 'stroke-linecap': 'round' })
        };
    },
};

const beaker: GlyphDef = {
    name: 'beaker', aliases: ['flask', 'erlenmeyer', 'reagent', 'solution', 'buffer', 'chemistry', 'reaction', 'media', 'medium', 'culture medium'], category: 'lab', color: 'teal',
    description: 'Laboratory glassware with liquid. variant: beaker | erlenmeyer.',
    draw({ defs }, o, t) {
        if (o.variant === 'erlenmeyer') {
            return { w: 90, h: 104, shape: 'rect', svg: el('path', { d: 'M18 62 H72 L86 96 Q88 100 82 100 H8 Q2 100 4 96 Z', fill: defs.linear([[0, t.light], [1, t.base]]) }) + el('path', { d: 'M32 4 H58 M35 4 V36 L4 96 Q2 100 8 100 H82 Q88 100 86 96 L55 36 V4', fill: GLASS, 'fill-opacity': 0.3, stroke: GLASS_STROKE, 'stroke-width': SW, 'stroke-linejoin': 'round' }) + el('path', { d: 'M18 86 L32 58', stroke: '#fff', 'stroke-width': 3, opacity: 0.7, 'stroke-linecap': 'round' }) };
        }
        return { w: 84, h: 100, shape: 'rect', svg: el('path', { d: 'M10 46 H70 V90 Q70 96 64 96 H16 Q10 96 10 90 Z', fill: defs.linear([[0, t.light], [1, t.base]]) }) + el('path', { d: 'M4 6 L10 10 V90 Q10 96 16 96 H64 Q70 96 70 90 V6', fill: GLASS, 'fill-opacity': 0.3, stroke: GLASS_STROKE, 'stroke-width': SW, 'stroke-linejoin': 'round' }) + [30, 46, 62].map(y => el('path', { d: `M56 ${y} H70`, stroke: GLASS_STROKE, 'stroke-width': 1.2 })).join('') + el('path', { d: 'M20 20 V84', stroke: '#fff', 'stroke-width': 3.4, opacity: 0.7, 'stroke-linecap': 'round' }) };
    },
};

const box = (defs: Defs, x: number, y: number, w: number, h: number, depth: number, t: Tone) =>
    el('path', { d: `M${x} ${y} L${x + depth} ${y - depth * 0.6} H${x + w + depth} L${x + w} ${y} Z`, fill: t.light, stroke: t.stroke, 'stroke-width': SW, 'stroke-linejoin': 'round' }) +
    el('path', { d: `M${x + w} ${y} L${x + w + depth} ${y - depth * 0.6} V${y + h - depth * 0.6} L${x + w} ${y + h} Z`, fill: t.shadow, stroke: t.stroke, 'stroke-width': SW, 'stroke-linejoin': 'round' }) +
    el('rect', { x, y, width: w, height: h, rx: 3, fill: defs.linear([[0, '#FFFFFF'], [1, t.base]]), stroke: t.stroke, 'stroke-width': SW });

const sequencer: GlyphDef = {
    name: 'sequencer', aliases: ['sequencing', 'ngs', 'next-generation sequencing', 'illumina', 'rna-seq', 'scrna-seq', 'single-cell rna-seq', 'single-cell sequencing', 'whole genome sequencing', 'wgs', 'atac-seq', 'chip-seq', 'instrument', 'machine', 'analyzer', 'mass spectrometer', 'mass spectrometry', 'proteomics', 'flow cytometer', 'cytometer', 'plate reader', 'qpcr machine', 'pcr machine', 'thermocycler'], category: 'lab', color: 'gray', accent: 'teal',
    description: 'Benchtop instrument (sequencer / analyser) with screen.',
    draw({ defs }, o, t, a) {
        const s = o.accent ? a : tone(HUES.teal);
        return {
            w: 140, h: 100, shape: 'rect', svg: box(defs, 4, 22, 112, 74, 20, t) +
                el('rect', { x: 14, y: 32, width: 52, height: 34, rx: 3, fill: defs.linear([[0, s.dark], [1, s.stroke]]), stroke: t.stroke, 'stroke-width': 1.2 }) +
                el('path', { d: 'M18 58 L26 50 L32 54 L40 42 L48 48 L58 38', stroke: s.light, 'stroke-width': 1.8, fill: 'none', 'stroke-linejoin': 'round' }) +
                el('rect', { x: 74, y: 34, width: 34, height: 8, rx: 2, fill: t.shadow, stroke: t.stroke, 'stroke-width': 1 }) +
                el('rect', { x: 74, y: 50, width: 34, height: 4, rx: 2, fill: s.base }) + el('circle', { cx: 100, cy: 80, r: 4, fill: HUES.green, stroke: tone(HUES.green).stroke, 'stroke-width': 1 })
        };
    },
};

const microscope: GlyphDef = {
    name: 'microscope', aliases: ['imaging', 'confocal', 'microscopy imaging', 'light microscope', 'fluorescence microscope', 'confocal microscopy', 'live imaging'], category: 'lab', color: 'gray', accent: 'blue',
    description: 'Upright light microscope.',
    draw({ defs }, o, t, a) {
        const s = o.accent ? a : tone(HUES.blue);
        return {
            w: 96, h: 120, shape: 'rect', svg:
                el('path', { d: 'M10 106 Q10 100 16 100 H84 Q90 100 90 106 V114 H10 Z', fill: defs.cylinder(t, true), stroke: t.stroke, 'stroke-width': SW }) +
                el('path', { d: 'M62 100 V60 Q62 44 74 36 L80 44 Q72 52 72 62 V100 Z', fill: defs.cylinder(t), stroke: t.stroke, 'stroke-width': SW, 'stroke-linejoin': 'round' }) +
                el('rect', { x: 22, y: 70, width: 44, height: 6, rx: 2, fill: t.shadow, stroke: t.stroke, 'stroke-width': SW }) +
                el('rect', { x: 34, y: 66, width: 22, height: 4, fill: '#EAF3FA', stroke: GLASS_STROKE, 'stroke-width': 1 }) +
                el('path', { d: 'M38 8 L52 4 L70 46 L56 52 Z', fill: defs.cylinder(s), stroke: s.stroke, 'stroke-width': SW, 'stroke-linejoin': 'round' }) +
                el('rect', { x: 49, y: 48, width: 12, height: 14, rx: 2, fill: defs.cylinder(t), stroke: t.stroke, 'stroke-width': SW }) +
                el('circle', { cx: 78, cy: 70, r: 6, fill: defs.body(t), stroke: t.stroke, 'stroke-width': SW })
        };
    },
};

const computer: GlyphDef = {
    name: 'computer', aliases: ['analysis', 'bioinformatics', 'computational analysis', 'data analysis', 'laptop', 'software', 'pipeline', 'machine learning', 'deep learning', 'ai model', 'model', 'algorithm', 'statistics', 'in silico', 'database', 'monitor'], category: 'lab', color: 'slate', accent: 'blue',
    description: 'Monitor showing a chart (computational / bioinformatic analysis). variant: monitor | laptop.',
    draw({ defs }, o, t, a) {
        const s = o.accent ? a : tone(HUES.blue);
        const screen = el('rect', { x: 14, y: 12, width: 102, height: 62, rx: 2, fill: '#F8FAFC' }) +
            [0, 1, 2, 3, 4].map(i => el('rect', { x: 24 + i * 17, y: 64 - [18, 30, 22, 40, 34][i], width: 11, height: [18, 30, 22, 40, 34][i], fill: [s.base, HUES.teal, HUES.orange, s.base, HUES.purple][i] })).join('') +
            el('path', { d: 'M22 66 H110', stroke: '#9AA5B1', 'stroke-width': 1 });
        if (o.variant === 'laptop') return { w: 130, h: 92, shape: 'rect', svg: el('rect', { x: 8, y: 4, width: 114, height: 76, rx: 6, fill: defs.linear([[0, t.base], [1, t.stroke]]), stroke: t.dark, 'stroke-width': SW }) + screen + el('path', { d: 'M2 82 H128 L122 90 H8 Z', fill: defs.linear([[0, t.light], [1, t.base]]), stroke: t.stroke, 'stroke-width': SW, 'stroke-linejoin': 'round' }) };
        return { w: 130, h: 108, shape: 'rect', svg: el('path', { d: 'M54 82 H76 L80 98 H50 Z', fill: defs.cylinder(t), stroke: t.stroke, 'stroke-width': SW, 'stroke-linejoin': 'round' }) + el('rect', { x: 38, y: 97, width: 54, height: 7, rx: 3, fill: t.base, stroke: t.stroke, 'stroke-width': SW }) + el('rect', { x: 6, y: 4, width: 118, height: 80, rx: 6, fill: defs.linear([[0, t.base], [1, t.stroke]]), stroke: t.dark, 'stroke-width': SW }) + screen };
    },
};

const centrifuge: GlyphDef = {
    name: 'centrifuge', aliases: ['centrifugation', 'spin', 'pellet', 'ultracentrifuge'], category: 'lab', color: 'gray', accent: 'blue',
    description: 'Benchtop centrifuge with open lid.',
    draw({ defs }, o, t, a) {
        const s = o.accent ? a : tone(HUES.blue);
        return { w: 120, h: 100, shape: 'rect', svg: el('path', { d: 'M20 40 Q20 20 60 14 Q100 20 100 40', fill: s.light, stroke: s.stroke, 'stroke-width': SW, opacity: 0.9 }) + el('path', { d: 'M8 48 Q8 40 16 40 H104 Q112 40 112 48 V88 Q112 96 104 96 H16 Q8 96 8 88 Z', fill: defs.linear([[0, '#fff'], [1, t.base]]), stroke: t.stroke, 'stroke-width': SW }) + el('ellipse', { cx: 60, cy: 46, rx: 40, ry: 6, fill: t.shadow, stroke: t.stroke, 'stroke-width': 1.2 }) + el('rect', { x: 22, y: 64, width: 30, height: 14, rx: 2, fill: s.dark }) + text('4000g', 37, 71, { size: 8, weight: 700, anchor: 'middle', baseline: 'middle', color: '#9FF0D0' }) + el('circle', { cx: 92, cy: 71, r: 7, fill: defs.body(t), stroke: t.stroke, 'stroke-width': SW }) };
    },
};

// ---- Data read-outs -------------------------------------------------------------------------

function card(defs: Defs, w: number, h: number, inner: string, axes = true) {
    return el('rect', { x: 1, y: 1, width: w - 2, height: h - 2, rx: 6, fill: '#FFFFFF', stroke: '#C7D0DA', 'stroke-width': 1.4 }) +
        (axes ? el('path', { d: `M14 10 V${h - 14} H${w - 10}`, fill: 'none', stroke: '#6B7785', 'stroke-width': 1.4, 'stroke-linecap': 'round' }) : '') + inner;
}
const PALETTE = [HUES.blue, HUES.orange, HUES.teal, HUES.red, HUES.purple, HUES.green, HUES.pink, HUES.gold];

const umap: GlyphDef = {
    name: 'umap', aliases: ['tsne', 't-sne', 'clustering', 'clusters', 'single-cell clusters', 'embedding', 'dimensionality reduction', 'pca', 'cell atlas', 'cell types'], category: 'data', color: 'blue',
    description: 'UMAP / t-SNE scatter with coloured clusters. count = number of clusters (default 5).',
    draw({ defs }, o) {
        const W = 120, H = 100, r = rng(String(o.seed ?? 'umap')), k = Math.max(2, Math.min(8, o.count ?? 5));
        let dots = '';
        const centers = Array.from({ length: k }, (_, i) => ({ x: 28 + ((i * 37) % 70) + r() * 10, y: 22 + ((i * 23) % 52) + r() * 8 }));
        centers.forEach((c, i) => { for (let j = 0; j < 26; j++) { const a = r() * 6.28, d = Math.sqrt(r()) * 13; dots += el('circle', { cx: c.x + Math.cos(a) * d * 1.2, cy: c.y + Math.sin(a) * d * 0.8, r: 1.9, fill: PALETTE[i % 8], opacity: 0.85 }); } });
        return { w: W, h: H, shape: 'rect', svg: card(defs, W, H, dots) };
    },
};
const barchart: GlyphDef = {
    name: 'bar chart', aliases: ['barplot', 'bar graph', 'quantification', 'results', 'comparison chart', 'expression levels', 'data', 'graph', 'chart'], category: 'data', color: 'blue', accent: 'orange',
    description: 'Bar chart with error bars (two groups).',
    draw({ defs }, o, t, a) {
        const W = 120, H = 100, vals = [30, 52, 40, 70], cols = [tone(HUES.gray), t, tone(HUES.gray), o.accent ? a : tone(HUES.orange)];
        const bars = vals.map((v, i) => { const x = 24 + i * 23 + (i > 1 ? 6 : 0); return el('rect', { x, y: H - 14 - v, width: 15, height: v, fill: defs.linear([[0, cols[i].light], [1, cols[i].base]]), stroke: cols[i].stroke, 'stroke-width': 1 }) + el('path', { d: `M${x + 7.5} ${H - 14 - v} v-8 m-4 0 h8`, stroke: '#4B5563', 'stroke-width': 1.1 }); }).join('');
        return { w: W, h: H, shape: 'rect', svg: card(defs, W, H, bars + text('*', 92, 12, { size: 14, weight: 700, anchor: 'middle', color: '#374151' })) };
    },
};
const heatmap: GlyphDef = {
    name: 'heatmap', aliases: ['heat map', 'gene expression', 'expression heatmap', 'transcriptomics', 'differential expression', 'deg', 'clustered heatmap', 'omics'], category: 'data', color: 'red', accent: 'blue',
    description: 'Clustered expression heatmap with dendrogram.',
    draw({ defs }, o, t, a) {
        const W = 120, H = 100, r = rng(String(o.seed ?? 'hm')), lo = o.accent ? a : tone(HUES.blue);
        let cells = '';
        for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
            const v = Math.max(0, Math.min(1, (j < 4 ? (i < 4 ? 0.8 : 0.2) : (i < 4 ? 0.25 : 0.75)) + (r() - 0.5) * 0.5));
            cells += el('rect', { x: 26 + i * 11, y: 18 + j * 9.5, width: 11, height: 9.5, fill: v > 0.5 ? mix('#FFFFFF', t.stroke, (v - 0.5) * 2) : mix('#FFFFFF', lo.stroke, (0.5 - v) * 2) });
        }
        const dendro = 'M24 22 H18 V36 H24 M18 29 H12 V60 H6 M24 54 H18 V88 H24 M18 71 H12';
        return { w: W, h: H, shape: 'rect', svg: card(defs, W, H, cells + el('path', { d: dendro, fill: 'none', stroke: '#6B7785', 'stroke-width': 1.1 }), false) };
    },
};
const volcano: GlyphDef = {
    name: 'volcano plot', aliases: ['volcano', 'differential expression plot', 'de analysis', 'differentially expressed genes'], category: 'data', color: 'red', accent: 'blue',
    description: 'Volcano plot with up/down regulated points highlighted.',
    draw({ defs }, o, t, a) {
        const W = 120, H = 100, r = rng('vol'), lo = o.accent ? a : tone(HUES.blue);
        let pts = '';
        for (let i = 0; i < 140; i++) { const x = (r() * 2 - 1), y = Math.abs(x) * (0.6 + r() * 0.9) + r() * 0.15; const px = 62 + x * 44, py = H - 16 - Math.min(1, y) * 70; const c = y > 0.55 && x > 0.3 ? t.base : y > 0.55 && x < -0.3 ? lo.base : '#B8C0CA'; pts += el('circle', { cx: px, cy: py, r: 1.8, fill: c, opacity: 0.9 }); }
        return { w: W, h: H, shape: 'rect', svg: card(defs, W, H, pts + el('path', { d: `M14 ${H - 50} H${W - 10}`, stroke: '#9AA5B1', 'stroke-width': 0.9, 'stroke-dasharray': '3 3' })) };
    },
};
const western: GlyphDef = {
    name: 'western blot', aliases: ['western', 'immunoblot', 'blot', 'gel', 'gel electrophoresis', 'pcr gel', 'agarose gel', 'sds-page', 'protein expression'], category: 'data', color: 'slate',
    description: 'Western blot / gel with bands of varying intensity. variant: western | gel | weak (signal suppressed) | strong (signal restored).',
    variants: ['western', 'gel', 'weak', 'strong'],
    draw({ defs }, o) {
        const W = 120, H = 90, r = rng(String(o.seed ?? 'wb')), gel = o.variant === 'gel';
        // weak/strong scale the two upper (target) rows while the loading control stays constant.
        const signal = o.variant === 'weak' ? 0.3 : o.variant === 'strong' ? 1.35 : 1;
        let bands = '';
        const lanes = 5;
        for (let row = 0; row < (gel ? 1 : 3); row++) for (let i = 0; i < lanes; i++) {
            const inten = row === 2 ? 0.8 : Math.min(1, [0.15, 0.5, 0.85, 0.65, 0.3][(i + row) % 5] * (0.8 + r() * 0.3) * signal);
            const y = gel ? 24 + ((i * 17) % 40) : 20 + row * 22;
            bands += el('rect', { x: (gel ? 16 + i * 19 : 10 + i * 14.5), y, width: gel ? 14 : 11.5, height: 6, rx: 3, fill: gel ? `rgba(240,250,255,${(0.35 + inten * 0.6).toFixed(2)})` : `rgba(25,30,38,${(0.15 + inten * 0.8).toFixed(2)})` });
        }
        const bg = gel ? '#1E293B' : '#F3F4F6';
        return { w: W, h: H, shape: 'rect', svg: el('rect', { x: 1, y: 1, width: W - 2, height: H - 2, rx: 6, fill: bg, stroke: '#C7D0DA', 'stroke-width': 1.4 }) + bands + (gel ? '' : ['Target', 'p-Target', 'Actin'].map((l, i) => text(l, W - 6, 24 + i * 22, { size: 7.5, anchor: 'end', color: '#4B5563', baseline: 'middle' })).join('')) };
    },
};
const linechart: GlyphDef = {
    name: 'line chart', aliases: ['line graph', 'time course', 'kinetics', 'growth curve', 'dose response', 'dose-response curve', 'tumor growth', 'survival curve', 'kaplan-meier', 'survival', 'kaplan meier', 'pharmacokinetics'], category: 'data', color: 'blue', accent: 'red',
    description: 'Line chart with two conditions. variant: line | survival (Kaplan–Meier steps) | dose (sigmoid).',
    aliasVariants: { 'survival curve': 'survival', 'kaplan-meier': 'survival', survival: 'survival', 'kaplan meier': 'survival', 'dose response': 'dose', 'dose-response curve': 'dose' },
    draw({ defs }, o, t, a) {
        const W = 120, H = 100, b = o.accent ? a : tone(HUES.red);
        let paths: string;
        if (o.variant === 'survival') {
            const step = (vals: number[]) => 'M14 16 ' + vals.map((v, i) => `H${14 + (i + 1) * 13} V${16 + v}`).join(' ');
            paths = el('path', { d: step([4, 8, 10, 14, 16, 20, 22]), fill: 'none', stroke: t.stroke, 'stroke-width': 2.2 }) + el('path', { d: step([10, 24, 36, 48, 56, 62, 66]), fill: 'none', stroke: b.stroke, 'stroke-width': 2.2 });
        } else if (o.variant === 'dose') {
            const sig = (shift: number) => { const pts: Pt[] = []; for (let i = 0; i <= 20; i++) { const x = i / 20; pts.push({ x: 16 + x * 94, y: H - 18 - 64 / (1 + Math.exp(-(x - shift) * 12)) }); } return smoothOpen(pts); };
            paths = el('path', { d: sig(0.4), fill: 'none', stroke: t.stroke, 'stroke-width': 2.2 }) + el('path', { d: sig(0.65), fill: 'none', stroke: b.stroke, 'stroke-width': 2.2 });
        } else {
            const ln = (k: number) => { const pts: Pt[] = []; for (let i = 0; i <= 6; i++) pts.push({ x: 18 + i * 15, y: H - 20 - k * (i * i) * 1.7 - i * 2 }); return pts; };
            const A = ln(1), B = ln(0.35);
            paths = [[A, t], [B, b]].map(([P, tt]: any) => el('path', { d: smoothOpen(P), fill: 'none', stroke: tt.stroke, 'stroke-width': 2.2 }) + P.map((p: Pt) => el('circle', { cx: p.x, cy: p.y, r: 2.6, fill: tt.base, stroke: tt.stroke, 'stroke-width': 1 })).join('')).join('');
        }
        return { w: W, h: H, shape: 'rect', svg: card(defs, W, H, paths) };
    },
};
const facs: GlyphDef = {
    name: 'flow cytometry', aliases: ['facs', 'facs plot', 'flow plot', 'cytometry', 'sorting', 'cell sorting', 'gating', 'flow cytometry plot', 'facs sorting'], category: 'data', color: 'blue',
    description: 'Flow-cytometry density plot with a gate.',
    draw({ defs }, o) {
        const W = 120, H = 100, r = rng('facs');
        let pts = '';
        const pop = (cx: number, cy: number, n: number) => { for (let i = 0; i < n; i++) { const a = r() * 6.28, d = Math.sqrt(-2 * Math.log(r() + 1e-6)) * 7; const x = cx + Math.cos(a) * d * 1.3, y = cy + Math.sin(a) * d; const dd = Math.hypot(x - cx, y - cy) / 22; pts += el('circle', { cx: x, cy: y, r: 1.5, fill: dd < 0.3 ? '#E3645E' : dd < 0.6 ? '#F5CF5C' : dd < 0.9 ? '#86C77A' : '#6EA6E0' }); } };
        pop(40, 66, 90); pop(84, 32, 80);
        return { w: W, h: H, shape: 'rect', svg: card(defs, W, H, pts + el('rect', { x: 66, y: 14, width: 40, height: 36, rx: 3, fill: 'none', stroke: '#111827', 'stroke-width': 1.3 }) + text('42%', 104, 22, { size: 8, weight: 700, anchor: 'end', color: '#111827' })) };
    },
};
const microscopy: GlyphDef = {
    name: 'microscopy image', aliases: ['fluorescence image', 'immunofluorescence', 'if staining', 'confocal image', 'image', 'staining', 'fluorescence', 'micrograph', 'imaging result'], category: 'data', color: 'green', accent: 'blue',
    description: 'Fluorescence micrograph: cells with nuclei (accent) and marker stain (color).',
    draw({ defs }, o, t, a) {
        const W = 110, H = 100, r = rng(String(o.seed ?? 'mic')), nuc = o.accent ? a : tone(HUES.blue);
        let cells = '';
        for (let i = 0; i < 9; i++) {
            const x = 14 + r() * 82, y = 14 + r() * 72;
            cells += el('path', { d: blob(x, y, 13, 11, { n: 7, jitter: 0.15, seed: i }), fill: t.base, opacity: 0.55 }) + el('ellipse', { cx: x + 1, cy: y, rx: 5.5, ry: 4.5, fill: nuc.base, opacity: 0.95 });
        }
        return { w: W, h: H, shape: 'rect', svg: el('rect', { x: 1, y: 1, width: W - 2, height: H - 2, rx: 4, fill: '#0B1220', stroke: '#334155', 'stroke-width': 1.4 }) + g(cells, { 'clip-path': defs.clip(`<rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="4"/>`) }) + el('path', { d: `M${W - 30} ${H - 10} H${W - 10}`, stroke: '#fff', 'stroke-width': 2.2 }) };
    },
};
const histology: GlyphDef = {
    name: 'histology', aliases: ['h&e', 'h and e', 'tissue section', 'histology section', 'ihc', 'immunohistochemistry', 'biopsy', 'pathology', 'tissue slide', 'slide'], category: 'data', color: 'pink', accent: 'purple',
    description: 'H&E-like tissue section with glandular structures.',
    draw({ defs }, o, t, a) {
        const W = 110, H = 100, r = rng(String(o.seed ?? 'he')), n = o.accent ? a : tone(HUES.purple);
        let s = '';
        for (let i = 0; i < 5; i++) { const x = 18 + r() * 74, y = 18 + r() * 64; s += el('path', { d: blob(x, y, 12, 9, { n: 7, jitter: 0.2, seed: 'g' + i }), fill: '#FBEFF4', stroke: n.base, 'stroke-width': 3, 'stroke-dasharray': '2 2.4' }); }
        for (let i = 0; i < 70; i++) s += el('circle', { cx: 4 + r() * 102, cy: 4 + r() * 92, r: 1.4 + r(), fill: n.stroke, opacity: 0.55 });
        return { w: W, h: H, shape: 'rect', svg: el('rect', { x: 1, y: 1, width: W - 2, height: H - 2, rx: 4, fill: defs.radial([[0, '#F7C9DA'], [1, t.base]], { r: 0.8 }), stroke: '#C7D0DA', 'stroke-width': 1.4 }) + g(s, { 'clip-path': defs.clip(`<rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="4"/>`) }) };
    },
};
const spectrum: GlyphDef = {
    name: 'spectrum', aliases: ['mass spectrum', 'ms spectrum', 'chromatogram', 'peaks', 'hplc', 'lc-ms', 'metabolomics', 'nmr', 'signal trace', 'electrophysiology', 'trace', 'calcium imaging trace', 'eeg', 'ecg'], category: 'data', color: 'blue',
    description: 'Spectrum / trace with peaks. variant: peaks | trace.',
    draw({ defs }, o, t) {
        const W = 120, H = 90;
        if (o.variant === 'trace') {
            const pts: Pt[] = []; const r = rng('tr'); for (let x = 16; x <= W - 10; x += 3) { const spike = [40, 70, 92].some(s => Math.abs(x - s) < 3) ? -40 : 0; pts.push({ x, y: H - 30 + spike + (r() - 0.5) * 5 }); }
            return { w: W, h: H, shape: 'rect', svg: card(defs, W, H, el('path', { d: 'M' + pts.map(p => `${f(p.x)} ${f(p.y)}`).join(' L'), fill: 'none', stroke: t.stroke, 'stroke-width': 1.5, 'stroke-linejoin': 'round' })) };
        }
        const peaks = [[30, 30], [44, 62], [58, 20], [72, 46], [90, 34], [100, 14]];
        return { w: W, h: H, shape: 'rect', svg: card(defs, W, H, peaks.map(([x, h]) => el('path', { d: `M${x} ${H - 14} V${H - 14 - h}`, stroke: t.stroke, 'stroke-width': 2.2 })).join('')) };
    },
};
const network: GlyphDef = {
    name: 'network', aliases: ['interaction network', 'gene network', 'ppi network', 'pathway analysis', 'graph network', 'gene regulatory network', 'connectome', 'neural network'], category: 'data', color: 'blue', accent: 'orange',
    description: 'Node–edge network graph.',
    draw({ defs }, o, t, a) {
        const r = rng('net'), N = 11, P = Array.from({ length: N }, (_, i) => ({ x: 60 + Math.cos(i * 2.4) * (12 + (i % 4) * 11), y: 50 + Math.sin(i * 2.4) * (10 + (i % 4) * 10) }));
        let e = ''; for (let i = 1; i < N; i++) { const j = Math.floor(r() * i); e += el('path', { d: `M${f(P[i].x)} ${f(P[i].y)} L${f(P[j].x)} ${f(P[j].y)}`, stroke: '#9AA5B1', 'stroke-width': 1.3 }); }
        const hub = o.accent ? a : tone(HUES.orange);
        return { w: 120, h: 100, shape: 'rect', svg: e + P.map((p, i) => el('circle', { cx: p.x, cy: p.y, r: i === 0 ? 8 : 4.5, fill: defs.body(i === 0 ? hub : t), stroke: (i === 0 ? hub : t).stroke, 'stroke-width': 1.1 })).join('') };
    },
};
const sequence: GlyphDef = {
    name: 'sequence', aliases: ['dna sequence', 'reads', 'sequencing reads', 'alignment', 'genome browser', 'coverage', 'tracks', 'peaks track', 'variant calling', 'mutation', 'snp', 'genotyping'], category: 'data', color: 'blue',
    description: 'Aligned sequencing reads / genome-browser tracks.',
    draw({ defs }, o) {
        const W = 140, H = 80, r = rng('seq'); let s = '';
        const colors: Record<string, string> = { A: '#2E9E5B', C: '#2F6FC9', G: '#E39A1F', T: '#D64545' };
        const seq = 'ATGCGTACCGTTAGCATG';
        [...seq].forEach((c, i) => { s += text(c, 10 + i * 7.1, 16, { size: 9.5, weight: 700, color: colors[c], anchor: 'middle', baseline: 'middle' }); });
        for (let row = 0; row < 5; row++) { const x0 = 6 + r() * 30, len = 50 + r() * 70; s += el('rect', { x: x0, y: 28 + row * 9, width: Math.min(len, W - x0 - 6), height: 5, rx: 2.5, fill: row % 2 ? '#9DB7E0' : '#B8C7DE' }); if (row === 2 || row === 4) s += el('rect', { x: 68, y: 28 + row * 9, width: 3, height: 5, fill: '#D64545' }); }
        return { w: W, h: H, shape: 'rect', svg: el('rect', { x: 1, y: 1, width: W - 2, height: H - 2, rx: 6, fill: '#fff', stroke: '#C7D0DA', 'stroke-width': 1.4 }) + s };
    },
};

export const labGlyphs: GlyphDef[] = [tube, falcon, petri, wellplate, flask, pipette, syringe, beaker, sequencer, microscope, centrifuge, computer, umap, barchart, heatmap, volcano, western, linechart, facs, microscopy, histology, spectrum, network, sequence];
