# HoloPrint remaining deps

Status: **research** (snapshot after isolation).  
Related: `src/holoprint/README.md`, [NEXT.md](./NEXT.md), [renderer-engine.md](./renderer-engine.md).

**Product:** ASI inspector does **not** import `src/holoprint/` at runtime. HoloPrint is optional **export** (hologram `.mcpack` for in-game build). CC BY-NC-SA attribution in `NOTICE.md` stays even if the pack folder is deleted.

---

## Already gone

| Direction | Status |
|-----------|--------|
| `src/app/`, `src/ui/`, `src/viewer/` → `src/holoprint/` | none |
| `ItemCriteriaInput` → `holoprint/HoloPrint.js` | uses `src/itemCriteria.js` |
| `src/HoloPrint.js` shim | deleted |
| Cache-bust `?v=judoN` mid-graph | only `src/index.html` (`judo42`) |

---

## Reverse: pack still uses ASI geo

`src/holoprint/HoloPrint.js` / `holoprintPack.js` import:

- `BlockGeoMaker`, `TextureAtlas`, `PolyMeshMaker`, `EntityGeoMaker`
- `PreviewRenderer` (preview without zip)
- `ResourcePackStack`, `LocalResourcePack`, `BlockUpdater`, `fetchers`
- `itemCriteria.js`, `utils.js`

Fine if pack stays (Path B). Deleted with the folder if Path A.

`StructureDiagramMaker` still `import("./WebGL2QuadRenderer.js")` from inside `holoprint/` — renderer lives in `src/`; that path is **broken** after the move.

---

## Pack-only files still in `src/` (ASI never uses them)

Only pack UI / `makePack` touch:

- `src/components/ItemCriteriaInput.js`, `FileInputTable.js`, `Vec3Input.js`, `SimpleLogger.js`, `ResizingInput.js`
- `src/itemCriteria.js`
- `src/entityScripts.molang.js`
- `src/WebGL2QuadRenderer.js` + shaders
- `src/translations/en_US.json` / `zh_CN.json` (still pack copy: generate pack, hologram controls)
- `src/holoprintPack.html` redirect
- Inspector `index.html` importmap still lists `@supabase/supabase-js` (unused by ASI)

Keep `LilGui` (preview options + pack).

---

## Network / tests / pipeline

- `fetchers.js` cache lists: `SuperLlama88888/holoprint-repository-tracker`
- Pack UI: HoloPrint **Supabase** (`holoprintPack.js`, `SupabaseLogger.js`)
- `tests/testSampleStructures` — `--export-holoprint-lib` + `makePack`
- `tests/completedPacks/*.holoprint.mcpack`
- `tests/checkBlockTranslationCoverage` still mentions `HoloPrint.IGNORED_BLOCKS` / old `MaterialList` path
- `pipeline/build.js` always bundles `temp/holoprint/holoprintPack.js`

`npm run test:viewer` does not need pack. Full `npm test` does.

---

## Heritage that is not a folder import

`BlockGeoMaker`, `TextureAtlas`, `PolyMeshMaker`, `ResourcePackStack` **are** the ASI renderer (HoloPrint-derived). Deleting `src/holoprint/` does not replace them. Attribution stays.

Two materials lists: `src/viewer/materialList.js` (ASI) vs `src/holoprint/MaterialList.js` (pack UI). Duplicate `tweakBlockPalette` in HoloPrint vs `viewer/palette.js`.

---

## Two paths (decide in NEXT.md)

**Path A — inspector-only repo:** delete `src/holoprint/`, pack-only `src/` leftovers, pack tests, pipeline pack entry, tracker URL, supabase from inspector importmap. Keep NOTICE/credits.

**Path B — keep hologram export:** move pack-only `src/` files into `src/holoprint/`, fix `WebGL2QuadRenderer` import, menu **Export → HoloPrint pack**, inspector never imports pack, lint/test that `app|ui|viewer` stay clean. Pack may keep unofficial dumps.
