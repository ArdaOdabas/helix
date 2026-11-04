# Bioicons integration and verification

Official source: https://github.com/duerrsimon/bioicons

Pinned commit: `d29e766ea7580b8063c4f47b29e872db40a4d979`. Downloaded with `git clone --depth 1`; no source repository modifications. No provider websites were scraped, no author-site assets fetched, and no BioRender-related references were found in the icon tree. The repository's top-level MIT license covers its web application; icon licensing comes from individual license directories and their original notices.

## Collection and license inventory

The official contribution guide defines the layout as `static/icons/<license>/<category>/<author>/<filename>.svg`. We read that layout, `authors.json`, `icons.json`, and all seven license notices. The checked-in icon index has 2,804 records and is stale: 30 actual files are not matched by the index; the filesystem is authoritative for enumeration. One SVG lacks an author directory and has no matching index attribution; it is skipped. Missing author links are retained as empty references; the author name is preserved, not invented.

- Total repository SVGs discovered: **2,836**.
- Scientific icon files: **2,830**; six website/logo graphics are outside the icon collection and skipped.
- Compatible source files: **1,581**.
- Newly imported unique vector assets: **1,579**.
- Duplicate files: **2**, skipped while retaining their separate provenance/licenses.
- Missing-attribution file skipped: **1**.
- Unsupported/malformed/over-limit files rejected: **1,248**.
- Importer runtime failures on compatible files: **0**.
- Aggregate accounting: 1,579 imported + 9 skipped (6 site resources, 2 duplicates, 1 missing attribution) + 1,248 rejected = 2,836 discovered.
- Repeat import: **1,581 skipped, zero new assets, zero updates, zero failures**.

| License | Discovered icon files | Imported unique assets |
| --- | ---: | ---: |
| BSD-3-Clause | 3 | 2 |
| CC0-1.0 | 488 | 145 |
| CC-BY-3.0 | 1376 | 1307 |
| CC-BY-4.0 | 885 | 116 |
| CC-BY-SA-3.0 | 4 | 2 |
| CC-BY-SA-4.0 | 35 | 5 |
| MIT | 39 | 2 |

The imported column counts canonical geometry records, not source files. Every successful source, including duplicate geometry, keeps its own attribution and license in provenance. Original full license notices are copied verbatim into `reports/bioicons/licenses` and `data/licenses/bioicons`. Per-file metadata preserves original author name/reference, category, upstream path, filename, pinned GitHub source URL, original-file SHA-256, license identifier/URL, and immutable license-notice URL. The manifest and full unmodified upstream author registry are retained alongside this report.

## Import method and scope

`src/assets/bioicons.ts` is a small metadata adapter; `scripts/import-bioicons.ts` preflights the entire collection and passes supported originals to the existing `importDirectory`. Raw bytes are staged, not flattened or redrawn, in `data/bioicons-source/<commit>`. No source SVG in the git checkout is changed. Category labels preserve upstream taxonomy with underscores/hyphens converted to spaces; `Bioicons` is a subcategory and searchable keyword. Names, taxonomy tokens and descriptions (including authors) enter the existing SQLite FTS5 index.

The sanitizer gained tested support for harmless version/export attributes, explicit clip-path units, SVG XML whitespace, Unicode IDs, and additional safe presentation properties. Non-rendering editor/RDF metadata is removed; upstream attribution is retained in the catalog manifest/provenance. Geometry, paths, groups, transforms and viewBox stay vector. Unsupported constructs fail visibly rather than being silently removed. No new database tables or document schema versions were required.

SVG exports now embed JSON attribution records in XML metadata, including all contributing source licenses, complete locally stored license notices, and palette/sub-element modification records. Library originals remain unchanged. Interactive selection attributes are not exported. This does not assign a single blanket license to a mixed-license figure.

The attribution-notice path was finalized through a second metadata-only importer run (1,581 source records updated, no new geometry). Both the initial counts/timings and finalization report are retained; later runs are idempotent.

## Performance on the full checked-out collection

- All 2,830 icon files inventoried; 2,829 with known author layout preflighted.
- Initial preflight: **3.64 s**.
- Import of all 1,581 compatible source files: **2.59 s** (~609 new assets/s).
- Initial incremental reimport: **0.28 s**.
- Complete catalog: **1,597 icons** including the 18 preexisting built-in/imported icons.
- 300 warm in-process FTS queries on the populated catalog: median **0.288 ms**, p95 **0.736 ms**, max **0.94 ms**. Final metadata-run measurements are also available in JSON.
- Every imported title tested: **1,579 / 1,579 found**, in **575.0 ms** total.
- 60 end-to-end official stdio MCP/HTTP search queries: median **1.00 ms**, p95 **1.82 ms**, max **2.72 ms**.

These are local warm-cache measurements, not a claim that all 2,830 source SVGs are supported/indexed. Original dimensions/complexity and hardware affect throughput.

## MCP, rendering and preservation checks

A NEW document, **Bioicons — licensed vector import verification**, ID `054e2a30-a943-4608-a67c-ae4f866fed79`, revision **44**, contains 14 inserted/recolored examples covering all seven imported license types. Official SDK stdio → existing MCP adapter → live HTTP service checks passed for search, pagination across all 1,579 entries, metadata inspection, insertion, per-path/group recoloring, and SVG export. Exported metadata contains original authors, source/licensing references, full license notices, and the applied changes.

Geometry comparisons passed for **all 1,581 compatible source files** and all **14 exported examples**, comparing path data, primitive geometry attributes and group/element transforms. Browser checks passed for pagination (30 → 60 entries), **60 decoded thumbnails**, attribution details, rendered modifications, and **0 page errors**.

The **2 preexisting documents** and **12 preexisting imported SVG files** were verified unchanged by complete-file SHA-256 (including document history). The development processes were restarted once to load the extended SVG profile and export metadata. No existing figure was edited.

Artifacts: [summary](summary.json), [original import measurements](first-import-report.json), [latest metadata/import report](import-report.json), [inventory](inventory.json), [per-file rejected list](rejected.json), [MCP results](mcp-verification.json), [geometry checks](geometry-verification.json), [browser checks](browser-verification.json), [vector gallery](verification.svg), [preview](verification.png).

Regression suite: **53 passed, 0 failed** across 8 files. Production build passed with two non-blocking Zod annotation warnings.

## Remaining unsupported features

The largest first rejection reasons are stylesheets (562), DTD/entity/processing declarations (213), unsupported line-height styles (115), font-variant (65), embedded images (58), font-variation settings (34), and RDFa/typeof (32). Other rejections include filters, patterns, blend/flow-text/font constructs, custom namespaces and unsupported styling. Six files exceed the 2 MB limit; three are malformed/empty. Counts are the first failing feature per SVG; files can contain more than one unsupported feature. All 1,248 rejection records are retained without the importer's normal 1,000-error display cap.

Sub-element editing remains fill/stroke overrides on visible-tree paths/groups. Definition/use internals, arbitrary path-point/transform editing, and per-primitive editing are not exposed. Whole-asset transforms and vector export remain available. No unsupported artwork was rasterized or silently flattened.

## Repeat commands

Use Node 24 from the project root. The checkout is retained locally and ignored by the Helix source ignore rules; no upstream dependencies or scripts were installed/executed.

```sh
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
# On a fresh checkout only:
git clone --depth 1 https://github.com/duerrsimon/bioicons.git vendor/bioicons
# Verify/refuse locally modified or non-official checkouts, stage supported originals,
# import with the existing importer, and benchmark the full collection:
node scripts/import-bioicons.ts vendor/bioicons data
# Creates ANOTHER NEW test document through live MCP:
node scripts/verify-bioicons.ts
# Read-only geometry/browser checks using the current report document:
node scripts/check-bioicons-geometry.ts
node scripts/check-bioicons-ui.ts
npm test
npm run build
```

Back up the entire data directory, including `licenses`, `assets`, `thumbnails`, `catalog.sqlite`, and `documents`. The full notices and pinned source/provenance information remain available even when not connected to GitHub.
