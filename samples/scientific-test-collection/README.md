# Original scientific SVG test collection

Ten locally authored, scientifically relevant conceptual illustrations, dedicated under CC0-1.0. No external artwork, website scraping, or downloads. These are schematic representations, not to scale, and do not provide molecular or quantitative biological models.

| Illustration | Editable paths |
| --- | ---: |
| Mammalian cell | 6 |
| Cell nucleus | 6 |
| Mitochondrion | 5 |
| Endoplasmic reticulum | 17 |
| Golgi apparatus | 7 |
| Plasma membrane | 23 |
| DNA double helix | 10 |
| Protein complex | 7 |
| Cell surface receptor | 7 |
| Lipid vesicle | 6 |

Each SVG contains meaningfully named groups and multiple independently painted paths with explicit fill/stroke attributes. `generate.py` contains the original geometry definitions and regenerates the same SVGs/manifest locally; no external input is used. Only SVGs in `svg/` are imported. Provider IDs and scientific keywords are in `manifest.json`.

From the project root, with Node 24:

```sh
export PATH="/opt/homebrew/opt/node@24/bin:$PATH"
npm run import:assets -- samples/scientific-test-collection/svg samples/scientific-test-collection/manifest.json
```

Use category **Helix original test collection** in the library. Original assets remain unchanged when document instances are edited.

## Verified live document

**Helix — original SVG collection verification**

- Document ID: `efbbea6a-df33-43be-999e-cd27c80f01ea`
- Saved revision: **44**
- Ten SVG instances, with independent fill/stroke overrides applied to one path of each. Other sub-elements retain their original paints.
- Live verification uses the official SDK stdio client, the existing MCP adapter, and the actual HTTP document service. No document JSON was edited directly.
- The preexisting document and two preexisting imported assets were verified unchanged by SHA-256, including the document's stored undo history.
- The local development processes were restarted once to load the new asset/sub-element handlers. No existing figure was edited.

Artifacts:

- [Modified vector export](../../examples/helix-test-collection.svg)
- [Browser preview](../../examples/helix-test-collection.png)
- [Per-asset verification report](../../examples/helix-test-collection-report.json)

## Results and repeatable checks

- Initial CLI import: **10 imported, 0 failed**.
- Incremental CLI reimport: **10 skipped, 0 duplicates added, 0 failed**.
- MCP: **10/10** for library listing, title search, insertion, independent fill, independent stroke, unaffected control paths, export, and geometry/transform preservation.
- Browser: **10/10** for visible library entries, thumbnails, searches, and rendered modifications; **0 page errors**.
- Regression suite: **47 passed, 0 failed**, across 7 files.
- Production build: **passed**, with two non-blocking Zod annotation warnings.

```sh
# Creates ANOTHER new document; never reuses/edits an existing figure:
node scripts/verify-test-collection.ts
# Read-only browser check of the document in the current report:
node scripts/check-test-collection-ui.ts
npm test
npm run build
```

The browser harness was corrected during verification to wait for each search response before checking its result; it no longer looks for the next asset while the preceding search is still active.

## Limitations

Scientific illustrations are schematic and not publication-validated. Sub-element editing currently covers fill/stroke overrides on visible-tree paths and groups, not path points, individual definition/use internals, text or primitive-shape editing, or arbitrary transform changes. Group paint follows SVG inheritance and does not override explicitly painted descendants. On open paths (such as DNA rungs), fill changes are stored/exported but may have no visible area; stroke changes remain visible. SVG filters, CSS stylesheets, embedded images and external fonts remain unsupported. Reconnect MCP clients if they cache the older tool list.
