import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sanitizeSvg } from '../src/assets/sanitize.ts';
import { Catalog } from '../src/assets/catalog.ts';
import { importDirectory } from '../src/assets/importer.ts';
import { exportSvg } from '../src/core/render.ts';
import { createDocument, applyCommands, nodeSchema } from '../src/core/model.ts';
const valid = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><title>Organelle</title><circle cx="50" cy="50" r="40" fill="#abc"/></svg>';
const manifest = { version: 1, provider: 'Original test artwork', license: 'CC0-1.0', licenseReference: 'Authored locally for tests', defaults: { category: 'Cell structures', tags: ['mitochondrion', 'energy'] } };
describe('SVG validation and sanitization', () => {
    it('extracts metadata and rejects dangerous content', () => { const s = sanitizeSvg(valid); assert.equal(s.title, 'Organelle'); assert.equal(s.width, 100); for (const fragment of ['<foreignObject/>', '<image href="https://example.com/a.png"/>', '<style>@import url(https://example.com)</style>', '<rect fill="url(https://example.com/a.svg)"/>', '<rect style="fill:u\\72l(https://evil.invalid)"/>'])
        assert.throws(() => sanitizeSvg(valid.replace('<title>Organelle</title>', fragment))); // A constant internal entity subset is expanded, not refused; every way of abusing one still is.
        assert.ok(sanitizeSvg('<!DOCTYPE svg [<!ENTITY ns_svg "http://www.w3.org/2000/svg">]>' + valid.replace('xmlns="http://www.w3.org/2000/svg"', 'xmlns="&ns_svg;"')).svg.includes('<svg'));
        assert.throws(() => sanitizeSvg('<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]>' + valid), /External entities/);
        assert.throws(() => sanitizeSvg('<!DOCTYPE svg [<!ENTITY % p "x">]>' + valid), /Parameter entities/);
        assert.throws(() => sanitizeSvg('<!DOCTYPE svg [<!ENTITY a "&b;&b;"><!ENTITY b "yy">]>' + valid), /Unsupported entity value/);
        assert.throws(() => sanitizeSvg('<!DOCTYPE svg [<!ENTITY a "x">]>' + valid.replace('<title>', '&undeclared;<title>')), /Undeclared entity/); assert.throws(() => sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><g></svg>')); assert.throws(() => sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"/>')); });
    it('retains safe gradients and local references', () => { const s = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><rect width="80" height="80" style="fill:url(#g);stroke:#abc"/></svg>'); assert.ok(s.svg.includes('fill="url(#g)"')); assert.throws(() => sanitizeSvg(valid.replace('fill="#abc"', 'fill="url(#absent)"'))); });
});
describe('bulk local importer and indexed catalog', () => {
    it('deduplicates, records provenance, generates thumbnails, and inserts vectors', async () => { const root = mkdtempSync(join(tmpdir(), 'helix-import-')), input = join(root, 'input'); mkdirSync(input); writeFileSync(join(input, 'a.svg'), valid); writeFileSync(join(input, 'duplicate.svg'), valid); writeFileSync(join(input, 'unsafe.svg'), valid.replace('<circle', '<foreignObject/><circle')); symlinkSync(join(input, 'a.svg'), join(input, 'ignored.svg')); const c = new Catalog(join(root, 'data')); try {
        const r = await importDirectory(input, c, manifest);
        assert.equal(r.scanned, 3);
        assert.equal(r.imported, 1);
        assert.equal(r.duplicates, 1);
        assert.equal(r.rejected, 1);
        const asset = c.search('mitochondria').items.find(a => a.id.startsWith('asset-'))!;
        assert.ok(asset);
        assert.equal(c.provenance(asset.id).length, 2);
        const icon = c.get(asset.id);
        assert.ok(icon.svg.includes('<circle'));
        assert.ok(readFileSync(join(root, 'data', 'thumbnails', asset.id.slice(6) + '.svg'), 'utf8').includes('width="128"'));
        const doc = applyCommands(createDocument('demo', 'Imported'), [{ type: 'add', node: nodeSchema.parse({ id: 'imported', type: 'icon', name: icon.name, iconId: icon.id }) }]);
        assert.ok(exportSvg(doc, id => c.get(id)).includes('<circle'));
        const repeated = await importDirectory(input, c, manifest);
        assert.equal(repeated.imported, 0);
        assert.equal(repeated.duplicates, 2);
    }
    finally {
        c.close();
    } });
    it('requires provenance and license metadata', async () => { const root = mkdtempSync(join(tmpdir(), 'helix-license-')), c = new Catalog(root); try {
        await assert.rejects(importDirectory(root, c, { version: 1 }));
    }
    finally {
        c.close();
    } });
    it('paginates originals and imported items without dropping rows', () => { const root = mkdtempSync(join(tmpdir(), 'helix-page-')), c = new Catalog(root); try {
        for (let i = 0; i < 12; i++)
            c.add(valid.replace('r="40"', `r="${i + 1}"`), { name: `Original ${i}`, category: 'Tests', tags: ['cell'], description: 'test', viewBox: '0 0 100 100', license: 'CC0', provider: 'Tests', sourceFile: `${i}.svg`, sourceHash: String(i) });
        let offset = 0, ids: string[] = [];
        for (let page = 0; page < 20; page++) {
            const r = c.search('', 4, offset);
            ids.push(...r.items.map(i => i.id));
            if (r.nextOffset === null)
                break;
            offset = r.nextOffset;
        }
        assert.equal(ids.length, 18);
        assert.equal(new Set(ids).size, 18);
    }
    finally {
        c.close();
    } });
});
