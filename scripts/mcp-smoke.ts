import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import assert from 'node:assert/strict';
const client = new Client({ name: 'helix-smoke', version: '1.0.0' });
const transport = new StdioClientTransport({ command: process.execPath, args: ['src/mcp/main.ts'], cwd: process.cwd(), env:{FIGURE_SERVICE_URL:process.env.FIGURE_SERVICE_URL ?? 'http://127.0.0.1:4317'} });
try {
    await client.connect(transport);
    const list = await client.listTools();
    assert.equal(list.tools.length, 36);
    console.log('Discovered', list.tools.length, 'MCP tools');
    if (process.argv.includes('--metadata-only')) {
        const fs = await import('node:fs/promises');
        await fs.writeFile('examples/mcp-tools.json', JSON.stringify(list, null, 2));
    }
    else {
        const r = await client.callTool({ name: 'list_documents', arguments: {} });
        if (r.isError)
            throw new Error(JSON.stringify(r.content));
        console.log('Shared persistent documents:', r.content);
    }
}
finally {
    await client.close();
}
