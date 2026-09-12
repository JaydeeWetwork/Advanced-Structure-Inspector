# Resume — 2026-08-28

Parked for a machine restart. Nothing was running (no scheduled jobs, no live preview process owned by this session). Working tree is **uncommitted on `dev`**. Do not merge to staging/main until you say so.

**Build token:** `judo57` (hard-refresh the Python server after restart).  
**Preview asset cache key:** `v20|pack=…` in `src/viewer/structurePreview.js`.  
**Serve:** `python -m http.server 5173 --directory src` → http://localhost:5173

---

## What we just shipped (this conversation)

User asks were: double-chest join, white edge flicker, load >5s, then inspect UI for double chests, then latch/UV looking off.

### Double chest model
- `src/viewer/doubleChest.js` — pairx/pairz → left/right. Partner-to-the-right = **left** half. `linkInspectDoubleChests` + `mergeDoubleChestInventories`.
- `src/data/blockShapeGeos.json` — `chest_double` 15-wide halves on 128×64 `double_*` textures; latch at the seam; inner faces hidden.
- Halves **skip** HoloPrint 0.95 CoM scale so they stay flush.
- **N/S latch-on-the-side bug:** preview instances negate X (`-16*x`) but BufferGeometry already does `16-z`. E/W pairs met; N/S put the buckle on the outer ends. Fix in `BlockGeoMaker.js`: after yaw, if `chest_double` and facing north/south, mirror X and `flipWinding`. See `#chestFacingIsNorthSouth`.

**Verify after restart:** north-facing double chest, latch on the **front center seam**, not the outer sides. Also check east/west pairs (should still join). Hard-refresh judo57.

### Inspect / raycast UI
- Double-click either half → **Large Chest** (54 slots). Left half = rows 1–3 (0–26), right = rows 4–6 (27–53). Same inventory from both halves. Left/Right badge = which half you clicked.
- `containerUi.js` kind `double_chest`; `InspectRaycaster.#withDoubleChest`; `inspectStructure.js` calls `linkInspectDoubleChests` after indexing.
- If Bedrock already stored slots ≥ 27 on the lead, that list is used as-is.

**Verify:** double-click both halves; icons load; trapped/copper titles (`largeChestTitle`).

### White flicker at block edges
- Solid materials **FrontSide** (`PreviewRenderer.PERFORMANCE_OPTIONS.materialSide: "front"`). Leaves/glass stay DoubleSide.
- `logarithmicDepthBuffer: true`; camera near plane **1**.
- Half-texel UV inset in `resolveTemplateFaceUvs`.

**Verify:** pan along a wall of full cubes; no white sparkle at edges.

### Load speed
- Viewer skips hologram **7-opacity** atlas + PNG encode/decode; packs **ImageData** straight to WebGL (`TextureAtlas.atlasImageData`).
- `SKIP_TEXTURE_CROP`, 12-wide `mapPool` CDN, packed-atlas session cache, palette geo `#templateMemo`, yield every 24 palette entries.
- Pack JSON starts **in parallel** with NBT. Preload decodes chest PNGs.
- `OPACITY: 1`, `MULTIPLE_OPACITIES: false` in `defaultPreviewConfig`.

**Verify:** first load still pays CDN; second load of the same File hits WeakMap. Watch `[basi]` progress logs.

---

## How to pick up

1. `cd D:\source\repos\structure-db-viewer`
2. `python -m http.server 5173 --directory src`
3. Hard-refresh http://localhost:5173 — title should show **judo57**.
4. Open a structure with double chests + a dense cube wall; pan; dbl-click a double chest.

Tests: `cd tests/viewerUnit && node --test index.js`  
Expect **104 pass**. Two Node suites still fail to *load* (`Element is not defined` in `src/utils/dom.js`) — pre-existing, not chest.

---

## Not done / still true

- **No git commit** this round. Lots of modified + untracked (paper UI, PackAssetStore, editor, taxonomy, `src/buildId.js`, etc.). `docs/NEXT.md` Decision D still open.
- NBT validation plan (`docs/sec_nbt_plan.md` P0–P5) **not implemented in src**.
- First structure load can still exceed 5s if textures are cold on jsDelivr; Cache Storage should help the second session.
- If latch is still wrong on **east/west** after judo57, the N/S-only X-mirror is too narrow — extend `#chestFacingIsNorthSouth` logic.
- If UVs look mirrored on the lid/top after the X-mirror, `flipWinding` quad order may need a tweak (`resolveTemplateFaceUvs`).

---

## Key files

| Area | Path |
|------|------|
| Pair + inventory merge | `src/viewer/doubleChest.js` |
| Geo cubes | `src/data/blockShapeGeos.json` (`chest_double`) |
| N/S X-mirror | `src/BlockGeoMaker.js` |
| 54-slot UI | `src/viewer/containerUi.js` |
| Index link | `src/viewer/inspectStructure.js` |
| Pick | `src/viewer/systems/InspectRaycaster.js` |
| Load/cache | `src/viewer/structurePreview.js`, `src/TextureAtlas.js` |
| Flicker | `src/PreviewRenderer.js`, `src/viewer/systems/PreviewResourcePool.js` |
| Build id | `src/buildId.js` + every `?v=judoN` |

Older architecture/docs: `docs/AUTHORING_CORE.md`, `docs/NEXT.md`, `docs/sec_nbt_plan.md`.
