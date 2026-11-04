// Library search tuned for figure making: the plain FTS ranking happily returns a black PhyloPic
// silhouette or a "Damaged mitochondria" variant for "mitochondria". Here candidates are re-ranked by
// name fit, provider style, quality grade and colourfulness, and their real (tight) bounds are
// measured once in Chromium and cached, so illustrations line up by what is drawn, not by padding.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { applySvgPalette } from '../core/svg-elements.ts';
import { harmonizeColorMap } from '../core/style.ts';

export type AssetCandidate = { id: string; name: string; provider: string; category: string; quality: string; vectors: number; viewBox: string; score: number };
export type ResolvedAsset = { id: string; name: string; provider: string; svg: string; box: { x: number; y: number; w: number; h: number }; attribution?: string };
export interface AssetBackend {
    db: DatabaseSync;
    get(id: string): { svg: string; viewBox: string; name: string; provider: string; license: string; author?: string; attribution?: string };
}
export type Measurer = (svg: string, width: number, height: number) => Promise<{ measurements: Array<{ id: string; local: { x: number; y: number; width: number; height: number } }> }>;

const PROVIDER_BONUS: Record<string, number> = {
    'NIH BioArt Source': 3.2, 'Bioicons': 2.6, 'Togo Picture Gallery': 1.6, 'SciDraw': 1.4, 'Reactome': 1.0, 'SciSVG': 1.0,
    'Health Icons': -2.5, 'PhyloPic': -3.5, 'Helix original local samples': -4, 'SciDraw ': 0, 'Helix original test collection': -4,
};
const ORGANISM_HINT = /\b(mouse|mice|rat|zebrafish|fly|drosophila|worm|elegans|monkey|primate|pig|dog|cat|frog|xenopus|chicken|plant|arabidopsis|fish|bird|horse|cow|sheep|rabbit|bat|tree|insect|mosquito|tick)\b/i;
const STOP = new Set(['a', 'an', 'the', 'of', 'and', 'with', 'in', 'on', 'for', 'to', 'cell', 'cells']);

function tokens(q: string) { return q.toLowerCase().replace(/[^a-z0-9+ -]/g, ' ').split(/[\s-]+/).filter(Boolean); }

export class AssetResolver {
    backend: AssetBackend;
    cachePath?: string;
    measurer?: Measurer;
    private bbox: Record<string, [number, number, number, number]> = {};
    private dirty = false;
    constructor(backend: AssetBackend, opts: { cachePath?: string; measurer?: Measurer } = {}) {
        this.backend = backend; this.cachePath = opts.cachePath; this.measurer = opts.measurer;
        if (this.cachePath && existsSync(this.cachePath)) { try { this.bbox = JSON.parse(readFileSync(this.cachePath, 'utf8')); } catch { this.bbox = {}; } }
    }

    search(query: string, limit = 8): AssetCandidate[] {
        const toks = tokens(query);
        if (!toks.length) return [];
        const run = (match: string) => {
            try {
                return this.backend.db.prepare(`SELECT a.id, a.name, a.provider, a.category, a.viewBox, s.quality AS quality,
                    json_extract(s.metadata,'$.vectors') AS vectors, bm25(asset_search, 0.0, 10.0, 1.0, 3.0, 1.0) AS rank
                    FROM asset_search JOIN assets a ON a.id = asset_search.id LEFT JOIN asset_science s ON s.assetId = a.id
                    WHERE asset_search MATCH ? AND a.provider != 'Helix figure engine' ORDER BY rank LIMIT 250`).all(match) as any[];
            } catch { return []; }
        };
        const q = (t: string) => `"${t.replace(/"/g, '')}"*`, qx = (t: string) => `"${t.replace(/"/g, '')}"`;
        // Whole-word matches first ("colon" must not become "colony"); prefixes only as a fallback.
        let rows = run(toks.map(qx).join(' AND '));
        if (rows.length < 3) rows = rows.concat(run(toks.map(q).join(' AND ')));
        const content = toks.filter(t => !STOP.has(t));
        if (rows.length < 3 && content.length > 1) rows = rows.concat(run(content.map(q).join(' OR ')));
        const organism = ORGANISM_HINT.test(query);
        const seen = new Set<string>();
        const scored = rows.filter(r => !seen.has(r.id) && seen.add(r.id)).map(r => {
            const nameToks = tokens(r.name);
            const hits = content.filter(t => nameToks.some(n => n.startsWith(t) || t.startsWith(n))).length;
            const extra = Math.max(0, nameToks.filter(n => !STOP.has(n)).length - hits);
            const exact = r.name.toLowerCase().trim() === query.toLowerCase().trim() ? 6 : 0;
            let score = -r.rank * 0.6 + hits * 3 + exact - extra * 1.3;
            score += PROVIDER_BONUS[r.provider] ?? 0;
            if (organism && r.provider === 'PhyloPic') score += 3.5;
            score += r.quality === 'A' ? 2 : r.quality === 'B' ? 1 : 0;
            // How much is actually drawn separates an illustration from a flat two-shape pictogram,
            // and predicts figure quality better than anything else available here.
            const vectors = Number(r.vectors ?? 0);
            score += vectors >= 120 ? 4 : vectors >= 40 ? 3 : vectors >= 18 ? 1.5 : vectors >= 10 ? -1 : -3;
            const [, , w, h] = String(r.viewBox).split(/[ ,]+/).map(Number);
            if (w && h && Math.max(w / h, h / w) > 3.5) score -= 2.5;
            if (/\b(damaged|mutant|broken|dead|outline|silhouette|icon|logo|label|text)\b/i.test(r.name) && !/damaged|mutant|dead/i.test(query)) score -= 2;
            return { id: r.id, name: r.name, provider: r.provider, category: r.category, quality: r.quality ?? 'C', vectors, viewBox: r.viewBox, score };
        }).sort((a, b) => b.score - a.score);
        // Colourfulness re-rank for the head of the list (needs the file, so only a few).
        for (const c of scored.slice(0, 14)) {
            try {
                const svg = this.backend.get(c.id).svg;
                const colors = new Set((svg.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|rgb\([^)]*\)/g) ?? []).map(s => s.toLowerCase()));
                c.score += colors.size >= 4 ? 1.8 : colors.size >= 2 ? 0.5 : -2.2;
                if (svg.length > 900_000) c.score -= 3;
            } catch { c.score -= 10; }
        }
        return scored.sort((a, b) => b.score - a.score).slice(0, limit);
    }

    /** Resolve an explicit id or a search query to one asset. */
    pick(ref: { id?: string; query?: string; pick?: number }): AssetCandidate | undefined {
        if (ref.id) { const a = this.backend.get(ref.id); return { id: ref.id, name: a.name, provider: a.provider, category: '', quality: '', vectors: 0, viewBox: a.viewBox, score: 0 }; }
        if (!ref.query) return undefined;
        const res = this.search(ref.query, Math.max(8, (ref.pick ?? 0) + 1));
        return res[Math.min(ref.pick ?? 0, res.length - 1)];
    }

    /** Measures tight drawing bounds for assets not yet in the cache (one Chromium round trip). */
    async ensureBounds(ids: string[]) {
        const todo = [...new Set(ids)].filter(id => !this.bbox[id]);
        if (!todo.length || !this.measurer) return;
        let x = 0; const parts: string[] = [];
        const places: Record<string, [number, number, number, number]> = {};
        for (const id of todo) {
            const { svg } = this.backend.get(id);
            const vb = viewBoxOf(svg);
            const inner = innerSvg(svg);
            places[id] = vb;
            parts.push(`<svg x="${x}" y="0" width="${vb[2]}" height="${vb[3]}" viewBox="${vb.join(' ')}" overflow="visible"><g data-object-id="${id}">${prefixIds(inner, 'm' + parts.length)}</g></svg>`);
            x += vb[2] + 20;
        }
        const H = Math.max(...Object.values(places).map(v => v[3]));
        const doc = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${x} ${H}" width="${x}" height="${H}">${parts.join('')}</svg>`;
        try {
            const { measurements } = await this.measurer(doc, Math.min(4000, Math.max(50, x / 10)), Math.min(4000, Math.max(50, H / 10)));
            for (const m of measurements) if (places[m.id] && m.local.width > 0 && m.local.height > 0) { this.bbox[m.id] = [m.local.x, m.local.y, m.local.width, m.local.height]; this.dirty = true; }
        } catch { /* fall back to viewBox */ }
        this.save();
    }
    save() { if (this.dirty && this.cachePath) { try { writeFileSync(this.cachePath, JSON.stringify(this.bbox)); this.dirty = false; } catch { /* read-only */ } } }

    /** Returns renderable SVG body + tight box; optional hue harmonisation. */
    load(id: string, opts: { hue?: string } = {}): ResolvedAsset {
        const a = this.backend.get(id);
        let svg = a.svg;
        if (opts.hue) { try { svg = applySvgPalette(svg, harmonizeColorMap(svg, opts.hue)); } catch { /* keep original */ } }
        const vb = viewBoxOf(a.svg);
        const t = this.bbox[id];
        // Pad by ~2% for strokes, which getBBox ignores.
        const box = t ? (() => { const p = Math.max(t[2], t[3]) * 0.02; return { x: t[0] - p, y: t[1] - p, w: t[2] + 2 * p, h: t[3] + 2 * p }; })() : { x: vb[0], y: vb[1], w: vb[2], h: vb[3] };
        const attribution = [a.name, a.author, a.provider, a.license].filter(Boolean).join(' · ');
        return { id, name: a.name, provider: a.provider, svg: innerSvg(svg), box, attribution };
    }
}

export function viewBoxOf(svg: string): [number, number, number, number] {
    const m = svg.match(/viewBox\s*=\s*"([^"]+)"/);
    if (m) { const v = m[1].trim().split(/[\s,]+/).map(Number); if (v.length === 4 && v.every(Number.isFinite) && v[2] > 0 && v[3] > 0) return v as any; }
    const w = parseFloat(svg.match(/\bwidth\s*=\s*"([\d.]+)/)?.[1] ?? '100'), h = parseFloat(svg.match(/\bheight\s*=\s*"([\d.]+)/)?.[1] ?? '100');
    return [0, 0, w || 100, h || 100];
}
/** Contents of the root <svg> element (keeps <defs>, <style> etc.). */
export function innerSvg(svg: string) {
    const start = svg.indexOf('>', svg.search(/<svg[\s>]/)) + 1, end = svg.lastIndexOf('</svg>');
    return start > 0 && end > start ? svg.slice(start, end) : svg;
}
export function prefixIds(svg: string, prefix: string) {
    return svg.replace(/\bid="([^"]+)"/g, (_, id) => `id="${prefix}-${id}"`)
        .replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${prefix}-${id})`)
        .replace(/\b(xlink:)?href="#([^"]+)"/g, (_, x, id) => `${x ?? ''}href="#${prefix}-${id}"`);
}
