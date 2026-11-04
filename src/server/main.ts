import { createServer } from 'node:http';
import { resolve, join, extname } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Store } from './store.ts';
import { Catalog } from '../assets/catalog.ts';
import { executeTool } from './tools.ts';
import { installHostRenderer } from './host-renderer.ts';
import { createHostedMode, hostedTools } from './hosted.ts';
import { demoPlan } from '../core/plan.ts';
const project = resolve(fileURLToPath(new URL('../..', import.meta.url))), directory = resolve(process.env.FIGURE_DATA_DIR ?? join(project, 'data'));
const distRoot = resolve(process.env.HELIX_DIST_DIR ?? join(project, 'dist'));
const token = process.env.HELIX_TOKEN || undefined, host = (process as any).parentPort;
const publicUrl = process.env.HELIX_PUBLIC_URL;
if (publicUrl && (!process.env.FIGURE_DATA_DIR || token || host))
    throw new Error('Hosted mode requires a separate FIGURE_DATA_DIR and a standalone server');
const hosted = publicUrl ? createHostedMode(directory, publicUrl, process.env.HELIX_SESSION_SECRET) : undefined;
const localStore = hosted ? undefined : new Store(directory);
const catalog = new Catalog(directory);
installHostRenderer();
function seed(store: Store) {
    if (!store.list().length)
        executeTool('create_document', { title: demoPlan.title, plan: demoPlan }, store, catalog);
}
if (localStore) seed(localStore);
let port = Number((hosted ? process.env.PORT : process.env.FIGURE_PORT) ?? 4317);
const server = createServer(async (req, res) => {
    try {
        const host = req.headers.host ?? '';
        if (hosted ? host !== hosted.url.host : !['127.0.0.1:' + port, 'localhost:' + port].includes(host)) {
            res.writeHead(403);
            res.end('Invalid host');
            return;
        }
        const origin = req.headers.origin;
        if (hosted ? (req.method === 'POST' && origin !== hosted.url.origin) : origin && !['http://127.0.0.1:5173', 'http://localhost:5173', 'http://127.0.0.1:' + port, 'http://localhost:' + port].includes(origin)) {
            res.writeHead(403);
            res.end('Origin not allowed');
            return;
        }
        const url = new URL(req.url ?? '/', 'http://127.0.0.1');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        if (token && url.pathname.startsWith('/api/') && url.pathname !== '/api/health' && req.headers['x-helix-token'] !== token) {
            res.writeHead(401);
            res.end('Missing Helix session token');
            return;
        }
        if (url.pathname === '/api/health') {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, service: 'helix', version: '0.6.0', icons: catalog.count() }));
            return;
        }
        if (hosted && (url.pathname === '/' || req.method === 'POST')) {
            res.setHeader('Cache-Control', 'private, no-store');
        }
        let store = localStore;
        if (hosted && req.method === 'GET' && url.pathname === '/') hosted.workspace(req, res, true);
        if (hosted && req.method === 'POST') {
            const id = hosted.workspace(req, res, false);
            if (!id) { res.writeHead(401); res.end('Open the editor to start a workspace'); return; }
            store = hosted.store(id);
        }
        if (req.method === 'POST' && url.pathname === '/api/import') {
            const document = store!.importDocument(JSON.parse(await readBody(req, 30000000)));
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(document));
            return;
        }
        if (req.method === 'POST' && url.pathname.startsWith('/api/tools/')) {
            const name = decodeURIComponent(url.pathname.slice(11));
            if (hosted && !hostedTools.has(name)) { res.writeHead(404); res.end('Not found'); return; }
            const body = await readBody(req, 3000000);
            if (hosted && name === 'list_documents') seed(store!);
            const result = await executeTool(name, JSON.parse(body || '{}'), store!, catalog);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(result));
            return;
        }
        if (req.method === 'GET' && url.pathname.startsWith('/api/icons/')) {
            const id = decodeURIComponent(url.pathname.slice(11));
            const etag='"'+id+(url.searchParams.has('thumbnail')?'-thumbnail':'')+'"';
            res.setHeader('ETag',etag);
            res.setHeader('Cache-Control','private, max-age=31536000, immutable');
            if(req.headers['if-none-match']===etag){res.writeHead(304);res.end();return;}
            const svg=url.searchParams.has('thumbnail') ? catalog.thumbnail(id) : catalog.get(id).svg;
            res.setHeader('Content-Type', 'image/svg+xml');
            res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
            res.end(svg);
            return;
        }
        const path = join(distRoot, url.pathname === '/' ? 'index.html' : url.pathname);
        if (!path.startsWith(distRoot + '/'))
            throw new Error('Invalid path');
        if (req.method === 'GET' && existsSync(path)) {
            res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2' } as Record<string, string>)[extname(path)] ?? 'application/octet-stream');
            res.end(readFileSync(path));
            return;
        }
        res.writeHead(404);
        res.end('Not found');
    }
    catch (e) {
        res.writeHead((e as Error).message.startsWith('Revision conflict') ? 409 : 400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: (e as Error).message }));
    }
});
async function readBody(req: AsyncIterable<Buffer | string>, limit: number) {
    let body = '';
    for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > limit)
            throw new Error('Request too large');
    }
    return body || '{}';
}
server.listen(port, hosted ? '0.0.0.0' : '127.0.0.1', () => {
    port = (server.address() as { port: number }).port;
    console.log(`Document service: ${hosted?.url.origin ?? 'http://127.0.0.1:' + port}`);
    host?.postMessage({ type: 'ready', port });
});
server.on('error', e => { console.error(e.message); host?.postMessage({ type: 'error', message: e.message, code: (e as NodeJS.ErrnoException).code }); process.exitCode = 1; });
function shutdown() { server.close(); try { catalog.db.close(); } finally { process.exit(0); } }
process.on('SIGTERM', shutdown);
host?.on('message', (event: { data: { type?: string } }) => { if (event.data?.type === 'shutdown') shutdown(); });
