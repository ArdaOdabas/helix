# AI Figure Composer and Visual Feedback Loop

## Audit findings

Before this change, Helix already implemented the important composition foundations: `create_document(plan)`, `apply_figure_plan`, deterministic topological layout, scientific asset search, atomic document operations, persisted undo/redo, vector SVG export, UI PNG export and live document polling. The latest feature was interactive SVG Element Mode, with unit and browser regressions. Those implementations were reused.

Repository inspection found **no** `render_figure`, `analyze_figure_layout`, server PNG rendering, MCP image responses or automated rendering/correction loop. Existing PNG scripts were verification fixtures, and UI PNG download did not expose image content to Claude. No dedicated partially implemented composer/feedback module was found. This directory has no `.git` metadata, so no staged diff or commit-history audit is claimed. Some status documentation was outdated and has been linked to current evidence.

The previous detailed composer specification was not present in the supplied conversation or repository. This implementation covers the explicitly requested capabilities and a conservative structured-plan workflow; compliance with any unseen requirements is unverified.

## Completed functionality

Four additional tools extend the existing registry: **32 total, preserving all 28 previous tools**. MCP server version is **0.4.0**. Full actual protocol schemas are in [mcp-tools.json](mcp-tools.json).

```ts
render_figure({documentId, expectedRevision?, scale?})
analyze_figure_layout({documentId, expectedRevision?, scale?, margin?, minFontSize?})
refine_figure_layout({
  documentId, expectedRevision?, scale?, margin?, minFontSize?,
  apply?, maxIterations?
})
compose_figure({title, plan, scale?, margin?, minFontSize?, maxIterations?})
```

All objects are strict. Document IDs retain existing validation. `scale`: finite 0.1–3, default 1; `margin`: finite 0–100 document pixels, default 12; `minFontSize`: finite 6–24, default 12. `refine_figure_layout` defaults to `apply:false`, `maxIterations:2` (integer 1–3). Applying corrections requires `expectedRevision`. Composer accepts the unchanged existing version-1 `planSchema`, defaults to two correction passes, and permits zero passes for composition/inspection only. It always creates a **new** document and never silently replaces a saved figure.

The renderer uses the authoritative existing SVG exporter with current palette and element overrides plus source attribution. It launches installed headless Chromium without requiring an editor tab, blocks network requests/service workers, applies restrictive content security policy and waits for font/layout completion. PNG output is capped at 2048 pixels per dimension and 4 MB. Documents exceeding 2,000 nodes or 12 MB SVG are explicitly rejected for visual feedback; SVG export remains available. Two renders may run concurrently, with a bounded six-request queue and queue timeout; a four-entry in-memory cache is keyed by document/revision/SVG hash/output size.

HTTP tools return PNG base64 in an `image` object. **The stdio MCP adapter returns native `image/png` image content plus separate JSON metadata**, rather than putting base64 in text. Metadata identifies document/revision, dimensions and SVG hash. A concurrent edit can leave a valid older snapshot; `snapshotCurrent:false` reports that fact. Mutations must use the current expected revision.

Layout analysis reads actual Chromium glyph bounds and document-transformed positions. It diagnoses text overflow, small text, possible object overlap, content outside margins and possible text/background contrast issues. Icons use their preserved viewport bounds so invisible off-viewport paths do not force false object moves. Group hierarchy, hidden objects, transforms and locked descendants are respected. Proposed fixes only shrink text that can remain above the requested minimum and translate fitting unlocked roots into the margin. They do not rewrite labels, recolor scientific content, select different assets or guess biological relationships.

The bounded automatic loop renders, measures, proposes shared document commands, checks the revision, applies one atomic undoable batch and renders/measures again. Each pass creates one revision/undo entry. It stops when no supported corrections remain or the pass limit is reached, returning unresolved issues and the final image. Font corrections and ancestor moves based on old glyph bounds are deferred to separate passes. Concurrent UI/MCP changes are rejected rather than overwritten. If a post-commit re-render fails, the error explicitly identifies the committed document/revision and explains undo; a failed composer identifies any newly created document so callers do not retry by blindly creating duplicates.

## Claude/Codex workflow

1. Search assets and inspect their individual licenses with existing `search_icons`/`get_asset`.
2. Supply a scientific plan to `compose_figure`, or reuse `create_document`/`apply_figure_plan`. No natural-language scientific claims are invented by the server.
3. Inspect the returned PNG image and `analysis`. For existing documents, `render_figure` and `analyze_figure_layout` are read-only.
4. For supported automatic corrections, call `refine_figure_layout` with `apply:true`, the returned current revision and a bounded iteration count. For visual/semantic choices, use existing `apply_operations`, `update_object` or SVG sub-element tools with expected revision.
5. Render and inspect again, then export via existing vector `export_svg`. Undo/redo and the React UI see the same saved document.

This gives the calling multimodal assistant an image-based feedback workflow. **There is no embedded LLM, external model/API call or automated biological correctness judgment.** Automatic inspection/correction is geometry-based; semantic image reasoning belongs to Claude/Codex. No claim is made that an autonomous external-model vision loop was exercised.

## Validation

- **96 automated tests passed, zero failed**, fifteen files. Seven added diagnostic/schema tests cover glyph fitting, hidden/clipped content, locked descendants, unchanged affine geometry, overlap/contrast reporting, minimum font limits, oversized geometry, bounded coverage and stale revisions.
- Actual stdio MCP → isolated HTTP service test: **16 checks passed, zero failed**. It discovers all 32 tools and verifies native PNG image blocks, PNG decoding/cache, read-only revisions, measured overflow/bounds, default inspection-only behavior, explicit revision requirement, bounded corrections, persisted state, undo/redo, stale revisions, concurrent edits during rendering, new-document composition, vector export, browser display and original asset integrity.
- The existing standalone `test:mcp` also passed against an isolated service. Its helper now explicitly forwards `FIGURE_SERVICE_URL` through the SDK transport; previously an environment override was silently omitted and the helper still contacted port 4317.
- A real NIH BioArt mitochondrion was intentionally placed partly outside a **new disposable document** with an overflowing label. One atomic pass translated it from x=-40 to x=12 and fitted the label from 24 to 18.6 px: two detected issues became zero. Text content and SVG paths were preserved. [Before](before.png), [after](after.png), [machine results](results.json).
- A second new document composed an editable schematic using real NIH BioArt and an existing protein icon. PNG decoded to nonblank scientific content and the browser displayed the saved figure: [PNG](composed.png), [vector SVG](composed.svg), [browser](browser.png). The before/after and composed PNGs were also visually inspected during implementation.
- Existing basic browser smoke, asset browser smoke and 28-check interactive Element Mode suite all passed, including live MCP synchronization and object manipulation.
- Production TypeScript/Vite build passed. Two nonblocking third-party Zod annotation warnings remain.
- Dependency repair replaced pre-existing links into missing temporary directories with reproducible registry installs. `playwright-core` is now a runtime dependency for production PNG rendering. Zod was patched from 4.6.5 to 4.6.7 after installation reported a constrained-collection memory-exhaustion advisory; `npm audit` subsequently reported zero vulnerabilities.
- [Integrity audit](integrity.json) compared **23,508 pre-existing document/asset files**, with **zero changed files**. No original scientific figures were mutated. All new validation documents reside in isolated temporary directories recorded in `results.json`.

## Run and connect

```sh
export PATH=/opt/homebrew/opt/node@24/bin:$PATH
npm install --include=dev
npm test
npm run build
npm run test:feedback
npm run test:browser
npm run test:assets:browser
npm run test:elements:browser

# Start the normal shared document service and React UI when needed:
npm run dev
# From another terminal after service startup:
npm run test:mcp
```

Chrome is not downloaded automatically. Set `CHROME_PATH` if it is not installed at the detected macOS/Linux paths. Browser regressions serve the production build, so build first. Runtime PNG tools require Node 24, the installed runtime dependencies, and Chrome/Chromium even when dev dependencies are omitted.

No normal Helix service was listening on ports 4317/5173 during this validation. Tests launched isolated services rather than starting or changing a user service. Start/restart `npm run dev`, then reconnect the MCP client. Claude Desktop may require a full quit/reopen and a new conversation to discard a cached tool list. The configured stdio interface was tested, but **Claude Desktop's live picker and image display have not been observed for this change**.

## Remaining limits and unverified behavior

- No unseen specification compliance, natural-language parser, embedded vision model, semantic scientific validation or general aesthetic optimizer is claimed.
- Possible overlaps are reported, never automatically separated: many scientific overlaps are intentional. Contrast compares opaque hex text with the document background, not composited pixels. Bounds are axis-aligned and omit some stroke/filter/clip effects; output is diagnostic, not proof of publication quality.
- Collision checks cover the first 500 visible non-arrow leaves and return an explicit completeness flag; issue output is capped at 250. Image rendering is limited as described above. Regional/zoomed render requests are not implemented.
- Installed Chrome is required; Windows executable autodetection and alternative rendering engines were not verified. Very large figures can be readable in vector export while tiny in the capped PNG.
- Resource-budget and queue limits are implemented; saturation, renderer crashes, production-only fresh installation and all supported SVG features have not been exhaustively load-tested.
- Existing structured layout limitations (cycles rejected, fixed relationship routes, no dynamic connector anchoring) remain. Existing documents and assets are not migrated.

## Files changed

New: `src/server/figure-renderer.ts`, `figure-layout.ts`, `figure-feedback.ts`; `tests/figure-layout.test.ts`; `scripts/test-figure-feedback.ts`; this report and artifacts.

Updated: `src/server/tools.ts` (four tools/reuse existing composer), `src/server/main.ts` (await async tools), `src/mcp/server.ts` (native images/version), `src/mcp/main.ts` (version log), `tests/mcp.test.ts`, `tests/mcp-elements-v2.test.ts`, `scripts/mcp-smoke.ts` (registry count and isolated service URL), `scripts/test-provider-mcp.ts` (registry count 32), `package.json`, `package-lock.json`, `README.md`. Existing scene models, UI editing code, SVG importers and asset geometry are unchanged for this task.
