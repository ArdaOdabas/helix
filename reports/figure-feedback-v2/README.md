# Arrow-aware visual feedback, whitespace and PNG scale

MCP server version **0.5.0**. Registry remains **32 tools**; existing renderer, structured composer, SVG exporter, command engine, persistence and MCP image adapter were extended rather than duplicated. No asset collection was reimported. No existing scientific document was modified.

## Audit and changes

The previous analyzer explicitly excluded arrows from overlaps, had no relationship ownership or whitespace metrics, and the renderer silently limited PNG size to 2048 pixels. Its revision-checked, undoable bounded correction loop and native MCP PNG content already worked and were reused.

Arrow geometry now shares the existing renderer's exact local shaft/head construction. Analysis transforms the shaft, triangle and stroke radius into document coordinates and measures polygon distances against transformed glyph boxes, object bounds and conservative SVG viewports. It reports `text_arrow_overlap`, `arrowhead_obscured`, `arrowhead_contact`, `arrow_icon_intersection`, `arrow_object_intersection`, `arrow_insufficient_clearance`, `arrow_endpoint_clearance` and invalid relationship references. Reports carry relationship classification and uncertainty. Nested transforms and rotation are supported; complex scientific SVG interiors are not reduced to a false claim of pixel-perfect collision detection.

New optional arrow `relationship: {sourceId,targetId,labelIds?}` metadata records existing entity relationships. The composer fills this metadata for newly generated plans. Original documents remain unchanged; legacy arrows retain their behavior and unknown contacts are not automatically assigned biological meaning. Omitted `labelIds` means unknown ownership; explicitly supplying an empty array declares no intentional labels. Invalid endpoints or label references disable semantic corrections. A matching legacy arrow name/text is marked as an inferred label, not proof of ownership. Explicit intentional shaft labels are reported separately in `intentionalArrowLabels`; their overlap is not automatically corrected. Labels obscuring heads are still diagnosed.

Corrections move a declared head label or a proven unrelated standalone label along a bounded arrow normal, rejecting candidate positions outside margins or colliding with other objects/arrows. Known endpoints may be trimmed along the original line to achieve clearance. Direction, source/target IDs, label text, parent relationships and scientific asset geometry remain unchanged. Unrelated icon intersections are not rerouted or repaired by guessing. Locked objects are respected; ambiguity or insufficient room remains a diagnostic.

Proposed batches are rendered and analyzed **before commit**. A batch introducing a new collision/bounds diagnostic is rejected. Generic margin corrections never independently translate linked endpoints/labels or arrows; unannotated arrows disable such ambiguous root moves. Each accepted pass is an atomic, expected-revision-checked command transaction and one undo step. The existing 1–3 pass limit and concurrent-edit protection remain. A label obstruction can require one pass to move the label and a second to trim endpoints; the tested fixture used two passes.

## MCP input schemas

Actual discovered JSON Schemas: [mcp-tools.json](mcp-tools.json). Existing inputs remain accepted.

```ts
render_figure({documentId, expectedRevision?, scale?, strictScale?})
analyze_figure_layout({
  documentId, expectedRevision?, scale?, strictScale?,
  margin?, minFontSize?, clearance?
})
refine_figure_layout({
  documentId, expectedRevision?, scale?, strictScale?,
  margin?, minFontSize?, clearance?, apply?, maxIterations?,
  resizeArtboard?: {width, height}
})
compose_figure({
  title, plan, scale?, strictScale?, margin?, minFontSize?, clearance?,
  maxIterations?
})
```

- `scale`: finite 0.1–3, default 1; `strictScale`: boolean, default false.
- `clearance`: finite 0–40 document pixels, default 8.
- Existing `margin` 0–100/default 12, `minFontSize` 6–24/default 12 and bounded iteration options remain.
- Refinement defaults to inspection-only. `apply:true` requires `expectedRevision`.
- `resizeArtboard` requires `apply:true` and a revision; width/height are finite 100–10000. It is an explicit separate one-transaction pass, not an inferred consequence of excessive whitespace. No unrelated correction is bundled into that resize pass.
- `add_arrow` accepts optional `relationship:{sourceId,targetId,labelIds?}`; `update_object.patch` also accepts it. `layoutRole:'content'|'decoration'` is optional in node/patch and placement schemas. Defaults do not migrate existing documents.

Example deliberate annotation and safe correction:

```json
{"documentId":"DOC","objectId":"ARROW","expectedRevision":4,"patch":{"relationship":{"sourceId":"SOURCE","targetId":"TARGET","labelIds":["ARROW_LABEL"]}}}
```

Then call `analyze_figure_layout`, inspect its PNG, and call:

```json
{"documentId":"DOC","expectedRevision":5,"apply":true,"clearance":8,"maxIterations":3}
```

Get the new revision before an explicit artboard operation:

```json
{"documentId":"DOC","expectedRevision":7,"apply":true,"resizeArtboard":{"width":550,"height":260}}
```

IDs/revisions above are examples, not existing user documents.

## Whitespace and artboard safety

`analysis.whitespace` returns `contentBounds`, `unusedMargins`, `unusedCanvasPercentage`, `suggestedArtboard`, excluded decorations and an explicit `whitespaceMayBeIntentional:true` flag. The percentage estimates area **outside the content bounding box**, not pixel occupancy or a scientific judgment. Negative margins indicate out-of-bounds content. Suggested dimensions retain the current top-left origin and include room for fixed decorations/hidden object bounds; a flag identifies model-limit violations. Left/top whitespace is not removed by silently translating an entire figure.

Explicit decorative shapes (`layoutRole:'decoration'`) are excluded from content bounds. Attribution/footer text remains content even if marked decorative. Unknown scientific compartments are not automatically classified as decorative backgrounds. No automatic shrink follows a high unused-area percentage.

Explicit resize checks all non-background objects, including hidden bounds, measured glyph overflow, stroke padding and attribution/footer text. It rejects cropping. An unlocked full-bleed, axis-aligned decorative rectangle is resized with the artboard in the same transaction. Locked background adaptation is rejected. Other scientific nodes and source asset attribution metadata are preserved. Width/height changes use existing `Store.replace`, so they persist and undo/redo with the same document revision system.

## PNG dimensions

Rendering now returns:

```ts
{
  requestedScale, actualScale, actualWidth, actualHeight,
  maxDimension: 2048, warnings: string[],
  width, height, scale // existing aliases preserved
}
```

Refinement/analysis returns the same fields under `render`. Requested scales are included in the cache key, so two requests producing identical capped dimensions retain correct request metadata. Capping and integer-pixel rounding produce explicit warnings. `strictScale:true` rejects a capped scale or fractional requested dimensions before launching a renderer. `actualWidth`/`actualHeight` are authoritative; ordinary fractional sizes are rounded to integer pixels. A tested 4000 × 500 document at requested scale 2 returned 2048 × 256, actual scale 0.512 and a cap warning. Scale 0.5 with strict mode returned exactly 2000 × 250.

PNG continues to be native MCP `image/png` content, separate from JSON metadata. Claude can render → inspect → analyze contacts/whitespace → apply revision-checked corrections → explicitly resize → render again. The tools measure geometry; scientific/visual understanding still belongs to the calling assistant and user.

## End-to-end evidence

- Arrow fixture using a real NIH BioArt mitochondrion: [before](arrow-before.png), [after](arrow-after.png), [vector export](arrow-after.svg), [browser](arrow-browser.png). A stroke crossed a label and touched both endpoints. Two bounded passes moved the label and trimmed the original line; three issues became zero. Relationship IDs and text were unchanged.
- Whitespace/attribution fixture: [before](whitespace-before.png), [after](whitespace-after.png). Explicit resize to 320 × 250 persisted, undo restored 1200 × 900, redo restored 320 × 250. Implicit resizing, stale revisions and cropping requests failed without mutations.
- [Wide capped PNG](wide-capped.png) was decoded and its binary dimensions matched reported metadata. Strict capping rejection, achievable strict scale and cache metadata isolation passed.
- The actual configured stdio command was tested against the reloaded normal service at port 4317: version **0.5.0**, **32 tools**, native PNG content and successful corrections/explicit resize. New disposable document **232f3352-59b6-4e14-a16b-4fc72cec52b5**, revision 7, 550 × 260. [Live results](live-main.json), [PNG](live-main.png), [read-only UI screenshot](live-browser.png). This is a newly created validation document, not a modified existing figure.
- Latest detailed isolated results: [results.json](results.json). Existing-file integrity: [integrity.json](integrity.json).

## Tests

- **110 tests passed, zero failed**, sixteen Vitest files. Fourteen new tests cover arrow/text/head/viewport contacts, rotation, ownership, invalid references, locked nodes, endpoint identity/direction, linked margin safety, legacy safety, composer metadata, decoration exclusion, attribution, hidden-edge cropping protection and fractional strict-scale rejection.
- Expanded actual stdio MCP/HTTP/browser workflow: **37 checks passed, zero failed**. Includes intentional labels, unrelated real NIH icons, arrowheads, insufficient clearance, corrections, undo/redo, persistence, concurrent/stale revision protection, atomic resize, PNG binary dimensions, strict mode and MCP image blocks.
- Original feedback protocol suite: **16 checks passed**. Existing Element Mode browser suite: **28 checks passed**, including live MCP synchronization. Both basic and asset browser smoke suites passed.
- Normal-service `npm run test:mcp` passed, discovering all 32 tools. Production TypeScript/Vite build passed with two existing nonblocking Zod comment-annotation warnings.
- **23,510 pre-existing scientific document/asset files checked; zero changed**. Assets were copied into isolated test catalogs only, not reimported into the real library. Original NIH SVG hashes were also verified directly.

Repeat with Node 24 and installed Chrome:

```sh
export PATH=/opt/homebrew/opt/node@24/bin:$PATH
npm test
npm run build
npm run test:feedback:v2
npm run test:feedback
npm run test:browser
npm run test:assets:browser
npm run test:elements:browser
npm run test:mcp # requires the normal Helix service
```

The browser scripts use isolated data/services and do not edit existing user figures. `CHROME_PATH` can override the detected executable. Tests should follow a production build because their UI checks serve `dist`.

## Files changed

New: `src/core/arrow-geometry.ts`; `src/server/arrow-layout.ts`, `artboard.ts`; `tests/figure-feedback-v2.test.ts`; `scripts/test-figure-feedback-v2.ts`; this report and evidence.

Updated: `src/core/model.ts` (optional compatible relationship/role metadata); `src/core/plan.ts` (new-plan ownership); `src/core/render.ts` (reuse identical shared arrow geometry); `src/server/figure-layout.ts`, `figure-feedback.ts`, `figure-renderer.ts`, `tools.ts`; `src/mcp/main.ts`, `server.ts` (version); `package.json`; `README.md`. Existing SVG source assets, importer and database schema were not rewritten.

## Activation and remaining limits

The running API/Vite service has been reloaded and fresh configured MCP sessions verified. **Fully quit/reopen Claude Desktop and start a new chat, or explicitly reconnect Helix**, to refresh the changed schemas even though the tool count remains 32. Look for `helixMcpVersion:0.5.0`. Its live cached picker has not been independently observed after your restart; fresh protocol discovery and image content are verified.

Analysis is conservative geometry, not proof of scientific correctness. Complex SVG silhouettes, ellipse interiors, glyph holes, clipping, masks and transparency can produce uncertain bounds contacts. Unrelated icon obstacles are not rerouted; arbitrary connector routing, automatic biological reassociation, global aesthetic optimization and origin recentering are outside this change. Intentional labels may deliberately cross a shaft; they remain untouched unless they obscure a head and a safe candidate exists. Scientific meaning is preserved structurally (IDs, direction, label text and parentage), not inferred by a vision model.

Only explicitly identified decorative shapes are excluded. Legacy relationship metadata is not fabricated. Overlap/arrow analysis limits remain explicit (500 non-arrow leaves and 200 arrows); issue output is capped at 250. Rendering retains the previous 2,000-object, 12 MB SVG and 2048-pixel limits. Saturation, every SVG feature, Windows rendering and semantic review inside Claude Desktop remain unverified. A failed post-commit renderer still reports the committed revision and undo recovery; every correction pass remains independently undoable.
