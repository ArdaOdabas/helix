// Turns a loose visual reference ("mouse", "glyph:gpcr", {search:"liver", hue:"red"}) into a drawable
// with known size. Procedural glyphs win for things they draw well; the licensed library supplies
// organisms, organs and everything else.
import { lookupGlyph, drawGlyph, norm } from './glyphs/index.ts';
import { Defs, g, f, translate } from './svg.ts';
import { prefixIds, type AssetResolver } from './assets.ts';
import { resolveColor } from './color.ts';
import type { GlyphOut } from './glyphs/types.ts';

export type VisualRef = string | {
    glyph?: string; asset?: string; search?: string; pick?: number;
    color?: string; accent?: string; variant?: string; count?: number; mods?: string[]; label?: string; seed?: number | string; hue?: string; flip?: boolean;
};
export type Drawable = {
    w: number; h: number; shape: 'ellipse' | 'rect';
    /** Draw with top-left at (x,y), uniformly scaled by s. */
    draw: (x: number, y: number, s: number) => string;
    anchors?: Record<string, { x: number; y: number }>;
    membraneY?: number;
    source: 'glyph' | 'asset' | 'missing';
    name: string;
    credit?: string;
};

/** Better catalog queries for common words whose literal search is poor. */
const QUERY_ALIASES: Record<string, string> = {
    human: 'person', patient: 'person', people: 'person', donor: 'person', man: 'person', volunteer: 'person', 'healthy donor': 'person', participant: 'person', cohort: 'person',
    mouse: 'lab mouse', mice: 'lab mouse', 'lab mouse': 'lab mouse', 'nude mouse': 'lab mouse', 'mouse model': 'lab mouse', 'xenograft': 'lab mouse',
    rat: 'rat', 'c. elegans': 'caenorhabditis elegans', worm: 'caenorhabditis elegans', 'fruit fly': 'drosophila', fly: 'drosophila',
    colon: 'healthy colon', 'large intestine': 'healthy colon', gut: 'intestine', adipose: 'adipocyte', 'fat cell': 'adipocyte', fat: 'adipocyte',
    'blood vessel': 'blood vessel', vessel: 'blood vessel', artery: 'blood vessel', vein: 'blood vessel', bone: 'bone marrow', tumor: 'tumor',
    'tumor tissue': 'tumor', egg: 'oocyte', 'beta cell': 'pancreatic islet', islet: 'pancreatic islet', heart: 'heart', lungs: 'lung',
};

export type VisualEnv = { defs: Defs; resolver?: AssetResolver; assetIds: Set<string>; warnings: string[]; credits: Map<string, string>; uid: () => string };

function fromGlyph(env: VisualEnv, out: GlyphOut, name: string, flip = false): Drawable {
    return {
        w: out.w, h: out.h, shape: out.shape ?? 'rect', anchors: out.anchors, membraneY: out.membraneY, source: 'glyph', name,
        draw: (x, y, s) => flip ? g(out.svg, { transform: `translate(${f(x + out.w * s)} ${f(y)}) scale(${f(-s)} ${f(s)})`, 'data-part': 'visual', 'data-name': name }) : g(out.svg, { transform: translate(x, y, s), 'data-part': 'visual', 'data-name': name }),
    };
}

function fromAsset(env: VisualEnv, id: string, hue?: string, flip = false): Drawable {
    env.assetIds.add(id);
    const r = env.resolver!;
    const a = r.load(id, { hue: hue ? resolveColor(hue, hue) : undefined });
    env.credits.set(id, a.attribution ?? a.name);
    const pre = env.uid();
    const body = prefixIds(a.svg, pre);
    return {
        w: a.box.w, h: a.box.h, shape: 'ellipse', source: 'asset', name: a.name, credit: a.attribution,
        draw: (x, y, s) => {
            const inner = `<svg x="0" y="0" width="${f(a.box.w)}" height="${f(a.box.h)}" viewBox="${f(a.box.x)} ${f(a.box.y)} ${f(a.box.w)} ${f(a.box.h)}" overflow="visible">${body}</svg>`;
            return flip ? g(inner, { transform: `translate(${f(x + a.box.w * s)} ${f(y)}) scale(${f(-s)} ${f(s)})`, 'data-part': 'visual', 'data-name': a.name }) : g(inner, { transform: translate(x, y, s), 'data-part': 'visual', 'data-name': a.name });
        },
    };
}

function missing(name: string): Drawable {
    return { w: 80, h: 80, shape: 'ellipse', source: 'missing', name, draw: (x, y, s) => `<g data-part="visual" data-name="missing" transform="${translate(x, y, s)}"><circle cx="40" cy="40" r="36" fill="#F1F4F8" stroke="#AAB4C0" stroke-width="1.6" stroke-dasharray="4 4"/><text x="40" y="45" text-anchor="middle" font-family="Helvetica, Arial" font-size="12" fill="#7A8594">?</text></g>` };
}

export function resolveVisual(env: VisualEnv, ref: VisualRef | undefined, defaults: { color?: string; seed?: string } = {}): Drawable | undefined {
    if (ref === undefined || ref === null || ref === '') return undefined;
    const o = typeof ref === 'string' ? parseRef(ref) : { ...ref };
    const opts = { span: (o as any).span, color: o.color ?? defaults.color, accent: o.accent, variant: o.variant, count: o.count, mods: o.mods, label: o.label, seed: o.seed ?? defaults.seed };
    // Explicit asset id.
    if (o.asset) {
        if (!env.resolver) { env.warnings.push(`Library unavailable for asset ${o.asset}`); return missing(o.asset); }
        try { return fromAsset(env, o.asset, o.hue, o.flip); } catch { env.warnings.push(`Unknown asset id ${o.asset}`); return missing(o.asset); }
    }
    if (o.glyph) {
        const hit = lookupGlyph(o.glyph);
        if (hit) return fromGlyph(env, drawGlyph(env.defs, hit.def, { ...opts, variant: opts.variant ?? hit.variant }), hit.def.name, o.flip);
        env.warnings.push(`No procedural glyph named "${o.glyph}"; searched the library instead.`);
    }
    const q: string = o.search ?? o.glyph ?? (o as any)._q ?? '';
    if (!o.search && (o as any)._q) {
        const hit = lookupGlyph(q);
        if (hit) {
            // A drawn illustration beats a generated one for anything with a real-world shape, so a
            // plain name takes the library's picture when there is a confident match. Procedural
            // glyphs stay in charge where generation is the point: membrane proteins that must sit
            // in a bilayer, nucleic acids that must line up across the editing scene, charts, and
            // any request that asks for parametric control (a colour, variant, label or badge) the
            // library cannot provide.
            const parametric = !!(o.color || o.accent || o.variant || o.mods || o.label || o.count);
            const generated = ['membrane', 'nucleic', 'data', 'symbol'].includes(hit.def.category);
            if (!parametric && !generated && env.resolver) {
                const best = env.resolver.search(QUERY_ALIASES[norm(q)] ?? q, 1)[0];
                // A flat two-or-three-shape pictogram is worse than the generated drawing, so the
                // library only wins when the asset is genuinely drawn.
                if (best && best.score >= 18 && best.vectors >= 18 && sameThing(best.name, q)) return fromAsset(env, best.id, o.hue, o.flip);
            }
            return fromGlyph(env, drawGlyph(env.defs, hit.def, { ...opts, variant: opts.variant ?? hit.variant }), hit.def.name, o.flip);
        }
    }
    if (!env.resolver) { env.warnings.push(`No glyph for "${q}" and no library available.`); return missing(q); }
    const query = QUERY_ALIASES[norm(q)] ?? q;
    const cand = env.resolver.pick({ query, pick: o.pick });
    if (!cand) { env.warnings.push(`Nothing found for "${q}". Try a simpler noun, a glyph name (list_figure_vocabulary) or search_icons.`); return missing(q); }
    return fromAsset(env, cand.id, o.hue ?? (o.color && !o.glyph ? o.color : undefined), o.flip);
}

/**
 * Whether a library asset's name denotes the same thing as the query, ignoring plurals and filler.
 * Deliberately strict: "t cell receptor" and "TCell senescence" are not a T cell, and a picture of
 * the wrong thing is worse than a generated picture of the right one.
 */
function sameThing(name: string, query: string) {
    const strip = (v: string) => norm(v).replace(/\b(the|a|an|of|generic|simple)\b/g, '').replace(/(\w)s\b/g, '$1').replace(/\s+/g, ' ').trim();
    return strip(name) === strip(QUERY_ALIASES[norm(query)] ?? query);
}

function parseRef(s: string): Exclude<VisualRef, string> {
    const m = s.match(/^(glyph|asset|search|icon):\s*(.+)$/i);
    if (m) { const k = m[1].toLowerCase(); return k === 'glyph' ? { glyph: m[2] } : k === 'search' ? { search: m[2] } : { asset: m[2].trim() }; }
    if (/^asset-[a-f0-9]{64}$/.test(s.trim())) return { asset: s.trim() };
    return { _q: s.trim() } as any;
}

/** Uniform scale that fits a drawable in a box. */
export const fitScale = (d: Drawable, maxW: number, maxH: number, maxScale = 3) => Math.min(maxW / d.w, maxH / d.h, maxScale);
