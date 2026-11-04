# MCP artboard resize fix — 0.5.1

## Root cause

The resize functionality already existed in `resizedDocument`, backed by `Store.replace`, with undo/redo and rendering support. It was exposed only as `refine_figure_layout.resizeArtboard`, requiring both `apply:true` and `expectedRevision`. This hid a basic document operation inside a layout-correction tool.

There was also a verified stale-schema problem: Claude Desktop's latest Helix startup log showed **MCP version 0.4.0**, despite the repository/backend being 0.5.0. Both versions advertised 32 tools. Version 0.4.0 predates the nested resize parameter, so a 32-tool count did not establish that Claude had a usable resize schema. Source changes do not replace a running stdio subprocess or its loaded schemas. The configured Node executable and absolute source entrypoint were correct; configuration changes were unnecessary.

## Fix and actual schema

Added a clearly named **`resize_artboard`** wrapper. It calls the existing geometry guard and `Store.replace`; no parallel resize model, replacement document creation or document JSON editing was introduced. MCP version is **0.5.1**, with **33 tools**, preserving the previous 32. The legacy nested parameter remains supported.

Verified actual MCP schema (full registry in [mcp-tools.json](mcp-tools.json)):

```ts
resize_artboard({
  documentId: string,
  width: number,             // finite 100..10000
  height: number,            // finite 100..10000
  expectedRevision: number,  // required nonnegative integer
  preserveContent?: boolean // defaults true
})
```

The input object is strict. Read `get_document` immediately before resizing and use its current revision. Example:

```json
{
  "documentId": "YOUR_DOCUMENT_ID",
  "width": 750,
  "height": 400,
  "expectedRevision": 7,
  "preserveContent": true
}
```

It returns the existing document with the same ID, unchanged object coordinates/relationships and one new revision. Same-size requests are no-ops after checking the revision. Undo and redo use existing document history. SVG export uses the saved width/height/viewBox; PNG output uses the same dimensions, subject to existing explicit scale limits. Tool descriptions for arrow/whitespace analysis, layout refinement and strict PNG rendering now point to the explicit resize operation.

## Preservation semantics

`preserveContent:true` uses the existing renderer for measured glyph bounds and existing conservative object/SVG viewport bounds. It rejects newly cropping content visible in the current viewport, including labels and attribution. Hidden objects or parts already outside the old viewport do not prevent a safe enlargement. All their objects/coordinates remain stored. Existing nested-refinement resizing retains its stricter legacy whole-object guard.

`preserveContent:false` explicitly permits viewport clipping. It does not delete, move, scale or reassign scientific objects and needs no protected-content measurement. Undo restores the old viewport. Existing behavior adapting an unlocked full-bleed decorative background is reused; its size may change, while its position/relationships remain fixed. Locked decorative backgrounds can reject protected resizing; unlock them explicitly if adaptation is required.

Protected nonempty documents require installed Chrome/Chromium to measure actual text. Complex SVG viewport bounds are conservative and may reject a resize that would only trim empty SVG padding. The previous renderer's 2,000-object/12 MB limits still apply. This operation does not recenter figures, change object positions, run layout corrections, or infer scientific meaning.

## End-to-end verification

The test used the **existing** disposable document **232f3352-59b6-4e14-a16b-4fc72cec52b5**, titled `Disposable — Helix Arrow and Artboard v2`, already present before this task. No replacement document was created. The script refuses to call creation/replacement tools and checks the owned ID, exact disposable title and real NIH BioArt asset before mutation.

Through the same configured executable, absolute entrypoint, working directory `/` and service URL used by Claude Desktop, a fresh MCP client discovered version **0.5.1**, **33 tools**, and the required/default fields above. The normal HTTP service and Vite UI were reloaded to activate the handler.

**18 live browser/MCP checks passed, zero failed:** discovery/schema defaults, existing ID retained, zero document creation, crop rejection, explicit clipping, identical object coordinates/relationships, one revision, no-op revisions, stale/missing revision rejection, undo, redo, disk persistence, live canvas updates, SVG vectors/dimensions, native MCP PNG dimensions and refresh persistence.

The existing document began at **550 × 260**, was expanded, exercised through undo/redo and deliberate clipping, then left at **750 × 400**. All nodes and root ordering remained exactly equal to the initial snapshot. The React artboard changed without navigation or refresh in **1,058 ms**, using its existing approximately 1.1-second live poll; this is automatic synchronization, not a new push transport. Reload also preserved dimensions. Final SVG and decoded PNG both measured 750 × 400.

Evidence: [results](results.json), [before UI](before.png), [after UI](after.png), [PNG export](export.png), [SVG export](export.svg), [integrity](integrity.json).

## Test results

- **117 automated tests passed, zero failed**, seventeen files. Seven new tests cover required revision/default schema, geometry-preserving transactions, crop/explicit-clipping behavior, previously clipped/hidden geometry, no-op/stale revisions, concurrent edits during measurement and actual MCP invocation.
- New existing-document browser/MCP test: **18 checks passed**.
- Original feedback suite: **16 checks passed**; arrow/whitespace suite: **37 passed**; Element Mode browser suite: **28 passed**; basic and asset browser smoke suites passed.
- Standalone normal-service `test:mcp` passed with 33 discovered tools.
- Production TypeScript/Vite build passed; two existing third-party Zod annotation warnings remain nonblocking.
- Integrity comparison permits only the explicitly owned disposable document to change. All other pre-existing scientific document and SVG asset files remain unchanged; no assets were reimported. Exact file count and SQLite asset count are in `integrity.json`.

## Activation and repeat commands

The normal service is already refreshed. **Fully quit/reopen Claude Desktop and start a new chat, or explicitly reconnect Helix**, to discard the old subprocess/schema cache. Verify **33 tools**, `resize_artboard`, and startup version **0.5.1**. Merely counting the old 32 tools or closing a chat is insufficient. Fresh configured protocol discovery and invocation are verified; Claude Desktop's picker after your restart remains unobserved.

```sh
export PATH=/opt/homebrew/opt/node@24/bin:$PATH
npm test
npm run build
npm run test:feedback
npm run test:feedback:v2
npm run test:browser
npm run test:assets:browser
npm run test:elements:browser
npm run test:mcp
npm run test:resize:browser
```

Build before browser tests. Most suites use isolated temporary data. **`test:resize:browser` intentionally resizes only the existing, explicitly owned disposable document on the normal service** and requires `npm run dev`. It never creates a replacement. Repeated runs enlarge this test artboard relative to its current dimensions. `CHROME_PATH` overrides the Chrome executable.

## Files changed

- `src/server/artboard.ts`: optional preservation/visibility modes on the existing helper; original strict defaults retained.
- `src/server/figure-feedback.ts`: thin standalone resize transaction using existing measurement, guard and history.
- `src/server/tools.ts`: registered tool/schema and updated resizing/analysis/render descriptions.
- `src/mcp/main.ts`, `src/mcp/server.ts`: version 0.5.1.
- `tests/resize-artboard.test.ts`: seven regressions and real MCP schema invocation.
- `scripts/test-resize-artboard.ts`: existing-document live browser/MCP/export test.
- Existing MCP tests/smoke/provider/feedback scripts: expected registry count 33.
- `package.json`, `README.md` and this report/evidence directory.

The React state model, canvas renderer, vector exporters, SQLite schema and SVG importer were reused without rebuilding them.
