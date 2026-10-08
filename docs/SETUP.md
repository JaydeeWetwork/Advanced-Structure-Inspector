# Setup guide — Bedrock Layers

Step-by-step install, run, build, and troubleshoot. The app version is **0.1.158** (`src/buildId.js`, the title, and the `version` field in `package.json`).

**Using the app** (hotkeys, catalog, preview, iPad Safari / touch, start/stop the server): [USAGE.md](./USAGE.md).

**Viewer APIs** (catalog, ingest, NBT, inspect, preview classes): [apis/README.md](./apis/README.md).

## 1. Prerequisites

1. Install **Node.js 22 or 24 LTS**: https://nodejs.org/
2. Confirm:

```bash
node -v   # v22 or v24
npm -v
```

3. A modern browser with **WebGL2** (Chrome, Edge, Firefox, **Safari**). **iPad Safari** is supported for using the served app (same desktop layout; see [USAGE — Touch / iPad Safari](./USAGE.md#touch--ipad-safari)).

## 2. Get the code

```bash
git clone https://github.com/JaydeeWetwork/bedrockLayers.git
cd bedrockLayers
```

The published site is [jaydeewetwork.github.io/bedrockLayers](https://jaydeewetwork.github.io/bedrockLayers/). GitHub does not move a project Pages address when the repository is renamed, so an older project address does not open this app.

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
- Dependencies come from the **import map** (esm.sh). `@zip.js/zip.js` is pinned to **2.7.62** in `src/index.html` and in `src/pack/holoprintPack.html`
- App data files load from `src/data/*.json`
- Item icons / some textures load from Mojang **bedrock-samples** on jsDelivr (CORS CDN). Full list: [official-resources.md](./official-resources.md).

### First load notes

- First preview may take longer while Three.js and vanilla texture metadata download
- Offline-only use will fail icon CDN fetches and esm.sh unless you vendor those deps yourself

## 5. Production build

```bash
npm run build
```

Output: **`dist/`** (hashed JS/CSS, minified). `npm run build:pack` writes the build version over `const VERSION = "dev"` in `src/pack/packConfig.js`. `HoloPrint.js` re-exports that constant.

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
# Fast — Bedrock Layers viewer logic
npm run test:viewer

# Pin bump: samples block ids vs Bedrock Layers shape maps (CDN)
npm run test:shape-coverage

# Everything (includes the long sample-structure pack suite)
npm run test:all
```

Viewer unit tests live in `tests/viewerUnit/` and use Node’s test runner. Pushes to `main` and pull requests run `npm ci` and `npm test` on Node 24 (`.github/workflows/viewerTests.yml`). JSON checks, translation coverage, and the sample-structure suite stay on `.github/workflows/automatedTesting.yml`. `test:shape-coverage` fetches `mojang-blocks.json` for `VANILLA_SAMPLES_TAG` in `src/data/packPins.js`. It exits 1 when a samples block id has no shape family, when a mapped family is missing from `blockShapeGeos.json`, or when a wood id misses `blocks.json` or a terrain key. The preview still draws an unmapped id as a unit cube. The vanilla placeholder id `unknown` is mapped to that cube, so it is not a failure.

`npm run bump:pins` moves the samples tag in `src/data/packPins.js`, the schema tags in `src/data/schemaPins.js`, the TGA stem list, the fancy-versus-opaque eigenvariants, the carried-texture list, and the block and item schema file lists together. It writes both pin files after the fetches succeed. A constant defined twice in one file, or in both files, fails the read. It then runs the shape-coverage check against that tag and exits non-zero if an id has no shape family. It changes `BlockUpdater.LATEST_VERSION` only when a block schema's packed version field changes. `node scripts/check-pin-freshness.mjs` compares the committed pins with the latest stable upstream tags, walking release pages until a stable tag appears, and exits 2 when one is behind. The monthly GitHub Action `.github/workflows/pinFreshness.yml` opens an issue from that report.

## 7. Project scripts (reference)

| Command | Description |
|---------|-------------|
| `npm run serve` | Dev: `serve src -p 5173` |
| `npm run serve:dist` | Prod: `serve dist -p 5173` |
| `npm run build` | Inspector only. `pipeline` esbuild → `dist/` |
| `npm run build:pack` | Inspector plus the pack page |
| `npm run test:pack` | Sample-structure pack goldens. Slow. Builds with the pack page |
| `npm run test:viewer` | Viewer unit tests |
| `npm run test:shape-coverage` | Samples ids vs `blockShapes.json` / `blockShapeGeos.json`. An id with no shape family fails |
| `npm run bump:pins` | Move the samples tag, schema tags, TGA list, fancy/opaque and carried lists, and schema file lists, then run shape coverage |
| `npm test` | Alias of `test:viewer` |
| `npm run test:all` | All workspace tests |
| `npm run typecheck` | Advisory `tsc --noEmit`. It reports existing JSDoc mismatches and does not change the app |
| `npm run make:minecarts` | Regenerate `tests/sampleStructures/minecarts.mcstructure` |
| `npm run make:cushions` | Regenerate `tests/sampleStructures/cushions.mcstructure` |
| `npm run make:copper-states` | Regenerate copper chest / bulb / golem samples |
| `npm run make:straw-shelf-poplar` | Regenerate straw bed, shelf mushroom, and poplar wood samples |
| `npm run make:flower-crop` | Regenerate two-block flower and crop samples |
| `npm run make:leaves` | Regenerate `tests/sampleStructures/leaves.mcstructure` |
| `npm run make:water` | Regenerate the contained water sample and strip unsupported flowing water from `second_layer.mcstructure` |
| `npm run seal:water` | Put glass on open sides of sample water, lava, and waterlogged blocks |
| `npm run fill:sign-text` | Fill sign text in the signs sample |

`node scripts/make-v2-two-layer-fixture.mjs` rewrites `tests/sampleStructures/format_v2_two_layer_water_plants.mcstructure` from `water_plants.mcstructure` as format 2 with both layers kept. Public samples that carried palette version `18168864` now use `18168865`. `chiseled_bookshelves.mcstructure` stores each book with a `Slot` byte. Item tag widths are in [apis/structure.md](./apis/structure.md).

Source layout (inspector, viewer APIs, pack page): [README.md](./README.md#layout). Pins: [apis/version.md](./apis/version.md).

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

The sample-structure workspace may treat large warning counts as failure even with 0 errors. Use `npm run test:viewer` for day-to-day Bedrock Layers work.

### PowerShell vs bash

On Windows PowerShell, prefer:

```powershell
Set-Location path\to\bedrockLayers
npm.cmd run serve
```

Do not use `cd /d` (that is cmd.exe syntax).

### Private field / SyntaxError after refactor

Hard-refresh after pulls.

## 10. Optional: pack generator

The hologram pack generator is separate from the inspector:

```
http://localhost:5173/pack/holoprintPack.html
```

(when serving `src/`)

## 11. License reminder

CC BY-NC-SA 4.0 — **non-commercial** use only; share adaptations under the same license; credit HoloPrint / SuperLlama88888 per [NOTICE.md](../NOTICE.md). Bedrock Layers is co-authored and co-developed by JaydeeWetwork and Grok Build (xAI).
