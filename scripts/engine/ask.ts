// Drives the installed Helix.app exactly as an MCP client would: connects to the app's bundled
// stdio launcher and calls one tool with a JSON argument file.
//   node scripts/engine/ask.ts generate_figure spec.json [outPrefix]
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { readFileSync, writeFileSync } from 'node:fs';

const [tool, argFile, outPrefix = '/tmp/claude-501/engine/ask'] = process.argv.slice(2);
const launcher = process.env.HELIX_LAUNCHER ?? '/Applications/Helix.app/Contents/Resources/bin/helix-mcp';
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !['FIGURE_SERVICE_URL', 'HELIX_TOKEN', 'ELECTRON_RUN_AS_NODE'].includes(k))) as Record<string, string>;
const client = new Client({ name: 'helix-ask', version: '1.0.0' });
try {
    await client.connect(new StdioClientTransport({ command: launcher, args: [], env }));
    const r = await client.callTool({ name: tool, arguments: argFile ? JSON.parse(readFileSync(argFile, 'utf8')) : {} }) as any;
    for (const c of r.content ?? []) {
        if (c.type === 'image') { writeFileSync(`${outPrefix}.png`, Buffer.from(c.data, 'base64')); console.error(`image -> ${outPrefix}.png`); }
        else if (c.type === 'text') console.log(c.text);
    }
    if (r.isError) process.exitCode = 1;
} finally { await client.close(); }
