// Render engine example specs to PNG for review: node scripts/engine/render.ts examples/engine/x.json [...]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename } from 'node:path';
import { Catalog } from '../../src/assets/catalog.ts';
import { AssetResolver } from '../../src/engine/assets.ts';
import { generateFigure } from '../../src/engine/compose.ts';
import { rasterizeSvg } from '../../src/server/figure-renderer.ts';
const resolver = new AssetResolver(new Catalog('data') as any, { cachePath: 'data/engine-asset-bounds.json', measurer: rasterizeSvg });
mkdirSync('/tmp/claude-501/engine/out', { recursive: true });
for (const file of process.argv.slice(2)) {
  const t = Date.now();
  const r = await generateFigure(JSON.parse(readFileSync(file, 'utf8')), { resolver });
  const { png } = await rasterizeSvg(r.svg, r.width * 1.5, r.height * 1.5);
  const out = '/tmp/claude-501/engine/out/' + basename(file, '.json');
  writeFileSync(out + '.png', png); writeFileSync(out + '.svg', r.svg);
  console.log(basename(file), r.width, r.height, Date.now() - t + 'ms', r.warnings.join(' | '));
}
