// Copies documents from the development data directory into Helix.app's data directory.
// Never overwrites or deletes; existing ids in the app are skipped. Run while Helix.app is not running.
//   node scripts/migrate-documents.mjs [sourceDataDir]
import { readdirSync, readFileSync, existsSync, copyFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

const source = join(resolve(process.argv[2] ?? join(import.meta.dirname, '..', 'data')), 'documents');
const appData = join(homedir(), 'Library', 'Application Support', 'Helix');
const target = join(appData, 'data', 'documents');
if (existsSync(join(appData, 'runtime.json'))) {
    console.error('Helix.app appears to be running (runtime.json exists). Quit Helix and retry; the service must be the only writer.');
    process.exit(1);
}
mkdirSync(target, { recursive: true });
let copied = 0, skipped = 0;
for (const file of readdirSync(source).filter(f => /^[0-9a-f-]{36}\.json$/.test(f))) {
    const record = JSON.parse(readFileSync(join(source, file), 'utf8'));
    if (!record?.document?.id || `${record.document.id}.json` !== file) { console.warn(`skip ${file}: not a Helix document record`); skipped++; continue; }
    if (existsSync(join(target, file))) { skipped++; continue; }
    copyFileSync(join(source, file), join(target, file));
    console.log(`copied ${record.document.title} (r${record.document.revision})`);
    copied++;
}
console.log(`${copied} copied, ${skipped} skipped → ${target}`);
