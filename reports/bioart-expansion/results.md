# Completed public-gallery snapshot

Final read-only SQLite audit: 2026-11-02 22:59 UTC. All 958 discovered official entry pages were checked: 930 supplied SVGs; 28 offered no SVG download.

| Measure | Count |
|---|---:|
| Authentic official SVG files/representations discovered and downloaded | 4,748 |
| Successfully mapped source files | 4,140 |
| Distinct authentic NIH assets in SQLite | 4,127 |
| Newly added distinct NIH assets | 4,123 |
| Previously present NIH assets retained | 4 |
| Duplicate source files sharing an existing content-addressed asset | 13 |
| Rejected SVG source files | 608 |
| Runtime import failures | 0 |
| Download errors / unprocessed entries / unresolved licenses | 0 |
| Total SQLite library assets, all providers | 5,718 |
| Bioicons assets, unchanged | 1,579 |

The 4,748 source files reconcile exactly: **4,127 distinct imported assets + 13 duplicate files + 608 rejected files**. Color representations are separate SVG files, not separate gallery entries. No generated/test illustrations are included in the NIH counts. The UI also has six built-in Helix icons outside SQLite (5,724 available icons overall).

License distribution among the 4,127 distinct imported NIH assets: **4,111 Public Domain; 16 CC BY 4.0**. There are 4,123 Public Domain and 17 CC BY source records because duplicate source files retain their own attribution. Twenty official top-level categories were imported. All individual source URLs, licenses and attribution are recorded in `imported.json` and SQLite provenance, with raw page/download evidence cached locally.

| First rejection reason | Files |
|---|---:|
| Embedded raster/image nodes | 320 |
| Unsupported CSS/SVG filters | 206 |
| Patterns | 36 |
| Above existing 2 MB SVG limit | 27 |
| Letter-spacing CSS | 10 |
| Unresolved references in the original SVG | 6 |
| Unsupported stylesheet attributes | 1 |
| Unsupported SVG font node | 1 |
| Missing XML root | 1 |
| **Total** | **608** |

No incomplete rasterized or partially stripped versions were substituted. All rejected originals are retained. Further import of these 608 files requires explicit renderer/sanitizer support or compatible official replacements. The other 28 entries require an official SVG release or a separately authorized conversion workflow. No login, access-denied or manual-download blocker was encountered. No official whole-library archive or documented bulk API was found; acquisition used official per-entry representation selection and SVG ZIP download controls.

Final repeat/resume verification imported **0**, skipped **4,140 unchanged successful source records**, retained **608 cached rejections**, and produced **0 failures** without another entry download pass. Existing IDs were retained.

Validation: **75 tests passed, 0 failed, 10 test files**; production build passed (two nonblocking Zod/Rollup annotation warnings). MCP discovery found all 28 tools. Isolated browser regression, production library provider/pagination/details/thumbnail checks, and two authentic-asset MCP/edit/export/undo/persistence cases passed. Full-source geometry audit checked all 4,140 mapped official SVG sources covering 4,127 distinct assets, with **0 geometry/hash failures**. SQLite `quick_check` returned `ok`. Sample SQLite FTS p95 times ranged from 0.638 to 3.288 ms (five scientific queries, 30 repetitions each); these are local SQL timings, not browser end-to-end latency.

All 1,595 pre-existing asset files are byte-identical, including Bioicons. No expansion/audit script issued document mutations. The integrity audit flagged one concurrently edited PRBJN/8CLC document (revision 9 → 25); its initial record is preserved byte-for-byte in undo history. It was left untouched. Consequently the document-integrity audit returns exit code 1 and must not be described as an all-document unchanged result. The other four document files and the document list remain unchanged.

See [README.md](README.md) for exact repeat/resume and validation commands, acquisition policy and remaining limitations; [summary.json](summary.json), [rejected.json](rejected.json), [geometry-audit.json](geometry-audit.json) and [concurrent-document-change.json](concurrent-document-change.json) contain machine-readable evidence.
