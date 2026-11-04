// Entry point: figure spec -> finished publication SVG. Two passes: a dry run discovers which
// library illustrations are needed (so their real bounds can be measured in one browser call),
// then the real layout runs with exact sizes.
import { figureSchema, type FigureSpec, type LeafSpec } from './spec.ts';
import { Defs, el, g, f, text, wrap, textWidth, textBlockHeight, INK, FONT, roundRect } from './svg.ts';
import { resolveVisual } from './visual.ts';
import { arrow } from './connectors.ts';
import { resolveColor, HUES, tone } from './color.ts';
import type { AssetResolver } from './assets.ts';
import type { Block, Ctx } from './layouts/common.ts';
import { workflow } from './layouts/workflow.ts';
import { pathway } from './layouts/pathway.ts';
import { comparison, cycle, zoom } from './layouts/others.ts';

export type GenerateOptions = { resolver?: AssetResolver; maxWidth?: number; background?: string };
export type GenerateResult = { svg: string; width: number; height: number; warnings: string[]; credits: Array<{ id: string; credit: string }>; assetIds: string[]; spec: FigureSpec };

const PAD = 34;

function renderLeaf(ctx: Ctx, spec: LeafSpec): Block {
    switch (spec.type) {
        case 'workflow': return workflow(ctx, spec);
        case 'pathway': return pathway(ctx, spec);
        case 'comparison': return comparison(ctx, spec);
        case 'cycle': return cycle(ctx, spec);
        case 'zoom': return zoom(ctx, spec);
    }
}

function legend(ctx: Ctx, items: NonNullable<FigureSpec['legend']>, maxW: number): Block {
    const parts: Array<{ w: number; svg: (x: number, y: number) => string }> = [];
    for (const it of items) {
        const tw = textWidth(it.label, 11.5);
        if (it.line) {
            parts.push({ w: 40 + tw, svg: (x, y) => arrow({ x, y: y + 8 }, { x: x + 30, y: y + 8 }, { kind: it.line as any, width: 1.8 }).svg + text(it.label, x + 38, y + 8, { size: 11.5, baseline: 'middle', color: INK.text }) });
        } else if (it.visual) {
            const d = resolveVisual(ctx, it.visual as any, { color: it.color });
            parts.push({
                w: 30 + tw, svg: (x, y) => {
                    if (!d) return '';
                    const s = Math.min(22 / d.w, 22 / d.h);
                    return d.draw(x + 11 - d.w * s / 2, y + 8 - d.h * s / 2, s) + text(it.label, x + 28, y + 8, { size: 11.5, baseline: 'middle', color: INK.text });
                }
            });
        } else {
            const t = tone(resolveColor(it.color, HUES.gray));
            parts.push({ w: 24 + tw, svg: (x, y) => el('rect', { x, y: y + 2, width: 14, height: 12, rx: 3, fill: t.base, stroke: t.stroke, 'stroke-width': 1 }) + text(it.label, x + 21, y + 8, { size: 11.5, baseline: 'middle', color: INK.text }) });
        }
    }
    let x = 0, y = 0, svg = '', W = 0;
    for (const p of parts) {
        if (x > 0 && x + p.w > maxW) { x = 0; y += 22; }
        svg += p.svg(x, y); x += p.w + 22; W = Math.max(W, x - 22);
    }
    return { w: W, h: y + 18, svg };
}

function panels(ctx: Ctx, spec: Extract<FigureSpec, { type: 'panels' }>): Block {
    const n = spec.panels.length, cols = Math.min(n, spec.columns ?? (n <= 2 ? n : n === 4 ? 2 : Math.min(3, n)));
    const gapX = 44, gapY = 40, colW = (ctx.maxWidth - gapX * (cols - 1)) / cols;
    const blocks = spec.panels.map(p => {
        const b = renderLeaf({ ...ctx, maxWidth: colW }, p as LeafSpec);
        const s = Math.min(1, colW / b.w);
        return { b, s, title: p.title, subtitle: p.subtitle, legend: p.legend };
    });
    const rows: typeof blocks[] = [];
    for (let i = 0; i < n; i += cols) rows.push(blocks.slice(i, i + cols));
    let y = 0, svg = '';
    const letters = spec.letters !== false;
    const W = cols * colW + (cols - 1) * gapX;
    rows.forEach((row, r) => {
        const headH = Math.max(...row.map(p => (p.title || letters ? 24 : 0) + (p.subtitle ? textBlockHeight(wrap(p.subtitle, 12, colW - 26).length, 12) + 4 : 0)));
        const bodyH = Math.max(...row.map(p => p.b.h * p.s));
        const legH = Math.max(0, ...row.map(p => p.legend?.length ? legend(ctx, p.legend, colW).h + 14 : 0));
        row.forEach((p, k) => {
            const x = k * (colW + gapX), idx = r * cols + k;
            if (letters) svg += text(String.fromCharCode(97 + idx), x, y, { size: 19, weight: 800, color: INK.text });
            if (p.title) svg += text(p.title, x + (letters ? 22 : 0), y + 2, { size: 15, weight: 700, color: INK.text });
            if (p.subtitle) svg += text(wrap(p.subtitle, 12, colW - 26), x + (letters ? 22 : 0), y + 24, { size: 12, color: INK.muted });
            const bx = x + (colW - p.b.w * p.s) / 2, by = y + headH + 14;
            svg += g(p.b.svg, { transform: p.s === 1 ? `translate(${f(bx)} ${f(by)})` : `translate(${f(bx)} ${f(by)}) scale(${f(p.s)})` });
            if (p.legend?.length) { const lg = legend(ctx, p.legend, colW); svg += g(lg.svg, { transform: `translate(${f(x + (colW - lg.w) / 2)} ${f(y + headH + 14 + bodyH + 14)})` }); }
        });
        y += headH + 14 + bodyH + legH + (r < rows.length - 1 ? gapY : 0);
        if (r < rows.length - 1) svg += el('path', { d: `M0 ${f(y - gapY / 2)} H${f(W)}`, stroke: INK.rule, 'stroke-width': 1 });
    });
    return { w: W, h: y, svg };
}

export function renderFigureSpec(spec: FigureSpec, env: Omit<Ctx, 'maxWidth' | 'defs'> & { maxWidth?: number }, background = '#FFFFFF') {
    const defs = new Defs('hx');
    let uid = 0;
    const ctx: Ctx = { ...env, defs, maxWidth: env.maxWidth ?? (spec.type === 'panels' ? 1500 : 1180), uid: () => 'u' + (++uid) };
    const body = spec.type === 'panels' ? panels(ctx, spec) : renderLeaf(ctx, spec);
    const lg = spec.type !== 'panels' && spec.legend?.length ? legend(ctx, spec.legend, Math.max(body.w, 500)) : spec.type === 'panels' && spec.legend?.length ? legend(ctx, spec.legend, body.w) : undefined;
    const contentW = Math.max(body.w, lg?.w ?? 0, 360);
    let y = PAD, head = '';
    if (spec.title) {
        const lines = wrap(spec.title, 21, Math.max(contentW, 520), 700);
        head += text(lines, PAD, y, { size: 21, weight: 700, color: INK.text });
        y += textBlockHeight(lines.length, 21, 1.2) + 4;
    }
    if (spec.subtitle) {
        const lines = wrap(spec.subtitle, 13.5, Math.max(contentW, 520));
        head += text(lines, PAD, y, { size: 13.5, color: INK.muted });
        y += textBlockHeight(lines.length, 13.5) + 2;
    }
    if (spec.title || spec.subtitle) y += 22;
    const W = Math.ceil(contentW + PAD * 2);
    const bodyX = PAD + (contentW - body.w) / 2;
    let out = head + g(body.svg, { transform: `translate(${f(bodyX)} ${f(y)})` });
    y += body.h;
    if (lg) { y += 26; out += g(lg.svg, { transform: `translate(${f(PAD + (contentW - lg.w) / 2)} ${f(y)})` }); y += lg.h; }
    if (spec.footnote) {
        y += 22;
        const lines = wrap(spec.footnote, 10.5, contentW);
        out += text(lines, PAD, y, { size: 10.5, color: INK.faint, lineHeight: 1.35 });
        y += textBlockHeight(lines.length, 10.5, 1.35);
    }
    const H = Math.ceil(y + PAD);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT.replace(/"/g, "'")}">${defs.render()}<rect width="${W}" height="${H}" fill="${background}"/>${out}</svg>`;
    return { svg, width: W, height: H };
}

export async function generateFigure(input: unknown, opts: GenerateOptions = {}): Promise<GenerateResult> {
    const spec = figureSchema.parse(input);
    const assetIds = new Set<string>(), warnings: string[] = [], credits = new Map<string, string>();
    // Pass 1: discover library assets.
    const dry = { resolver: opts.resolver, assetIds, warnings: [] as string[], credits: new Map<string, string>(), uid: () => 'x', defs: new Defs('dry') };
    try { renderFigureSpec(spec, { ...dry, maxWidth: opts.maxWidth }); } catch { /* the real pass reports errors */ }
    if (opts.resolver && assetIds.size) await opts.resolver.ensureBounds([...assetIds]);
    // Pass 2: real layout.
    const real = renderFigureSpec(spec, { resolver: opts.resolver, assetIds: new Set(), warnings, credits, uid: () => '', maxWidth: opts.maxWidth } as any, opts.background);
    return { ...real, warnings: [...new Set(warnings)], credits: [...credits].map(([id, credit]) => ({ id, credit })), assetIds: [...assetIds], spec };
}
