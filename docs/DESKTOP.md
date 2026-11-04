# Helix.app — macOS desktop application (v0.7.0)

Helix runs as a standalone Apple Silicon app. Opening `Helix.app` from Finder starts everything it needs: the editor window, the document service, the bundled scientific library, the PNG renderer and the MCP endpoint used by AI assistants. You don't need a terminal, Node.js, Chrome or `npm run dev`.

## Quick start

| Task | How |
|---|---|
| Build the app | `npm run desktop:build` → `~/Developer/Helix/build/release/Helix-darwin-arm64/Helix.app` |
| Build app + installer | `npm run desktop:dmg` → `~/Developer/Helix/build/Helix-0.6.0-arm64.dmg` |
| Install | Open the DMG and drag Helix to Applications |
| First launch of an unsigned build | Right-click Helix.app → **Open** → **Open** (only needed once; see *Signing*) |
| Connect Claude / other MCP clients | In Helix: **Helix → Connect AI Assistants…** |
| Generate a whole figure from a description | Ask the assistant; `generate_figure` runs inside the app (see [FIGURE-ENGINE.md](FIGURE-ENGINE.md)) |
| Copy development documents into the app | Quit Helix, then `node scripts/migrate-documents.mjs` (copies only, never overwrites) |
| Test a packaged build | Launch Helix, then `node scripts/test-desktop.ts [path/to/Helix.app]` |

Build output goes to `~/Developer/Helix/build` (override with `HELIX_BUILD_DIR`), not into the project. `~/Desktop` is synced by iCloud Drive on this Mac. File Provider adds metadata to every file there, and `codesign` rejects that metadata; it also ignores `.nosync`. Building there would also upload a 2.5 GB bundle.

## Why Electron rather than Tauri

The decision follows from what the existing code already depends on:

| Requirement in the repository | Electron 45 | Tauri 2 |
|---|---|---|
| Document service uses `node:sqlite`, Node's TS type-stripping, `node:http` | Bundled Node **24.22.1** runs it unchanged in a utility process | Needs a separately bundled and signed Node 24 sidecar (~110 MB) |
| `render_figure`, `analyze_figure_layout`, `refine_figure_layout`, `compose_figure` measure and screenshot SVG in **Chromium** (`getBBox`, `getScreenCTM`) | Rendered by the app's own Chromium 156 in an offscreen window, so the results match the existing Playwright path | WKWebView renders and measures text differently, and the "installed Chrome" requirement would remain |
| SVG editor developed and tested in Chrome | Same engine | WebKit; would need re-validation |
| Rust toolchain | Not needed | Not installed on this machine |

Tauri's main advantage is a smaller bundle (~10 MB versus ~250 MB of runtime). Here the bundle is dominated by the 2.2 GB scientific library, so that saving is marginal. Getting it would have required a Node sidecar, a separate renderer and re-validation of SVG measurements. Electron delivers a single runtime that also replaces the "Chrome must be installed" dependency.

## Architecture

```
Helix.app/Contents
├── MacOS/Helix                    Electron main process (desktop/main.ts)
│     ├── window, native menus, save/open dialogs, single-instance lock
│     ├── offscreen Chromium renderer for MCP PNG/measurement requests
│     └── supervises ↓ (restarts it up to 3×/min, then asks)
├── Frameworks/…Helper              utility process: src/server/main.ts (bundled to app/server.mjs)
│                                   document store, catalog, all 40 tools, HTTP API on 127.0.0.1
├── Resources/app/                  main.cjs, preload.cjs, server.mjs, mcp.mjs, dist/ (React editor)
├── Resources/library/              READ-ONLY bundled library: catalog.sqlite seed, assets/, thumbnails/, licenses/
└── Resources/bin/helix-mcp         MCP stdio launcher (runs mcp.mjs with the app's bundled Node)

~/Library/Application Support/Helix/          (writable, never inside the bundle)
├── data/documents/*.json           documents + 100-step undo/redo history (atomic, fsync'd writes)
├── data/catalog.sqlite             copy of the bundled catalog (APFS clone on first launch, ~0.5 s)
├── runtime.json                    {url, token, pid} for MCP discovery, mode 0600, removed on quit
├── preferences.json                window bounds, last export folder
└── logs/main.log, logs/backend.log (rotated at 5 MB)
```

* **Library**: `Catalog` reads asset, thumbnail and licence files from the writable data directory first, then from the bundled read-only library (`HELIX_LIBRARY_DIR`). Only the 500 MB SQLite catalog is copied out, because it must be writable (WAL, future imports). The 47k SVG files stay in the signed bundle.
* **Port**: The app prefers `127.0.0.1:47317`. If that port is taken, it uses an OS-assigned port, so it can't collide with `npm run dev` on 4317/5173. The current URL is published in `runtime.json`.
* **Session token**: Each launch generates a random token. The service rejects `/api/*` requests without `X-Helix-Token` (`/api/health` is exempt). The editor window gets the header injected by the main process. The MCP launcher reads it from `runtime.json`. Existing Host/Origin checks still apply.
* **Renderer isolation**: The editor runs with `contextIsolation`, `sandbox` and no Node integration. The preload exposes only `saveFile`, `openFigure` and `onCommand`, and IPC calls are accepted only from the editor's own origin. Navigation away from the app and all permission requests are denied, and external links open in the default browser. The PNG renderer uses a separate session that blocks every request except its own temporary page.
* **Process lifecycle**: Quit, ⌘Q and `SIGTERM` stop the document service gracefully: the HTTP server closes, the SQLite handle closes and `runtime.json` is removed. If the service exits unexpectedly, it is restarted and the window reloads. Closing the window keeps the app in the Dock, as macOS document apps do.
* **Figure engine**: `generate_figure`, `find_visual` and `list_figure_vocabulary` run in the bundled document service and render through the app's own Chromium. Generated figures are written to `~/Documents/Helix Figures` and opened as editable documents in the app, one object per illustration, label and arrow.
* **Live AI edits**: MCP tools go through the same service. The editor polls the open document every 1.1 s and shows changes from Claude/Codex without a reload.

## Connecting AI assistants (MCP)

**Helix → Connect AI Assistants…** shows the command and offers:

* **Copy Claude Code Command**: `claude mcp add helix -- "/Applications/Helix.app/Contents/Resources/bin/helix-mcp"`
* **Copy Claude Desktop Config**: `{"mcpServers":{"helix":{"command":".../helix-mcp"}}}`
* **Add to Claude Desktop…**: after confirmation, backs up `claude_desktop_config.json` and adds or updates only the `helix` entry. Restart Claude Desktop afterwards.

The launcher finds the service in this order: `FIGURE_SERVICE_URL` (explicit/legacy), then a running Helix.app (`runtime.json`), then a running dev service on 4317. If neither is running, it **launches Helix.app** in the background and waits for it. If Helix restarts (new port or token), the next tool call rediscovers it automatically.

> **Existing Claude Desktop entry.** `scientific_figure_editor` in your Claude Desktop config still points at `node src/mcp/main.ts` with `FIGURE_SERVICE_URL=http://127.0.0.1:4317`, so it only reaches the dev server. It was not modified. Replace it with the `helix` entry when you switch to the app, or keep both if you still run `npm run dev`. The "32 vs 33 tools" discrepancy was a stale connection: the server registers 33 tools (verified through the bundled launcher), and clients discover new tools only after reconnecting or restarting.

## Keyboard shortcuts and menus

| Shortcut | Action | Shortcut | Action |
|---|---|---|---|
| ⌘N | New figure | ⌘Z / ⇧⌘Z | Undo / Redo (text fields get native undo) |
| ⌘O | Import figure JSON | ⌘G / ⇧⌘G | Group / Ungroup |
| ⇧⌘E | Export SVG… | ⌫ | Delete selection |
| ⌘E | Export PNG 2×… | ⌘= / ⌘- / ⌘0 | Zoom in / out / fit |
| ⌥⌘E | Export PNG 4× (print)… | ⇧⌘P | Figure plan |
| ⌘Q | Quit (stops the service) | Space-drag | Pan |

Exports use the native save panel and remember the last folder. PNG export rasterises the vector SVG at 2× or 4×, up to Chromium's canvas limit of 16384 px per side or 268 MP. Above that limit the scale is reduced and a message says so.

## Signing and notarization

The build is **ad-hoc signed only** (`codesign --sign -`). It is **not** Developer ID–signed and **not notarized**. Gatekeeper (`spctl`) rejects it, as expected. It runs on this Mac and opens elsewhere only after right-click → Open, or after removing quarantine.

To distribute it to other Macs:

1. Join the Apple Developer Program and create a **Developer ID Application** certificate.
2. Sign with the hardened runtime and Electron's entitlements: `com.apple.security.cs.allow-jit` and `com.apple.security.cs.allow-unsigned-executable-memory`. `@electron/osx-sign` handles the helpers. The `helix-mcp` shell script needs no entitlement.
3. Notarize with `xcrun notarytool submit Helix-0.6.0-arm64.dmg --keychain-profile <profile> --wait`, then `xcrun stapler staple` the app and the DMG.
4. Keep the `ELECTRON_RUN_AS_NODE` fuse enabled, because `helix-mcp` depends on it. If fuses are hardened later, ship a separate Node binary for MCP instead.

The 47k library files are sealed inside the bundle, so signing and notarizing take a few minutes.

## Licensing of bundled assets

The library mixes Public Domain/CC0 (~12.9k), CC BY (~8.6k), CC BY-SA (~1.2k) and **CC BY-NC / BY-NC-SA (~750)** assets. Per-asset attribution travels with the catalog and is embedded in SVG exports. Personal and academic use is fine. Before **public** distribution of the DMG, review whether NC and SA assets may be redistributed in a bundle, and ship a consolidated attribution notice. Help → *Asset Licenses and Attribution* opens the bundled licence texts.

## Verified on the packaged app (2026-11-04, macOS 26.3.1, M4 Pro)

All checks below ran against `Helix.app` launched through LaunchServices (`open`) or its executable. The dev server was not used.

| Check | Result |
|---|---|
| Fresh first launch (no Application Support folder) | Catalog cloned in 0.5 s, service ready in about 0.6 s, demo figure shown |
| Library | 23,503 icons reported; NIH BioArt/Bioicons assets load from the read-only bundle |
| Bundled MCP launcher (`scripts/test-desktop.ts`) | 33 tools incl. `resize_artboard`. Covers create, search, add icon/text/arrow, undo/redo, stale-revision rejection, `export_svg`, `render_figure` (exact 1600×1000 PNG through app Chromium), `analyze_figure_layout`, `resize_artboard`. Existing documents' revisions unchanged |
| Live AI edits | Objects added by an external MCP client appeared in the open window within the polling interval |
| Menu: New Figure, Undo, Export SVG / PNG 2× / PNG 4× / JSON | Correct files written (900×560 figure → 1800×1120 and 3600×2240 PNG) via `HELIX_TEST_SAVE_DIR`. Undo removed exactly one step. The native save panel appears with the right name and filter |
| Import JSON endpoint | Valid export imported as a new document; malformed input rejected with validation errors |
| Quit (menu and SIGTERM) | Service exits with code 0, `runtime.json` removed, port freed, no stray processes, no temp files, catalog `integrity_check = ok` |
| Relaunch | Documents and last-open figure persist |
| Second launch | Single-instance lock: still one main process and one service |
| Port 47317 occupied | Falls back to an OS-assigned port; MCP still discovers it |
| `kill -9` of the document service | Restarted automatically; editor reconnected |
| 16 development documents copied in | All open and render (e.g. CRISPR knock-in figure); sources unchanged (SHA-256 verified) |
| DMG (`Helix-0.6.0-arm64.dmg`, 1.09 GB, ULFO) | `hdiutil verify` valid; app signature valid inside; launched **directly from the read-only mounted image**: search and library SVG serving work, clean quit |
| Installed `/Applications/Helix.app`, Helix **not running**, MCP launcher called as Claude Desktop would | Launcher auto-opened Helix and the full suite passed in 10.6 s. (This found and fixed a bug: `open` forwarded `ELECTRON_RUN_AS_NODE` to the app, which then exited at once.) |
| Vitest | 117/117 pass after all changes; `tsc --noEmit` clean |
| Dev mode (`npm run dev`, Chrome/Playwright renderer) | `render_figure` and `analyze_figure_layout` still work |

### Not verified / known limitations

* **Confirming the native save panel** was not automated: the UI automation tool refused to confirm a save in a panel it could not read. The file-writing path itself was verified via `HELIX_TEST_SAVE_DIR`.
* **Keyboard ⌘Z through the menu accelerator** was not exercised with real key events, only menu clicks. A guard ignores the menu echo of a shortcut the page already handled, so a single keystroke can't undo twice.
* **Import via ⌘O** opens the native open panel (not automated). The import endpoint behind it was tested directly.
* **Slow first launch from the DMG (~1 min, no feedback).** Before any app code runs, macOS validates the sealed bundle, which means hashing 47k library files read through the compressed image. A copy on a normal disk started in a few seconds. Install by dragging to Applications instead of running from the DMG. Recommended fix: pack `assets/` and `thumbnails/` into one read-only SQLite/archive file. That turns 47k sealed files into a handful, which also speeds up signing, notarization, copying and DMG creation.
* The app is **ad-hoc signed, not notarized**; first launch on another Mac needs right-click → Open.
* Library updates: a newer app version does not yet replace an existing user catalog. Deleting `~/Library/Application Support/Helix/data/catalog.sqlite` re-provisions it.
* Concurrent writers: the dev server (`data/`) and the app (`~/Library/Application Support/Helix/data`) use separate data directories by design. Don't point both at the same directory.
* The bundle is about 2.5 GB, almost all of it the scientific library.
