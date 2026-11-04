import { z } from 'zod';
import { idSchema, nodeSchema, styleSchema } from './model.ts';
import type { Operation } from './model.ts';
export const planSchema = z.object({ version: z.literal(1), title: z.string().min(1).max(300), panels: z.array(z.object({ id: idSchema, title: z.string().max(200) }).strict()).min(1).max(20), entities: z.array(z.object({ id: idSchema, panelId: idSchema, label: z.string().max(300), iconId: z.string().max(150), count: z.number().int().min(1).max(8).default(1) }).strict()).min(1).max(100), relationships: z.array(z.object({ from: idSchema, to: idSchema, label: z.string().max(200).default('') }).strict()).max(200).default([]), labels: z.array(z.object({ panelId: idSchema, text: z.string().max(500) }).strict()).max(100).default([]), layout: z.object({ direction: z.enum(['vertical', 'horizontal']).default('vertical'), gap: z.number().min(160).max(500).default(220), padding: z.number().min(40).max(200).default(70) }).strict().default(() => ({ direction: 'vertical' as const, gap: 220, padding: 70 })), style: styleSchema.partial().default({}), caption: z.string().max(2000).optional() }).strict();
export type FigurePlan = z.infer<typeof planSchema>;
export function layoutPlan(raw: unknown, resolveIcon: (id: string) => unknown) {
    const p = planSchema.parse(raw);
    const panelIds = new Set(p.panels.map(x => x.id)), ids = new Set<string>();
    for (const panel of p.panels) {
        if (ids.has(panel.id))
            throw new Error('Duplicate plan ID');
        ids.add(panel.id);
    }
    const entityIds = new Set<string>();
    for (const e of p.entities) {
        if (!panelIds.has(e.panelId) || ids.has(e.id))
            throw new Error('Invalid panel reference or duplicate entity ID');
        ids.add(e.id);
        entityIds.add(e.id);
        resolveIcon(e.iconId);
    }
    for (const r of p.relationships)
        if (!entityIds.has(r.from) || !entityIds.has(r.to) || r.from === r.to)
            throw new Error('Invalid relationship reference');
    for (const l of p.labels)
        if (!panelIds.has(l.panelId))
            throw new Error('Invalid label panel');
    // Stable topological ordering within each panel; cycles are rejected instead of silently mislaid out.
    const incoming = new Map(p.entities.map(e => [e.id, 0]));
    for (const r of p.relationships)
        incoming.set(r.to, incoming.get(r.to)! + 1);
    const queue = p.entities.filter(e => !incoming.get(e.id)), ordered: typeof p.entities = [];
    while (queue.length) {
        const e = queue.shift()!;
        ordered.push(e);
        for (const r of p.relationships.filter(r => r.from === e.id)) {
            incoming.set(r.to, incoming.get(r.to)! - 1);
            if (!incoming.get(r.to))
                queue.push(p.entities.find(e => e.id === r.to)!);
        }
    }
    if (ordered.length !== p.entities.length)
        throw new Error('Cyclic relationship graph is not supported by this layout');
    const ops: Operation[] = [];
    let serial = 0;
    const used = new Set(ids);
    const fresh = () => { let id: string; do {
        id = `layout-${serial++}`;
    } while (used.has(id)); used.add(id); return id; };
    const add = (input: Record<string, unknown>) => { const n = nodeSchema.parse({ id: fresh(), name: 'Object', ...input }); ops.push({ type: 'add', node: n }); return n.id; };
    const positions = new Map<string, {
        x: number;
        y: number;
    }>();
    const vertical = p.layout.direction === 'vertical', panelWidth = vertical ? 420 : Math.max(650, ordered.length * p.layout.gap + 100);
    const maximum = Math.max(...p.panels.map(panel => ordered.filter(e => e.panelId === panel.id).length));
    const width = Math.max(800, p.layout.padding * 2 + p.panels.length * panelWidth), height = Math.max(700, p.layout.padding * 2 + (vertical ? maximum * p.layout.gap : 320) + 100);
    for (const [pi, panel] of p.panels.entries()) {
        const left = p.layout.padding + pi * panelWidth;
        add({ type: 'text', name: 'Panel heading', text: panel.title, width: panelWidth - 30, height: 35, transform: [1, 0, 0, 1, left, 38], style: { fill: '#718078', fontSize: 15 } });
        for (const [i, e] of ordered.filter(e => e.panelId === panel.id).entries()) {
            const x = left + (vertical ? 135 : i * p.layout.gap), y = 100 + (vertical ? i * p.layout.gap : 70);
            positions.set(e.id, { x, y });
            const groupId = add({ id: e.id, type: 'group', name: e.label, semanticId: e.id });
            for (let k = 0; k < e.count; k++) {
                const size = e.count === 1 ? 95 : 39;
                const ox = e.count === 1 ? 0 : (k % 4) * 42 - 35, oy = e.count === 1 ? 0 : Math.floor(k / 4) * 44 + 7;
                add({ type: 'icon', name: e.label, iconId: e.iconId, parentId: groupId, width: size, height: size, transform: [1, 0, 0, 1, x + ox, y + oy], style: { ...p.style, fill: p.style.fill ?? '#427e70' } });
            }
            add({ type: 'text', name: e.label, text: e.label, parentId: groupId, width: 300, height: 60, transform: [1, 0, 0, 1, x - 100, y + 105], style: { fill: '#273d36', fontSize: 19 } });
        }
    }
    for (const r of p.relationships) {
        const a = positions.get(r.from)!, b = positions.get(r.to)!, start = { x: a.x + 47, y: a.y + 155 }, end = { x: b.x + 47, y: b.y - 12 };
        if (!vertical) {
            start.x = a.x + 145;
            start.y = a.y + 45;
            end.x = b.x - 12;
            end.y = b.y + 45;
        }
        const dx = end.x - start.x, dy = end.y - start.y, len = Math.hypot(dx, dy);
        const arrowId=add({ type: 'arrow', relationship:{sourceId:r.from,targetId:r.to,labelIds:[]}, name: r.label || 'Relationship', width: Math.max(5, len), height: 20, transform: [dx / len, dy / len, -dy / len, dx / len, start.x + 10 * dy / len, start.y - 10 * dx / len], style: { stroke: '#8b9f96', strokeWidth: 2 } });
        if (r.label){
            const labelId=add({ type: 'text', name: r.label, text: r.label, width: 240, height: 30, transform: [1, 0, 0, 1, (start.x + end.x) / 2 + 18, (start.y + end.y) / 2 - 14], style: { fill: '#5a7065', fontSize: 16 } });
            const arrow=ops.find(op=>op.type==='add'&&op.node.id===arrowId);if(arrow?.type==='add')arrow.node.relationship!.labelIds=[labelId];
        }
    }
    p.labels.forEach((l, i) => add({ type: 'text', name: 'Annotation', text: l.text, width: 360, height: 50, transform: [1, 0, 0, 1, p.layout.padding + p.panels.findIndex(x => x.id === l.panelId) * panelWidth, height - 80 - i * 30], style: { fill: '#74867b', fontSize: 14 } }));
    return { plan: p, operations: ops, width, height };
}
export const demoPlan = { version: 1, title: 'Naive pluripotency to an 8-cell-like state', panels: [{ id: 'pathway', title: 'CELL STATE TRANSITION' }], entities: [{ id: 'naive', panelId: 'pathway', label: 'Human naive pluripotent\nstem cells', iconId: 'mammalian-cell', count: 1 }, { id: 'eight-cell', panelId: 'pathway', label: '8-cell-like cells', iconId: 'mammalian-cell', count: 8 }, { id: 'tprx1', panelId: 'pathway', label: 'TPRX1 expression', iconId: 'protein', count: 1 }], relationships: [{ from: 'naive', to: 'eight-cell', label: 'PRBJN treatment' }, { from: 'eight-cell', to: 'tprx1', label: '' }], labels: [{ panelId: 'pathway', text: 'Schematic cell-state model; not an embryo.' }], layout: { direction: 'vertical', gap: 220, padding: 70 }, style: { fill: '#4e8d79' }, caption: 'User-specified illustrative pathway. PRBJN composition, timing, and mechanistic claims are not inferred. Eight cells are symbolic, not a claim of embryo identity.' };
