import type { Defs, Pt, Tone } from '../svg.ts';

export type GlyphOpts = {
    /** Main hue (named or hex). */
    color?: string;
    /** Secondary hue (nucleus, second strand, liquid, highlighted wells...). */
    accent?: string;
    variant?: string;
    seed?: number | string;
    count?: number;
    detail?: 'low' | 'high';
    /** Free text drawn inside some glyphs (protein name inside a blob, gene name on a track). */
    label?: string;
    /** Membrane thickness for membrane-spanning glyphs (set by the pathway layout). */
    span?: number;
    /** Glyph-specific extras, e.g. modifications for proteins. */
    mods?: string[];
    flip?: boolean;
};
export type GlyphOut = {
    svg: string;
    w: number;
    h: number;
    /** Named attachment points in glyph coordinates (top/bottom binding sites, pore...). */
    anchors?: Record<string, Pt>;
    /** Outline used for connector clipping: the glyph's hit shape in its own box. */
    shape?: 'ellipse' | 'rect';
    /** Vertical offset of the membrane mid-plane for membrane glyphs. */
    membraneY?: number;
};
export type GlyphCtx = { defs: Defs };
export type GlyphDef = {
    name: string;
    aliases: string[];
    category: 'cell' | 'organelle' | 'molecule' | 'membrane' | 'nucleic' | 'lab' | 'data' | 'organism' | 'symbol';
    description: string;
    color: string;
    accent?: string;
    variants?: string[];
    /** Aliases that imply a variant, e.g. {kinase:'kinase'} on protein. */
    aliasVariants?: Record<string, string>;
    draw: (ctx: GlyphCtx, o: GlyphOpts, t: Tone, a: Tone) => GlyphOut;
};
