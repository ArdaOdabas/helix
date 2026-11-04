# Scientific asset library upgrade

Latest follow-up: [NIH BioArt and MCP element editing](../reports/bioart/README.md) adds provider filtering, bounded pagination, ID-based atomic tools, primitive paint editing, and narrow simple-class SVG CSS support. Historical validation below describes earlier snapshots.

The existing recursive XML importer, content-addressed SVG catalog, SQLite FTS5 search, shared document command engine, HTTP endpoints, and SDK MCP registration remain in use. No provider content is downloaded. Tests and browser verification use temporary directories and a separate service.

## Import a local collection

Use Node 24 from the project root:

```sh
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
# Recursive import, inferred metadata, explicitly unspecified license:
npm run import:assets -- /absolute/path/to/svg-collection
# JSON manifest:
npm run import:assets -- /absolute/path/to/svg-collection /absolute/path/to/manifest.json /absolute/path/to/helix-data
# CSV manifest:
npm run import:assets -- /absolute/path/to/svg-collection /absolute/path/to/manifest.csv /absolute/path/to/helix-data
# No manifest, custom storage:
npm run import:assets -- /absolute/path/to/svg-collection - /absolute/path/to/helix-data
# Environment alternative, shared with the service:
FIGURE_DATA_DIR=/absolute/path/to/helix-data npm run import:assets -- /absolute/path/to/svg-collection
```

Repeat the same command for incremental imports. SVGs are read locally, recursively; symlinks are skipped. Reports contain `scanned`, `imported`, `updated`, `skipped`, `failed`, `failures`, and backward-compatible `duplicates`/`rejected`. Exit status 2 means at least one failure. Failure details are capped at 1,000; counts remain complete. A file's identity combines its absolute source path, raw SHA-256, and effective metadata hash. Unchanged entries skip XML parsing and asset writes. Failed entries retain their last successful source mapping and are retried on the next import.

Sanitized SVG bytes determine immutable `asset-<sha256>` IDs. A changed file creates/reuses a new version; earlier assets and figure references are retained. Metadata-only changes refresh metadata and FTS while retaining the geometry ID. Duplicate content from a different path records additional provenance while keeping the canonical metadata from the first source. Hashes detect byte identity, not perceptually equivalent geometry. Provider IDs are retained as metadata rather than used as storage IDs.

Optional version-1 JSON manifests retain their existing format and add `title`, `subcategory`, `keywords`, and per-asset `provider`, `license`, and `licenseReference`. `name` and `tags` remain supported. Metadata precedence is per-file, defaults, then SVG title/description and directory/filename inference. First directory component is category; remaining directories form subcategory.

```json
{
  "version": 1,
  "provider": "Local lab",
  "license": "CC0-1.0",
  "licenseReference": "Original artwork by the lab",
  "defaults": {"category": "Cell biology"},
  "assets": {
    "cells/vesicle.svg": {
      "title": "Transport vesicle",
      "subcategory": "Organelles",
      "keywords": ["vesicle", "transport", "cargo"]
    }
  }
}
```

CSV uses a header row, RFC-style quoted fields, and semicolon-separated keywords. Each row carries its own attribution fields:

```csv
filename,title,category,subcategory,keywords,provider,license,licenseReference,attribution
cells/vesicle.svg,"Transport, vesicle",Cell biology,Organelles,vesicle;cargo,Local lab,CC0-1.0,Original lab artwork,Lab team
```

## Migration and compatibility

Opening `Catalog` creates these additive tables and sets `PRAGMA user_version=2`:

- `asset_details(assetId PRIMARY KEY, metadata)`: dimensions, palette, element counts, original filename, subcategory, source, attribution, and import timestamp.
- `import_sources(sourceFile PRIMARY KEY, sourceHash, metadataHash, assetId, importedAt)`: last successful import per absolute path.
- `import_history(id PRIMARY KEY, startedAt, finishedAt, source, report)`: persistent progress and errors, exposed through `list_imports`.

Indexes cover category, JSON subcategory, and import start time. Existing `assets`, `asset_search` (FTS5), and `provenance` tables retain their schema and existing records. Subcategories join tags in FTS. Existing IDs, built-in icons, and stored document JSON remain valid. Geometry metadata for older assets is extracted on inspection without rewriting their vectors. `colorMap` is an optional document-node/patch field, so existing version-1 documents need no rewrite. Recolor changes use the regular mutation, revision, lock, and undo mechanisms.

Migration runs when the upgraded catalog is first opened, including by the CLI. It does not rewrite document files. Back up the data directory before adopting the upgrade. Existing service processes are not restarted automatically: new API/MCP tool handlers require a deliberate later restart. The sidebar reads persisted import progress every two seconds and refreshes results when import counts change.

## Vectors and security

Paths, groups, transforms, viewBox, IDs, gradients, clips, masks, markers, and local symbol/use references remain vector content. Scripts and case-insensitive event attributes are removed. DTDs/entities, unsafe external references, images, embedded HTML, unsupported namespaces, and unsupported elements/styles are rejected. Local references must resolve. Recursive or excessively expanding use graphs are rejected. Limits remain 2 MB/file, 20,000 XML elements, 60 nesting levels, and bounded geometry/attribute sizes.

Previews use sanitized SVGs; 128×128 SVG thumbnails retain aspect ratio. Recoloring maps exact fill/stroke/stop-color/color palette values on one document instance. Library originals remain immutable. SVG export embeds geometry, namespaces IDs and fragment references per instance, and applies palette mappings without rasterization.

## UI and MCP

The sidebar adds category/subcategory filters, keyword search, thumbnail previews, pagination, accessible Details buttons, metadata/provenance information, and import progress/errors. Click-to-add and canvas dragging remain; assets can also be dragged from the library to a canvas location. Palette recoloring is available in object properties.

Existing tools remain available. `search_icons` gains optional `subcategory`; `get_asset`, `list_categories`, `list_imports`, and `recolor_asset` are added. `add_icon`, `update_object`, and all prior tools use the same document service and keep revision protection. MCP registration and HTTP `/api/tools/<name>` dispatch share the definitions. `/api/icons/<id>?thumbnail=1` serves thumbnail vectors.

## Validation and limits

```sh
npm test
npm run build
npm run test:assets:browser
npm run test:mcp:metadata
```

The isolated browser check starts its own service on port 14317 with temporary assets/documents, then stops only that process. Set `FIGURE_ASSET_TEST_PORT` or `CHROME_PATH` when needed. It never uses the running workspace's documents.

Remaining limitations: no arbitrary path editing, raster thumbnails, CSS stylesheets, SVG filters, embedded images, or external fonts; unsupported structures fail visibly. Imports are resumable per file rather than atomic per collection. Original source width/height units are normalized to viewBox dimensions. Duplicate-source aliases are retained as provenance rather than merged into canonical FTS tags. A terminated importer can leave an unfinished history row; the next command remains resumable. Search uses lexical FTS and a small synonym dictionary. The UI observes CLI imports; it does not upload directories or launch an importer. Asset IDs persist per immutable geometry version, rather than one mutable ID per source filename.

## Implementation inventory and observed results

Changed implementation files:

- `src/assets/catalog.ts`
- `src/assets/importer.ts`
- `src/assets/sanitize.ts`
- `src/assets/cli.ts`
- `src/core/model.ts`
- `src/core/render.ts`
- `src/server/tools.ts`
- `src/server/main.ts`
- `src/ui/main.tsx`
- `src/ui/IconPreview.tsx`
- `src/ui/style.css`

Tests and tooling:

- `tests/assets-upgrade.test.ts` (new)
- `tests/importer.test.ts`
- `tests/mcp.test.ts`
- `tests/icon-preview.test.tsx`
- `scripts/assets-browser-smoke.ts` (new)
- `scripts/mcp-smoke.ts`
- `package.json` (`test:assets:browser` command)

Documentation/generated artifacts:

- `README.md`
- `docs/LICENSED_ASSET_IMPORT.md`
- `docs/ASSET_LIBRARY_UPGRADE.md` (new)
- `examples/asset-manifest.schema.json`
- `examples/mcp-tools.json`
- `dist/index.html` and Vite-generated `dist/assets/*`

Observed validation on 2 November 2026:

- `npm test`: 5 files, 30 tests passed, including existing document engine/persistence tests and imported-asset MCP SDK insertion/recolor/export.
- `npm run build`: TypeScript and Vite production build passed. Vite reports two dependency annotation warnings from Zod.
- `npm run test:assets:browser`: passed filters, details, SVG thumbnail loading, click insertion, instance recoloring, live import refresh, and library drag/drop in headless Chrome against isolated temporary storage.
- `npm run test:mcp:metadata`: official stdio SDK discovery passed for all 22 tools; regenerated tool metadata without calling the running document service.

The existing running service was not restarted. No existing asset or scientific document was changed or deleted; the workspace database was not opened for migration during verification. Only temporary test databases were migrated. Build output was regenerated as required.

## Follow-up: provenance and SVG sub-elements

Metadata-only reimports update the matching `(assetId, sourceHash, sourceFile)` provenance record. The importer compares the new source metadata with that source's previous metadata; only changed fields propagate to canonical asset metadata. This prevents a duplicate source's filename or inferred title from overwriting unrelated canonical fields. Original import timestamps, asset creation timestamps, source identity, and other sources' provenance stay intact. Legacy records without `asset_details` are also supported. No additional database migration is required.

The intermittent recoloring browser timeout came from sequential native prompts and a test that registered its second dialog listener after accepting the first prompt. Palette recoloring now uses an explicit form with a color selector, replacement field, and Apply button. Palette/element actions are disabled while loading or saving, stale metadata responses are ignored, and undo/redo buttons are disabled during saves. Browser regression testing delays the recolor response and checks both busy state and resulting SVG attributes; it no longer depends on dialog timing or longer timeouts.

SVG sub-element editing supports visible-tree `<path>` and `<g>` elements:

- Select an icon instance, then choose a path/group in **SVG element** in Properties. Alt-click an ordinary path on the canvas for direct selection.
- Set fill and stroke independently using hex colors or `none`. Reset removes only the corresponding override.
- Group attributes follow normal SVG inheritance: explicitly painted descendants retain their own paint. A group edit does not forcibly recolor every descendant.
- Edits are optional `elementStyles` on the document instance, keyed by element-child index paths such as `1/0`. Existing IDs and SVG hierarchy are retained. Keys include noneditable child positions and are stable for an immutable asset version, including paths/groups with no IDs.
- Palette mappings apply first; element overrides apply second. Changing an instance's asset clears old element overrides unless explicitly replaced. Original library vectors are never changed.
- Existing document schema version 1 remains valid; the new field is optional. Saves, revision conflicts, locks, persisted undo/redo, and SVG export use the existing document engine. Interactive selection attributes are omitted from exported SVGs.

Additional MCP tools (24 total):

```text
list_svg_elements {documentId, objectId}
recolor_svg_element {
  documentId, objectId, expectedRevision,
  elementKey: "1/0",
  style: {fill: "#ff0000", stroke: "none"}
}
```

Inspect `list_svg_elements` for valid keys, original IDs, hierarchy, transforms, and current explicit paint attributes. `fill: null` or `stroke: null` removes that property override. Omitted properties remain unchanged. Keys inside definitions and unsupported targets are rejected. Export retains vector paths and transforms, including namespaced definition references.

**Scope limits:** definitions (`defs`, symbols, clips, masks, markers), use-instance internals, text, primitive shapes such as rectangles/circles, gradient-stop editing, path-point editing, sub-element transform editing, and structural insert/delete/reparent operations are not exposed. These features may remain present in imported/rendered SVGs without being selectable. No CSS stylesheets, filters, embedded images, or external fonts are added. Returned paint attributes are explicit values, not a computed/inherited CSS cascade. Element overrides are limited to 1,000 per instance. Structural keys are scoped to the immutable asset version and are not portable to a different SVG.

Follow-up files include `src/core/svg-elements.ts`, `src/ui/SvgAssetEditor.tsx`, and `tests/svg-editing.test.ts`, plus catalog, model, renderer, tool definitions, editor UI/styles, browser smoke checks, MCP tool-count assertions, and generated tool metadata.

Follow-up validation: `npm test` passed 36 tests across 6 files with 0 failures; `npm run build` passed TypeScript/Vite with the same two non-blocking Zod annotation warnings; official stdio metadata discovery passed for all 24 tools; the expanded isolated browser smoke check passed three consecutive runs, including delayed palette responses, path/group editing, direct selection, independent fill/stroke, undo/redo, live imports, and drag/drop. Existing figures and the running service were not modified or restarted. All mutation tests used temporary storage.
