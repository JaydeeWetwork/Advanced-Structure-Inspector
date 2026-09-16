# Setup guide — Bedrock ASI

Step-by-step install, run, build, and troubleshoot.

**Using the app** (hotkeys, catalog, preview, iPad Safari / touch, start/stop the server): [USAGE.md](./USAGE.md).

**Viewer APIs** (catalog, ingest, NBT, inspect, preview classes): [apis/README.md](./apis/README.md).

## 1. Prerequisites

1. Install **Node.js 18+** (20 LTS recommended): https://nodejs.org/
2. Confirm:

```bash
node -v   # v18.x or higher
npm -v
```

3. A modern browser with **WebGL2** (Chrome, Edge, Firefox, **Safari**). **iPad Safari** is supported for using the served app (same desktop layout; see [USAGE — Touch / iPad Safari](./USAGE.md#touch--ipad-safari)).

## 2. Get the code

```bash
git clone <your-repo-url> Advanced-Structure-Inspector
cd Advanced-Structure-Inspector
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
- Item icons / some textures load from Mojang **bedrock-samples** on jsDelivr (CORS CDN). Full list: [official-resources.md](./official-resources.md).

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

# Pin bump: samples block ids vs ASI shape maps (CDN)
npm run test:shape-coverage

# Everything (includes long sample-structure HoloPrint suite)
npm run test:all
```

Viewer unit tests live in `tests/viewerUnit/` and use Node’s test runner. `test:shape-coverage` fetches `mojang-blocks.json` for `VANILLA_SAMPLES_TAG` in `src/data/packPins.js`. Exit 1 only if a mapped family is missing from `blockShapeGeos.json`. Fallback unit cubes are printed as a checklist, not a failure.

## 7. Project scripts (reference)

| Command | Description |
|---------|-------------|
| `npm run serve` | Dev: `serve src -p 5173` |
| `npm run serve:dist` | Prod: `serve dist -p 5173` |
| `npm run build` | `pipeline` esbuild → `dist/` |
| `npm run test:viewer` | Viewer unit tests |
| `npm run test:shape-coverage` | Samples ids vs `blockShapes.json` / `blockShapeGeos.json` |
| `npm test` | Alias of `test:viewer` |
| `npm run test:all` | All workspace tests |
| `npm run lint` | TypeScript check (filtered) |
| `npm run make:minecarts` | Regenerate `tests/sampleStructures/minecarts.mcstructure` |
| `npm run make:copper-states` | Regenerate copper chest / bulb / golem samples |
| `npm run make:straw-shelf-poplar` | Regenerate straw bed, shelf mushroom, and poplar wood samples |
| `npm run make:flower-crop` | Regenerate two-block flower and crop samples |
| `npm run fill:sign-text` | Fill sign text in the signs sample |

## 8. App data location

| Storage | Purpose |
|---------|---------|
| **IndexedDB** | Structure files and catalog for this browser origin |
| **localStorage** | Theme and dock pins |

**Clear list** in the UI wipes catalog data for this origin. `localhost` on a different port is a different catalog.

## 9. Common issues

### Port 5173 already in use

```bash
npx --yes serve src -p 5180
```

### Blank page / module errors

- Serve **`src/`** (or **`dist/`** after build), not the repo root
- Use a real static server (not `file://`) so modules and import maps work
- Hard-refresh after pulling (`Ctrl+Shift+R`)

### Preview fails / WebGL

- Enable hardware acceleration
- Close other heavy WebGL tabs (browsers limit contexts; app parks max 2 + 1 active)
- **iPad Safari:** iPadOS 15+ (WebGL2). Open the app over **http(s)** from `npm run serve` or a static host — not `file://`. Touch gestures: [USAGE — Touch / iPad Safari](./USAGE.md#touch--ipad-safari).

### Icons missing (buckets, etc.)

- Need network to jsDelivr bedrock-samples
- After code updates, hard-refresh so `itemIconLoader` / `itemIcons.json` reload
- Empty bucket id is `bucket`; filled ids are `water_bucket`, `lava_bucket`, … (mapped to `bucket_*` textures)

### `npm test` fails with many “warnings”

The sample-structure workspace may treat large warning counts as failure even with 0 errors. Use `npm run test:viewer` for day-to-day ASI work.

### PowerShell vs bash

On Windows PowerShell, prefer:

```powershell
Set-Location path\to\Advanced-Structure-Inspector
npm.cmd run serve
```

Do not use `cd /d` (that is cmd.exe syntax).

### Private field / SyntaxError after refactor

Hard-refresh after pulls.

## 10. Optional: HoloPrint pack UI

Upstream pack generator is still available:

```
http://localhost:5173/holoprint/holoprintPack.html
```

(when serving `src/`)

## 11. License reminder

CC BY-NC-SA 4.0 — **non-commercial** use only; share adaptations under the same license; credit HoloPrint / SuperLlama88888 per [NOTICE.md](../NOTICE.md).
