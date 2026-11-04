// Declarative figure composition. The caller describes panels and the blocks inside them; this engine
// measures every block, stacks it, sizes the panels and the artboard, aligns the connectors between
// panels and places the legend and footnotes. No coordinates are supplied from outside.
//
// This is deliberately the inverse of hand-placing nodes: the agent states structure, the engine owns
// geometry, so spacing and alignment are consistent instead of being re-invented per figure.
import { z } from 'zod';
import { nodeSchema } from './model.ts';
import type { Operation } from './model.ts';
import { buildPrimitive, primitiveSchema, palette, paint } from './primitives.ts';
import { layoutText, measureText } from './text-metrics.ts';
import { harmonizeColorMap } from './style.ts';

const segment = z.object({
    label: z.string().max(120).default(''),
    span: z.number().finite().min(0.01).max(100).default(1),
    fill: paint.default(palette.dna),
    ghost: z.boolean().default(false),
}).strict();

const mark = z.object({
    /** Fraction along the whole track, or `afterSegment` to pin the mark to a segment boundary. */
    at: z.number().finite().min(0).max(1).optional(),
    afterSegment: z.number().int().min(0).max(23).optional(),
    label: z.string().max(120).default(''),
    kind: z.enum(['cut', 'site', 'tick']).default('tick'),
    color: paint.default(palette.warn),
}).strict().refine(m => (m.at === undefined) !== (m.afterSegment === undefined), 'Give either at or afterSegment');

const spanLabel = z.object({
    /** Inclusive segment index range the bracket annotates. */
    fromSegment: z.number().int().min(0).max(23),
    toSegment: z.number().int().min(0).max(23),
    label: z.string().max(120),
    color: paint.optional(),
}).strict();

const leafBlock = z.discriminatedUnion('type', [
    z.object({ type: z.literal('track'), title: z.string().max(200).default(''), segments: z.array(segment).min(1).max(24),
        marks: z.array(mark).max(24).default([]), brackets: z.array(spanLabel).max(12).default([]),
        caption: z.string().max(300).default(''), barHeight: z.number().min(8).max(80).default(26),
        segmentLabels: z.boolean().default(true) }).strict(),
    z.object({ type: z.literal('icon'), iconId: z.string().max(150), height: z.number().min(20).max(420).default(140),
        caption: z.string().max(200).default(''), align: z.enum(['left', 'center']).default('center'),
        /** Recolour this illustration into one hue so mixed-provider assets read as one set. */
        hue: paint.optional() }).strict(),
    z.object({ type: z.literal('note'), text: z.string().max(600), tone: z.enum(['body', 'muted', 'strong']).default('muted') }).strict(),
    z.object({ type: z.literal('chips'), items: z.array(z.object({ label: z.string().max(80), color: paint }).strict()).min(1).max(12),
        columns: z.number().int().min(1).max(3).default(1) }).strict(),
    z.object({ type: z.literal('spacer'), height: z.number().min(2).max(200).default(12) }).strict(),
]);
type LeafBlock = z.infer<typeof leafBlock>;

const block = z.union([
    leafBlock,
    z.object({ type: z.literal('inset'), title: z.string().max(200).default(''), blocks: z.array(leafBlock).min(1).max(8),
        /** Draw guide lines from the block directly above this one. */
        linkToPrevious: z.boolean().default(true) }).strict(),
]);
type Block = z.infer<typeof block>;

export const composeSpecSchema = z.object({
    title: z.string().min(1).max(300),
    subtitle: z.string().max(400).default(''),
    panels: z.array(z.object({
        letter: z.string().max(3).default(''), title: z.string().max(200).default(''),
        tint: paint.optional(), blocks: z.array(block).min(1).max(24),
    }).strict()).min(1).max(6),
    connectors: z.array(z.object({
        /** Index of the panel the arrow leaves; it always points at the next panel. */
        afterPanel: z.number().int().min(0).max(4),
        relation: z.enum(['activates', 'inhibits', 'converts', 'translocates', 'produces']).default('converts'),
        label: z.string().max(80).default(''),
    }).strict()).max(5).default([]),
    legend: z.array(z.object({ label: z.string().max(80), color: paint }).strict()).max(12).default([]),
    footnotes: z.array(z.string().max(600)).max(4).default([]),
    panelWidth: z.number().min(220).max(900).default(388),
    /** Default hue for every icon that does not set its own; the single biggest lever on style unity. */
    iconHue: paint.optional(),
    /** 0 renders illustrations almost neutral in the figure hue, 1 keeps their own saturation. */
    iconSaturation: z.number().min(0).max(1).default(0.85),
    extras: z.array(primitiveSchema).max(20).default([]),
}).strict();
export type ComposeSpec = z.infer<typeof composeSpecSchema>;

const PAD = 40, GAP = 56, BLOCK_GAP = 18, PANEL_PAD = 28, HEADER = 52;
const TINTS = ['#f2f6f3', '#f3f1f8', '#f1f7f4', '#eef4f7', '#f6f5ec', '#f7f3f1'];
const TONE = { body: { fill: palette.ink, fontSize: 13 }, muted: { fill: palette.muted, fontSize: 12 }, strong: { fill: palette.ink, fontSize: 15 } };

export type IconInfo = { viewBox?: string; svg?: string };
type Box = { x: number; y: number; width: number; height: number };

/** Mirrors the genomic_track primitive's own vertical layout. */
function trackHeight(b: Extract<LeafBlock, { type: 'track' }>, width: number) {
    const labelled = b.segmentLabels && b.segments.some(s => s.label);
    const caption = b.caption ? layoutText(b.caption, 12, width).height + 6 : 0;
    return headroomOf(b) + (b.title ? 24 : 0) + b.barHeight + (labelled ? 26 : 8) + caption + (b.brackets.length ? 34 : 0);
}
const headroomOf = (b: Extract<LeafBlock, { type: 'track' }>) => b.marks.length ? (b.marks.some(m => m.label) ? 30 : 10) : 0;

/** Natural height of one block at a given content width, before anything is emitted. */
function blockHeight(b: Block, width: number, resolveIcon: (id: string) => IconInfo): number {
    if (b.type === 'spacer') return b.height;
    if (b.type === 'note') return layoutText(b.text, TONE[b.tone].fontSize, width).height;
    if (b.type === 'chips') {
        const rows = Math.ceil(b.items.length / b.columns);
        return rows * 24;
    }
    if (b.type === 'icon') {
        const caption = b.caption ? layoutText(b.caption, 12, width).height + 6 : 0;
        return b.height + caption;
    }
    if (b.type === 'track') return trackHeight(b, width);
    const inner = width - 32;
    return 16 + (b.title ? 26 : 0) + b.blocks.reduce((sum, child, index) => sum + blockHeight(child, inner, resolveIcon) + (index ? BLOCK_GAP : 0), 0) + 18;
}

/**
 * Lays out a whole figure. Returns add-operations plus the artboard size the figure needs.
 * `nextId` must produce document-unique ids; `resolveIcon` supplies asset aspect ratios.
 */
export function composeFigureLayout(raw: unknown, nextId: () => string, resolveIcon: (id: string) => IconInfo) {
    const spec = composeSpecSchema.parse(raw);
    const ops: Operation[] = [];
    const emit = (result: { operations: Operation[] }) => ops.push(...result.operations);
    const primitive = (input: Record<string, unknown>) => emit(buildPrimitive(input, nextId));
    const textNode = (text: string, x: number, y: number, fontSize: number, fill: string, maxWidth: number, name: string) => {
        const wrapped = layoutText(text, fontSize, maxWidth);
        ops.push({ type: 'add', node: nodeSchema.parse({ id: nextId(), type: 'text', name, text: wrapped.text,
            width: Math.max(8, wrapped.width), height: wrapped.height, transform: [1, 0, 0, 1, x, y],
            style: { fill, fontSize, stroke: 'none', strokeWidth: 0 } }) });
        return wrapped.height;
    };

    const panelWidth = spec.panelWidth, content = panelWidth - PANEL_PAD * 2;
    const width = PAD * 2 + spec.panels.length * panelWidth + (spec.panels.length - 1) * GAP;
    const panelX = (index: number) => PAD + index * (panelWidth + GAP);

    // Title block
    let cursor = PAD - 6;
    cursor += textNode(spec.title, PAD, cursor, 27, palette.ink, width - PAD * 2, 'Figure title') + 10;
    if (spec.subtitle) cursor += textNode(spec.subtitle, PAD, cursor, 15, palette.muted, width - PAD * 2, 'Figure subtitle') + 8;
    const panelTop = cursor + 18;

    // Panels are all given the tallest panel's height so the row reads as one band.
    const bodyTop = panelTop + HEADER;
    const heights = spec.panels.map(p => p.blocks.reduce((sum, b, i) => sum + blockHeight(b, content, resolveIcon) + (i ? BLOCK_GAP : 0), 0));
    const panelHeight = Math.max(...heights) + HEADER + PANEL_PAD;

    /** First track's bar centre, so inter-panel arrows line up with the DNA rather than floating. */
    let connectorY = bodyTop + 40;
    const firstTrack = spec.panels[0].blocks.findIndex(b => b.type === 'track');
    if (firstTrack >= 0) {
        const before = spec.panels[0].blocks.slice(0, firstTrack).reduce((sum, b, i) => sum + blockHeight(b, content, resolveIcon) + (i || firstTrack ? BLOCK_GAP : 0), 0);
        const track = spec.panels[0].blocks[firstTrack] as Extract<LeafBlock, { type: 'track' }>;
        connectorY = bodyTop + before + headroomOf(track) + (track.title ? 24 : 0) + track.barHeight / 2;
    }

    spec.panels.forEach((panel, index) => {
        const x = panelX(index);
        primitive({ kind: 'panel', x, y: panelTop, width: panelWidth, height: panelHeight,
            letter: panel.letter, title: panel.title, tint: panel.tint ?? TINTS[index % TINTS.length] });
        let y = bodyTop, previousSource: Box | null = null;
        for (const [position, b] of panel.blocks.entries()) {
            if (position) y += BLOCK_GAP;
            const source = sourceOf(b, x + PANEL_PAD, y, content);
            y += place(b, x + PANEL_PAD, y, content, previousSource);
            previousSource = source;
        }
    });

    /** A track's bar rectangle, which an inset placed below it can point at. */
    function sourceOf(b: Block, x: number, y: number, available: number): Box | null {
        if (b.type !== 'track') return null;
        const top = y + headroomOf(b) + (b.title ? 24 : 0);
        return { x, y: top - 4, width: available, height: b.barHeight + 8 };
    }

    function place(b: Block, x: number, y: number, available: number, previousSource: Box | null): number {
        const height = blockHeight(b, available, resolveIcon);
        if (b.type === 'spacer') return height;
        if (b.type === 'note') { textNode(b.text, x, y, TONE[b.tone].fontSize, TONE[b.tone].fill, available, 'Note'); return height; }
        if (b.type === 'chips') {
            const rows = Math.ceil(b.items.length / b.columns), columnWidth = available / b.columns;
            b.items.forEach((item, i) => {
                const column = Math.floor(i / rows), row = i % rows;
                const cx = x + column * columnWidth, cy = y + row * 24;
                const label = layoutText(item.label, 12, columnWidth - 22);
                ops.push({ type: 'add', node: nodeSchema.parse({ id: nextId(), type: 'shape', shape: 'roundrect', name: `${item.label} chip`,
                    width: Math.min(columnWidth - 4, measureText(item.label, 12) + 20), height: 20, transform: [1, 0, 0, 1, cx, cy],
                    style: { fill: item.color, stroke: 'none', strokeWidth: 0, opacity: 0.22 } }) });
                ops.push({ type: 'add', node: nodeSchema.parse({ id: nextId(), type: 'text', name: `${item.label} chip label`, text: label.text,
                    width: Math.max(8, label.width), height: label.height, transform: [1, 0, 0, 1, cx + 10, cy + 3.5],
                    style: { fill: palette.ink, fontSize: 12, stroke: 'none', strokeWidth: 0 } }) });
            });
            return height;
        }
        if (b.type === 'icon') {
            const box = resolveIcon(b.iconId).viewBox?.split(/[\s,]+/).map(Number);
            const ratio = box && box.length === 4 && box[2] > 0 && box[3] > 0 ? box[2] / box[3] : 1;
            const iconWidth = Math.min(available, b.height * ratio), iconHeight = iconWidth / ratio;
            const ix = b.align === 'center' ? x + (available - iconWidth) / 2 : x;
            const hue = b.hue ?? spec.iconHue;
            const asset = hue ? resolveIcon(b.iconId).svg : undefined;
            const colorMap = hue && asset ? harmonizeColorMap(asset, hue, { saturation: spec.iconSaturation }) : undefined;
            ops.push({ type: 'add', node: nodeSchema.parse({ id: nextId(), type: 'icon', name: 'Illustration', iconId: b.iconId,
                width: iconWidth, height: iconHeight, transform: [1, 0, 0, 1, ix, y],
                ...(colorMap && Object.keys(colorMap).length ? { colorMap } : {}) }) });
            if (b.caption) {
                const caption = layoutText(b.caption, 12, available);
                ops.push({ type: 'add', node: nodeSchema.parse({ id: nextId(), type: 'text', name: 'Illustration caption', text: caption.text,
                    width: Math.max(8, caption.width), height: caption.height,
                    transform: [1, 0, 0, 1, b.align === 'center' ? x + (available - caption.width) / 2 : x, y + iconHeight + 6],
                    style: { fill: palette.muted, fontSize: 12, stroke: 'none', strokeWidth: 0 } }) });
            }
            return height;
        }
        if (b.type === 'track') {
            const total = b.segments.reduce((sum, s) => sum + s.span, 0);
            const edge = (index: number) => b.segments.slice(0, index).reduce((sum, s) => sum + s.span, 0) / total;
            primitive({ kind: 'genomic_track', x, y, width: available, barHeight: b.barHeight,
                title: b.title, segments: b.segments, segmentLabels: b.segmentLabels, caption: b.caption,
                marks: b.marks.map(m => ({ at: m.at ?? edge(m.afterSegment! + 1), label: m.label, kind: m.kind, color: m.color })) });
            for (const bracket of b.brackets) {
                const from = edge(Math.min(bracket.fromSegment, bracket.toSegment));
                const to = edge(Math.max(bracket.fromSegment, bracket.toSegment) + 1);
                primitive({ kind: 'bracket', x: x + from * available, y: y + height - 30,
                    width: Math.max(12, (to - from) * available), label: bracket.label, side: 'below', depth: 10,
                    color: bracket.color ?? b.segments[bracket.fromSegment]?.fill ?? palette.muted });
            }
            return height;
        }
        // Inset: frame sized to its own content, with guides back to the block above.
        const inner = available - 32;
        primitive({ kind: 'callout', x, y, width: available, height, showSource: b.linkToPrevious && previousSource !== null,
            title: b.title, source: previousSource ?? { x, y: y - 44, width: available, height: 36 } });
        let inside = y + 16 + (b.title ? 26 : 0), nested: Box | null = null;
        for (const [position, child] of b.blocks.entries()) {
            if (position) inside += BLOCK_GAP;
            const source = sourceOf(child, x + 16, inside, inner);
            inside += place(child, x + 16, inside, inner, nested);
            nested = source;
        }
        return height;
    }

    for (const connector of spec.connectors) {
        if (connector.afterPanel >= spec.panels.length - 1) continue;
        primitive({ kind: 'connector', relation: connector.relation, label: connector.label,
            from: { x: panelX(connector.afterPanel) + panelWidth + 8, y: connectorY },
            to: { x: panelX(connector.afterPanel + 1) - 8, y: connectorY } });
    }

    cursor = panelTop + panelHeight + 34;
    if (spec.legend.length) {
        const columns = Math.min(4, spec.legend.length);
        primitive({ kind: 'legend', x: PAD, y: cursor, columns, items: spec.legend });
        cursor += Math.ceil(spec.legend.length / columns) * 22 + 22;
    }
    for (const footnote of spec.footnotes) cursor += textNode(footnote, PAD, cursor, 11.5, '#8a968b', width - PAD * 2, 'Footnote') + 8;
    for (const extra of spec.extras) primitive(extra as Record<string, unknown>);

    return { operations: ops, width: Math.round(width), height: Math.round(cursor + PAD - 8) };
}
