# Setup guide — Bedrock ASI

Step-by-step install, run, build, and troubleshoot.

## 1. Prerequisites

1. Install **Node.js 18+** (20 LTS recommended): https://nodejs.org/
2. Confirm:

```bash
node -v   # v18.x or higher
npm -v
```

3. A modern browser with **WebGL2** (Chrome, Edge, Firefox, Safari).

## 2. Get the code

```bash
git clone <your-repo-url> structure-db-viewer
cd structure-db-viewer
```

## 3. Install dependencies

From the **repo root**:

```bash
npm ci
```

This installs npm **workspaces** (`pipeline/`, `tests/**`). You do not need a separate install inside `src/` for normal use.

If `npm ci` fails (no lockfile match), use:

```bash
npm install
```

## 4. Run in development

```bash
npm run serve
```

Then open:

**http://localhost:5173**

### What this does

- Serves files from **`src/`**
- Browser loads `index.html` → ES modules
- Dependencies come from the **import map** (esm.sh)
- App data files load from `src/data/*.json`
- Item icons / some textures load from Mojang **bedrock-samples** on jsDelivr (CORS CDN)

### First load notes

- First preview may take longer while Three.js and vanilla texture metadata download
- Offline-only use will fail icon CDN fetches and esm.sh unless you vendor those deps yourself

## 5. Production build

```bash
npm run build
```

Output: **`dist/`** (hashed JS/CSS, minified).

Serve it:

```bash
npm run serve:dist
```

Or copy `dist/` to any static host.

### Deploy checklist

- [ ] Open `dist/index.html` via HTTPS (or localhost)
- [ ] Confirm network access to esm.sh **or** that the build inlined/bundled deps as your pipeline does
- [ ] Confirm CDN access for item icons if you rely on inventory/item-frame icons
- [ ] Update `package.json` `repository.url` if you publish a fork

## 6. Tests

```bash
# Fast — ASI viewer logic
npm run test:viewer

# Everything (includes long sample-structure HoloPrint suite)
npm test
```

Viewer unit tests live in `tests/viewerUnit/` and use Node’s test runner.

## 7. Project scripts (reference)

| Command | Description |
|---------|-------------|
| `npm run serve` | Dev: `serve src -p 5173` |
| `npm run serve:dist` | Prod: `serve dist -p 5173` |
| `npm run build` | `pipeline` esbuild → `dist/` |
| `npm run test:viewer` | Viewer unit tests |
| `npm test` | All workspace tests |
| `npm run lint` | TypeScript check (filtered) |

## 8. App data location

| Storage | Purpose |
|---------|---------|
| **IndexedDB** (`asi-db-viewer` / catalog stores; copies from legacy `structure-db-viewer` once) | Structure metadata + file blobs + categories |
| **localStorage** | UI pins / small prefs (if used) |
| **In-memory** | Preview park LRU (max 2 WebGL sessions), icon blob URLs |

**Clear list** in the UI wipes IndexedDB catalog data for this origin.

## 9. Architecture (where code lives)

| Area | Path |
|------|------|
| Boot + wire only | `src/index.js` (~230 lines) |
| Shared state / session | `src/app/state.js`, `src/app/dom.js` |
| Preview lifecycle | `src/app/previewLifecycle.js`, `importExport.js` |
| UI modules | `src/ui/catalogList.js`, `detailPanel.js`, `previewChrome.js` |
| Preview orchestration | `src/viewer/structurePreview.js` |
| 3D renderer | `src/PreviewRenderer.js` thin shell; systems under `viewer/systems/` |
| Public APIs | `src/viewer/api/` (icons, inventory, catalog, previewSession) |
| Systems | `src/viewer/systems/` + `layerVisibility.js` |
| Item icons / frames | `itemIconLoader.js`, `itemFrameItems.js` |
| Inspect / inventories | `inspectStructure.js`, `containerUi.js` |
| Persistence | `db.js`, `catalog.js` |

**Cache busting:** only `index.html` → `index.js?v=…` (no mid-graph `?v=` nicknames).

More context: [FORK.md](../FORK.md).

## 10. Common issues

### Port 5173 already in use

```bash
npx --yes serve src -p 5180
```

### Blank page / module errors

- Serve **`src/`** (or **`dist/`** after build), not the repo root
- Use a real static server (not `file://`) so modules and import maps work
- Hard-refresh after pulling (`Ctrl+Shift+R`) — query `?v=` cache busts change often

### Preview fails / WebGL

- Enable hardware acceleration
- Close other heavy WebGL tabs (browsers limit contexts; app parks max 2 + 1 active)

### Icons missing (buckets, etc.)

- Need network to jsDelivr bedrock-samples
- After code updates, hard-refresh so `itemIconLoader` / `itemIcons.json` reload
- Empty bucket id is `bucket`; filled ids are `water_bucket`, `lava_bucket`, … (mapped to `bucket_*` textures)

### `npm test` fails with many “warnings”

The sample-structure workspace may treat large warning counts as failure even with 0 errors. Use `npm run test:viewer` for day-to-day ASI work.

### PowerShell vs bash

On Windows PowerShell, prefer:

```powershell
Set-Location path\to\structure-db-viewer
npm.cmd run serve
```

Do not use `cd /d` (that is cmd.exe syntax).

### Private field / SyntaxError after refactor

Hard-refresh after pulls. Only `index.html` busts `index.js?v=…`; a leftover `PreviewRenderer.v3.js` re-exports the single renderer.

## 11. Optional: HoloPrint pack UI

Upstream pack generator is still available:

```
http://localhost:5173/holoprint/holoprintPack.html
```

(when serving `src/`)

## 12. License reminder

CC BY-NC-SA 4.0 — **non-commercial** use only; share adaptations under the same license; credit HoloPrint / SuperLlama88888 per [NOTICE.md](../NOTICE.md).
