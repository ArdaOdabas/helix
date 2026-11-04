import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Catalog } from './catalog.ts';
import { importDirectory, parseManifest } from './importer.ts';
const [input, manifestPath, dataPath = process.env.FIGURE_DATA_DIR || 'data'] = process.argv.slice(2);
if (!input) {
    console.error('Usage: npm run import:assets -- LOCAL_DIRECTORY [MANIFEST.json|MANIFEST.csv] [DATA_DIRECTORY]');
    process.exit(1);
}
const c = new Catalog(resolve(dataPath));
try {
    const report = await importDirectory(input, c, manifestPath && manifestPath !== '-' ? parseManifest(await readFile(manifestPath, 'utf8'), manifestPath) : undefined);
    console.log(JSON.stringify(report, null, 2));
    if (report.rejected)
        process.exitCode = 2;
}
finally {
    c.close();
}
