import { Catalog } from '../src/assets/catalog.ts';
import { sanitizeSvg } from '../src/assets/sanitize.ts';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const count = Number(process.argv[2] ?? 10000);
if (!Number.isInteger(count) || count < 1 || count > 100000)
    throw new Error('Count must be 1..100000');
const root = mkdtempSync(join(tmpdir(), 'helix-scale-')), c = new Catalog(root), start = performance.now();
try {
    for (let i = 0; i < count; i++) {
        const raw = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 10L${10 + i / 1000} 90L90 20Z" fill="#49765d"/></svg>`;
        const cleaned = sanitizeSvg(raw);
        c.add(cleaned.svg, { name: `Synthetic scale fixture ${i}`, category: i % 2 ? 'Proteins' : 'Cell structures', tags: ['scale', 'organelle', `fixture${i}`], description: 'Synthetic original geometry, not provider content.', viewBox: cleaned.viewBox, license: 'CC0-1.0', provider: 'Helix benchmark', sourceFile: `${i}.svg`, sourceHash: String(i) });
    }
    const elapsed = performance.now() - start, t = performance.now(), r = c.search('fixture9999', 30);
    console.log(JSON.stringify({ syntheticAssets: count, importMs: Math.round(elapsed), queryMs: Math.round((performance.now() - t) * 100) / 100, queryResults: r.items.length, catalogCount: c.count() }, null, 2));
}
finally {
    c.close();
    rmSync(root, { recursive: true, force: true });
}
