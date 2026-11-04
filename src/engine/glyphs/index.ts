import { cellGlyphs } from './cells.ts';
import { moleculeGlyphs } from './molecules.ts';
import { labGlyphs } from './lab.ts';
import { editingGlyphs } from './editing.ts';
import type { GlyphDef, GlyphOpts, GlyphOut } from './types.ts';
import { resolveColor, HUES } from '../color.ts';
import { tone, type Defs } from '../svg.ts';

const modules: GlyphDef[][] = [cellGlyphs, moleculeGlyphs, labGlyphs, editingGlyphs];
let extra: GlyphDef[] = [];
export function registerGlyphs(defs: GlyphDef[]) { extra = extra.concat(defs); index = undefined; }

let index: Map<string, GlyphDef> | undefined;
function build() {
    const m = new Map<string, GlyphDef>();
    for (const d of [...modules.flat(), ...extra]) {
        m.set(norm(d.name), d);
        for (const a of d.aliases) if (!m.has(norm(a))) m.set(norm(a), d);
    }
    return m;
}
export const norm = (s: string) => s.toLowerCase().replace(/[‐-―_]/g, '-').replace(/[^a-z0-9+\- .]/g, '').replace(/\s+/g, ' ').trim();
export function allGlyphs(): GlyphDef[] { return [...modules.flat(), ...extra]; }

/** Finds a procedural glyph by name/alias. Also tries singular forms ("T cells" -> "t cell"). */
export function findGlyph(name: string): GlyphDef | undefined { return lookupGlyph(name)?.def; }
/** Lookup that also reports the variant implied by the alias used ("kinase" -> protein/kinase). */
export function lookupGlyph(name: string): { def: GlyphDef; variant?: string } | undefined {
    index ??= build();
    const n = norm(name);
    for (const k of [n, n.replace(/s$/, ''), n.replace(/es$/, ''), n.replace(/-/g, ' '), n.replace(/ /g, '-')]) {
        const def = index.get(k);
        if (def) return { def, variant: def.aliasVariants?.[k] };
    }
    return undefined;
}

export function drawGlyph(defs: Defs, def: GlyphDef, o: GlyphOpts): GlyphOut {
    const t = tone(resolveColor(o.color, HUES[def.color] ?? def.color));
    const a = tone(resolveColor(o.accent, HUES[def.accent ?? 'purple'] ?? HUES.purple));
    return def.draw({ defs }, o, t, a);
}
export type { GlyphDef, GlyphOpts, GlyphOut };
