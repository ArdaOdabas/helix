# Interactive SVG Element Mode

Implemented and browser-verified November 3, 2026. No backend tools, original assets, database schemas or existing scientific documents were changed for this feature. Tests create new disposable documents in isolated temporary data directories.

## Use

1. Refresh Helix. In Object Mode, single-click, drag and resize icons normally.
2. Double-click a scientific SVG icon, or select it and press **Edit SVG Elements** in the right inspector. The blue **Element Mode** banner, dashed icon outline and status bar identify the active mode. Locked icons cannot be edited.
3. Click a visible path to select it. Native browser SVG hit-testing respects painter order, transforms, clipping and stroke-only geometry. Hover has an amber outline; selected elements have blue outlines. The inspector and status bar show the stable source ID, tag and drawing-order index. IDs absent in the source use existing deterministic `@svg:<key>` identifiers.
4. Expand **SVG Elements** to select any editable path or group, including hidden, overlapping or clipped elements. Rows display drawing order, IDs, types, fill/stroke swatches and selection state. `inherit`/`none` swatches use a checker pattern; the selected-element inspector reads browser-computed paint for inherited colors.
5. Shift-click canvas elements or list rows for multi-selection. Use separate fill/stroke pickers, or enter a hex color/`none` and press **Apply element fill/stroke**. Stroke width and opacity commit when leaving their numeric field. Reset a single property or **Reset element overrides** for all selected elements.
6. Escape (including from an inspector input), **Exit Element Mode**, or a canvas click outside the icon exits. The parent icon remains an ordinary object; no ungrouping or geometry modification occurs.

Each selection batch uses existing `update_icon_elements` with stable source IDs and expected document revision. One batch creates one undo step. Cmd/Ctrl-Z and toolbar Undo/Redo use existing persisted history. Groups follow normal SVG inheritance: a group fill does not replace explicit child fills; select those children to change them together.

## State and performance

Committed state remains in the existing document `elementStyles`/palette model. Temporary preview styles are React state, discarded on errors or mode exit. SVG DOM is not the editing source of truth. Export uses the authoritative document renderer, so UI highlights cannot enter SVG/PNG exports.

Annotated SVG rendering is memoized by asset and rendering properties independently of hover/selection/position. Unchanged icons retain their rendering even when another object changes. Hover changes only a small stylesheet; it does not parse SVG. Element metadata is fetched on document revision changes, with pagination; original palette metadata is fetched once per selected asset. The list is bounded by a scroll region; it is not virtualized, and thousands of simultaneously selected elements have not been performance-certified.

Live synchronization retains existing approximately 1.1-second polling. Inspector focus no longer blocks it indefinitely. Poll responses are ignored if a command/gesture is active, the document changed, or the result is older than the displayed revision. Color drafts are keyed by selection and revision, preventing late paint metadata from overwriting freshly typed input. Native pointer capture begins only after real dragging, allowing path double-click events to reach the icon.

## Verification

Latest machine-readable evidence: [results.json](results.json). Visual/export artifacts: [browser screenshot](element-mode.png), [SVG](edited.svg), [PNG](edited.png).

- **89 Vitest tests passed, zero failed**, fourteen files, including two added rendering/export regressions.
- `npm run test:elements:browser`: **28 checks passed, zero failures or browser errors**. Actual Chrome mouse events selected the real NIH [mitochondrion 352](https://bioart.niaid.nih.gov/bioart/352) and [nucleus 72](https://bioart.niaid.nih.gov/bioart/72). These contain 6 and 21 editable entries respectively; the nucleus paths themselves contain complex geometry.
- Independent membrane recoloring, target-only changes, list selection, Shift-selection, atomic one-revision updates, undo, redo, color pickers, reload persistence and SVG export passed. Actual stdio MCP edits changed the browser canvas without refreshing, while an inspector text input remained focused.
- A separate temporary **303-element** fixture verified nested transforms, clipping, native overlapping-path painter order, hidden list selection, stroke-only direct selection, hover and reset. It is a labeled synthetic stress fixture, not an imported scientific illustration.
- PNG exports with and without Element Mode highlights were byte-identical. SVG contained expected paint and no interactive annotations/highlight stylesheet.
- Object selection, dragging, resizing and grouping passed. Both existing `test:browser` and `test:assets:browser` scripts passed, including palette editing, group editing, undo/redo and drag/drop.
- `npm run test:mcp` passed, discovering all **28 existing tools**. No MCP API/registration changes or Claude Desktop restart are required for this UI feature.
- TypeScript and production Vite build passed. Two pre-existing third-party Zod comment-annotation warnings remain nonblocking.
- Original NIH SVG hashes were checked after editing. The full baseline audit separately verifies original assets and figures; test documents are isolated from the real data directory. Latest library count remains 23,497 SQLite assets.

Repeat from the repository root with Node 24 and installed Chrome:

```sh
export PATH=/opt/homebrew/opt/node@24/bin:$PATH
npm test
npm run build
npm run test:elements:browser
npm run test:browser
npm run test:assets:browser
npm run test:mcp
```

The browser scripts launch isolated services and serve the production build, so build before running them. `test:mcp` requires the normal running Helix service. `CHROME_PATH` overrides the default macOS Chrome executable. `results.json` records the latest disposable document ID and its retained temporary data directory; no user document is reused.

## Changed files

- `src/ui/main.tsx`: mode/selection/preview state, pointer/keyboard handlers, status, existing mutation integration and monotonic document polling.
- `src/ui/SvgAssetEditor.tsx`: paginated metadata, drawing-order list, computed paint inspector, independent color/numeric controls, atomic batches and reset.
- `src/ui/SvgCanvasContent.tsx` (new): memoized annotated SVG rendering and transient highlight rules.
- `src/ui/style.css`: mode banner, selection distinction, scrollable list and swatches.
- `tests/element-mode.test.tsx` (new): anonymous IDs, clipped/stroke-only geometry, transient versus persisted styling and export exclusion.
- `scripts/test-element-mode.ts` (new): isolated real-asset browser/MCP regression suite plus dense selection fixture.
- `package.json`: `test:elements:browser` command.
- `README.md` and this report/evidence directory: usage and verified results.

## Limits

Supported editable tags remain paths, groups, rectangles, circles, ellipses, lines, polylines and polygons. Definition-only shapes, individual `<use>` instances, text/glyph internals, path-point editing and gradient-stop editing are outside this change. Existing supported gradients remain intact until deliberately replaced by a flat fill/stroke. The native color picker accepts opaque six-digit colors; text controls also accept existing supported hex alpha formats and `none`. Hidden or clipped geometry may have no visible highlight; its list selection and inspector still work. Completely covered paths should be selected from the list. Local opacity is shown, rather than the product of all ancestor opacities.

The existing SVG importer still rejects unsupported/unsafe features instead of flattening them. No asset acquisition, reimport, geometry editing or scientific figure modification is part of this feature.
