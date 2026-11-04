// MCP tools for the figure engine (generate_figure, find_visual, list_figure_vocabulary).
import { z } from 'zod';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { figureSchema } from '../engine/spec.ts';
import { generateFigure } from '../engine/compose.ts';
import { AssetResolver, prefixIds } from '../engine/assets.ts';
import { splitParts, buildDocument, type Box } from '../engine/document.ts';
import { GENERATE_DESCRIPTION, vocabulary } from '../engine/guide.ts';
import { lookupGlyph, drawGlyph } from '../engine/glyphs/index.ts';
import { Defs, text, el, g, f } from '../engine/svg.ts';
import { rasterizeSvg } from './figure-renderer.ts';
import { nodeSchema } from '../core/model.ts';
import type { Store } from './store.ts';
import type { Catalog } from '../assets/catalog.ts';

let resolverCache: { catalog: Catalog; resolver: AssetResolver } | undefined;
function resolverFor(catalog: Catalog) {
    if (resolverCache?.catalog !== catalog) resolverCache = { catalog, resolver: new AssetResolver(catalog as any, { cachePath: join(catalog.directory, 'engine-asset-bounds.json'), measurer: rasterizeSvg }) };
    return resolverCache.resolver;
}

export const engineToolDefinitions = {
    generate_figure: {
        description: GENERATE_DESCRIPTION,
        schema: z.object({
            spec: figureSchema.describe('The figure description (see tool description; examples via list_figure_vocabulary).'),
            outputDir: z.string().max(500).optional().describe('Folder for the SVG/PNG files. Default ~/Documents/Helix Figures.'),
            fileName: z.string().max(120).regex(/^[\w .()-]+$/).optional().describe('Base file name without extension.'),
            exportScale: z.number().min(1).max(6).default(3).describe('PNG export scale (3 ≈ 300 dpi at journal column size).'),
            editable: z.boolean().default(true).describe('Also create an editable Helix document (each element a separate object).'),
            replaceDocumentId: z.string().max(100).optional().describe('Update this previously generated document in place instead of creating a new one.'),
            background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#FFFFFF'),
        }).strict(),
        readOnly: false,
    },
    find_visual: {
        description: 'Preview what a visual name resolves to before using it in generate_figure: returns an image contact sheet with the procedural glyph (if any) and the best library illustrations, each with its asset id and the {"search":…, "pick":n} or {"asset":id} reference to use. Read-only.',
        schema: z.object({ query: z.string().min(1).max(120), limit: z.number().int().min(1).max(12).default(8) }).strict(),
        readOnly: true,
    },
    list_figure_vocabulary: {
        description: 'Full vocabulary for generate_figure: layouts, every procedural glyph (with aliases, variants and default colours), colour names, inline text markup and complete example specs for each layout. Read-only; call once before writing your first spec.',
        schema: z.object({}).strict(),
        readOnly: true,
    },
};

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'figure';
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
const cleanSvg = (svg: string) => svg.replace(/ data-(part|name|object-id)="[^"]*"/g, '');

export async function executeEngineTool(name: string, args: any, store: Store, catalog: Catalog): Promise<unknown> {
    if (name === 'list_figure_vocabulary') return vocabulary();
    if (name === 'find_visual') return findVisual(args, catalog);
    // generate_figure
    const resolver = resolverFor(catalog);
    const r = await generateFigure(args.spec, { resolver, background: args.background });
    const svg = cleanSvg(r.svg);
    const title = r.spec.title ?? (r.spec.type === 'panels' ? 'Multi-panel figure' : `${r.spec.type[0].toUpperCase()}${r.spec.type.slice(1)} figure`);
    const dir = args.outputDir ? (isAbsolute(args.outputDir) ? args.outputDir : resolve(homedir(), args.outputDir.replace(/^~\/?/, ''))) : join(homedir(), 'Documents', 'Helix Figures');
    mkdirSync(dir, { recursive: true });
    const base = join(dir, args.fileName ?? `${slug(title)}-${stamp()}`);
    writeFileSync(base + '.svg', svg);
    const maxSide = 9000, scale = Math.min(args.exportScale, maxSide / r.width, maxSide / r.height);
    const hi = await rasterizeSvg(svg, r.width * scale, r.height * scale);
    writeFileSync(base + '.png', hi.png);
    const pScale = Math.min(1.25, 1568 / Math.max(r.width, r.height));
    const preview = await rasterizeSvg(svg, r.width * pScale, r.height * pScale);
    const credits = r.credits.map(c => c.credit);
    if (credits.length) writeFileSync(base + '.credits.txt', `Illustration credits for ${title}\n\n` + credits.map(c => '• ' + c).join('\n') + '\n\nProcedural glyphs, layout, arrows and text: Helix figure engine (original).\n');
    let document: unknown;
    if (args.editable) {
        try {
            const split = splitParts(r.svg);
            const measured = await rasterizeSvg(split.marked, Math.min(r.width, 4000), Math.min(r.height, 4000) * (Math.min(r.width, 4000) / r.width));
            const boxes = new Map<string, Box>(measured.measurements.map(m => [m.id, m.world]));
            document = buildDocument({
                addAsset: (s, meta) => catalog.add(s, meta).id,
                createDocument: (t, w, h, nodes, existing) => {
                    const ops = nodes.map(n => ({ type: 'add', node: nodeSchema.parse({ ...n, parentId: null }) }));
                    if (existing) {
                        const cur = store.read(existing).document;
                        const del = cur.roots.map(id => ({ type: 'delete', id }));
                        const d = store.mutate(existing, [...del, ...ops]);
                        if (d.width !== w || d.height !== h) { const rec = store.read(existing); store.replace(existing, { ...rec.document, width: w, height: h, title: t }); }
                        const fin = store.read(existing).document; return { id: fin.id, revision: fin.revision };
                    }
                    const doc = store.create(t, w, h, randomUUID());
                    const d = store.mutate(doc.id, ops);
                    return { id: d.id, revision: d.revision };
                },
            }, title, split, boxes, { license: credits.length ? 'Mixed: see figure credits' : 'Original (Helix figure engine)', existingId: args.replaceDocumentId });
        } catch (e) { document = { error: `Editable document not created: ${(e as Error).message}` }; }
    }
    return {
        title, width: r.width, height: r.height,
        files: { svg: base + '.svg', png: base + '.png', pngScale: Math.round(scale * 100) / 100, ...(credits.length ? { credits: base + '.credits.txt' } : {}) },
        document,
        warnings: r.warnings,
        credits: credits.slice(0, 25),
        review: 'Inspect the image: are labels accurate and concise, is anything mis-drawn, unbalanced or ambiguous? Refine the spec and call again with replaceDocumentId to update the same document.',
        image: { type: 'image' as const, mimeType: 'image/png' as const, data: preview.png.toString('base64') },
    };
}

async function findVisual(args: { query: string; limit: number }, catalog: Catalog) {
    const resolver = resolverFor(catalog);
    const hit = lookupGlyph(args.query);
    const cands = resolver.search(args.query, args.limit);
    await resolver.ensureBounds(cands.map(c => c.id));
    const defs = new Defs('fv');
    const cw = 190, ch = 190, cells: string[] = [];
    const items: Array<Record<string, unknown>> = [];
    let i = 0;
    const cell = (draw: (cx: number, cy: number) => string, title: string, sub: string) => {
        const x = (i % 4) * cw, y = Math.floor(i / 4) * ch; i++;
        cells.push(g(el('rect', { x: 4, y: 4, width: cw - 8, height: ch - 8, rx: 8, fill: '#fff', stroke: '#dfe4ea' }) + draw(cw / 2, 78) + text(title, cw / 2, 146, { size: 12, weight: 700, anchor: 'middle' }) + text(sub, cw / 2, 163, { size: 10, anchor: 'middle', color: '#667' }), { transform: `translate(${x} ${y})` }));
    };
    if (hit) {
        const out = drawGlyph(defs, hit.def, { variant: hit.variant, seed: 'fv' });
        const s = Math.min(150 / out.w, 120 / out.h, 1.6);
        cell((cx, cy) => g(out.svg, { transform: `translate(${f(cx - out.w * s / 2)} ${f(cy - out.h * s / 2)}) scale(${f(s)})` }), `glyph: ${hit.def.name}`, 'procedural (used by default)');
        items.push({ ref: hit.variant ? { glyph: hit.def.name, variant: hit.variant } : `glyph:${hit.def.name}`, kind: 'glyph', name: hit.def.name, variants: hit.def.variants, description: hit.def.description });
    }
    cands.forEach((c, k) => {
        const a = resolver.load(c.id), s = Math.min(150 / a.box.w, 120 / a.box.h);
        cell((cx, cy) => `<svg x="${f(cx - a.box.w * s / 2)}" y="${f(cy - a.box.h * s / 2)}" width="${f(a.box.w * s)}" height="${f(a.box.h * s)}" viewBox="${a.box.x} ${a.box.y} ${a.box.w} ${a.box.h}">${prefixIds(a.svg, 'c' + k)}</svg>`, `#${k} ${c.name.slice(0, 24)}`, c.provider.slice(0, 26));
        items.push({ ref: { search: args.query, pick: k }, asset: c.id, name: c.name, provider: c.provider, quality: c.quality });
    });
    const W = Math.min(4, i) * cw, H = Math.ceil(i / 4) * ch;
    if (!i) return { query: args.query, matches: [], note: 'Nothing found. Try a simpler or different noun.' };
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${defs.render()}<rect width="${W}" height="${H}" fill="#f4f6f8"/>${cells.join('')}</svg>`;
    const { png } = await rasterizeSvg(svg, W, H);
    return { query: args.query, matches: items, image: { type: 'image' as const, mimeType: 'image/png' as const, data: png.toString('base64') } };
}
