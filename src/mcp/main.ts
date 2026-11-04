import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createMcpServer } from './server.ts';
import {toolDefinitions} from '../server/tools.ts';
import { resolveService, type Service } from './discovery.ts';
let service: Service | undefined;
async function call(name: string, args: unknown, retry = true): Promise<unknown> {
    service ??= await resolveService();
    let response: Response;
    try {
        response = await fetch(service.url + '/api/tools/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(service.token ? { 'X-Helix-Token': service.token } : {}) }, body: JSON.stringify(args), signal: AbortSignal.timeout(60000) });
    }
    catch (e) {
        // Helix.app may have restarted on a new port/token; rediscover once.
        service = undefined;
        if (retry) return call(name, args, false);
        throw e;
    }
    if (response.status === 401 && retry) { service = undefined; return call(name, args, false); }
    const data = await response.json();
    if (!response.ok)
        throw new Error(data.error ?? 'Service error');
    return data;
}
const server = createMcpServer((name, args) => call(name, args));
console.error(JSON.stringify({helixMcpVersion:'0.7.0',registeredTools:Object.keys(toolDefinitions).length,serviceUrl:process.env.FIGURE_SERVICE_URL ?? 'auto (Helix.app runtime file, then http://127.0.0.1:4317)'}));
await server.connect(new StdioServerTransport());
