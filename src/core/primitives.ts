// Parametric scientific primitives: panel cards, genomic tracks, callout insets, typed connectors,
// span brackets and legends. Each one compiles to ordinary grouped shape/text/arrow nodes, so the
// result stays fully editable (move, recolor, ungroup, undo) instead of being a flattened picture.
import { z } from 'zod';
import { nodeSchema } from './model.ts';
import type { Operation } from './model.ts';
import { measureText, layoutText } from './text-metrics.ts';

export const paint = z.string().regex(/^(#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})|none)$/);
const coordinate = z.number().finite().min(-10000).max(10000);
const size = z.number().finite().min(1).max(10000);

/** Shared figure palette. Hue encodes identity, not decoration. */
export const palette = {
    ink: '#1f2d27', muted: '#5d6b63', hairline: '#c9d4cd', paper: '#ffffff',
    dna: '#b9c6d8', insert: '#3f9d7a', insertSoft: '#cdeadd', donor: '#8c7fbe', donorSoft: '#e2dcf4',
    enzyme: '#e4866a', enzymeSoft: '#f7d9cf', cell: '#9fb6ad', accent: '#2f6f5e', warn: '#c1683f',
    tint: ['#f2f6f3', '#f3f1f8', '#f8f3ef', '#eef4f7', '#f6f5ec'],
} as const;

const textWidth = (text: string, fontSize: number) => Math.max(8, measureText(text, fontSize));

const segmentSchema = z.object({
    label: z.string().max(120).default(''),
    span: z.number().finite().min(0.01).max(100).default(1),
    fill: paint.default(palette.dna),
    /** Drawn as an outline-only segment, for regions that are absent in this state. */
    ghost: z.boolean().default(false),
}).strict();

const markSchema = z.object({
    /** Fraction along the track, 0 = left edge, 1 = right edge. */
    at: z.number().finite().min(0).max(1),
    label: z.string().max(120).default(''),
    kind: z.enum(['cut', 'site', 'tick']).default('tick'),
    color: paint.default(palette.warn),
}).strict();

const base = { x: coordinate, y: coordinate };

export const primitiveSchema = z.discriminatedUnion('kind', [
    z.object({
        kind: z.literal('panel'), ...base, width: size, height: size,
        letter: z.string().max(3).default(''), title: z.string().max(200).default(''),
        tint: paint.optional(), name: z.string().max(200).optional(),
    }).strict(),
    z.object({
        kind: z.literal('genomic_track'), ...base, width: size,
        /** Height of the DNA bar itself; labels and marks are laid out around it. */
        barHeight: z.number().finite().min(6).max(200).default(26),
        title: z.string().max(200).default(''),
        segments: z.array(segmentSchema).min(1).max(24),
        marks: z.array(markSchema).max(24).default([]),
        caption: z.string().max(300).default(''),
        /** Label every segment underneath the bar. */
        segmentLabels: z.boolean().default(true),
        name: z.string().max(200).optional(),
    }).strict(),
    z.object({
        kind: z.literal('callout'), ...base, width: size, height: size,
        /** Region of the figure this inset magnifies; connector lines are drawn from it. */
        source: z.object({ x: coordinate, y: coordinate, width: size, height: size }).strict(),
        title: z.string().max(200).default(''),
        tint: paint.default(palette.paper),
        /** Draw the magnified-region frame and guide lines. Off when the inset has no meaningful source. */
        showSource: z.boolean().default(true),
        name: z.string().max(200).optional(),
    }).strict(),
    z.object({
        kind: z.literal('connector'), from: z.object(base).strict(), to: z.object(base).strict(),
        relation: z.enum(['activates', 'inhibits', 'converts', 'translocates', 'produces']).default('converts'),
        label: z.string().max(200).default(''),
        color: paint.optional(), name: z.string().max(200).optional(),
    }).strict(),
    z.object({
        kind: z.literal('bracket'), ...base, width: size,
        label: z.string().max(200).default(''),
        /** 'below' puts the tips and label under the span, 'above' over it. */
        side: z.enum(['above', 'below']).default('below'),
        depth: z.number().finite().min(4).max(80).default(10),
        color: paint.default(palette.muted), name: z.string().max(200).optional(),
    }).strict(),
    z.object({
        kind: z.literal('legend'), ...base,
        items: z.array(z.object({ label: z.string().max(120), color: paint }).strict()).min(1).max(12),
        columns: z.number().int().min(1).max(4).default(1),
        name: z.string().max(200).optional(),
    }).strict(),
]);
export type Primitive = z.infer<typeof primitiveSchema>;

export type PrimitiveResult = { operations: Operation[]; groupId: string; width: number; height: number; name: string };

/**
 * Compiles one primitive into add-operations. `nextId` must return fresh document-unique ids.
 * Child coordinates are absolute, matching the figure planner; the wrapper group keeps identity transform.
 */
export function buildPrimitive(raw: unknown, nextId: () => string, parentId: string | null = null): PrimitiveResult {
    const p = primitiveSchema.parse(raw);
    const ops: Operation[] = [];
    const groupId = nextId();
    const add = (input: Record<string, unknown>) => {
        const node = nodeSchema.parse({ id: nextId(), name: 'Object', parentId: groupId, ...input });
        ops.push({ type: 'add', node });
        return node.id;
    };
    const rect = (x: number, y: number, width: number, height: number, style: Record<string, unknown>, name: string, shape: 'rect' | 'roundrect' | 'ellipse' = 'rect') =>
        add({ type: 'shape', shape, name, width: Math.max(1, width), height: Math.max(1, height), transform: [1, 0, 0, 1, x, y], style });
    const label = (x: number, y: number, text: string, fontSize: number, fill: string, name = text || 'Label', align: 'left' | 'center' = 'left') =>
        add({ type: 'text', name, text, width: Math.max(8, textWidth(text, fontSize)), height: fontSize * 1.45,
            transform: [1, 0, 0, 1, align === 'center' ? x - textWidth(text, fontSize) / 2 : x, y], style: { fill, fontSize, stroke: 'none', strokeWidth: 0 } });

    let width = 0, height = 0, name = p.name ?? '';

    if (p.kind === 'panel') {
        name ||= p.title ? `Panel ${p.letter} — ${p.title}`.trim() : 'Panel';
        width = p.width; height = p.height;
        rect(p.x, p.y, p.width, p.height, { fill: p.tint ?? palette.tint[0], stroke: palette.hairline, strokeWidth: 1 }, 'Panel background', 'roundrect');
        if (p.letter) label(p.x + 18, p.y + 14, p.letter, 20, palette.ink, 'Panel letter');
        if (p.title) label(p.x + (p.letter ? 46 : 18), p.y + 16, p.title, 17, palette.ink, 'Panel title');
    }
    else if (p.kind === 'genomic_track') {
        name ||= p.title || 'Genomic track';
        const total = p.segments.reduce((sum, s) => sum + s.span, 0);
        // Marks and their labels live above the bar; reserve that band before placing it.
        const headroom = p.marks.length ? (p.marks.some(m => m.label) ? 30 : 10) : 0;
        const top = p.y + (p.title ? 24 : 0) + headroom;
        if (p.title) label(p.x, p.y, p.title, 15, palette.ink, 'Track title');
        let cursor = p.x;
        for (const segment of p.segments) {
            const segmentWidth = (segment.span / total) * p.width;
            rect(cursor, top, segmentWidth, p.barHeight,
                segment.ghost ? { fill: 'none', stroke: palette.hairline, strokeWidth: 1.5 } : { fill: segment.fill, stroke: 'none', strokeWidth: 0 },
                segment.label || 'Segment');
            if (p.segmentLabels && segment.label)
                label(cursor + segmentWidth / 2, top + p.barHeight + 7, segment.label, 12, palette.muted, `${segment.label} label`, 'center');
            cursor += segmentWidth;
        }
        // Marks sit above the bar so they never collide with segment labels.
        for (const mark of p.marks) {
            const mx = p.x + mark.at * p.width;
            if (mark.kind === 'cut') {
                // Double-strand break: a full-height break line with a staggered nick above it.
                rect(mx - 1.5, top - 6, 3, p.barHeight + 12, { fill: mark.color, stroke: 'none', strokeWidth: 0 }, mark.label || 'Cut site');
                rect(mx - 9, top - 10, 18, 3, { fill: mark.color, stroke: 'none', strokeWidth: 0 }, 'Cut site marker');
            }
            else if (mark.kind === 'site')
                rect(mx - 7, top - 4, 14, p.barHeight + 8, { fill: 'none', stroke: mark.color, strokeWidth: 2 }, mark.label || 'Site', 'roundrect');
            else
                rect(mx - 1, top - 8, 2, 8, { fill: mark.color, stroke: 'none', strokeWidth: 0 }, mark.label || 'Tick');
            if (mark.label) label(mx, top - 22, mark.label, 12, mark.color, `${mark.label} label`, 'center');
        }
        const labelled = p.segmentLabels && p.segments.some(s => s.label);
        let bottom = top + p.barHeight + (labelled ? 26 : 8);
        if (p.caption) {
            const wrapped = layoutText(p.caption, 12, p.width);
            add({ type: 'text', name: 'Track caption', text: wrapped.text, width: Math.max(8, wrapped.width), height: wrapped.height,
                transform: [1, 0, 0, 1, p.x, bottom], style: { fill: palette.muted, fontSize: 12, stroke: 'none', strokeWidth: 0 } });
            bottom += wrapped.height + 6;
        }
        width = p.width;
        height = bottom - p.y;
    }
    else if (p.kind === 'callout') {
        name ||= p.title ? `Inset — ${p.title}` : 'Inset';
        width = p.width; height = p.height;
        const s = p.source;
        if (p.showSource)
            rect(s.x, s.y, s.width, s.height, { fill: 'none', stroke: palette.accent, strokeWidth: 1.5 }, 'Magnified region', 'roundrect');
        // Two straight guides from the source corners to the inset, drawn as thin rotated bars.
        // Zoom trapezoid: the source's bottom corners meet the inset's top corners, so the guides
        // run along the outside and never cross the caption between them.
        for (const [sx, sy, tx, ty] of [
            [s.x, s.y + s.height, p.x, p.y],
            [s.x + s.width, s.y + s.height, p.x + p.width, p.y],
        ] as const) {
            if (!p.showSource) break;
            const dx = tx - sx, dy = ty - sy, length = Math.hypot(dx, dy);
            if (length < 2) continue;
            const cos = dx / length, sin = dy / length;
            add({ type: 'shape', shape: 'rect', name: 'Inset guide', parentId: groupId, width: length, height: 1,
                transform: [cos, sin, -sin, cos, sx, sy], style: { fill: palette.hairline, stroke: 'none', strokeWidth: 0, opacity: 0.9 } });
        }
        rect(p.x, p.y, p.width, p.height, { fill: p.tint, stroke: palette.accent, strokeWidth: 1.5 }, 'Inset frame', 'roundrect');
        if (p.title) label(p.x + 14, p.y + 12, p.title, 14, palette.ink, 'Inset title');
    }
    else if (p.kind === 'connector') {
        name ||= p.label || p.relation;
        const dx = p.to.x - p.from.x, dy = p.to.y - p.from.y, length = Math.hypot(dx, dy) || 1;
        const cos = dx / length, sin = dy / length;
        const color = p.color ?? (p.relation === 'inhibits' ? palette.warn : palette.accent);
        const thickness = 2.2;
        // 'inhibits' ends in a crossbar, every other relation in an arrowhead.
        const shaft = p.relation === 'inhibits' ? length - 2 : length;
        if (p.relation === 'inhibits') {
            add({ type: 'shape', shape: 'rect', name: 'Inhibition shaft', parentId: groupId, width: shaft, height: thickness,
                transform: [cos, sin, -sin, cos, p.from.x, p.from.y - thickness / 2], style: { fill: color, stroke: 'none', strokeWidth: 0 } });
            add({ type: 'shape', shape: 'rect', name: 'Inhibition bar', parentId: groupId, width: 3, height: 18,
                transform: [cos, sin, -sin, cos, p.to.x - cos * 3 + sin * 9, p.to.y - sin * 3 - cos * 9], style: { fill: color, stroke: 'none', strokeWidth: 0 } });
        }
        else {
            // Arrow nodes render left-to-right in local space; the transform aims them.
            add({ type: 'arrow', name: `${p.relation} connector`, parentId: groupId, width: length, height: 14,
                transform: [cos, sin, -sin, cos, p.from.x, p.from.y - 7],
                style: { stroke: color, fill: color, strokeWidth: p.relation === 'produces' ? 3 : 2, opacity: p.relation === 'translocates' ? 0.55 : 1 } });
        }
        if (p.label) label((p.from.x + p.to.x) / 2, Math.min(p.from.y, p.to.y) - 24, p.label, 12, palette.muted, 'Relation label', 'center');
        width = Math.abs(dx); height = Math.abs(dy) + 30;
    }
    else if (p.kind === 'bracket') {
        name ||= p.label || 'Bracket';
        const below = p.side === 'below', sign = below ? 1 : -1;
        const spine = p.y + sign * p.depth;
        rect(p.x, spine, p.width, 1.5, { fill: p.color, stroke: 'none', strokeWidth: 0 }, 'Bracket span');
        rect(p.x, Math.min(p.y, spine), 1.5, p.depth, { fill: p.color, stroke: 'none', strokeWidth: 0 }, 'Bracket tip');
        rect(p.x + p.width - 1.5, Math.min(p.y, spine), 1.5, p.depth, { fill: p.color, stroke: 'none', strokeWidth: 0 }, 'Bracket tip');
        if (p.label) label(p.x + p.width / 2, below ? spine + 6 : spine - 20, p.label, 12, p.color, 'Bracket label', 'center');
        width = p.width; height = p.depth + 20;
    }
    else {
        name ||= 'Legend';
        const rows = Math.ceil(p.items.length / p.columns), columnWidth = 190, rowHeight = 22;
        p.items.forEach((item, index) => {
            const column = Math.floor(index / rows), row = index % rows;
            const x = p.x + column * columnWidth, y = p.y + row * rowHeight;
            rect(x, y + 3, 12, 12, { fill: item.color, stroke: 'none', strokeWidth: 0 }, `${item.label} swatch`, 'roundrect');
            label(x + 19, y, item.label, 12, palette.muted, `${item.label} legend`);
        });
        width = p.columns * columnWidth; height = rows * rowHeight;
    }

    ops.unshift({ type: 'add', node: nodeSchema.parse({ id: groupId, type: 'group', name: name || 'Primitive', parentId }) });
    return { operations: ops, groupId, width, height, name: name || 'Primitive' };
}
