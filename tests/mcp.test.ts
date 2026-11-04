import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { Client } from '@modelcontextprotocol/client';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMcpServer } from '../src/mcp/server.ts';
import { Store } from '../src/server/store.ts';
import { Catalog } from '../src/assets/catalog.ts';
import { executeTool } from '../src/server/tools.ts';
import { demoPlan } from '../src/core/plan.ts';
const content = (r: any) => JSON.parse(r.content[0].text);
describe('official MCP SDK transport contract', () => {
    it('discovers schemas and creates, edits, persists, and exports through MCP', async () => { const directory = mkdtempSync(join(tmpdir(), 'helix-mcp-')), store = new Store(directory), catalog = new Catalog(directory); const server = createMcpServer((name, input) => executeTool(name, input, store, catalog)), client = new Client({ name: 'helix-test', version: '1.0.0' }); const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair(); try {
        await server.connect(serverTransport);
        await client.connect(clientTransport);
        const list = await client.listTools();
        assert.equal(list.tools.length, 40);
        assert.ok(list.tools.find(t => t.name === 'add_icon')!.inputSchema);
        const d = content(await client.callTool({ name: 'create_document', arguments: { title: 'MCP demo', plan: demoPlan } }));
        assert.ok(d.nodes.naive);
        const changed = await client.callTool({ name: 'update_object', arguments: { documentId: d.id, objectId: 'naive', expectedRevision: d.revision, patch: { name: 'Edited through MCP' } } });
        assert.ok(!changed.isError);
        assert.equal(store.read(d.id).document.nodes.naive.name, 'Edited through MCP');
        const svg = content(await client.callTool({ name: 'export_svg', arguments: { documentId: d.id } }));
        assert.ok(svg.svg.includes('TPRX1 expression'));
        const bad = await client.callTool({ name: 'delete_object', arguments: { documentId: d.id, objectId: 'missing' } });
        assert.equal(bad.isError, true);
    }
    finally {
        await client.close();
        await server.close();
        catalog.close();
    } });
});
