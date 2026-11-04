// The figure description language. Callers state WHAT is in the figure (steps, molecules,
// interactions, comparisons); the engine owns every coordinate.
import { z } from 'zod';

const str = (max = 400) => z.string().max(max);
export const visualSchema = z.union([
    str(200).describe('A thing to draw, by name: "mouse", "T cell", "liver", "GPCR", "96-well plate", "UMAP". Prefix "glyph:" to force a procedural drawing, "search:" to force a library search, or give an asset id.'),
    z.object({
        glyph: str(80).optional().describe('Procedural glyph name (see list_figure_vocabulary).'),
        search: str(120).optional().describe('Library search query (23k licensed illustrations).'),
        asset: str(80).optional().describe('Exact library asset id.'),
        pick: z.number().int().min(0).max(7).optional().describe('Use the n-th best library match instead of the first.'),
        color: str(30).optional().describe('Main colour: palette name (blue, teal, green, orange, red, pink, purple, yellow, gray, …) or hex.'),
        accent: str(30).optional().describe('Secondary colour (nucleus, second strand, liquid, highlighted wells…).'),
        hue: str(30).optional().describe('Recolour a library illustration toward this hue (keeps shading).'),
        variant: str(40).optional(),
        count: z.number().int().min(1).max(40).optional(),
        mods: z.array(str(8)).max(4).optional().describe('Protein modifications drawn as badges: "P", "Ub", "Me", "Ac".'),
        label: str(40).optional().describe('Short text written inside the glyph (protein names).'),
        seed: z.union([z.number(), str(40)]).optional(),
        flip: z.boolean().optional(),
    }).passthrough(),
]);
export type VisualSpec = z.infer<typeof visualSchema>;

const step = z.object({
    id: str(60).optional(),
    label: str(120).optional().describe('Bold step title shown under the illustration.'),
    detail: str(300).optional().describe('Smaller explanatory text under the title.'),
    visual: visualSchema.optional(),
    visuals: z.array(visualSchema).max(4).optional().describe('Several illustrations side by side for one step.'),
    action: str(120).optional().describe('Text on the arrow leaving this step (e.g. "Dox, 48 h").'),
    color: str(30).optional().describe('Colour used for procedural glyphs in this step.'),
}).passthrough();

const edge = z.object({
    from: str(60), to: str(60),
    label: str(120).optional(),
    type: str(40).optional().describe('activates | inhibits | binds | translocates | produces | releases | converts. Inferred from label when omitted.'),
    dashed: z.boolean().optional(),
}).passthrough();

const stage = z.object({ label: str(80), from: z.union([str(60), z.number().int()]), to: z.union([str(60), z.number().int()]), color: str(30).optional() }).passthrough();
const legendItem = z.object({ label: str(80), color: str(30).optional(), visual: visualSchema.optional(), line: z.enum(['activate', 'inhibit', 'translocate', 'bind']).optional() }).passthrough();

const common = {
    title: str(200).optional(),
    subtitle: str(300).optional(),
    footnote: str(600).optional(),
    legend: z.array(legendItem).max(12).optional(),
    palette: z.enum(['default', 'muted', 'vivid']).optional(),
};

export const workflowSchema = z.object({
    type: z.literal('workflow'),
    ...common,
    steps: z.array(step).min(1).max(18),
    edges: z.array(edge).max(40).optional().describe('Only for branching workflows; omit for a simple sequence.'),
    stages: z.array(stage).max(8).optional().describe('Tinted bands grouping consecutive steps, e.g. {label:"In vivo", from:0, to:2}.'),
    perRow: z.number().int().min(1).max(8).optional().describe('Steps per row before the flow wraps (serpentine). Default: automatic.'),
    numbered: z.boolean().optional(),
    arrowStyle: z.enum(['line', 'block']).optional(),
    visualSize: z.number().min(50).max(220).optional().describe('Illustration height in px (default 104).'),
}).passthrough();

const pnode = z.object({
    id: str(60),
    label: str(60).optional(),
    visual: visualSchema.optional().describe('Override the drawing (default chosen from kind).'),
    kind: str(40).optional().describe('ligand | receptor | gpcr | rtk | channel | transporter | protein | kinase | gprotein | tf | gene | mrna | drug | ion | antibody | vesicle | complex'),
    location: z.enum(['extracellular', 'membrane', 'cytoplasm', 'nucleus', 'output']).optional(),
    color: str(30).optional(),
    mods: z.array(str(8)).max(4).optional(),
    note: str(120).optional(),
}).passthrough();

export const pathwaySchema = z.object({
    type: z.literal('pathway'),
    ...common,
    nodes: z.array(pnode).min(1).max(40),
    edges: z.array(edge).max(60).default([]),
    nucleus: z.boolean().optional().describe('Draw the nucleus (default: true if any node is located there).'),
    outputs: z.array(str(80)).max(6).optional().describe('Phenotypic outcomes listed below the cell (e.g. "Proliferation").'),
    compartmentLabels: z.boolean().optional(),
}).passthrough();

const cell = z.union([visualSchema, z.object({ visual: visualSchema.optional(), label: str(120).optional(), detail: str(240).optional() }).passthrough(), z.null()]);
export const comparisonSchema = z.object({
    type: z.literal('comparison'),
    ...common,
    columns: z.array(z.object({ title: str(80), subtitle: str(160).optional(), color: str(30).optional() }).passthrough()).min(2).max(4),
    rows: z.array(z.object({ label: str(80).optional(), cells: z.array(cell).max(4) }).passthrough()).min(1).max(6),
    transition: str(100).optional().describe('Label on an arrow between the columns (e.g. "Treatment").'),
    visualSize: z.number().min(60).max(260).optional().describe('Illustration height in px (default 112). Raise it for detailed mechanisms.'),
}).passthrough();

export const cycleSchema = z.object({
    type: z.literal('cycle'),
    ...common,
    stages: z.array(step).min(3).max(8),
    center: z.object({ label: str(80).optional(), visual: visualSchema.optional(), detail: str(200).optional() }).passthrough().optional(),
}).passthrough();

export const zoomSchema = z.object({
    type: z.literal('zoom'),
    ...common,
    levels: z.array(z.object({ visual: visualSchema, label: str(100).optional(), detail: str(240).optional(), focus: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]).optional().describe('Fractional point on THIS illustration that the next level magnifies.') }).passthrough()).min(2).max(5),
}).passthrough();

export type WorkflowSpec = z.infer<typeof workflowSchema>;
export type PathwaySpec = z.infer<typeof pathwaySchema>;
export type ComparisonSpec = z.infer<typeof comparisonSchema>;
export type CycleSpec = z.infer<typeof cycleSchema>;
export type ZoomSpec = z.infer<typeof zoomSchema>;

const leaf = z.discriminatedUnion('type', [workflowSchema, pathwaySchema, comparisonSchema, cycleSchema, zoomSchema]);
export const panelsSchema = z.object({
    type: z.literal('panels'),
    ...common,
    panels: z.array(leaf).min(1).max(8).describe('Each panel is a complete workflow/pathway/comparison/cycle/zoom spec; its title becomes the panel heading (a, b, c…).'),
    columns: z.number().int().min(1).max(4).optional().describe('Panels per row (default: 2 when more than 2 panels).'),
    letters: z.boolean().optional(),
}).passthrough();
export type PanelsSpec = z.infer<typeof panelsSchema>;

export const figureSchema = z.discriminatedUnion('type', [workflowSchema, pathwaySchema, comparisonSchema, cycleSchema, zoomSchema, panelsSchema]);
export type FigureSpec = z.infer<typeof figureSchema>;
export type LeafSpec = z.infer<typeof leaf>;
