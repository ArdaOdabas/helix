// Helix.app main process: owns the window, menus, file dialogs and the PNG renderer, and supervises the
// document service (src/server/main.ts), which runs in an Electron utility process with Electron's Node.
import { app, BrowserWindow, Menu, dialog, ipcMain, shell, utilityProcess, session, clipboard } from 'electron';
import type { UtilityProcess, MenuItemConstructorOptions, IpcMainInvokeEvent } from 'electron';
import { existsSync, mkdirSync, copyFileSync, renameSync, readFileSync, writeFileSync, unlinkSync, statSync, appendFileSync, constants } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { renderPage, measureRenderedPage } from '../src/server/figure-renderer.ts';

const PREFERRED_PORT = 47317;
const appRoot = app.getAppPath();
const resources = app.isPackaged ? process.resourcesPath : join(appRoot, '..');
const libraryDir = process.env.HELIX_LIBRARY_DIR ?? join(resources, 'library');
const userDir = app.getPath('userData');
const dataDir = join(userDir, 'data');
const logDir = join(userDir, 'logs');
const runtimeFile = join(userDir, 'runtime.json');
const token = randomBytes(24).toString('hex');

let win: BrowserWindow | null = null;
let backend: UtilityProcess | null = null;
let port = 0;
let quitting = false;
const crashes: number[] = [];

function log(file: 'main' | 'backend', line: string) {
    try {
        mkdirSync(logDir, { recursive: true });
        const path = join(logDir, file + '.log');
        if (existsSync(path) && statSync(path).size > 5_000_000) renameSync(path, path + '.1');
        appendFileSync(path, `[${new Date().toISOString()}] ${line.trimEnd()}\n`);
    }
    catch { /* logging must never take the app down */ }
}

if (!app.requestSingleInstanceLock()) {
    app.quit();
}
else {
    app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
    app.whenReady().then(start).catch(e => fatal('Helix could not start', e));
}

/** First launch: clone the bundled catalog into Application Support. Library files stay read-only in the bundle. */
function provisionData() {
    mkdirSync(join(dataDir, 'documents'), { recursive: true });
    const catalog = join(dataDir, 'catalog.sqlite');
    const seed = join(libraryDir, 'catalog.sqlite');
    if (!existsSync(catalog)) {
        if (!existsSync(seed)) throw new Error(`Bundled scientific library not found at ${libraryDir}`);
        const tmp = catalog + '.' + randomUUID() + '.tmp';
        copyFileSync(seed, tmp, constants.COPYFILE_FICLONE); // APFS clone when possible, byte copy otherwise
        renameSync(tmp, catalog);
        const manifest = join(libraryDir, 'library.json');
        if (existsSync(manifest)) copyFileSync(manifest, join(dataDir, 'library.json'));
        log('main', `Provisioned catalog from ${seed}`);
    }
}

function writeRuntime() {
    const tmp = runtimeFile + '.tmp';
    writeFileSync(tmp, JSON.stringify({ url: `http://127.0.0.1:${port}`, token, pid: process.pid, version: app.getVersion(), startedAt: new Date().toISOString() }, null, 2), { mode: 0o600 });
    renameSync(tmp, runtimeFile);
}
function removeRuntime() {
    try { if (JSON.parse(readFileSync(runtimeFile, 'utf8')).pid === process.pid) unlinkSync(runtimeFile); }
    catch { /* already gone */ }
}

function startBackend(preferred: number): Promise<number> {
    return new Promise((resolve, reject) => {
        const child = utilityProcess.fork(join(appRoot, 'server.mjs'), [], {
            serviceName: 'Helix Document Service',
            stdio: 'pipe',
            env: { ...process.env, FIGURE_DATA_DIR: dataDir, HELIX_LIBRARY_DIR: libraryDir, HELIX_DIST_DIR: join(appRoot, 'dist'), FIGURE_PORT: String(preferred), HELIX_TOKEN: token },
        });
        backend = child;
        let settled = false;
        const timer = setTimeout(() => { if (!settled) { settled = true; child.kill(); reject(new Error('Document service did not start within 60 s')); } }, 60000);
        child.stdout?.on('data', d => log('backend', String(d)));
        child.stderr?.on('data', d => log('backend', String(d)));
        child.on('message', async (msg: any) => {
            if (msg?.type === 'ready' && !settled) { settled = true; clearTimeout(timer); resolve(msg.port); }
            else if (msg?.type === 'error' && !settled) {
                settled = true; clearTimeout(timer);
                if (backend === child) backend = null;
                child.kill();
                if (msg.code === 'EADDRINUSE' && preferred !== 0) startBackend(0).then(resolve, reject);
                else reject(new Error(msg.message));
            }
            else if (msg?.type === 'render') {
                try { child.postMessage({ type: 'render-result', id: msg.id, ...(await renderSvg(msg.svg, msg.width, msg.height)) }); }
                catch (e) { child.postMessage({ type: 'render-result', id: msg.id, error: (e as Error).message }); }
            }
        });
        child.on('exit', code => {
            log('main', `Document service exited with code ${code}`);
            // Only the live service may trigger recovery; replaced or deliberately stopped instances may not.
            const current = backend === child;
            if (current) backend = null;
            if (!settled) { settled = true; clearTimeout(timer); reject(new Error(`Document service exited during startup (code ${code})`)); return; }
            if (current && !quitting) recoverBackend();
        });
    });
}

async function recoverBackend() {
    const now = Date.now();
    crashes.push(now);
    while (crashes.length && crashes[0] < now - 60000) crashes.shift();
    if (crashes.length <= 3) {
        try {
            port = await startBackend(port || PREFERRED_PORT);
            writeRuntime();
            win?.loadURL(`http://127.0.0.1:${port}/`);
            return;
        }
        catch (e) { log('main', `Restart failed: ${(e as Error).message}`); }
    }
    const { response } = await dialog.showMessageBox({ type: 'error', message: 'The Helix document service stopped unexpectedly.', detail: `Saved documents are not affected. Details are in ${logDir}.`, buttons: ['Restart Service', 'Quit Helix'], defaultId: 0 });
    if (response === 0) { crashes.length = 0; recoverBackend(); }
    else app.quit();
}

/** Renders the exported SVG in an isolated offscreen Chromium page; mirrors the Playwright renderer. */
async function renderSvg(svg: string, width: number, height: number) {
    const file = join(tmpdir(), `helix-render-${randomUUID()}.html`);
    writeFileSync(file, renderPage + svg, { mode: 0o600 });
    const view = new BrowserWindow({ show: false, width, height, useContentSize: true, enableLargerThanScreen: true, frame: false, webPreferences: { offscreen: true, partition: 'helix-render', sandbox: true, backgroundThrottling: false, spellcheck: false } });
    try {
        const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Renderer timed out; retry later.')), 25000));
        const work = (async () => {
            view.setContentSize(width, height);
            await view.loadURL(pathToFileURL(file).href);
            const measurements = await view.webContents.executeJavaScript(`(${measureRenderedPage.toString()})()`);
            let image = await view.webContents.capturePage({ x: 0, y: 0, width, height });
            const size = image.getSize();
            if (size.width !== width || size.height !== height) image = image.resize({ width, height, quality: 'best' });
            return { png: image.toPNG().toString('base64'), measurements };
        })();
        return await Promise.race([work, timeout]);
    }
    finally {
        view.destroy();
        try { unlinkSync(file); } catch { /* ignore */ }
    }
}

function lockDownSessions() {
    const render = session.fromPartition('helix-render');
    render.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
    render.webRequest.onBeforeRequest((details, cb) => cb({ cancel: !(details.url.startsWith('file://') && details.url.includes('helix-render-')) && !details.url.startsWith('data:') }));
    const main = session.defaultSession;
    main.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
    main.webRequest.onBeforeSendHeaders({ urls: ['http://127.0.0.1/*'] }, (details, cb) => {
        const u = new URL(details.url);
        if (u.port === String(port)) details.requestHeaders['X-Helix-Token'] = token;
        cb({ requestHeaders: details.requestHeaders });
    });
}

function isAppFrame(event: IpcMainInvokeEvent) {
    try { return new URL(event.senderFrame?.url ?? '').origin === `http://127.0.0.1:${port}`; }
    catch { return false; }
}

function registerIpc() {
    ipcMain.handle('helix:save-file', async (event, options: { defaultName: string; data: Uint8Array | string; filters: { name: string; extensions: string[] }[] }) => {
        if (!isAppFrame(event) || !win) throw new Error('Not allowed');
        const name = String(options.defaultName).replace(/[/\\:\0]/g, '-').slice(0, 200) || 'Untitled';
        // HELIX_TEST_SAVE_DIR lets automated tests exercise the export path without a modal dialog.
        const testDir = process.env.HELIX_TEST_SAVE_DIR;
        const filePath = testDir ? join(testDir, name) : (await dialog.showSaveDialog(win, { defaultPath: join(lastDirectory(), name), filters: options.filters })).filePath;
        if (!filePath) return { saved: false };
        const tmp = filePath + '.' + randomUUID() + '.tmp';
        writeFileSync(tmp, typeof options.data === 'string' ? options.data : Buffer.from(options.data));
        renameSync(tmp, filePath);
        if (!testDir) rememberDirectory(dirname(filePath));
        return { saved: true, path: filePath, name: basename(filePath) };
    });
    ipcMain.handle('helix:open-figure', async event => {
        if (!isAppFrame(event) || !win) throw new Error('Not allowed');
        const result = await dialog.showOpenDialog(win, { defaultPath: lastDirectory(), properties: ['openFile'], filters: [{ name: 'Helix figure (JSON)', extensions: ['json'] }] });
        if (result.canceled || !result.filePaths[0]) return null;
        const path = result.filePaths[0];
        if (statSync(path).size > 30_000_000) throw new Error('File is larger than 30 MB');
        rememberDirectory(dirname(path));
        return { name: basename(path), text: readFileSync(path, 'utf8') };
    });
}

const prefsFile = join(userDir, 'preferences.json');
function prefs(): Record<string, any> { try { return JSON.parse(readFileSync(prefsFile, 'utf8')); } catch { return {}; } }
function savePrefs(patch: Record<string, unknown>) { try { writeFileSync(prefsFile, JSON.stringify({ ...prefs(), ...patch }, null, 2)); } catch { /* non-critical */ } }
function lastDirectory() { const d = prefs().lastDirectory; return typeof d === 'string' && existsSync(d) ? d : app.getPath('documents'); }
function rememberDirectory(d: string) { savePrefs({ lastDirectory: d }); }

function send(command: string) { win?.webContents.send('helix:command', command); }

function mcpCommand() { return join(resources, 'bin', 'helix-mcp'); }
async function connectAssistants() {
    const command = mcpCommand();
    const desktopConfig = JSON.stringify({ mcpServers: { helix: { command } } }, null, 2);
    const { response } = await dialog.showMessageBox(win!, {
        type: 'info',
        message: 'Connect AI assistants to Helix',
        detail: `Helix includes an MCP server. AI assistants that connect to it can create and edit figures while you watch them in this window. If Helix is not running, the assistant opens it automatically.\n\nMCP command:\n${command}\n\nClaude Code:  claude mcp add helix -- "${command}"\n\nClaude Desktop: add the "helix" entry to claude_desktop_config.json, then restart Claude Desktop so it discovers all tools.`,
        buttons: ['Copy Claude Code Command', 'Copy Claude Desktop Config', 'Add to Claude Desktop…', 'Close'],
        defaultId: 3, cancelId: 3,
    });
    if (response === 0) clipboard.writeText(`claude mcp add helix -- "${command}"`);
    if (response === 1) clipboard.writeText(desktopConfig);
    if (response === 2) await addToClaudeDesktop(command);
}
async function addToClaudeDesktop(command: string) {
    const config = join(app.getPath('appData'), 'Claude', 'claude_desktop_config.json');
    let current: any = {};
    try { if (existsSync(config)) current = JSON.parse(readFileSync(config, 'utf8')); }
    catch { await dialog.showMessageBox(win!, { type: 'error', message: 'Claude Desktop configuration is not valid JSON.', detail: `${config} was not modified.` }); return; }
    const others = Object.entries(current.mcpServers ?? {}).filter(([k, v]: [string, any]) => k !== 'helix' && String(v?.args ?? '').includes('src/mcp/main.ts')).map(([k]) => k);
    const { response } = await dialog.showMessageBox(win!, {
        type: 'question', message: 'Add Helix to Claude Desktop?',
        detail: `Helix will add or update the "helix" MCP server in\n${config}\nA backup is saved next to it first. No other entries are changed.${others.length ? `\n\nThe development entry ${others.map(o => `"${o}"`).join(', ')} still points at the source checkout and port 4317. Remove it yourself if you no longer use the development server.` : ''}\n\nRestart Claude Desktop afterwards.`,
        buttons: ['Add', 'Cancel'], defaultId: 0, cancelId: 1,
    });
    if (response !== 0) return;
    mkdirSync(dirname(config), { recursive: true });
    if (existsSync(config)) copyFileSync(config, `${config}.helix-backup-${Date.now()}`);
    current.mcpServers = { ...(current.mcpServers ?? {}), helix: { command } };
    writeFileSync(config, JSON.stringify(current, null, 2));
}

function buildMenu() {
    const item = (label: string, accelerator: string | undefined, command: string): MenuItemConstructorOptions => ({ label, accelerator, click: () => send(command) });
    const template: MenuItemConstructorOptions[] = [
        { label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { label: 'Connect AI Assistants…', click: () => connectAssistants() }, { type: 'separator' }, { role: 'services' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
        { label: 'File', submenu: [
            item('New Figure', 'CmdOrCtrl+N', 'new'),
            item('Import Figure JSON…', 'CmdOrCtrl+O', 'import'),
            { type: 'separator' },
            item('Export SVG…', 'CmdOrCtrl+Shift+E', 'export-svg'),
            item('Export PNG (2×)…', 'CmdOrCtrl+E', 'export-png-2'),
            item('Export PNG (4×, print)…', 'CmdOrCtrl+Alt+E', 'export-png-4'),
            item('Export Figure JSON…', undefined, 'export-json'),
            { type: 'separator' },
            { label: 'Show Data Folder', click: () => shell.openPath(userDir) },
            { type: 'separator' },
            { role: 'close' },
        ] },
        { label: 'Edit', submenu: [
            item('Undo', 'CmdOrCtrl+Z', 'undo'),
            item('Redo', 'CmdOrCtrl+Shift+Z', 'redo'),
            { type: 'separator' },
            { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
            { type: 'separator' },
            item('Group', 'CmdOrCtrl+G', 'group'),
            item('Ungroup', 'CmdOrCtrl+Shift+G', 'ungroup'),
            item('Delete', undefined, 'delete'),
        ] },
        { label: 'View', submenu: [
            item('Zoom In', 'CmdOrCtrl+=', 'zoom-in'),
            item('Zoom Out', 'CmdOrCtrl+-', 'zoom-out'),
            item('Zoom to Fit', 'CmdOrCtrl+0', 'zoom-fit'),
            { type: 'separator' },
            item('Figure Plan…', 'CmdOrCtrl+Shift+P', 'plan'),
            { type: 'separator' },
            { role: 'togglefullscreen' },
            ...(app.isPackaged ? [] : [{ role: 'reload' }, { role: 'toggleDevTools' }] as MenuItemConstructorOptions[]),
        ] },
        { role: 'windowMenu' },
        { role: 'help', submenu: [
            { label: 'Connect AI Assistants…', click: () => connectAssistants() },
            { label: 'Show Logs', click: () => shell.openPath(logDir) },
            { label: 'Asset Licenses and Attribution', click: () => shell.openPath(join(libraryDir, 'licenses')) },
        ] },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
    const bounds = prefs().bounds;
    win = new BrowserWindow({
        width: 1440, height: 900, minWidth: 1000, minHeight: 640, ...(bounds ?? {}),
        title: 'Helix', show: false, backgroundColor: '#f4f5f7', titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 20, y: 31 },
        webPreferences: { preload: join(appRoot, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: true },
    });
    win.once('ready-to-show', () => win?.show());
    win.on('close', () => { if (win) savePrefs({ bounds: win.getBounds() }); });
    win.on('closed', () => { win = null; });
    win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//.test(url) && !url.startsWith(`http://127.0.0.1:${port}`)) shell.openExternal(url); return { action: 'deny' }; });
    win.webContents.on('will-navigate', (event, url) => { if (!url.startsWith(`http://127.0.0.1:${port}/`)) event.preventDefault(); });
    win.webContents.on('render-process-gone', (_e, details) => { log('main', `Renderer gone: ${details.reason}`); if (!quitting && details.reason !== 'clean-exit') win?.reload(); });
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<body style="margin:0;display:grid;place-items:center;height:100vh;font:15px -apple-system;color:#555;background:#f4f5f7">Starting Helix…</body>'));
    return win;
}

async function start() {
    app.setAboutPanelOptions({ applicationName: 'Helix', applicationVersion: app.getVersion(), copyright: 'Scientific assets remain under their individual licenses; see Help → Asset Licenses.' });
    log('main', `Starting Helix ${app.getVersion()} (packaged=${app.isPackaged})`);
    lockDownSessions();
    registerIpc();
    buildMenu();
    createWindow();
    provisionData();
    port = await startBackend(PREFERRED_PORT);
    writeRuntime();
    log('main', `Document service on 127.0.0.1:${port}`);
    await win?.loadURL(`http://127.0.0.1:${port}/`);
}

async function fatal(message: string, e: unknown) {
    log('main', `${message}: ${(e as Error)?.stack ?? e}`);
    await dialog.showMessageBox({ type: 'error', message, detail: `${(e as Error)?.message ?? e}\n\nLogs: ${logDir}` });
    app.exit(1);
}

app.on('activate', () => { if (!win && port) createWindow().loadURL(`http://127.0.0.1:${port}/`); });
app.on('window-all-closed', () => { /* macOS: stay running until Quit, like other document apps */ });
app.on('before-quit', () => { quitting = true; });
process.on('SIGTERM', () => app.quit());
app.on('will-quit', event => {
    removeRuntime();
    const child = backend;
    if (!child) return;
    event.preventDefault();
    backend = null;
    const done = () => app.quit();
    const timer = setTimeout(() => { child.kill(); done(); }, 3000);
    child.once('exit', () => { clearTimeout(timer); done(); });
    child.postMessage({ type: 'shutdown' });
});
