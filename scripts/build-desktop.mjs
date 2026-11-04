// Builds Helix.app (Apple Silicon) and optionally a DMG.
//   node scripts/build-desktop.mjs            # stage + package .app
//   node scripts/build-desktop.mjs --dmg      # also create ~/Developer/Helix/build/Helix-<version>-arm64.dmg
//   node scripts/build-desktop.mjs --stage    # only stage ~/Developer/Helix/build/app + ~/Developer/Helix/build/library (for `npm run desktop:dev`)
// The source data directory is only read: the catalog is copied with VACUUM INTO and library files are cloned.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync, cpSync, copyFileSync, chmodSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
// Default output lives outside the project: ~/Desktop is iCloud-synced here, and File Provider metadata
// both breaks codesign and would upload the 2.5 GB bundle. Override with HELIX_BUILD_DIR.
const out = resolve(process.env.HELIX_BUILD_DIR ?? join(homedir(), 'Developer', 'Helix', 'build'));
const args = new Set(process.argv.slice(2));
const sourceData = resolve(process.env.FIGURE_DATA_DIR ?? join(root, 'data'));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const electronVersion = JSON.parse(readFileSync(join(root, 'node_modules/electron/package.json'), 'utf8')).version;
const electronBin = join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron');
const run = (cmd, argv, opts = {}) => execFileSync(cmd, argv, { stdio: 'inherit', cwd: root, ...opts });
const step = name => console.log(`\n▸ ${name}`);

step('Type-check and build editor UI');
run(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit']);
run(process.execPath, ['node_modules/vite/bin/vite.js', 'build']);

step('Bundle main process, preload, document service and MCP server');
const app = join(out, 'app');
rmSync(app, { recursive: true, force: true });
mkdirSync(app, { recursive: true });
const common = { bundle: true, platform: 'node', target: 'node24', sourcemap: 'linked', logLevel: 'warning', define: { 'process.env.NODE_ENV': '"production"' } };
const esmBanner = { js: "import { createRequire as __helixRequire } from 'node:module'; const require = __helixRequire(import.meta.url);" };
await build({ ...common, entryPoints: [join(root, 'desktop/main.ts')], outfile: join(app, 'main.cjs'), format: 'cjs', external: ['electron', 'playwright-core'] });
await build({ ...common, entryPoints: [join(root, 'desktop/preload.ts')], outfile: join(app, 'preload.cjs'), format: 'cjs', external: ['electron', 'playwright-core'] });
// playwright-core is only the fallback renderer outside Helix.app; inside the app Electron renders.
await build({ ...common, entryPoints: [join(root, 'src/server/main.ts')], outfile: join(app, 'server.mjs'), format: 'esm', banner: esmBanner, external: ['playwright-core'] });
await build({ ...common, entryPoints: [join(root, 'src/mcp/main.ts')], outfile: join(app, 'mcp.mjs'), format: 'esm', banner: esmBanner, external: ['playwright-core'] });
cpSync(join(root, 'dist'), join(app, 'dist'), { recursive: true });
writeFileSync(join(app, 'package.json'), JSON.stringify({ name: 'helix', productName: 'Helix', version, description: 'AI-native scientific figure editor', main: 'main.cjs', private: true }, null, 2));

step('Stage MCP launcher');
const bin = join(out, 'bin');
mkdirSync(bin, { recursive: true });
copyFileSync(join(root, 'desktop/helix-mcp'), join(bin, 'helix-mcp'));
chmodSync(join(bin, 'helix-mcp'), 0o755);

step(`Stage scientific library from ${sourceData}`);
const library = join(out, 'library');
const catalogSource = join(sourceData, 'catalog.sqlite');
if (!existsSync(catalogSource)) throw new Error(`No catalog at ${catalogSource}`);
const sourceMtime = statSync(catalogSource).mtimeMs;
const stamp = join(library, 'library.json');
const fresh = existsSync(stamp) && JSON.parse(readFileSync(stamp, 'utf8')).sourceMtime === sourceMtime && !args.has('--restage-library');
if (fresh) console.log('  library unchanged since last staging; reusing');
else {
    rmSync(library, { recursive: true, force: true });
    mkdirSync(library, { recursive: true });
    const source = new DatabaseSync(catalogSource, { readOnly: true });
    const sourceCount = source.prepare('SELECT count(*) AS n FROM assets').get().n;
    source.exec(`VACUUM INTO '${join(library, 'catalog.sqlite').replaceAll("'", "''")}'`);
    source.close();
    const copy = new DatabaseSync(join(library, 'catalog.sqlite'));
    const integrity = copy.prepare('PRAGMA integrity_check').get().integrity_check;
    const copyCount = copy.prepare('SELECT count(*) AS n FROM assets').get().n;
    copy.exec('PRAGMA journal_mode=DELETE');
    copy.close();
    if (integrity !== 'ok' || copyCount !== sourceCount) throw new Error(`Catalog copy failed verification (integrity=${integrity}, ${copyCount}/${sourceCount} assets)`);
    console.log(`  catalog: ${copyCount} assets, integrity ${integrity}`);
    for (const dir of ['assets', 'thumbnails', 'licenses'])
        if (existsSync(join(sourceData, dir))) run('/bin/cp', ['-cR', join(sourceData, dir), join(library, dir)]); // APFS clones
    writeFileSync(stamp, JSON.stringify({ version, assets: copyCount, sourceMtime, stagedAt: new Date().toISOString() }, null, 2));
}
if (args.has('--stage')) process.exit(0);

step('App icon');
const icon = join(out, 'icon');
mkdirSync(join(icon, 'Helix.iconset'), { recursive: true });
run(electronBin, [join(root, 'desktop/tools/render-icon.cjs'), join(root, 'desktop/icon.svg'), join(icon, 'icon-1024.png')], { stdio: 'ignore' });
for (const size of [16, 32, 128, 256, 512]) {
    run('/usr/bin/sips', ['-z', String(size), String(size), join(icon, 'icon-1024.png'), '--out', join(icon, 'Helix.iconset', `icon_${size}x${size}.png`)], { stdio: 'ignore' });
    run('/usr/bin/sips', ['-z', String(size * 2), String(size * 2), join(icon, 'icon-1024.png'), '--out', join(icon, 'Helix.iconset', `icon_${size}x${size}@2x.png`)], { stdio: 'ignore' });
}
run('/usr/bin/iconutil', ['-c', 'icns', join(icon, 'Helix.iconset'), '-o', join(icon, 'Helix.icns')]);

step(`Package Helix.app with Electron ${electronVersion} (arm64)`);
const { packager } = await import('@electron/packager');
const release = join(out, 'release');
run('/bin/rm', ['-rf', release]); // fs.rmSync races Spotlight on large trees
const [appDir] = await packager({
    dir: app, out: release, name: 'Helix', executableName: 'Helix', platform: 'darwin', arch: 'arm64',
    electronVersion, appVersion: version, buildVersion: version, appBundleId: 'app.helix.editor',
    appCategoryType: 'public.app-category.graphics-design', appCopyright: 'Helix contributors. Scientific assets remain under their individual licenses.',
    icon: join(icon, 'Helix.icns'), asar: false, prune: false, overwrite: true, quiet: true,
    extraResource: [library, bin],
    extendInfo: { LSMinimumSystemVersion: '12.0', NSHighResolutionCapable: true, LSApplicationCategoryType: 'public.app-category.graphics-design' },
});
const bundle = join(appDir, 'Helix.app');

step('Ad-hoc code signature (not Developer ID, not notarized)');
run('/usr/bin/find', [bundle, '-name', '.DS_Store', '-delete']);
run('/usr/bin/xattr', ['-cr', bundle]); // codesign rejects Finder/provenance metadata inherited from source files
run('/usr/bin/codesign', ['--force', '--deep', '--sign', '-', '--timestamp=none', bundle]);
run('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle]);
console.log(`\n✓ ${bundle}`);

if (args.has('--dmg')) {
    step('Disk image');
    const dmgRoot = join(out, 'dmg-root');
    rmSync(dmgRoot, { recursive: true, force: true });
    mkdirSync(dmgRoot);
    run('/bin/cp', ['-cR', bundle, join(dmgRoot, 'Helix.app')]);
    run('/bin/ln', ['-s', '/Applications', join(dmgRoot, 'Applications')]);
    const dmg = join(out, `Helix-${version}-arm64.dmg`);
    rmSync(dmg, { force: true });
    run('/usr/bin/hdiutil', ['create', '-volname', 'Helix', '-srcfolder', dmgRoot, '-fs', 'APFS', '-format', 'ULFO', '-ov', dmg]);
    rmSync(dmgRoot, { recursive: true, force: true });
    console.log(`\n✓ ${dmg}`);
}
