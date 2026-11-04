import { z } from 'zod';
export const idSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/);
export const color = z.string().regex(/^(#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|none)$/);
const finite = z.number().finite().min(-100000).max(100000);
export const matrixSchema = z.tuple([finite, finite, finite, finite, finite, finite]).refine(m => Math.abs(m[0] * m[3] - m[1] * m[2]) > 1e-8, 'Transform must be invertible');
export type Matrix = z.infer<typeof matrixSchema>;
export const identity = (): Matrix => [1, 0, 0, 1, 0, 0];
export const styleSchema = z.object({ fill: color.default('#d7e9e4'), stroke: color.default('#35695e'), strokeWidth: z.number().min(0).max(30).default(2), opacity: z.number().min(0).max(1).default(1), fontSize: z.number().min(6).max(200).default(20) }).strict();
export const colorMapSchema = z.record(z.string().max(100), color).refine(m => Object.keys(m).length <= 100, 'Too many colors');
export const svgElementKeySchema = z.string().max(300).regex(/^\d+(?:\/\d+)*$/);
export const svgElementStyleSchema = z.object({fill:color.optional(),stroke:color.optional(),strokeWidth:z.number().finite().min(0).max(1000).optional(),opacity:z.number().finite().min(0).max(1).optional()}).strict();
export const svgElementStylesSchema = z.record(svgElementKeySchema,svgElementStyleSchema).refine(m=>Object.keys(m).length<=1000,'Too many SVG element overrides');
export const relationshipSchema=z.object({sourceId:idSchema,targetId:idSchema,labelIds:z.array(idSchema).max(20).optional()}).strict();
export const nodeSchema = z.object({ id: idSchema, type: z.enum(['icon', 'shape', 'text', 'arrow', 'group']), name: z.string().max(300), parentId: idSchema.nullable().default(null), children: z.array(idSchema).max(5000).default([]), transform: matrixSchema.default(identity), width: z.number().positive().max(10000).default(100), height: z.number().positive().max(10000).default(100), visible: z.boolean().default(true), locked: z.boolean().default(false), style: styleSchema.default(() => styleSchema.parse({})), iconId: z.string().max(150).optional(), text: z.string().max(10000).optional(), shape: z.enum(['rect', 'ellipse', 'roundrect']).optional(), elementStyles:svgElementStylesSchema.optional(), colorMap: colorMapSchema.optional(), semanticId: z.string().max(200).optional(), relationship:relationshipSchema.optional(), layoutRole:z.enum(['content','decoration']).optional() }).strict();
export type FigureNode = z.infer<typeof nodeSchema>;
export const documentSchema = z.object({ schemaVersion: z.literal(1), id: idSchema, title: z.string().min(1).max(300), revision: z.number().int().nonnegative(), width: z.number().min(100).max(10000), height: z.number().min(100).max(10000), background: color, roots: z.array(idSchema).max(10000), nodes: z.record(idSchema, nodeSchema), updatedAt: z.string() }).strict();
export type FigureDocument = z.infer<typeof documentSchema>;
export const stylePatchSchema = z.object({ fill: color.optional(), stroke: color.optional(), strokeWidth: z.number().min(0).max(30).optional(), opacity: z.number().min(0).max(1).optional(), fontSize: z.number().min(6).max(200).optional() }).strict();
export const patchSchema = z.object({ name: z.string().max(300).optional(), transform: matrixSchema.optional(), width: z.number().positive().max(10000).optional(), height: z.number().positive().max(10000).optional(), visible: z.boolean().optional(), locked: z.boolean().optional(), style: stylePatchSchema.optional(), iconId: z.string().max(150).optional(), text: z.string().max(10000).optional(), shape: z.enum(['rect', 'ellipse', 'roundrect']).optional(), elementStyles:svgElementStylesSchema.optional(), colorMap: colorMapSchema.optional(), semanticId: z.string().max(200).optional(), relationship:relationshipSchema.optional(), layoutRole:z.enum(['content','decoration']).optional() }).strict();
export const operationSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('add'), node: nodeSchema }).strict(),
    z.object({ type: z.literal('update'), id: idSchema, patch: patchSchema }).strict(),
    z.object({ type: z.literal('delete'), id: idSchema }).strict(),
    z.object({ type: z.literal('group'), ids: z.array(idSchema).min(2).max(500), id: idSchema, name: z.string().max(300).default('Group') }).strict(),
    z.object({ type: z.literal('ungroup'), id: idSchema }).strict(),
    z.object({ type: z.literal('reorder'), id: idSchema, index: z.number().int().nonnegative() }).strict()
]);
export type Operation = z.infer<typeof operationSchema>;
export function multiply(a: Matrix, b: Matrix): Matrix { return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]]; }
export function inverse(m: Matrix): Matrix { const d = m[0] * m[3] - m[1] * m[2]; if (Math.abs(d) < 1e-8)
    throw new Error('Singular matrix'); return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d]; }
export function point(m: Matrix, x: number, y: number) { return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] }; }
export function world(d: FigureDocument, id: string): Matrix { const n = d.nodes[id]; if (!n)
    throw new Error(`Unknown object: ${id}`); return n.parentId ? multiply(world(d, n.parentId), n.transform) : n.transform; }
export function bounds(d: FigureDocument, id: string): {
    x: number;
    y: number;
    width: number;
    height: number;
} { const n = d.nodes[id]; if (!n)
    throw new Error(`Unknown object: ${id}`); if (n.type === 'group' && n.children.length) {
    const bs = n.children.map(c => bounds(d, c));
    const x = Math.min(...bs.map(b => b.x)), y = Math.min(...bs.map(b => b.y));
    return { x, y, width: Math.max(...bs.map(b => b.x + b.width)) - x, height: Math.max(...bs.map(b => b.y + b.height)) - y };
} const m = world(d, id), ps = [[0, 0], [n.width, 0], [0, n.height], [n.width, n.height]].map(([x, y]) => point(m, x, y)); const x = Math.min(...ps.map(p => p.x)), y = Math.min(...ps.map(p => p.y)); return { x, y, width: Math.max(...ps.map(p => p.x)) - x, height: Math.max(...ps.map(p => p.y)) - y }; }
export function isLocked(d: FigureDocument, id: string): boolean { const n = d.nodes[id]; return !!n && (n.locked || !!n.parentId && isLocked(d, n.parentId)); }
export function validateDocument(input: unknown): FigureDocument { const d = documentSchema.parse(input), seen = new Set<string>(); function visit(id: string, parent: string | null, depth: number) { if (depth > 100)
    throw new Error('Maximum group nesting exceeded'); const n = d.nodes[id]; if (!n || n.id !== id || n.parentId !== parent || seen.has(id))
    throw new Error('Invalid scene hierarchy'); seen.add(id); if (n.type !== 'group' && n.children.length)
    throw new Error('Only groups can contain children'); for (const c of n.children)
    visit(c, id, depth + 1); } for (const id of d.roots)
    visit(id, null, 0); if (seen.size !== Object.keys(d.nodes).length)
    throw new Error('Orphaned scene nodes'); return d; }
export function createDocument(id: string, title: string, width = 1100, height = 800): FigureDocument { return validateDocument({ schemaVersion: 1, id, title, revision: 0, width, height, background: '#ffffff', roots: [], nodes: {}, updatedAt: new Date().toISOString() }); }
export function applyCommands(input: FigureDocument, raw: unknown): FigureDocument {
    const ops = z.array(operationSchema).max(5000).parse(raw), d = structuredClone(input);
    const requireNode = (id: string) => { const n = d.nodes[id]; if (!n)
        throw new Error(`Unknown object: ${id}`); return n; };
    const siblings = (n: FigureNode) => n.parentId ? requireNode(n.parentId).children : d.roots;
    const editable = (id: string) => { requireNode(id); if (isLocked(d, id))
        throw new Error(`Object is locked: ${id}`); };
    for (const op of ops) {
        if (op.type === 'add') {
            const n = structuredClone(op.node);
            if (d.nodes[n.id])
                throw new Error(`Duplicate object: ${n.id}`);
            if (n.children.length)
                throw new Error('Add children separately');
            if (n.parentId) {
                editable(n.parentId);
                if (requireNode(n.parentId).type !== 'group')
                    throw new Error('Parent must be a group');
            }
            d.nodes[n.id] = n;
            siblings(n).push(n.id);
        }
        else if (op.type === 'update') {
            const n = requireNode(op.id);
            if (isLocked(d, op.id) && !(Object.keys(op.patch).length === 1 && op.patch.locked === false && (!n.parentId || !isLocked(d, n.parentId))))
                throw new Error('Unlock object before editing');
            d.nodes[op.id] = nodeSchema.parse({ ...n, ...(op.patch.iconId && op.patch.iconId !== n.iconId ? {elementStyles:undefined} : {}), ...op.patch, style: { ...n.style, ...op.patch.style } });
        }
        else if (op.type === 'delete') {
            editable(op.id);
            const n = requireNode(op.id);
            const remove = (id: string) => { for (const c of requireNode(id).children)
                remove(c); delete d.nodes[id]; };
            const a = siblings(n);
            a.splice(a.indexOf(n.id), 1);
            remove(n.id);
        }
        else if (op.type === 'group') {
            const ids = [...new Set(op.ids)];
            if (ids.length < 2 || d.nodes[op.id])
                throw new Error('Group needs distinct objects and a fresh ID');
            ids.forEach(editable);
            const ns = ids.map(requireNode), parentId = ns[0].parentId;
            if (ns.some(n => n.parentId !== parentId))
                throw new Error('Group objects must share a parent');
            const a = siblings(ns[0]), ordered = a.filter(id => ids.includes(id)), at = Math.min(...ids.map(id => a.indexOf(id)));
            const g = nodeSchema.parse({ id: op.id, type: 'group', name: op.name, parentId, children: ordered });
            for (const n of ns)
                n.parentId = g.id;
            for (let i = a.length - 1; i >= 0; i--)
                if (ids.includes(a[i]))
                    a.splice(i, 1);
            a.splice(at, 0, g.id);
            d.nodes[g.id] = g;
        }
        else if (op.type === 'ungroup') {
            editable(op.id);
            const g = requireNode(op.id);
            if (g.type !== 'group')
                throw new Error('Object is not a group');
            const a = siblings(g), at = a.indexOf(g.id);
            for (const id of g.children) {
                const n = requireNode(id);
                n.transform = multiply(g.transform, n.transform);
                n.parentId = g.parentId;
            }
            a.splice(at, 1, ...g.children);
            delete d.nodes[g.id];
        }
        else {
            editable(op.id);
            const n = requireNode(op.id), a = siblings(n);
            a.splice(a.indexOf(n.id), 1);
            a.splice(Math.min(op.index, a.length), 0, n.id);
        }
    }
    d.revision = input.revision + 1;
    d.updatedAt = new Date().toISOString();
    return validateDocument(d);
}
