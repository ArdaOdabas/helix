# Licensed scientific SVG collection

Current implementation: see [Scientific asset library upgrade](ASSET_LIBRARY_UPGRADE.md) for optional manifests, CSV, incremental imports, migration details, per-instance recoloring, and browser verification.

## Transfer mechanism assessment — 2 November 2026

The project owner's explicit statement of permission from BioRender's founder is the basis for preparing this importer. No collection has started, and no BioRender content has been imported.

Public official sources inspected:

- [BioRender export formats](https://help.biorender.com/hc/en-gb/articles/17605437960605-Exporting-file-formats-in-BioRender), dated 8 October 2026: describes PNG and JPEG illustration exports, Premium PDF, and says vector export is unavailable.
- [BioRender library](https://www.biorender.com/library): describes in-app icon use and figure export to JPG, PNG, and PDF. It does not document a complete SVG-library download or bulk-transfer API.
- The previously collected [connector assessment](../../biorender_mcp_analysis.md) did not establish an asset-download API or authenticated schemas. Search results and previews are not a supported bulk-transfer mechanism.

**Finding:** no supported public bulk SVG-library export was found in these materials. This is not proof that a private provider-supported transfer does not exist.

Available options, before any collection:

1. **Preferred:** ask the founder/provider to supply an SVG package and a JSON/CSV metadata manifest through their chosen transfer channel, with asset IDs, versions, categories, tags, provenance, and the agreed license reference. Locally unpack the package, then use this importer.
2. Ask for a provider-managed snapshot or authenticated documented bulk-export endpoint. Obtain its documentation, pagination and rate-limit rules before implementing a separate transfer adapter. No downloader exists in this MVP.
3. Arrange a provider-assisted export if their internal format needs conversion to standalone SVG. Request a small representative sample first to check supported features and metadata mapping.
4. Standard illustration exports can support manual reference workflows, but the documented raster outputs do not provide the editable vector library required here.

No requests for permission or assets were sent to BioRender. No authentication, rate-limit, access-control, or technical restriction was bypassed. The existing icon search UI and browser caches were not used for extraction.

## Import boundary

`src/assets/cli.ts` is a separate local-only process. It accepts a real directory plus an optional manifest, walks it incrementally, ignores symlinks, and processes `.svg` files. It never accepts a remote URL, invokes a browser, or requests credentials. ZIP extraction and all provider transfer work remain outside its scope.

```sh
npm run import:assets -- samples/svg samples/manifest.json
# Provider package, once supplied and unpacked:
npm run import:assets -- /absolute/path/to/package /absolute/path/to/manifest.json /absolute/path/to/project/data
```

Use the same data directory as the document service. The default is the project's `data` directory when invoked from the project root. A different directory must also be supplied through `FIGURE_DATA_DIR` when starting the service. Relative manifest asset keys are relative to the input directory. Do not place credentials or private endpoint values in a manifest.

Manifest example:

```json
{
  "version": 1,
  "provider": "Provider name",
  "license": "Agreed commercial license identifier",
  "licenseReference": "Agreement or authorization reference",
  "attribution": "Agreed attribution text",
  "defaults": {"category":"Cell structures","tags":["organelle"]},
  "assets": {
    "cells/example.svg": {
      "name":"Example scientific icon",
      "providerId":"provider-asset-123",
      "category":"Cell types",
      "tags":["cell","mammalian","human"],
      "description":"Scientific description and scope"
    }
  }
}
```

When a JSON manifest is supplied it requires provider, license, and license reference. Without a manifest, provenance is explicitly recorded as Local collection / Unspecified / Not supplied. These fields record supplied provenance; the program does not independently authenticate an agreement. The owner has already stated authorization, so no additional permission gate is implemented.

## Validation and sanitization

A real XML parser validates structure. The sanitizer uses an explicit element/attribute allowlist. It accepts paths, basic geometry, groups, inline text, local gradients, and clipping. Safe inline style declarations are converted to presentation attributes. Comments and root pixel dimensions are removed; the viewBox is retained or derived from positive numeric dimensions.

Scripts and event handlers are removed. DTD/entity declarations, processing instructions other than the initial XML declaration, embedded HTML, external references, images, style sheets, unknown namespaces, unresolved fragment references, duplicate IDs, and unsupported elements are rejected. CSS escapes and unsafe URI-bearing values are rejected. Per-file size, element count, attribute length, nesting depth, and dimensions are bounded. Rejections are reported without silently importing a visually damaged asset. Safe masks, markers, symbols and local use references are supported with expansion checks. Filters and external fonts are not supported; representative provider assets may need provider-side normalization or a deliberately tested extension.

Source SHA-256 records input identity. Sanitized SVG SHA-256 is the content-addressed asset identity. This deduplicates identical sanitized bytes; it does not attempt geometric or perceptual equivalence. Metadata from duplicate source files is retained as separate provenance records. The first imported descriptive record is the canonical search record; later provenance aliases are retained but are not merged into its search tags.

## Storage and large-collection design

- SQLite WAL catalog with full-text indexing; imports and searches do not load the entire library into memory.
- SHA-256-addressed standalone SVG files; document instances reference immutable asset IDs.
- Per-asset 128 × 128 **SVG thumbnails**, generated locally from sanitized vectors. These are thumbnail artifacts, not raster PNG files.
- Provider IDs, license references, attribution, source filenames, and source hashes retained in a provenance table.
- Paginated search shared by the UI and MCP, with category filtering.
- Scientific tags and a small curated synonym dictionary supplement Unicode full-text ranking. This is deterministic semantic metadata search, not an embedding-based search engine. No AI key is required.
- Re-imports are resumable in the sense that already present content is deduplicated and provenance inserts are idempotent. Reports bound failure details to 1,000 entries while retaining rejection counts. There is no package-level all-or-nothing transaction.
- One command owns each asset metadata transaction. Asset catalog writes use SQLite locking; the document service remains the sole document writer.

The included benchmark uses synthetic original geometry and metadata. It measures sanitization, asset/thumbnail writes, SHA-256 deduplication and catalog indexing together. It is not a performance guarantee for complex provider SVGs.

## Document insertion

`search_icons` returns IDs, scientific tags, category, provider, and license metadata. `add_icon` validates the selected asset and inserts an SVG-backed object through the same command engine as manual editing. Instances support transforms, grouping, visibility, opacity, deletion, and persisted identity. Original icons use `currentColor` for recoloring. Imported icons retain fixed palette colors; per-path editing is not implemented. Exact palette remapping is supported per instance through `recolor_asset` and object properties. Export embeds the required sanitized vectors and namespaces local definition IDs per instance.

Back up the catalog database, asset directory, thumbnails, and documents together. A document JSON with external asset IDs is editable but is not a self-contained asset bundle; SVG export is self-contained.

## Remaining steps for the licensed library

1. Obtain the provider-selected package/transfer mechanism and a representative sample. No bulk download should precede that step.
2. Map provider metadata to the manifest and retain the actual agreement reference and attribution.
3. Run local sample import; inspect rejection reports and visual fidelity, especially gradients, clips, text, and unsupported features.
4. Normalize unsupported features through a supported provider export or extend the sanitizer with tests; do not simply remove checks.
5. Import the complete supplied package, review counts and duplicate/provenance records, and back up the catalog.
6. Validate taxonomy search quality and rendered/exported figures against representative source assets. Add richer synonym or local embedding support only if retrieval evaluation warrants it.

Current validation results and environmental blockers are recorded in `IMPLEMENTATION_STATUS.md`.
