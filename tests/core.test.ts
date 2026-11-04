import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyCommands, createDocument, nodeSchema, world, bounds, multiply, validateDocument } from '../src/core/model.ts';
import { Store } from '../src/server/store.ts';
import { Catalog } from '../src/assets/catalog.ts';
import { executeTool } from '../src/server/tools.ts';
import { layoutPlan, demoPlan } from '../src/core/plan.ts';
import { exportSvg } from '../src/core/render.ts';
import { builtinIcons } from '../src/core/icons.ts';
const node = (id: string, x = 0) => nodeSchema.parse({ id, type: 'shape', name: id, transform: [1, 0, 0, 1, x, 30] });
describe('document command engine', () => {
    it('adds stable IDs and rejects duplicate IDs atomically', () => { const original = createDocument('test', 'Test'); const d = applyCommands(original, [{ type: 'add', node: node('a') }]); assert.equal(d.revision, 1); assert.throws(() => applyCommands(d, [{ type: 'add', node: node('b') }, { type: 'add', node: node('a') }])); assert.equal(Object.keys(d.nodes).length, 1); assert.equal(Object.keys(original.nodes).length, 0); });
    it('partial updates preserve unspecified geometry and style', () => { const d = applyCommands(createDocument('test', 'Test'), [{ type: 'add', node: { ...node('a'), width: 230, visible: false, style: { fill: '#123456', stroke: '#abcdef', strokeWidth: 5, fontSize: 28, opacity: .6 } } }]); const next = applyCommands(d, [{ type: 'update', id: 'a', patch: { name: 'Renamed', style: { opacity: .4 } } }]); assert.equal(next.nodes.a.width, 230); assert.equal(next.nodes.a.visible, false); assert.equal(next.nodes.a.style.fill, '#123456'); assert.equal(next.nodes.a.style.opacity, .4); });
    it('preserves transforms across grouping, group transformation, and ungrouping', () => { let d = applyCommands(createDocument('test', 'Test'), [{ type: 'add', node: node('a', 20) }, { type: 'add', node: node('b', 140) }]); const before = world(d, 'a'); d = applyCommands(d, [{ type: 'group', ids: ['b', 'a'], id: 'g', name: 'Group' }]); assert.deepEqual(world(d, 'a'), before); assert.deepEqual(d.nodes.g.children, ['a', 'b']); d = applyCommands(d, [{ type: 'update', id: 'g', patch: { transform: [0, 2, -2, 0, 50, 60] } }]); const transformed = world(d, 'a'); d = applyCommands(d, [{ type: 'ungroup', id: 'g' }]); assert.deepEqual(world(d, 'a'), transformed); assert.deepEqual(d.roots, ['a', 'b']); assert.equal(d.nodes.a.parentId, null); });
    it('deletes a subtree and maintains ordered layers', () => { let d = applyCommands(createDocument('test', 'Test'), [{ type: 'add', node: node('a') }, { type: 'add', node: node('b') }, { type: 'add', node: node('c') }, { type: 'reorder', id: 'a', index: 2 }, { type: 'group', id: 'g', ids: ['b', 'c'], name: 'G' }]); assert.deepEqual(d.roots, ['g', 'a']); d = applyCommands(d, [{ type: 'delete', id: 'g' }]); assert.deepEqual(Object.keys(d.nodes), ['a']); assert.deepEqual(d.roots, ['a']); });
    it('rejects invalid references, singular transforms and hierarchy corruption', () => { const d = createDocument('test', 'Test'); assert.throws(() => applyCommands(d, [{ type: 'delete', id: 'missing' }])); assert.throws(() => nodeSchema.parse({ ...node('a'), transform: [0, 0, 0, 0, 1, 1] })); assert.throws(() => validateDocument({ ...d, roots: ['missing'] })); assert.throws(() => applyCommands(d, [{ type: 'add', node: { ...node('a'), parentId: 'missing' } }])); });
    it('computes world bounds and blocks edits to locked descendants', () => { let d = applyCommands(createDocument('test', 'Test'), [{ type: 'add', node: node('a') }, { type: 'add', node: node('b', 120) }, { type: 'group', id: 'g', ids: ['a', 'b'], name: 'G' }, { type: 'update', id: 'g', patch: { locked: true } }]); assert.equal(bounds(d, 'g').width, 220); assert.throws(() => applyCommands(d, [{ type: 'update', id: 'a', patch: { width: 10 } }])); d = applyCommands(d, [{ type: 'update', id: 'g', patch: { locked: false } }]); assert.doesNotThrow(() => applyCommands(d, [{ type: 'update', id: 'a', patch: { width: 10 } }])); });
});
describe('persistent tool service', () => {
    it('persists edits and history across instances; stale revision cannot overwrite', () => { const directory = mkdtempSync(join(tmpdir(), 'helix-store-')); const s = new Store(directory); const d = s.create('Test', 800, 600, 'test'); s.mutate(d.id, [{ type: 'add', node: node('a') }], 0); const reopened = new Store(directory); assert.equal(reopened.read('test').document.nodes.a.id, 'a'); assert.throws(() => reopened.mutate('test', [{ type: 'delete', id: 'a' }], 0), /Revision conflict/); const undone = reopened.history('test', 'undo', 1); assert.equal(undone.revision, 2); assert.equal(Object.keys(undone.nodes).length, 0); const redone = reopened.history('test', 'redo', 2); assert.equal(redone.revision, 3); assert.ok(redone.nodes.a); });
    it('shares the same commands across MCP-style tools and UI batches', () => { const directory = mkdtempSync(join(tmpdir(), 'helix-tools-')), s = new Store(directory), c = new Catalog(directory); try {
        const d = executeTool('create_document', { title: 'Integration' }, s, c) as any;
        const withIcon = executeTool('add_icon', { documentId: d.id, iconId: 'mammalian-cell' }, s, c) as any;
        const id = withIcon.roots[0];
        executeTool('apply_operations', { documentId: d.id, expectedRevision: 1, operations: [{ type: 'update', id, patch: { transform: [1, 0, 0, 1, 220, 180] } }] }, s, c);
        const exported = executeTool('export_svg', { documentId: d.id }, s, c) as any;
        assert.ok(exported.svg.includes('220 180'));
        assert.throws(() => executeTool('add_icon', { documentId: d.id, iconId: 'does-not-exist' }, s, c));
        assert.throws(() => executeTool('add_text', { documentId: d.id, text: 'a', unexpected: 1 }, s, c));
    }
    finally {
        c.close();
    } });
});
describe('figure planning and vector export', () => {
    it('lays out an entire deterministic editable figure without input coordinates', () => { const a = layoutPlan(demoPlan, id => builtinIcons.find(i => i.id === id)!), b = layoutPlan(demoPlan, id => builtinIcons.find(i => i.id === id)!); assert.deepEqual(a.operations, b.operations); const d = applyCommands(createDocument('demo', 'Demo', a.width, a.height), a.operations); assert.equal(Object.values(d.nodes).filter(n => n.type === 'icon').length, 10); assert.ok(Object.values(d.nodes).some(n => n.text === 'PRBJN treatment')); const svg = exportSvg(d, id => builtinIcons.find(i => i.id === id)!); assert.ok(svg.includes('TPRX1 expression')); assert.ok(!svg.includes('<image')); assert.ok(svg.includes('data-object-id="naive"')); });
    it('rejects cyclic relationships and invalid scientific references', () => { assert.throws(() => layoutPlan({ ...demoPlan, relationships: [{ from: 'naive', to: 'bad' }] }, () => true)); assert.throws(() => layoutPlan({ ...demoPlan, relationships: [{ from: 'naive', to: 'eight-cell' }, { from: 'eight-cell', to: 'naive' }] }, () => true), /Cyclic/); });
    it('escapes text in standalone SVG output', () => { const d = applyCommands(createDocument('escape', '<&'), [{ type: 'add', node: nodeSchema.parse({ id: 'text', type: 'text', name: 'Text', text: '<script>alert(1)</script>' }) }]); const svg = exportSvg(d, () => builtinIcons[0]); assert.ok(svg.includes('&lt;script&gt;')); assert.ok(!svg.includes('<script>')); });
});
