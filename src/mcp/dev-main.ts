// MCP entry point for development checkouts: starts the document service itself when it is not
// already running, so an MCP client (Claude Desktop, Codex) needs no terminal. All stdout stays
// reserved for the protocol; the child service's output goes to a log file.
import { spawn } from 'node:child_process';
import { openSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMcpServer } from './server.ts';
import { toolDefinitions } from '../server/tools.ts';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const port = Number(process.env.FIGURE_PORT ?? 4317);
const url = `http://127.0.0.1:${port}`;

async function healthy() {
    try {
        const r = await fetch(url + '/api/health', { signal: AbortSignal.timeout(1500) });
        return r.ok && (await r.json()).ok === true;
    } catch { return false; }
}

async function ensureService() {
    if (await healthy()) return 'already running';
    const logDir = join(projectRoot, 'data', 'logs');
    mkdirSync(logDir, { recursive: true });
    const log = openSync(join(logDir, 'mcp-service.log'), 'a');
    const child = spawn(process.execPath, [join(projectRoot, 'src', 'server', 'main.ts')], {
        cwd: projectRoot, detached: true, stdio: ['ignore', log, log],
        env: { ...process.env, FIGURE_PORT: String(port) },
    });
    child.unref();
    for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 500));
        if (await healthy()) return `started (pid ${child.pid})`;
    }
    throw new Error(`The document service did not start on ${url}. See data/logs/mcp-service.log.`);
}

const status = await ensureService();

async function call(name: string, args: unknown): Promise<unknown> {
    const response = await fetch(url + '/api/tools/' + name, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args), signal: AbortSignal.timeout(300000),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? 'Service error');
    return data;
}

console.error(JSON.stringify({ helixMcpVersion: '0.7.0', mode: 'development', service: url, serviceStatus: status, registeredTools: Object.keys(toolDefinitions).length }));
await createMcpServer(call).connect(new StdioServerTransport());
