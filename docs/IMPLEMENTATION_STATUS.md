# Implementation and verification status

Date: 2 November 2026. Project: `~/Desktop/scientific-figure-editor`.

## Implemented source

| Deliverable | Status |
|---|---|
| Framework-independent document engine | Versioned JSON, stable IDs, hierarchy validation, affine transforms, atomic command batches, layer order, grouping/ungrouping, lock checks |
| Persistence | Shared local service, atomic JSON snapshots, persisted bounded undo/redo and monotonic revisions, expected-revision conflicts |
| React/Vite editor | SVG scene, pan/zoom, selection, dragging, resize handles, text, shapes, arrows, layers, grouping, property controls; implemented but browser acceptance unverified |
| Original icon library | Six independently authored vector schematics; no BioRender assets |
| Figure planning | Validated panels/entities/relationships/labels/layout/style; deterministic topological layout; no external AI key |
| Demo | 21 editable scene objects, including 10 icon instances, two arrows, labels and groups; plan, JSON document, and standalone SVG saved in `examples/` |
| MCP server | Official SDK 2.3.1, 18 tools, strict Zod validation, stdio transport, shared-service adapter |
| SVG export | Generated and checked by assertions; geometry and text remain vector |
| PNG export | Browser implementation present; not browser-verified |
| Separate importer | Local directory CLI, XML validation/sanitization, source and sanitized SHA-256, deduplication, metadata/provenance, SVG thumbnails, SQLite FTS, pagination |
| MCP/config documentation | README, Codex TOML example, Claude Desktop JSON example; no client configuration changed |

## Checks actually completed

- Read both reference documents before implementation.
- Confirmed an installed Node 24 runtime: **24.22.2** at `/opt/homebrew/opt/node@24/bin/node`. The shell default is Node 18.
- Installed cached TypeScript and type tooling into a temporary directory. Reused locally cached official SDK, Zod, XML parser, and Playwright packages through ignored `node_modules` links. This is a partial offline dependency setup, not a completed reproducible project installation.
- **17 tests passed** using `npm run test:offline`, which executes the same assertion bodies under Node's native test runner. These are not reported as a Vitest run.
- Tests cover atomicity, stable IDs, sparse updates, hierarchy errors, transform-preserving grouping/ungrouping, layer order, locks, persisted history, revision conflicts, deterministic plans, vector export/escaping, unsafe XML rejection, gradients/local references, deduplication, provenance, thumbnails, and search pagination.
- Official SDK client/server integration passed over its in-memory transport: tools/list, complete plan-driven figure creation, mutation, persistence, SVG export, and invalid-reference error.
- Actual stdio SDK discovery succeeded from a separate client process: **18 tools**, with exact descriptions and input schemas written to `examples/mcp-tools.json`. No listening socket or browser was required for this metadata check. It does not verify the HTTP service bridge.
- Core, importer, service, and MCP TypeScript modules passed strict offline typechecking with cached TypeScript 5.3.3/type tooling. Full-project checking reaches missing package declarations; it is not a successful production build.
- TypeScript transpilation syntax checks completed for all source/test/script TypeScript files.
- Two original local SVG samples imported successfully. Re-import reported **0 new / 2 duplicates / 0 rejected**. Unsafe fixtures were separately rejected in tests.
- Synthetic benchmark, not provider content: **10,000 assets in 3,201 ms**, tested lookup **0.67 ms**; **30,000 assets in 11,451 ms**, tested lookup **1.15 ms**. Includes sanitization, hashing, SVG/thumbnail writes, and indexing. Actual complex-library performance and visual fidelity remain to be measured.

## Checks attempted but blocked

| Attempt | Observed result | Consequence |
|---|---|---|
| Online npm resolution/install | `ENOTFOUND registry.npmjs.org` | Missing Vite, Vitest, React DOM and related packages could not be fetched |
| Offline npm install | `ENOTCACHED` for missing packages | No complete install or lockfile |
| `npm test` | `vitest: command not found` | Vitest execution remains pending |
| `npm run build` | Missing `react-dom/client`, `vitest`, and `vite` declarations/packages | Full production build not verified; no production bundle claimed |
| Direct document-service startup | `listen EPERM ... 127.0.0.1:4317` | Current execution environment prohibits the required listener |
| `npm run dev` | Vite entry module missing; processes stopped | No development server is running |
| Headless installed Chrome launch | Browser closed during startup in this environment | Browser interactions, screenshots, PNG export, and browser/MCP revision synchronization remain unverified |

**There is no active local application URL to report.** Intended development URL after successful startup: `http://127.0.0.1:5173`. Intended service/production-preview URL: `http://127.0.0.1:4317`.

## Licensed library assessment

No BioRender content has been downloaded or imported. Official public materials describe illustration exports and do not establish a supported complete SVG-library transfer. The preferred next step is a provider-supplied asset package and metadata manifest, or documentation for a provider-approved bulk mechanism. See `LICENSED_ASSET_IMPORT.md` for options and compatibility requirements. No automated collector has been written or run.

## Next execution steps

1. Enable normal npm network access and local loopback listeners in the execution environment, or run the commands in an unrestricted local terminal.
2. Select Node 24; run `npm install`, `npm test`, `npm run build`, then `npm run dev`.
3. Run `npm run test:mcp` against the active shared service, and `npm run test:browser` against Vite. Fix any integration or visual issues revealed by actual browser execution before calling the application verified.
4. Merge the supplied MCP registration example into the desired client configuration and restart that client; test actual Claude/Codex tool calls. This has not been done automatically.
5. Obtain a supported provider package and representative sample, map its metadata, validate sanitizer coverage and visual fidelity, then import the licensed collection locally. Do not begin bulk collection until the provider-supported transfer method is established.

## Explicit limitations

No PDF export, arbitrary SVG path editing, full rich text, automatic connector reattachment, collaborative merging, or embedding search is claimed. Imported fixed SVG palettes remain fixed. The initial sanitizer intentionally rejects unsupported features rather than flattening them. Semantic search means scientific metadata, taxonomy, synonyms and FTS ranking. Group sizes are manipulated through affine resize handles, not synthetic width/height fields.
