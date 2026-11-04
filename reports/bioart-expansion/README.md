# NIH BioArt collection expansion

The authoritative final counts are in [summary.json](summary.json). While acquisition is running its `completed` field is false. Source-level successes, rejection reasons, the complete observed entry inventory, and resumable progress are in `imported.json`, `rejected.json`, `discovery.json`, and `checkpoint.json` respectively. Reports are snapshots; rerun the audit after an import finishes.

## Official acquisition

Source: <https://bioart.niaid.nih.gov/discover>. Individual entries use `https://bioart.niaid.nih.gov/bioart/ENTRY_ID`.

The official gallery advertised 958 entries at discovery. This is an entry count, not a count of downloadable SVG color variants. No official whole-library archive, repository, or documented public download API was found. The normal entry page supports selecting all representations, selecting SVG, and downloading an official ZIP containing those SVGs. The adapter uses those visible controls in an installed Chrome browser through Playwright. It does not guess file endpoints or use third-party mirrors.

Per-entry [license terms](https://bioart.niaid.nih.gov/terms) and [FAQ guidance](https://bioart.niaid.nih.gov/faqs) apply. Public Domain text and Creative Commons image-badge links are recorded individually. An absent, unrecognized, or conflicting license prevents import pending review. Original entry URLs, titles, creators, credit, citations, categories, subcategories, keywords, DOI (where shown), timestamps and original filenames are preserved. Raw official downloads and page metadata remain under `data/bioart-downloads/.packs/ENTRY_ID/`; asset editing never changes those downloads.

Two workers share a browser cache, with at most one new acquisition navigation per second. Transient failures use bounded exponential retries. HTTP 401, 403, 429 or CAPTCHA stops acquisition. No access-control bypass is attempted. ZIP extraction is restricted to SVG members, with path, count and expanded-size checks.

## Repeat or resume

From the project directory, using Node 24, Python 3, the installed dependencies and Google Chrome:

```sh
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
node scripts/discover-bioart.ts
node scripts/expand-bioart.ts
node scripts/audit-bioart-expansion.ts
node scripts/audit-bioart-geometry.ts
```

Repeat `node scripts/expand-bioart.ts` after interruption. Completed archive hashes and source hashes are verified; cached archives are reused, completed entries are skipped, pending records are flushed through the existing importer, and unchanged successful imports are skipped. Rejected sources use the existing sanitizer preflight cache. Changed upstream bytes receive a separate local filename rather than overwriting prior raw downloads. Checkpoint and manifest writes use atomic rename. `BIOART_CONCURRENCY=1` reduces concurrency; `CHROME_PATH` overrides the browser executable. The default output is `data/bioart-downloads`; pass a first positional directory argument to the expansion script to change it.

For an already downloaded collection with its recorded metadata:

```sh
node scripts/import-bioart.ts data/bioart-downloads data/bioart-downloads/bioart-downloads.json
```

Discovery can verify and reuse a saved inventory when the advertised count and newest links still match. It is not a complete upstream change detector: a future edit to an old entry may require targeted manual revalidation. Checkpoints refer to local absolute archive paths; keep the cached directory available when resuming.

## Verification and integrity

```sh
npm test
npm run test:mcp
npm run test:assets:browser
node scripts/test-bioart-expansion.ts
node scripts/test-bioart-library-ui.ts
npm run build
node scripts/audit-bioart-expansion.ts
```

`test:assets:browser` uses an isolated service and temporary documents. `test-bioart-expansion.ts` uses genuine downloaded Public Domain and CC BY samples with a separate temporary catalog. It verifies metadata, MCP insertion, independent fill and stroke changes, atomic revisions, persistence, unchanged unrelated elements, undo/redo, preserved export geometry, unchanged sources, and incremental skipping. Neither test edits user documents. The audit opens SQLite read-only and checks every pre-existing document and asset against `baseline.json`. Do not use the historical `scripts/verify-bioart.ts` for this task: it edits existing test figures.

`test-bioart-library-ui.ts` checks the running production UI at `http://127.0.0.1:4317` (override with `FIGURE_UI_URL`). It checks provider filtering, bounded pagination, asset details, thumbnail decoding and HTTP 304 caching, and blocks document mutation requests. Identically titled color variants are identified by their asset IDs in this check.

`audit-bioart-geometry.ts` opens the catalog read-only, verifies every successfully mapped official raw file's SHA-256, verifies each stored asset's content-addressed ID, and compares vector geometry attributes, IDs, groups, transforms, gradients and clipping/mask geometry to the raw SVG. It writes `geometry-audit.json`. It does not claim pixel-level equivalence for every browser or scientific correctness of the original illustration.

The integrity audit reports changes from the initial snapshot and returns a nonzero exit code when it finds them; it never restores documents. During expansion, PRBJN/8CLC received concurrent revisions from another client. The initial revision-9 record can be reconstructed byte-for-byte from its undo history, matching the baseline SHA-256. See `concurrent-document-change.json`. This is recorded separately from test failures and asset-file integrity.

Imported assets are available to the running service through its shared SQLite catalog; no service restart is required for the import. The UI polls the library and can filter **Asset provider → NIH BioArt Source**. Refresh the page if needed. Existing MCP clients can search the same catalog; clients caching old tool registries must reconnect to discover all 28 tools.

## Unsupported files

The existing sanitizer preserves supported paths, groups, transforms, IDs, viewBox, gradients and vector sub-elements. It rejects unsupported raster-image nodes, filters, patterns, CSS or attributes, malformed XML, unresolved references, oversized SVGs and excessive complexity. Rejected originals remain cached with explicit reasons; they are not silently flattened, partially stripped, rasterized or counted as imported. Some official entries offer only AI, EPS or PNG and have no SVG download.

Full compatibility with every official SVG is not claimed. Additional rejected illustrations require renderer/sanitizer support or a compatible official SVG variant; merely repeating the import cannot fix unsupported features. Future access-denied responses or missing licensing need manual resolution through the official source. Bioicons and existing scientific figures are outside the mutation scope.
