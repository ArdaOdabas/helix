# The figure engine

A generative engine that turns a structured description of a figure into a finished, publication-style
scientific illustration. The assistant states *what* is in the figure; the engine owns every
coordinate, colour, arrow and line break.

This exists because hand-placing SVG coordinates produces crude figures: an assistant writing
`<circle cx="120" cy="80">` by hand has no idea how wide its own label will render, where the arrow
should stop, or what "a T cell" looks like. Here the assistant never touches geometry.

## How it is put together

```
src/engine/
  color.ts        Tonal families: one hue -> fill, highlight, outline, shadow, wash
  svg.ts          Primitives: gradients, smooth/organic paths, text measurement, inline markup
  glyphs/         ~70 procedural illustrations drawn under one lighting model
  assets.ts       Re-ranked search over the 23k-illustration licensed library + measured bounds
  visual.ts       "mouse" / "GPCR" / {search:…} -> a drawable with a known size
  connectors.ts   Arrows, inhibition bars, block arrows, elbows, arcs, bowed curves, labels
  spec.ts         The figure description language (Zod; it is also the MCP tool schema)
  layouts/        workflow (sequence, serpentine, stage bands, DAG), pathway, comparison, cycle, zoom
  compose.ts      Panels, title/subtitle/legend/footnote, artboard, two-pass rendering
  document.ts     Finished SVG -> editable Helix document (one object per element)
  guide.ts        The vocabulary and examples served to the assistant
src/server/engine-tools.ts   MCP tools: generate_figure, find_visual, list_figure_vocabulary
```

### Two sources of illustration

1. **Procedural glyphs** (`src/engine/glyphs/`) are drawn by code: cells, organelles, receptors in a
   membrane, DNA, antibodies, genome-editing effectors, lab equipment and data read-outs (UMAP,
   heatmap, western blot, volcano, flow cytometry, survival curves). Each is parametric — colour, variant, count, modification badges,
   a label written inside — and every one uses the same lighting model (upper-left highlight, a
   darker outline derived from the same hue, a soft radial body gradient). That is what makes a figure
   look like one set rather than a collage. Membrane glyphs report their bilayer mid-plane so the
   pathway layout can thread the membrane through them at any thickness. Nucleic acids share a set of
   primitives (`src/engine/nucleic.ts`) and one palette: a strand is a backbone carrying its own
   bases as ticks, paired bases meet in the middle and unpaired ones do not, which is what makes an
   open bubble read as single-stranded; DNA is blue, RNA amber, newly written DNA darker, and red is
   reserved for edits and cut sites. Every DNA, RNA, plasmid, nucleosome and editing glyph is drawn
   from those primitives, so they sit together in one figure. The genome-editing family
   (`glyphs/editing.ts`) goes further and shares a whole scene: one duplex geometry, R-loop, guide RNA
   and PAM position, with a common canvas height, so a Cas9, a base editor and a prime editor drawn
   side by side sit on the same DNA baseline with their PAM boxes in line.
2. **The licensed library** (NIH BioArt, Bioicons/Servier, Reactome, Togo, SciDraw, PhyloPic) supplies
   everything procedural code should not invent: organisms, organs, tissues and specialised cell types.
   Plain FTS ranking is not usable for figure making — it returns black silhouettes and "Damaged
   mitochondria" variants — so `assets.ts` re-ranks by name fit, provider style, quality grade,
   how much is actually drawn, aspect ratio, colourfulness and penalty words, prefers whole-word
   matches, and rewrites weak queries ("human" → "person", "mouse" → "lab mouse").

### Which source wins

A plain name resolves to the library's illustration when the match is unambiguous (the names denote
the same thing, ignoring plurals and filler) and the asset is actually drawn rather than a flat
pictogram — judged by how many vector elements it contains, which predicts figure quality better
than anything else available. Below that bar the procedural glyph is used, because a generated
drawing of the right thing beats a three-shape silhouette. Structural glyphs (membrane proteins,
nucleic acids, charts) are always generated, since they have to align with the scene around them,
and any request carrying a colour, variant, label or modification badge selects the glyph too.

### Measured bounds

Library SVGs have arbitrary padding inside their `viewBox`, so scaling by the viewBox makes one
illustration tiny and the next huge. The engine therefore renders in two passes: a dry run collects
which assets the figure needs, all of their true drawing bounds are measured in one Chromium call
(`getBBox`, cached in `data/engine-asset-bounds.json`), then the real layout runs with exact sizes.

### Layouts

| `type` | For | Key fields |
|---|---|---|
| `workflow` | protocols, pipelines | `steps[]` with `visual`/`visuals`, `label`, `detail`, `action` (arrow text); `stages[]`, `numbered`, `perRow`, `arrowStyle`; `edges[]` turns it into a layered DAG |
| `pathway` | signalling mechanisms | `nodes[]` (`kind`, `location`, `mods`), `edges[]` (`type` inferred from the label), `outputs[]` |
| `comparison` | healthy vs disease, WT vs KO | `columns[]`, `rows[]`, `transition`, `visualSize`; illustrations in one row share a scale so they stay comparable |
| `cycle` | cell cycle, viral life cycle | `stages[]`, `center` |
| `zoom` | organism → organ → cell → molecule | `levels[]` with `focus` |
| `panels` | multi-panel figures | `panels[]` of any of the above, lettered a, b, c… |

Layout decisions the engine makes so the caller does not: serpentine wrapping and row balancing when a
workflow is long; packing linear kinase cascades into left/right runs instead of one tall column;
docking a ligand onto the receptor it binds; putting an antagonist beside its receptor in the
extracellular space; placing a drug that inhibits one cytoplasmic target beside (or below) it;
ordering DAG layers by mean parent position to reduce crossings; bowing skip-layer edges around
whatever stands between their ends; flipping an arrow label to the other side when it would land on a
molecule; sizing the nucleus to its contents.

### Editable output

`document.ts` marks every illustration, label, arrow and badge in the finished SVG with
`data-object-id`, measures their world bounds in Chromium, crops each one into its own sanitised SVG
asset and builds a Helix document with one object per element. The document renders identically to the
generated file, and each piece can then be moved, recoloured (Element Mode) or deleted in the editor.

## MCP tools

| Tool | Purpose |
|---|---|
| `generate_figure` | spec → preview image + `.svg`/`.png` files + editable document. `replaceDocumentId` updates a previous figure in place, which is how the assistant iterates. |
| `find_visual` | Contact sheet of what a name resolves to (procedural glyph plus library candidates), each with the exact `{"search":…,"pick":n}` or `{"asset":id}` reference. |
| `list_figure_vocabulary` | Every layout, glyph (aliases, variants, default colour), colour name, text markup rule and a complete example spec per layout. |

The intended loop is: `list_figure_vocabulary` once → write a spec → `generate_figure` → **look at the
returned image** → fix wording, colours, visuals, `perRow` → call again with `replaceDocumentId`.

## Helper scripts

```sh
node scripts/engine/gallery.ts [category]        # contact sheet of every procedural glyph
node scripts/engine/search-sheet.ts "a,b,c"      # what the library returns for given queries
node scripts/engine/render.ts examples/engine/*.json   # render specs locally to /tmp
node scripts/engine/ask.ts generate_figure spec.json   # call the installed Helix.app exactly as an MCP client does
```

## Attribution

Library illustrations keep their per-asset author and licence. `generate_figure` returns the credits
and writes a `.credits.txt` beside the exported files whenever a figure uses them. Procedural glyphs,
layout, connectors and typography are original to this project. No BioRender asset, schema or code is
used anywhere.

## Verified

`npx vitest run` — 154 tests pass, 27 of them for the engine: colour monotonicity, text wrapping and
markup, every glyph and declared variant rendering as well-formed finite SVG, membrane mid-planes and
span, interaction-kind inference, boundary geometry, each layout producing a valid artboard,
multi-panel composition, determinism, graceful warnings for unknown references, schema rejection of
malformed specs, part splitting with sanitizer acceptance, transform parsing and id namespacing.
Example specs in `examples/engine/` were rendered and inspected visually. `generate_figure` was
exercised end-to-end over the real MCP stdio transport and HTTP service, and the resulting editable
document re-rendered through the editor's own exporter matches the generated figure.

## Limits

- Scientific correctness is the caller's responsibility: the engine draws what the spec says.
- PNG export and editable documents need installed Chromium (`CHROME_PATH` to override).
- Pathway layouts handle feed-forward mechanisms well; dense feedback loops may need a hand-tuned
  `location`/edge order, or splitting into panels.
- The library has no illustration for every term; `find_visual` shows what is actually available.
