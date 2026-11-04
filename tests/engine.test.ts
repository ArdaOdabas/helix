import { describe, it, expect } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { renderFigureSpec } from '../src/engine/compose.ts';
import { figureSchema } from '../src/engine/spec.ts';
import { Defs, wrap, textWidth, plain, richText } from '../src/engine/svg.ts';
import { tone, hexToHsl, resolveColor, mix } from '../src/engine/color.ts';
import { allGlyphs, findGlyph, lookupGlyph, drawGlyph } from '../src/engine/glyphs/index.ts';
import { edgeKind, boundary, arrow } from '../src/engine/connectors.ts';
import { splitParts, parseTransform, partSvg } from '../src/engine/document.ts';
import { viewBoxOf, innerSvg, prefixIds } from '../src/engine/assets.ts';
import { sanitizeSvg } from '../src/assets/sanitize.ts';
import { vocabulary } from '../src/engine/guide.ts';

const env = () => ({ assetIds: new Set<string>(), warnings: [] as string[], credits: new Map<string, string>(), uid: () => 'u', resolver: undefined });
const render = (spec: unknown) => renderFigureSpec(figureSchema.parse(spec), env() as any);
const parse = (svg: string) => new DOMParser().parseFromString(svg, 'image/svg+xml');

describe('colour model', () => {
    it('derives a consistent tonal family from any hue', () => {
        for (const base of ['#6EA6E0', '#E3645E', '#86C77A', '#222222']) {
            const t = tone(base);
            const l = (c: string) => hexToHsl(c).l;
            expect(l(t.light)).toBeGreaterThan(l(t.base));
            expect(l(t.stroke)).toBeLessThan(l(t.base));
            expect(l(t.dark)).toBeLessThanOrEqual(l(t.stroke));
            expect(l(t.pale)).toBeGreaterThan(l(t.light));
            for (const c of Object.values(t)) expect(c).toMatch(/^#[0-9a-fA-F]{6}$/);
        }
    });
    it('resolves palette names, hex and unknown values', () => {
        expect(resolveColor('teal', '#000000')).toMatch(/^#/);
        expect(resolveColor('#ABCDEF', '#000000')).toBe('#ABCDEF');
        expect(resolveColor('not-a-colour', '#123456')).toBe('#123456');
        expect(mix('#000000', '#ffffff', 0.5)).toBe('#808080');
    });
});

describe('text handling', () => {
    it('wraps to the given width and measures bold text as wider', () => {
        const lines = wrap('Homology-directed repair integrates a promoterless reporter', 12, 120);
        expect(lines.length).toBeGreaterThan(1);
        for (const l of lines) expect(textWidth(l, 12)).toBeLessThanOrEqual(121);
        expect(textWidth('ABC', 12, 700)).toBeGreaterThan(textWidth('ABC', 12, 400));
    });
    it('renders inline markup and escapes XML', () => {
        expect(richText('Ca^2+^')).toContain('baseline-shift="super"');
        expect(richText('CO_2_')).toContain('baseline-shift="sub"');
        expect(richText('*TP53*')).toContain('font-style="italic"');
        expect(richText('a<b & "c"')).toBe('a&lt;b &amp; &quot;c&quot;');
        expect(plain('*TP53* Ca^2+^')).toBe('TP53 Ca2+');
    });
});

describe('glyph library', () => {
    const defs = new Defs('t');
    it('draws every glyph and every declared variant as well-formed SVG with positive size', () => {
        for (const g of allGlyphs()) {
            for (const variant of [undefined, ...(g.variants ?? [])]) {
                const out = drawGlyph(defs, g, { variant, seed: g.name, label: 'TEST', mods: ['P'], count: 3 });
                expect(out.w, g.name).toBeGreaterThan(0);
                expect(out.h, g.name).toBeGreaterThan(0);
                const doc = parse(`<svg xmlns="http://www.w3.org/2000/svg">${out.svg}</svg>`);
                expect(doc.documentElement?.localName, `${g.name}/${variant}`).toBe('svg');
                expect(out.svg).not.toContain('NaN');
                expect(out.svg).not.toContain('undefined');
            }
        }
    });
    it('resolves aliases, plurals and alias-implied variants', () => {
        expect(findGlyph('T cells')?.name).toBe('t cell');
        expect(findGlyph('mitochondria')?.name).toBe('mitochondrion');
        expect(findGlyph('EGFR')?.name).toBe('rtk');
        expect(lookupGlyph('AAV')).toMatchObject({ variant: 'capsid' });
        expect(lookupGlyph('kinase')).toMatchObject({ variant: 'kinase' });
        expect(findGlyph('definitely not a glyph')).toBeUndefined();
    });
    it('gives membrane glyphs a mid-plane and the requested span', () => {
        for (const name of ['gpcr', 'rtk', 'receptor', 'ion channel', 'transporter']) {
            const g = findGlyph(name)!;
            const a = drawGlyph(defs, g, { span: 30 }), b = drawGlyph(defs, g, { span: 60 });
            expect(a.membraneY, name).toBeGreaterThan(0);
            expect(b.h - a.h, name).toBeCloseTo(30, 0);
        }
    });
});

describe('connectors', () => {
    it('infers the interaction kind from free text', () => {
        expect(edgeKind('inhibits')).toBe('inhibit');
        expect(edgeKind('blocks degradation')).toBe('inhibit');
        expect(edgeKind('binds to')).toBe('bind');
        expect(edgeKind('translocates to the nucleus')).toBe('translocate');
        expect(edgeKind('transcription')).toBe('produce');
        expect(edgeKind('')).toBe('activate');
    });
    it('puts boundary points on the shape outline', () => {
        const box = { x: 0, y: 0, w: 100, h: 50, shape: 'ellipse' as const };
        const p = boundary(box, { x: 500, y: 25 });
        expect(p.x).toBeCloseTo(100, 6);
        expect(p.y).toBeCloseTo(25, 6);
        const r = boundary({ ...box, shape: 'rect' }, { x: 50, y: 500 });
        expect(r.y).toBeCloseTo(50, 6);
    });
    it('draws an inhibition bar instead of an arrow head', () => {
        const a = arrow({ x: 0, y: 0 }, { x: 0, y: 80 }, { kind: 'activate' }).svg;
        const i = arrow({ x: 0, y: 0 }, { x: 0, y: 80 }, { kind: 'inhibit' }).svg;
        expect(a).toContain('Z"');       // filled head
        expect(i).not.toMatch(/ Z"/);
        expect(arrow({ x: 0, y: 0 }, { x: 1, y: 0 }, {}).svg).toBe('');
    });
});

describe('figure layouts', () => {
    const specs: Record<string, unknown> = {
        workflow: { type: 'workflow', title: 'T', numbered: true, stages: [{ label: 'In vivo', from: 0, to: 1 }], steps: [{ label: 'Mouse', visual: 'glyph:cell', action: 'Treat' }, { label: 'Cells', visual: 'glyph:t cell' }, { label: 'Read-out', visual: 'glyph:umap' }] },
        branching: { type: 'workflow', steps: [{ id: 'a', label: 'Start', visual: 'glyph:tube' }, { id: 'b', label: 'Arm 1', visual: 'glyph:petri dish' }, { id: 'c', label: 'Arm 2', visual: 'glyph:well plate' }], edges: [{ from: 'a', to: 'b', label: 'split' }, { from: 'a', to: 'c' }] },
        pathway: {
            type: 'pathway', title: 'P',
            nodes: [{ id: 'l', label: 'EGF', kind: 'ligand' }, { id: 'r', label: 'EGFR', kind: 'rtk' }, { id: 'k', label: 'MEK', kind: 'kinase' }, { id: 'd', label: 'Drug', kind: 'drug' }, { id: 't', label: 'ELK1', kind: 'tf', location: 'nucleus' }, { id: 'g', label: 'FOS', kind: 'gene', location: 'nucleus' }],
            edges: [{ from: 'l', to: 'r', type: 'binds' }, { from: 'r', to: 'k' }, { from: 'd', to: 'k', type: 'inhibits' }, { from: 'k', to: 't', type: 'translocates' }, { from: 't', to: 'g', type: 'produces' }],
            outputs: ['Proliferation'],
        },
        comparison: { type: 'comparison', columns: [{ title: 'WT' }, { title: 'KO' }], transition: 'Cre', rows: [{ label: 'Cell', cells: ['glyph:cell', { visual: 'glyph:cancer cell', label: 'Transformed' }] }] },
        cycle: { type: 'cycle', stages: [{ label: 'G1', visual: 'glyph:cell' }, { label: 'S', visual: 'glyph:dna' }, { label: 'G2', visual: 'glyph:cell' }, { label: 'M', visual: 'glyph:chromosome' }], center: { label: 'Cell cycle' } },
        zoom: { type: 'zoom', levels: [{ visual: 'glyph:cell cluster', focus: [0.5, 0.5], label: 'Tissue' }, { visual: 'glyph:cell', label: 'Cell' }, { visual: 'glyph:mitochondrion', label: 'Mitochondrion' }] },
    };
    for (const [name, spec] of Object.entries(specs)) {
        it(`renders a ${name} figure as valid, finite SVG`, () => {
            const r = render(spec);
            expect(r.width).toBeGreaterThan(200);
            expect(r.height).toBeGreaterThan(100);
            expect(r.svg).not.toMatch(/NaN|undefined|Infinity/);
            const doc = parse(r.svg);
            expect(doc.documentElement?.getAttribute('viewBox')).toBe(`0 0 ${r.width} ${r.height}`);
        });
    }
    it('composes several layouts into a lettered multi-panel figure', () => {
        const r = render({ type: 'panels', title: 'Abstract', columns: 2, panels: [specs.workflow, specs.pathway, specs.comparison, specs.zoom] });
        for (const letter of ['>a<', '>b<', '>c<', '>d<']) expect(r.svg).toContain(letter);
        expect(r.width).toBeGreaterThan(900);
    });
    it('keeps the top-level composition inside the artboard', () => {
        for (const spec of Object.values(specs)) {
            const r = render(spec);
            const root = parse(r.svg).documentElement!;
            for (let c = root.firstChild; c; c = c.nextSibling) {
                if (c.nodeType !== 1) continue;
                const m = parseTransform((c as any).getAttribute?.('transform') ?? null);
                expect(m[4]).toBeGreaterThanOrEqual(0);
                expect(m[5]).toBeGreaterThanOrEqual(0);
                expect(m[4]).toBeLessThan(r.width);
                expect(m[5]).toBeLessThan(r.height);
            }
        }
    });
    it('is deterministic for the same spec', () => {
        expect(render(specs.pathway).svg).toBe(render(specs.pathway).svg);
    });
    it('reports unresolvable references as warnings instead of failing', () => {
        const e = env() as any;
        const r = renderFigureSpec(figureSchema.parse({ type: 'workflow', steps: [{ label: 'X', visual: 'glyph:not-a-real-glyph' }] }), e);
        expect(r.svg).toContain('<svg');
        expect(e.warnings.join(' ')).toMatch(/not-a-real-glyph/);
    });
    it('rejects malformed specs', () => {
        expect(() => figureSchema.parse({ type: 'nope' })).toThrow();
        expect(() => figureSchema.parse({ type: 'workflow', steps: [] })).toThrow();
        expect(() => figureSchema.parse({ type: 'pathway', nodes: [{ id: 'a' }], edges: [{ from: 'a' }] })).toThrow();
    });
});

describe('editable document conversion', () => {
    const spec = { type: 'workflow', title: 'Doc', numbered: true, steps: [{ label: 'Cell', visual: 'glyph:cell', action: 'Treat' }, { label: 'Result', visual: 'glyph:bar chart' }] };
    it('splits the figure into individually marked parts', () => {
        const split = splitParts(render(spec).svg);
        expect(split.parts.length).toBeGreaterThan(5);
        const kinds = new Set(split.parts.map(p => p.kind));
        for (const k of ['visual', 'text', 'connector', 'badge']) expect(kinds).toContain(k);
        for (const p of split.parts) expect(split.marked).toContain(`data-object-id="${p.id}"`);
    });
    it('produces parts whose SVG passes the library sanitizer', () => {
        const split = splitParts(render(spec).svg);
        for (const p of split.parts) {
            const s = partSvg(p, split.defs, { x: 0, y: 0, width: 100, height: 100 });
            expect(() => sanitizeSvg(s.svg), p.name).not.toThrow();
        }
    });
    it('parses SVG transform lists into matrices', () => {
        expect(parseTransform('translate(10 20)')).toEqual([1, 0, 0, 1, 10, 20]);
        expect(parseTransform('translate(10 20) scale(2)')).toEqual([2, 0, 0, 2, 10, 20]);
        expect(parseTransform(null)).toEqual([1, 0, 0, 1, 0, 0]);
        const r = parseTransform('rotate(90)');
        expect(r[0]).toBeCloseTo(0, 6);
        expect(r[1]).toBeCloseTo(1, 6);
    });
});

describe('asset helpers', () => {
    it('reads view boxes and isolates inner markup', () => {
        expect(viewBoxOf('<svg viewBox="1 2 30 40"></svg>')).toEqual([1, 2, 30, 40]);
        expect(viewBoxOf('<svg width="50" height="60"></svg>')).toEqual([0, 0, 50, 60]);
        expect(innerSvg('<svg viewBox="0 0 1 1"><g><path/></g></svg>')).toBe('<g><path/></g>');
    });
    it('namespaces ids so two copies never collide', () => {
        const out = prefixIds('<linearGradient id="a"/><path fill="url(#a)" href="#a"/>', 'p1');
        expect(out).toContain('id="p1-a"');
        expect(out).toContain('url(#p1-a)');
        expect(out).toContain('href="#p1-a"');
    });
});

describe('vocabulary', () => {
    it('documents every glyph and layout for the assistant', () => {
        const v = vocabulary();
        expect(v.layouts).toContain('pathway');
        const listed = Object.values(v.glyphs).flat();
        expect(listed.length).toBe(allGlyphs().length);
        for (const g of listed) expect(g.description.length).toBeGreaterThan(10);
        for (const key of Object.keys(v.examples)) expect(() => figureSchema.parse(v.examples[key])).not.toThrow();
    });
});
