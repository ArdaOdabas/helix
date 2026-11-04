// Renders every procedural glyph into a contact sheet for visual review.
import { writeFileSync, mkdirSync } from 'node:fs';
import { Defs, el, g, text, f } from '../../src/engine/svg.ts';
import { allGlyphs, drawGlyph } from '../../src/engine/glyphs/index.ts';
import { rasterizeSvg } from '../../src/server/figure-renderer.ts';
const filter = process.argv[2];
const defs = new Defs('gal');
const list = allGlyphs().filter(d => !filter || d.category === filter || d.name.includes(filter));
const cols = 6, cw = 200, ch = 190;
let body = '';
list.forEach((d, i) => {
  const out = drawGlyph(defs, d, { seed: d.name });
  const s = Math.min(150 / out.w, 130 / out.h, 1.6);
  const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
  body += g(el('rect', { x: 4, y: 4, width: cw - 8, height: ch - 8, rx: 8, fill: '#fff', stroke: '#e3e7ec' }) +
    g(out.svg, { transform: `translate(${f((cw - out.w * s) / 2)} ${f(14 + (140 - out.h * s) / 2)}) scale(${f(s)})` }) +
    text(d.name, cw / 2, ch - 30, { size: 13, weight: 600, anchor: 'middle' }), { transform: `translate(${x} ${y})` });
});
const W = cols * cw, H = Math.ceil(list.length / cols) * ch;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${defs.render()}<rect width="${W}" height="${H}" fill="#f5f7fa"/>${body}</svg>`;
mkdirSync('/tmp/claude-501/engine', { recursive: true });
writeFileSync('/tmp/claude-501/engine/gallery.svg', svg);
const { png } = await rasterizeSvg(svg, W, H);
writeFileSync('/tmp/claude-501/engine/gallery.png', png);
console.log('ok', list.length, W, H);
