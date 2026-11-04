// Locates the document service the MCP server should drive:
// 1. FIGURE_SERVICE_URL (explicit; development and legacy configurations)
// 2. a running Helix.app (runtime file)
// 3. a running development service on 127.0.0.1:4317
// 4. launching Helix.app and waiting for its runtime file
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
export type Service = { url: string; token?: string };
export const runtimeFile = () => process.env.HELIX_RUNTIME_FILE ?? join(homedir(), 'Library', 'Application Support', 'Helix', 'runtime.json');
export function loopback(url: string) {
    const u = new URL(url);
    if (u.hostname !== '127.0.0.1' || u.protocol !== 'http:')
        throw new Error('Helix service URL must be loopback HTTP');
    return u.origin;
}
async function healthy(service: Service) {
    try {
        const r = await fetch(service.url + '/api/health', { signal: AbortSignal.timeout(2000) });
        return r.ok && (await r.json()).ok === true;
    }
    catch { return false; }
}
function readRuntime(): Service | undefined {
    try {
        const r = JSON.parse(readFileSync(runtimeFile(), 'utf8'));
        return { url: loopback(r.url), token: typeof r.token === 'string' ? r.token : undefined };
    }
    catch { return undefined; }
}
function launchApp() {
    const app = process.env.HELIX_APP_PATH;
    // `open` forwards its environment to the app; ELECTRON_RUN_AS_NODE would make Helix start as plain Node and exit.
    const { ELECTRON_RUN_AS_NODE: _node, ...env } = process.env;
    return new Promise<void>(resolve => execFile('/usr/bin/open', app ? ['-g', app] : ['-g', '-b', 'app.helix.editor'], { env }, () => resolve()));
}
export async function resolveService(): Promise<Service> {
    if (process.env.FIGURE_SERVICE_URL)
        return { url: loopback(process.env.FIGURE_SERVICE_URL), token: process.env.HELIX_TOKEN };
    const current = readRuntime();
    if (current && await healthy(current)) return current;
    const dev = { url: 'http://127.0.0.1:4317' };
    if (await healthy(dev)) return dev;
    if (process.platform === 'darwin' && process.env.HELIX_NO_LAUNCH !== '1') {
        await launchApp();
        for (const deadline = Date.now() + 45000; Date.now() < deadline; await new Promise(r => setTimeout(r, 500))) {
            const next = readRuntime();
            if (next && await healthy(next)) return next;
        }
    }
    throw new Error('Helix is not running. Open Helix.app (or start the development service with npm run dev) and retry.');
}
