import { writeFileSync } from 'node:fs';
import { Catalog } from '../../src/assets/catalog.ts';
import { AssetResolver, prefixIds } from '../../src/engine/assets.ts';
import { rasterizeSvg } from '../../src/server/figure-renderer.ts';
import { text } from '../../src/engine/svg.ts';
const queries = (process.argv[2] ?? 'mouse,human,liver,heart,brain,lung,kidney,mitochondria,neuron,t cell,microscope,syringe,tumor,intestine,blood vessel,embryo').split(',');
const cat = new Catalog('data');
const r = new AssetResolver(cat as any, { cachePath: 'data/engine-asset-bounds.json', measurer: rasterizeSvg });
const N = 6, cw = 170, ch = 150;
let body = '', i = 0;
const all: string[][] = queries.map(q => r.search(q, N).map(c => c.id));
await r.ensureBounds(all.flat());
queries.forEach((q, row) => {
  body += text(q, 8, row * ch + 8, { size: 14, weight: 700 });
  r.search(q, N).forEach((c, k) => {
    const a = r.load(c.id), s = Math.min(130 / a.box.w, 100 / a.box.h);
    const x = 120 + k * cw, y = row * ch + 6;
    body += `<rect x="${x}" y="${y}" width="${cw - 8}" height="${ch - 8}" fill="#fff" stroke="#ddd"/>`;
    body += `<svg x="${x + (cw - 8 - a.box.w * s) / 2}" y="${y + 6}" width="${a.box.w * s}" height="${a.box.h * s}" viewBox="${a.box.x} ${a.box.y} ${a.box.w} ${a.box.h}">${prefixIds(a.svg, 'a' + i++)}</svg>`;
    body += text(`${c.provider.slice(0, 12)} ${c.score.toFixed(1)}`, x + 4, y + 112, { size: 9, color: '#555' });
    body += text(c.name.slice(0, 26), x + 4, y + 124, { size: 9, weight: 600 });
  });
});
const W = 120 + N * cw, H = queries.length * ch;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#f4f6f8"/>${body}</svg>`;
const { png } = await rasterizeSvg(svg, W, H);
writeFileSync('/tmp/claude-501/engine/search.png', png);
console.log('ok');
