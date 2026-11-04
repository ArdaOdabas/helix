import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildPrimitive } from '../src/core/primitives.ts';
import { createDocument, applyCommands } from '../src/core/model.ts';

const build = (spec: unknown) => buildPrimitive(spec, () => randomUUID());

describe('scientific primitives', () => {
    it('compiles a genomic track into editable grouped nodes with proportional segments', () => {
        const { operations, groupId } = build({ kind: 'genomic_track', x: 100, y: 200, width: 400, title: 'AAVS1 locus',
            segments: [{ label: "5' arm", span: 1, fill: '#8c7fbe' }, { label: 'EGFP', span: 2, fill: '#3f9d7a' }, { label: "3' arm", span: 1, fill: '#8c7fbe' }],
            marks: [{ at: 0.5, label: 'Cas9 cut', kind: 'cut' }] });
        const document = applyCommands(createDocument('d', 'Track', 900, 600), operations);
        const group = document.nodes[groupId];
        assert.equal(group.type, 'group');
        assert.ok(group.children.length >= 8, 'track should expand into individual editable elements');
        const bars = group.children.map(id => document.nodes[id]).filter(n => n.type === 'shape' && n.height === 26);
        assert.equal(bars.length, 3);
        // Spans 1:2:1 over 400 px.
        assert.deepEqual(bars.map(b => b.width), [100, 200, 100]);
        assert.deepEqual(bars.map(b => b.transform[4]), [100, 200, 400]);
        assert.ok(group.children.some(id => document.nodes[id].text === 'Cas9 cut'));
    });

    it('draws an inhibition connector with a crossbar and an activation connector with an arrowhead', () => {
        const inhibit = build({ kind: 'connector', from: { x: 0, y: 0 }, to: { x: 100, y: 0 }, relation: 'inhibits' });
        const nodes = inhibit.operations.map(o => (o as { node: { type: string } }).node);
        assert.ok(!nodes.some(n => n.type === 'arrow'), 'inhibition must not use an arrowhead');
        const activate = build({ kind: 'connector', from: { x: 0, y: 0 }, to: { x: 100, y: 0 }, relation: 'activates' });
        assert.ok(activate.operations.some(o => (o as { node: { type: string } }).node.type === 'arrow'));
    });

    it('keeps every primitive inside one undoable group that can be ungrouped', () => {
        const { operations, groupId } = build({ kind: 'panel', x: 0, y: 0, width: 300, height: 200, letter: 'a', title: 'Selection' });
        let document = applyCommands(createDocument('d', 'Panel', 900, 600), operations);
        const children = document.nodes[groupId].children.length;
        assert.ok(children >= 3);
        document = applyCommands(document, [{ type: 'ungroup', id: groupId }]);
        assert.equal(document.nodes[groupId], undefined);
        assert.equal(document.roots.length, children);
    });

    it('rejects malformed primitives instead of drawing something wrong', () => {
        assert.throws(() => build({ kind: 'genomic_track', x: 0, y: 0, width: 100, segments: [] }));
        assert.throws(() => build({ kind: 'connector', from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, relation: 'teleports' }));
        assert.throws(() => build({ kind: 'nonsense', x: 0, y: 0 }));
    });
});
