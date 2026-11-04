// End-to-end check of a packaged Helix.app through its bundled MCP launcher (Contents/Resources/bin/helix-mcp).
// Uses only a new disposable document; existing documents are never modified.
//   node scripts/test-desktop.ts [/path/to/Helix.app]
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import assert from 'node:assert/strict';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

const bundle = process.argv[2] ?? join(homedir(), 'Developer/Helix/build/release/Helix-darwin-arm64/Helix.app');
const launcher = join(bundle, 'Contents/Resources/bin/helix-mcp');
assert.ok(existsSync(launcher), `MCP launcher missing: ${launcher}`);
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !['FIGURE_SERVICE_URL', 'HELIX_TOKEN', 'ELECTRON_RUN_AS_NODE'].includes(k))) as Record<string, string>;
const client = new Client({ name: 'helix-desktop-test', version: '1.0.0' });
const results: [string, string][] = [];
const check = (name: string, detail = 'ok') => { results.push([name, detail]); console.log(`✓ ${name}${detail === 'ok' ? '' : ` — ${detail}`}`); };
async function call(name: string, args: Record<string, unknown> = {}) {
    const r = await client.callTool({ name, arguments: args }) as any;
    if (r.isError) throw new Error(`${name}: ${r.content?.[0]?.text}`);
    return { data: JSON.parse(r.content[0].text), content: r.content };
}
try {
    await client.connect(new StdioClientTransport({ command: launcher, args: [], env }));
    const tools = (await client.listTools()).tools.map(t => t.name);
    assert.equal(tools.length, 40);
    for (const name of ['resize_artboard', 'generate_figure', 'find_visual', 'list_figure_vocabulary', 'delete_document']) assert.ok(tools.includes(name), `missing tool ${name}`);
    check('MCP discovery through bundled launcher', `${tools.length} tools incl. resize_artboard, generate_figure`);

    const before = (await call('list_documents')).data as { id: string; revision: number }[];
    let doc = (await call('create_document', { title: `Desktop test ${new Date().toISOString()}`, width: 800, height: 500 })).data;
    check('create_document', doc.id);

    const icons = (await call('search_icons', { query: 'mitochondria', limit: 3 })).data;
    assert.ok(icons.items.length > 0, 'asset search returned nothing');
    check('search_icons (bundled library)', `${icons.total ?? icons.items.length} hits for "mitochondria"`);

    doc = (await call('add_icon', { documentId: doc.id, expectedRevision: doc.revision, iconId: icons.items[0].id, x: 80, y: 120, width: 180, height: 140 })).data;
    doc = (await call('add_text', { documentId: doc.id, expectedRevision: doc.revision, text: 'Mitochondrion', x: 80, y: 290, width: 220, height: 40 })).data;
    doc = (await call('add_arrow', { documentId: doc.id, expectedRevision: doc.revision, x: 300, y: 190, width: 200, height: 1 })).data;
    assert.equal(Object.keys(doc.nodes).length, 3);
    check('add_icon / add_text / add_arrow', `revision ${doc.revision}`);

    const undone = (await call('undo', { documentId: doc.id, expectedRevision: doc.revision })).data;
    assert.equal(Object.keys(undone.nodes).length, 2);
    doc = (await call('redo', { documentId: doc.id, expectedRevision: undone.revision })).data;
    assert.equal(Object.keys(doc.nodes).length, 3);
    check('undo / redo');

    const stale = await client.callTool({ name: 'add_text', arguments: { documentId: doc.id, expectedRevision: doc.revision - 1, text: 'stale', x: 0, y: 0, width: 10, height: 10 } }) as any;
    assert.ok(stale.isError && /Revision conflict/.test(stale.content[0].text));
    check('stale revision rejected');

    const svg = (await call('export_svg', { documentId: doc.id })).data.svg as string;
    assert.ok(svg.startsWith('<svg') && svg.includes('Mitochondrion'));
    check('export_svg', `${svg.length} bytes`);

    const render = await call('render_figure', { documentId: doc.id, expectedRevision: doc.revision, scale: 2 });
    const image = render.content.find((c: any) => c.type === 'image');
    assert.ok(image, 'no image content');
    const png = Buffer.from(image.data, 'base64');
    assert.equal(png.readUInt32BE(16), 1600);
    assert.equal(png.readUInt32BE(20), 1000);
    check('render_figure via Helix.app Chromium', `${png.readUInt32BE(16)}×${png.readUInt32BE(20)} PNG, ${render.data.warnings.length} warnings`);

    const analysis = (await call('analyze_figure_layout', { documentId: doc.id, expectedRevision: doc.revision })).data;
    check('analyze_figure_layout', `${analysis.analysis?.issues?.length ?? 'n/a'} issues`);

    doc = (await call('resize_artboard', { documentId: doc.id, width: 900, height: 560, expectedRevision: doc.revision, preserveContent: true })).data;
    const resized = doc.document ?? doc;
    assert.equal(resized.width, 900);
    check('resize_artboard', `${resized.width}×${resized.height}`);

    const after = (await call('list_documents')).data as { id: string; revision: number }[];
    for (const d of before) assert.equal(after.find(a => a.id === d.id)?.revision, d.revision, `existing document ${d.id} changed`);
    check('existing documents untouched', `${before.length} documents`);

    const vocab = (await call('list_figure_vocabulary')).data;
    assert.ok(vocab.layouts.includes('pathway') && Object.keys(vocab.glyphs).length >= 5);
    check('list_figure_vocabulary', `${Object.values(vocab.glyphs).flat().length} glyphs, ${vocab.layouts.length} layouts`);

    const visual = await call('find_visual', { query: 'macrophage', limit: 3 });
    assert.ok(visual.content.some((c: any) => c.type === 'image'), 'find_visual returned no image');
    check('find_visual (bundled library)', `${visual.data.matches.length} matches`);

    const figureSpec = {
        type: 'pathway', title: `Desktop engine test ${new Date().toISOString()}`,
        nodes: [{ id: 'l', label: 'Ligand', kind: 'ligand' }, { id: 'r', label: 'RTK', kind: 'rtk' }, { id: 'k', label: 'MEK', kind: 'kinase' }, { id: 't', label: 'TF', kind: 'tf', location: 'nucleus' }],
        edges: [{ from: 'l', to: 'r', type: 'binds' }, { from: 'r', to: 'k' }, { from: 'k', to: 't', type: 'translocates' }],
        outputs: ['Proliferation'],
    };
    const gen = await call('generate_figure', { spec: figureSpec, outputDir: join(homedir(), 'Documents', 'Helix Figures'), fileName: 'desktop-engine-test', exportScale: 2 });
    assert.ok(gen.content.some((c: any) => c.type === 'image'), 'generate_figure returned no preview image');
    assert.ok(existsSync(gen.data.files.svg) && existsSync(gen.data.files.png), 'figure files not written');
    assert.ok(gen.data.document?.objects >= 8, `editable document has too few objects: ${JSON.stringify(gen.data.document)}`);
    assert.deepEqual(gen.data.document.skipped, [], 'some figure parts were rejected by the sanitizer');
    check('generate_figure in the packaged app', `${gen.data.width}×${gen.data.height}, ${gen.data.document.objects} editable objects`);

    const regen = await call('generate_figure', { spec: figureSpec, outputDir: join(homedir(), 'Documents', 'Helix Figures'), fileName: 'desktop-engine-test', exportScale: 2, replaceDocumentId: gen.data.document.id });
    assert.equal(regen.data.document.id, gen.data.document.id, 'replaceDocumentId created a new document');
    check('generate_figure replaceDocumentId updates in place', `revision ${regen.data.document.revision}`);

    // Every document this test created is disposable; leaving them behind clutters the real library.
    const created = [resized.id, gen.data.document.id];
    for (const id of created) await call('delete_document', { documentId: id });
    const left = (await call('list_documents')).data as { id: string }[];
    assert.ok(!left.some(d => created.includes(d.id)), 'disposable test documents were not removed');
    assert.equal(left.length, before.length, 'document count did not return to its starting value');
    check('disposable documents removed', `${created.length} deleted, ${left.length} remain`);

    const runtime = JSON.parse(readFileSync(join(homedir(), 'Library/Application Support/Helix/runtime.json'), 'utf8'));
    console.log(JSON.stringify({ documentId: resized.id, service: runtime.url }));
}
finally {
    await client.close();
}
