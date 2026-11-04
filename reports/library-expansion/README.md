# Scientific library expansion and MCP validation

Validated November 3, 2026. Counts come from `data/catalog.sqlite`, source bindings and preserved official inventories, not advertised collection sizes. Machine-readable evidence: [summary](summary.json), [geometry audit](geometry.json), [performance](performance.json), [MCP NIH proof](mcp-real-assets.json), [six-provider MCP proof](provider-mcp.json), [browser checks](browser.json), [exact protocol schemas](mcp-tools.json).

## 2026-11-04 — recovery pass and SciDraw resumption

The importers had been refusing a large share of each source over cosmetic markup rather than
anything unsafe, and SciDraw's acquisition had stopped early. Both were addressed.

**Sanitizer policy change.** Unknown *style properties* and *attributes* are now dropped instead of
failing the file (removing a declaration can only change appearance); editor private data blocks —
Illustrator's PGF, Inkscape's namedview — are stripped like other metadata; a constant internal
entity subset is expanded under rules that make expansion attacks impossible (internal only, no
nested values, capped count and size); `<switch>` and `<a>` are unwrapped and `<filter>` definitions
removed with their references; the byte cap moved from 2 MB to 6 MB and was aligned across the four
places that defined it. Still refused: scripts, event handlers, external references of any kind,
embedded raster, parameter and external entities, and elements in unknown namespaces.

**Counts after re-import** (professional, non-silhouette providers):

| Provider | Before | After |
|---|---:|---:|
| NIH BioArt Source | 4,127 | 4,225 |
| Bioicons (incl. Servier) | 1,579 | 2,222 |
| Togo Picture Gallery | 1,114 | 1,370 |
| SciDraw | 91 | 365 |
| **Total** | **9,276** | **10,547** |

**SciDraw.** The cached terms permit download, modification and use of any image (CC-BY 4.0 or CC0)
and contain no restriction on automated access. The earlier run had been halted by an HTTP
401/403/429 from the site, so the crawl pace was made configurable and the resumed run used one tab
at one page per 3 s. 543 of 704 entries were downloaded (110 entries offer no SVG at all); the site
refused once more near the end and the run stopped itself, which is where acquisition was left.
`manualReviewRequired` remains set in the checkpoint, so any further run needs an explicit
`--resume-after-review` after a fresh look at the terms and rate limits.


## Actual acquisitions

| Provider | Discovered | Downloaded | New SQLite assets | Skipped | Rejected SVGs | Artwork license |
|---|---:|---:|---:|---:|---:|---|
| Reactome | 2,571 | 2,571 | 2,365 | 206 | 0 | CC BY 4.0 |
| Togo Picture Gallery | 2,094 | 2,086 | 1,114 | 41 | 939 | CC BY 4.0 |
| PhyloPic | 13,354 | 13,354 | 13,321 | 15 | 18 | Per image; seven licenses below |
| Health Icons | 1,552 | 1,552 | 863 | 689 | 0 | CC0 1.0 |
| SciDraw | 704 entries | 230 | 91 | 20 | 139 | Imported images: CC BY 4.0 |
| SciSVG | 30 | 30 | 25 | 5 | 0 | CC BY 4.0 |

Imported means new canonical asset rows, not aliases. Skipped comprises scientific-scope exclusions, geometry duplicates, Togo's eight known oversized transfers, and SciDraw's twenty entries with no downloadable SVG. SciDraw has another **454 unprocessed entries**. Health Icons counts only the primary 48px filled/outline candidates; 24px copies and branding were excluded. Reactome exclusions are arrows/backgrounds; Health exclusions are generic categories. Discovered does not imply scientifically curated or importable.

**23,497 total rows**, up from 5,718; **17,779 new canonical assets**. Existing providers remain NIH BioArt Source 4,127 and Bioicons 1,579; two original samples and ten original test assets are retained. Excluding those twelve local samples/test assets gives **20,286 distinct vector structures**, of which **19,175 have scientific categories**. The remainder are explicitly Unclassified; this is not a claim of 20,000 expertly curated scientific illustrations.

Unique non-test structures by best heuristic grade: **A 952, B 5,105, C 14,229**. Raw rows including retained legacy duplicates and local samples/tests: A 1,903; B 6,535; C 15,059. A requires at least twenty editable primitives and two groups; B at least three primitives; C includes simpler useful drawings and all PhyloPic silhouettes. These structural grades do not measure scientific accuracy. Unsupported drawings are not put into the usable catalog as grade D.

**207 new duplicate source files** reuse existing geometry. **3,199 legacy duplicate rows remain** to preserve document references. Geometry fingerprints ignore paint and non-rendering metadata while preserving geometric attributes and references. They are conservative structural comparisons, not general visual equivalence under arbitrary scaling, rotation or retracing. There are **1,096 rejected downloaded SVGs plus eight oversized acquisition skips (1,104 unsupported source files)**. Rejection reasons include raster image elements, filters, unsupported attributes/namespaces, custom entities, size and complexity limits. Originals are retained; rejected illustrations are not flattened or partially imported.

## Official sources and attribution

- [Reactome Icon Library](https://reactome.org/icon-lib): official category pages and their linked individual SVG files. The advertised SVG tar archive returned 404. Institutional attribution is retained with original titles/categories/source URLs.
- [Togo official README](https://dbarchive.biosciencedbc.jp/data/togo-pic/LATEST/README_e.html) and [download page](https://dbarchive.biosciencedbc.jp/en/togo-pic/download.html): official live image directory and preserved `20180926_togopic_masterfile.csv`. Documented archive URLs tested returned 404; individual official files were used. Mandatory credit `© 2016 DBCLS TogoTV / CC-BY-4.0` retained. Scientific names, taxonomy IDs and creators are copied where CSV rows exist; newer unmatched files have no invented metadata. Case-colliding filenames use deterministic URL hashes locally; original filenames and URLs remain in provenance.
- [PhyloPic documented API](https://www.phylopic.org/articles/api-recipes), [API specification](https://api-docs.phylopic.org/v2/index.html): build 562, 13,354 records, linked official `vectorFile` downloads. Provider-generated silhouettes may originate from raster submissions; Helix performs no tracing or rasterization. Original source-file links, creator/attribution, node IDs and external taxonomy references remain in raw metadata.
- [Health Icons licensing](https://healthicons.org/licenses), official `resolvetosavelives/healthicons` repository: artwork CC0; website software MIT is not used as the artwork license.
- [SciDraw terms](https://scidraw.io/terms): normal gallery/detail browsing and publicly exposed official SVG download links. Acquisition stopped on an HTTP 401/403/429 listener; the original runner failed to persist the exact denied response, so its exact status is unknown. No subsequent SciDraw requests were made. All 91 imported drawings preserve their official gallery primary creator; **full contributor lists are unverified for all 91**, explicitly recorded in metadata. Twenty other downloaded detail pages had full author metadata but were unsupported. This integration is partial and needs access review/manual contributor verification.
- [SciSVG official repository](https://github.com/SaveenaSolanki/SciSVG): artwork CC BY 4.0, separate from MIT software. Scientific scope excludes five general-science assets.

PhyloPic license distribution across successfully mapped source records (canonical geometry dedup may reduce the asset count): CC0 **6,993**; Public Domain Mark **778**; CC BY 4.0 **2,537**; CC BY 3.0 **1,059**; CC BY-SA 3.0 **1,218**; CC BY-NC 3.0 **422**; CC BY-NC-SA 3.0 **329**. License terms and attribution are per source, including aliases; do not assume all images permit commercial use. Full per-provider SQL provenance distributions are in `summary.json`.

## MCP fix and real-asset evidence

The internal SVG element override engine and some source-level tools already existed. The long-running client connection still advertised an old eighteen-tool registry. Anonymous SVG elements also lacked a preferred stable public ID, and the previous tool input shape did not accept the requested root `elementId`/`patch` contract. The existing shared command engine was extended; no parallel editing implementation was created.

Fresh configured stdio MCP connections discover **28 tools**, including all original eighteen. Server version is **0.3.0**. The preferred schemas are:

```ts
list_icon_elements({
  documentId: string, objectId: string,
  limit?: number, // integer 1..1000, default 100
  offset?: number // nonnegative integer, default 0
})
update_icon_element({
  documentId: string, objectId: string, elementId: string,
  patch: { fill?: Color|null, stroke?: Color|null,
           strokeWidth?: number|null, opacity?: number|null },
  expectedRevision?: number // nonnegative integer
})
update_icon_elements({
  documentId: string, objectId: string,
  changes: Array<{elementId: string, patch: Patch}>, // 1..1000
  expectedRevision?: number
})
```

Document/object identifiers match `^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$`; element IDs are 1..500 characters. Patch objects reject unknown fields and must contain at least one property. `strokeWidth` is finite 0..1000; `opacity` finite 0..1. Colors are `none` or hex with 3, 4, 6 or 8 digits; external paint URLs are rejected. Null removes an override. Legacy `change` and flat `elementKey` inputs remain supported; exact JSON Schema including all unions is in `mcp-tools.json`.

Listing returns original IDs or deterministic `@svg:<structural key>` IDs, element type, raw current fill/stroke, numeric styling, parent key, transform and editable flag. Raw paint is not a full browser-computed inherited CSS style. Patches persist in existing `elementStyles` and palettes in `colorMap`; export serializes these as `modifications.elements/palette`. Invalid IDs reject the entire batch, producing no revision or partial update. A valid batch produces one command/revision and undo transaction. Source SVGs remain immutable.

Actual configured stdio MCP calls created disposable document **3b0298d8-e7ee-4beb-bf70-bb9485ce8d98**, revision 12. Real [NIH mitochondrion 352](https://bioart.niaid.nih.gov/bioart/352): visible outer boundary `@svg:2` blue `#4389C7`, inner membrane `@svg:1/3` orange `#E89B43`. Browser-rendered pixel counts were **2,491 blue / 2,910 orange**. Real [NIH nucleus 72](https://bioart.niaid.nih.gov/bioart/72): two independent regions produced **51,717 blue / 645 orange** pixels. Both passed readback, live browser, refresh/reload, undo/redo, unrelated-element checks, original asset hash checks and vector SVG export. See `mcp-real-assets.png` and `.svg`. Initial hidden-boundary selection was corrected after visual inspection; final proof checks rendered pixels rather than attributes alone.

Claude Desktop's configured command was tested directly through the actual protocol, but **its UI tool picker has not been confirmed after reconnect**. The old connection was closed; Claude did not automatically reconnect. Fully quit Claude Desktop (Cmd-Q), reopen it, reconnect Helix and start a new chat; check for the three tool names. Configuration already points to Node 24 and this workspace's `src/mcp/main.ts`, with service URL `http://127.0.0.1:4317`. No Claude configuration edit is needed. This is a remaining client verification step, not a claimed UI success.

## Database, search and compatibility

Migration is additive: `asset_science` keyed by existing asset ID stores geometry hash, quality, scientific category and auxiliary metadata, with filter/hash indexes. Existing schema version 2, asset IDs, canonical rows and document schemas remain compatible. FTS aliases include additional source titles and keywords without replacing original assets. `PRAGMA quick_check` is `ok`.

Scientific categories and constrained synonyms supplement original provider categories. Mitochondria/mitochondrion and full stem-cell names are searchable; ambiguous ER/ESC expansion requires context. Search retains provider/category/subcategory filters and adds `scientificCategory`, `quality` and optional `uniqueGeometry`. Legacy search defaults remain compatible. Unique grouping occurs within matched filters, so cross-provider aliases do not hide provider-specific results.

The UI requests thirty records per page, uses lazy decoded thumbnails and existing immutable thumbnail caching, and avoids shipping bulky raw provider metadata in search results. Full metadata/licenses remain in details. No full-library browser load. Incremental source/hash metadata indexing skips successful unchanged files; rejected files are currently revalidated on repeat imports.

Final local SQLite benchmark at 23,497 rows: ordinary FTS p95 **6.012 ms**, filtered unique-provider search p95 **77.197 ms**. Cached category/provider reads p95 0.012/0.018 ms; first cold calls reached 819/257 ms. Isolated synthetic 25,000-row FTS/filter p95 **33.173/75.131 ms**. Synthetic rows never enter the real catalog or reported asset counts. These are local SQL timings, not network latency guarantees.

## Reproduce or resume

Use Node 24 and run from the repository root. Browser tests and SciDraw's UI adapter require installed Chrome (`CHROME_PATH` may override its path).

```sh
export PATH=/opt/homebrew/opt/node@24/bin:$PATH
# Only if the official repository caches are absent:
git clone --depth 1 https://github.com/resolvetosavelives/healthicons.git vendor/healthicons
git clone --depth 1 https://github.com/SaveenaSolanki/SciSVG.git vendor/scisvg

node scripts/acquire-reactome.ts
node scripts/acquire-togo.ts
node scripts/acquire-phylopic.ts
node scripts/import-collections.ts reactome togo phylopic healthicons scisvg scidraw
node scripts/index-science.ts --reclassify
node scripts/audit-library.ts
node scripts/audit-collection-geometry.ts
node scripts/benchmark-library.ts

npm test
npm run test:mcp
npm run test:browser
npm run test:assets:browser
node scripts/test-provider-mcp.ts
node scripts/test-library-ui.ts
npm run build
```

Acquisition checkpoints/inventories, `.part` downloads, ETag/Range receipts and raw originals are in `data/collections/<provider>`. Retry/backoff honors server responses and stops on access denial or rate-limit responses. PhyloPic build changes require deliberate inventory review rather than mixing builds. Repository imports record exact upstream commits; cloning later revisions may change counts. Togo `--download-oversize` can retrieve retained large sources, but does not remove the importer's 2 MB safety limit.

**Do not automatically resume SciDraw.** Verify access conditions manually first. Only after that review, its explicit resume command is `node scripts/acquire-scidraw.ts --resume-after-review`; the default command refuses while its checkpoint requires review. An authorized manual download can instead be imported with a provenance manifest:

```sh
npm run import:assets -- /absolute/local/svg-directory /absolute/metadata.json data
```

Manifest format: version 1, provider, license, licenseReference, optional attribution/defaults, and `assets` keyed by relative filename. Put source URL, author, individual license/license URL, title, original category, scientific category, keywords and any official taxonomy fields on each entry; do not invent missing values. This generic command imports local files, not a license to retrieve restricted resources.

The running API and Vite UI were restarted to load the updated backend; refresh the browser at `http://127.0.0.1:5173`. On a future restart use `npm run dev`; for production deployment use `npm run build` and the project's configured serving process. Only one service should own `data`. Keep Claude connected to the same service URL.

## Validation and limitations

- Vitest: **87 passed, 0 failed**, thirteen files, covering unit/integration/MCP schemas, batch atomicity, IDs, metadata, resume, safety, duplicate handling, compatibility and export.
- Both browser smoke scripts passed using isolated temporary data; live library filter/pagination/thumbnail/license checks passed with all document writes blocked.
- Fresh stdio MCP discovery: 28 tools; real imported samples from all six new providers passed search, metadata/license, insertion, element editing and vector export (**6/6, 0 failed**).
- Production TypeScript check and Vite build passed; two nonblocking third-party Zod comment annotation warnings remain.
- Integrity baseline compares 5,724 original files plus original asset/detail rows. No original document, Bioicons asset or NIH BioArt asset changed. Only new disposable documents were written through commands.
- Full read-only source audit verified **17,986 mapped source files**, with zero raw hash, immutable asset ID or geometry mismatches. Repeating all six imports produced zero new assets and zero metadata updates; supported unchanged files were skipped, while the same 1,096 unsupported SVGs were rejected again.
- Unsupported SVG features remain explicit failures, including raster/image embedding, general filters/CSS/fonts and unsafe entities. Supported paths, groups, transforms, local references and gradients remain vectors. Geometry point editing, editing definition-only elements or general text layout is outside this change.
- SciDraw access and full contributor verification, eight oversized Togo SVGs, unsupported drawings, manual scientific curation and Claude Desktop UI reconnection remain incomplete.

## Changed source files

Existing: `src/core/{model,svg-elements,render,icons}.ts`; `src/server/tools.ts`; `src/mcp/{server,main}.ts`; `src/assets/{catalog,importer,sanitize,svg-normalize}.ts`; `src/ui/{main.tsx,IconPreview.tsx}`; `scripts/browser-smoke.ts`; `vitest.config.ts`; `README.md`.

Added: `src/assets/{acquire,science,collection-names,scidraw-metadata,svg-attribution}.ts`; `src/core/scientific-categories.ts`; `scripts/acquire-{reactome,togo,phylopic,scidraw}.ts`; `scripts/{import-collections,index-science,verify-mcp-elements,audit-library,audit-collection-geometry,benchmark-library,test-library-ui,test-provider-mcp}.ts`; `tests/{mcp-elements-v2,science-library,acquisition}.test.ts`; this report and its evidence artifacts. Downloaded originals, generated manifests, receipts/checkpoints, SQLite source/provenance/classification rows and immutable imported asset/thumbnail files are data additions, not edits to existing scientific figures.
