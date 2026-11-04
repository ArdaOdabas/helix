# NIH BioArt integration and MCP sub-element editing

## Completion and scope

ID-based and atomic MCP editing is implemented through the existing override model and command engine. The exact authorized mitochondrion fixture is fixed. Four actual official NIH SVG illustrations have been imported and verified. This is a **verified local-download integration and selected sample acquisition**, not a claim that the entire 2,000+ illustration website has been enumerated/imported.

Bioicons was not reimplemented or reimported. The protected PRBJN / 8CLC document was not modified.

## Root cause and MCP behavior

The document model already supported optional `elementStyles` and `colorMap`; the renderer/exporter, persisted undo/redo, and legacy `list_svg_elements` / `recolor_svg_element` worked through the live service. The attached conversation's MCP tool inventory still exposed only 18 original tools, whereas a fresh stdio server exposed the then-current 24. Long-lived MCP processes and cached client tool schemas do not reload source changes automatically. There was also no friendly original-ID edit tool and no atomic multi-element operation.

The shown `modifications: {palette:{}, elements:{}}` was generated SVG export metadata reflecting absent instance overrides. It was not an editable source document command surface. No second asset model or mutation engine was created.

New tools (28 total, all prior tools retained):

- `list_icon_elements`: original IDs, structural keys, explicit fill/stroke, parent key, tag, transform, revision, and paginated results.
- `update_icon_element`: one ID/key paint update.
- `update_icon_elements`: multiple ID/key paint updates, fully validated before saving one revision and one undo transaction.
- `list_providers`: providers and distinct asset counts.

`search_icons` and `list_categories` gained optional provider filters. Existing names/schemas remain backward compatible. Legacy recoloring and new operations use one `updateSvgElementStyles` helper and the existing Store mutation path. Paint edits now include basic SVG primitives as well as paths/groups. Definition/use internals and geometry editing remain excluded.

Example:

```json
{
  "documentId": "22e4ffb0-cc28-4226-b024-2056d9916923",
  "objectId": "62bc9dd2-9dc1-4238-b0ed-82e56154e59a",
  "expectedRevision": 12,
  "changes": [
    {"elementId":"outer-membrane","fill":"#4389C7"},
    {"elementId":"inner-membrane","fill":"#E89B43"}
  ]
}
```

Call `get_document` first for the current revision. A change accepts exactly one `elementId` or `elementKey`, plus independent `fill` / `stroke`. `null` resets only that override; omitted properties stay unchanged. Invalid targets reject the whole batch. Source SVG assets are never changed.

**Client deployment step:** disconnect/reconnect `scientific_figure_editor` in Claude/Codex (or restart its MCP connection) so its stdio process loads current source and tools/list is refreshed. The server advertises tool-list change support and emits an initialization notification; server component version is now 0.2.0. Official SDK discovery and invocation of all relevant tools passed. An actual Claude Desktop conversation after manual reconnection was not automated or independently verified. Existing client configuration paths remain valid.

## Authorized mitochondrion regression

Document `22e4ffb0-cc28-4226-b024-2056d9916923`, instance `62bc9dd2-9dc1-4238-b0ed-82e56154e59a`:

- Outer membrane: **#4389C7**.
- Inner membrane: **#E89B43**.
- Cristae and matrix granule unchanged, including strokes and transforms.
- One atomic batch was initially saved from revision 3 to 4; subsequent undo/redo verification leaves the current fixture at revision **12**.
- Live browser synchronization, including while library search retains focus, passed. Page refresh retained both colors. Undo/redo passed and SVG export retained the fills.
- Original asset SHA-256 unchanged.

Library-search focus no longer suspends document polling. Unsaved inspector/plan fields still defer polling so drafts are not overwritten.

Artifacts: [mitochondrion SVG](mitochondrion.svg), [mitochondrion preview](mitochondrion-after.png), [verification details](verification.json).

## Official source research and acquisition

Reviewed official sources: [home](https://bioart.niaid.nih.gov/), [FAQ](https://bioart.niaid.nih.gov/faqs), [terms](https://bioart.niaid.nih.gov/terms), [release notes](https://bioart.niaid.nih.gov/release-notes), and the five selected entry pages. The FAQ states that no account is needed. Terms/FAQ direct users to each entry's license; Public Domain and attribution-requiring entries must not be conflated. The per-entry controls offer representations and file types including SVG, AI, EPS, and PNG where available.

Official landing-page categories observed: Viruses, Anatomy, Cells and Organelles, Equipment, Proteins, Animals, People, Arthropods, Bacteria, Cellular Processes, Molecules, Plants, Shapes, Brushes, Swatches, Templates. Not every entry/representation necessarily offers SVG.

No published official bulk archive, dataset, repository, documented API, or numeric request limit was verified in these reviewed pages. No guessed download API or third-party mirror was used. Normal official browser controls were used for these explicitly selected entries only:

| Entry | Title | Per-entry license | Result |
| --- | --- | --- | --- |
| [173](https://bioart.niaid.nih.gov/bioart/173) | Generic Immune Cell | Public Domain | Imported |
| [353](https://bioart.niaid.nih.gov/bioart/353) | Mitochondria | Public Domain | Imported |
| [72](https://bioart.niaid.nih.gov/bioart/72) | Cell Nucleus | Public Domain | Imported |
| [483](https://bioart.niaid.nih.gov/bioart/483) | Schematic Protein Shape Phosphorylated | Public Domain | Imported |
| [519](https://bioart.niaid.nih.gov/bioart/519) | Human Anatomy | Public Domain | Rejected: unsupported filter styling |

The default SVG representation was selected through the official UI. The optional browser recorder accepts explicit official entry URLs and is not a catalog crawler. It does not construct file endpoints. Individual authors, credits, categories, subcategories, descriptions, keywords, dates, entry URLs and licenses are recorded from the actual downloaded metadata and visible entry page. Missing metadata remains absent; unknown/conflicting licenses fail. The observed creator was Ryan Kissinger with Courtesy of NIAID credit. This statement is about the acquired entries only, not the entire collection's license distribution.

The local workflow is the primary adapter. Operators can download files manually and supply the same per-file manifest. Sequential UI transfers honor access-denied/CAPTCHA stops and bounded exponential retries for transient HTTP responses, including Retry-After. Completed files have checksum checkpoints; a completed file interrupted before manifest persistence can be recovered from its saved entry text. Incomplete browser downloads restart rather than implementing an undocumented range API. Real access-denial/rate-limit errors were not induced; these behaviors are regression-tested with simulated responses.

## Import accounting and source preservation

- **5 distinct official SVG downloads**, represented by five per-entry metadata records.
- **6 local SVG files**: an early first copy of the immune-cell SVG is byte-identical to the manifest-linked copy.
- **4 imported assets**, provider exactly `NIH BioArt Source`.
- **1 unmanifested duplicate skipped**, retained locally rather than deleted.
- **1 rejected** Human Anatomy SVG requiring unsupported filters. Original bytes retained; no partial artwork or raster substitute imported.
- Importer runtime failures on compatible inputs: **0**.
- Repeat import: **4 unchanged files skipped**, no new assets or updates. The unchanged rejection is cached by source hash/profile.
- Imported license distribution: **Public Domain: 4**. All five acquired entries were individually marked Public Domain. No license inference is made for unacquired entries.
- Imported categories: **Cells and Organelles (3)**, **Proteins (1)**. Official subcategories and all category labels remain in metadata and are filterable; no new scientific taxonomy was fabricated.

The existing SVG sanitizer/importDirectory, SQLite FTS catalog, immutable content hashes, provenance and import history are reused. Preflight/staging is local and resumable. Raw bytes are retained in `data/bioart-downloads` and the accepted-source staging directory `data/bioart-source`. A manifest allowlist prevents unrelated files from being imported. Source hashes, safe metadata and successful/failed preflight outcomes are cached with the sanitizer profile, avoiding repeated XML normalization of unchanged inputs.

SVG namespace prefixes and simple class paint styles are normalized without changing geometry. Supported presentation properties and a small enum-only blend/isolation subset are preserved; inline styles retain priority. Local clips/gradients and IDs survive. Unsupported selectors, !important rules, external references, filters, DTDs, scripts and advanced features remain rejected or safely removed as appropriate. Parser/rule/element limits bound complexity. No source art is rasterized.

No new database table or document schema version was needed. Additive provider/category and provenance-provider indexes support filtering. Duplicate geometry can belong to multiple providers through existing provenance; alias names/categories/keywords are incrementally indexed for touched assets, while per-source licensing is retained. Existing IDs and asset files stay immutable. There is no blanket relabeling of Bioicons.

## UI and scalability

Search defaults to all providers. Provider, category and subcategory filters work in the sidebar and through MCP. Attribution/license/source details, SVG previews, import status/errors and insertion remain available. The browser holds one bounded 30-item catalog page; next/previous replace the page rather than accumulating the entire collection. Thumbnails use immutable content-ID caching, ETags and verified 304 responses.

Current mixed catalog: **1601 icons**. 300 NIH-filtered searches measured median **0.133 ms**, p95 **0.315 ms**. 300 all-provider searches measured median **0.343 ms**, p95 **0.579 ms**. A separate **20,000-row synthetic metadata/FTS** benchmark measured median **14.83 ms**, p95 **21.60 ms**. This is not a claim that 20,000 official NIH assets were acquired or that their SVG rendering/import throughput was tested.

## Validation

NEW document: **NIH BioArt SVG Integration Test**, ID `2af8a07e-af3c-455c-971e-1c8cd3e32896`, revision **28**. It contains four BioArt illustrations. The nucleus provides 13 paths and clipping structure; two independent elements in each instance were recolored. Browser colors, reload persistence, provider/category/search behavior, thumbnails/caching, metadata and vector export passed. Geometry/transform comparisons passed against the raw official downloads and after export. Original asset hashes are unchanged.

- Unit/integration suite: **65 passed, 0 failed**, 9 files.
- Official stdio MCP discovery: **28 tools**, relevant ID/batch operations invoked successfully.
- Live authorized-fixture and NIH browser/MCP checks: passed, zero page errors.
- Isolated browser regression (insertion, palette, primitive/path/group editing, drag/drop, undo/redo, import refresh): passed.
- Production TypeScript/Vite build: passed. Two non-blocking dependency annotation warnings from Zod remain.
- All **3 protected existing document files** (including PRBJN) and **1591 existing imported SVG files** match their baseline SHA-256. The only preexisting document modified is the explicitly authorized mitochondrion fixture. The NIH document was created during this task.
- Development processes were restarted to activate the new handlers and final normalization guards. Existing scientific figures were not rewritten.

Artifacts: [summary](summary.json), [research](research.json), [download metadata](download-manifest.json), [initial import](first-import-report.json), [latest/resumed import](import-report.json), [integrity](integrity.json), [performance](performance.json), [live verification](verification.json), [NIH vector export](integration-test.svg), [NIH preview](integration-test.png).

## Remaining limits / unverified work

The full BioArt catalog and all representation variants have not been enumerated or imported. Only five explicitly selected default SVG downloads were acquired. No official bulk endpoint was verified. The optional UI recorder requires installed Chrome and may need updating if NIH changes its public controls; the local-file adapter remains available independently.

General CSS selectors/stylesheets, filter effects, embedded images, DTDs, pattern/flow-text/font constructs and arbitrary geometry/transform editing remain outside scope. Paint editing covers visible-tree paths, groups and basic vector primitives; shared definition/use internals are not directly editable. Returned fill/stroke values are explicit attributes, not the full computed CSS cascade. The rejected Human Anatomy artwork was not silently degraded.

A running Claude/Codex MCP child must reconnect to load source/schema changes. The fresh SDK protocol path is verified; actual Claude Desktop UI reconnection/tool execution was not controlled by this task. Long Retry-After delays stop for a later resume rather than holding the agent indefinitely. Partial-file byte-range resume is not implemented for blob downloads.

## Exact repeat/resume commands

From the project root:

```sh
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"

# Optional normal-UI acquisition of the same published entries.
# Complete unchanged files are checked locally and skipped.
node scripts/acquire-bioart-ui.ts data/bioart-downloads \
  https://bioart.niaid.nih.gov/bioart/173 \
  https://bioart.niaid.nih.gov/bioart/519 \
  https://bioart.niaid.nih.gov/bioart/353 \
  https://bioart.niaid.nih.gov/bioart/72 \
  https://bioart.niaid.nih.gov/bioart/483

# Local-file import/resume using the existing shared importer:
node scripts/import-bioart.ts \
  data/bioart-downloads data/bioart-downloads/bioart-downloads.json data

# Revalidates ONLY the authorized mitochondrion fixture and this task's NIH test document:
node scripts/verify-bioart.ts
node scripts/benchmark-bioart.ts
npm test
npm run test:mcp
npm run test:assets:browser
npm run build
```

To use manually downloaded files, create a version-1 JSON manifest with `assets` records like the included [download manifest](download-manifest.json). Supply exact per-file metadata from each official entry. Relative filenames, official entry URLs, titles, per-entry licenses and license references are required. Creator/category/keywords/credit/date fields are optional and must not be invented. Optional SHA-256 values enforce transfer integrity. Back up the entire data directory and these source/attribution records together.

## Files modified / added

- src/core/svg-elements.ts
- src/server/tools.ts
- src/server/main.ts
- src/mcp/server.ts
- src/assets/catalog.ts
- src/assets/importer.ts
- src/assets/sanitize.ts
- src/assets/svg-normalize.ts (new)
- src/assets/bioart.ts (new)
- src/assets/bioart-local.ts (new)
- src/assets/bioart-retry.ts (new)
- src/ui/main.tsx
- scripts/acquire-bioart-ui.ts (new)
- scripts/import-bioart.ts (new)
- scripts/verify-bioart.ts (new)
- scripts/benchmark-bioart.ts (new)
- scripts/mcp-smoke.ts
- scripts/check-bioicons-ui.ts
- tests/bioart.test.ts (new)
- tests/mcp.test.ts
- tests/bioicons.test.ts
- examples/mcp-tools.json
- examples/asset-manifest.schema.json
- README.md
- docs/ASSET_LIBRARY_UPGRADE.md
- reports/bioart/* (new reports, metadata, SVGs and previews)
