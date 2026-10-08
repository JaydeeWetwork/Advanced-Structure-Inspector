# Viewer APIs

Stable contracts for the Bedrock Layers inspector. Bedrock Layers is co-authored and co-developed by JaydeeWetwork and Grok Build (xAI). App and UI code import from `src/viewer/api/` (or a subpath). Implementation lives under `src/viewer/`. `PreviewRenderer` is `src/viewer/engine/PreviewRenderer.js`.

```
index.js  +  app/  +  ui/
        │
        ▼
 src/viewer/api/*          ← public contracts
        │
        ├── catalog, ingest, structure (NBT)
        ├── inventory, icons
        ├── preview session + PreviewRenderer
        └── build (abort / caches), version (vanilla pack pins)
```

`src/viewer/api/index.js` re-exports every barrel below.

```js
import { StructureCatalog, ingestFiles, readMcstructure } from "./viewer/api/index.js";
// or a subpath:
import { StructureCatalog } from "./viewer/api/catalog.js";
```

Bedrock `.mcstructure` is little-endian NBT. `format_version` 1 or 2, `size`, `structure_world_origin`, `structure.block_indices` (version 1 always two layers; version 2 one or two), `structure.entities`, and `structure.palette`. Version 2 may omit an empty waterlog layer. The product reader is the vendored `nbtify-readonly-typeless` 1.1.2 build (`src/vendor/nbtify-readonly-typeless`). It returns plain numbers, and both `List<Int>` and `Int_Array` arrive as `Int32Array`. A float list arrives as `Float32Array`, and a later write keeps that list as Float, including whole values. `INT_ARRAY` and `LONG_ARRAY` are read with indexed loops. After `readMcstructure`, `block_indices` always has two layers. `compression` 1 on a version 2 file is a zlib byte array holding the `structure` compound. That payload is read up to 64 MiB, the checksum must match, and bytes after the stream fail as `STRUCTURE_NBT_REJECTED`. There is no compression-ratio cap. An inflated payload that is not NBT fails as `STRUCTURE_NBT_REJECTED`. Other format versions (`STRUCTURE_UNSUPPORTED_VERSION`), including format version 3, plus gzip, a whole-file zlib wrapper, and any other `compression` value (`STRUCTURE_COMPRESSED`) are rejected. Nesting past 64 levels, or a node count past 2,000,000, fails before parse (`STRUCTURE_NBT_REJECTED`). The format contract is [structure.md](./structure.md).

## Modules

| Doc | Module | Role |
|-----|--------|------|
| [catalog.md](./catalog.md) | `api/catalog.js` | IndexedDB catalog, named catalogs, taxonomy. Structure rows are `catalogEntries.js` |
| [ingest.md](./ingest.md) | `api/ingest.js` | Files → catalog rows |
| [structure.md](./structure.md) | `api/structure.js` | Read/write `.mcstructure` |
| [inventory.md](./inventory.md) | `api/inventory.js` | Inspect NBT + container UI |
| [icons.md](./icons.md) | `api/icons.js` | Item / block icon URLs |
| [preview.md](./preview.md) | session + `PreviewRenderer` | 3D preview, systems, pick |
| [build.md](./build.md) | `api/build.js` | Abort + in-memory caches |
| [version.md](./version.md) | `api/version.js` | Render pins in `packPins.js`, schema pins in `schemaPins.js` |

## Main flows

**Import** — `File` → `detectSourceKind` / `expandSourceFile` → parse NBT → `catalog.add` → IndexedDB (byte copy of the file).

**Preview** — selected `entry.file` → geo + atlas → `new PreviewRenderer(cont, packName, imageBlob, structureSize, blockPalette, blockFaceTemplates, blockIndices, options, entities)` → `init()` → orbit / inspect. Fence rails, glass-pane arms, coral fans, the waterlog inset, and the newer-block status line are described in [preview.md](./preview.md).

**Inspect** — `pickAtClient` → inspect index → `renderContainerUi` + `hydrateInventoryIcons`.

**Session** — switching structures parks the old WebGL canvas (LRU, max 2) and restores it when you come back. `primary()` is the active renderer. `primaryPreview()` is the same method, marked deprecated.

## Not on the public barrels

These exist for the codec, scripts, and the pack page. App code should stay on the barrels above.

| Symbol | Where |
|--------|--------|
| `mcstructureShapeProblem`, `mcstructureFormatVersion`, `MCSTRUCTURE_SUPPORTED_VERSIONS`, quota constants | `mcstructureCodec.js` re-exports them from `mcstructureLimits.js` and `mcstructureValidate.js` |
| `readMcstructureTyped`, `typeMcstructureForWrite`, `typeFreeformNbt`, `typeBlockStates`, `BEDROCK_BOOL_BLOCK_STATES`, `loadNbtify` | `src/viewer/core/nbt/mcstructureTyped.js` |
| `sniffSourceMagic` | `ingest.js` re-exports it from `ingestBudget.js` (not `api/ingest.js`) |

## Not public contracts

- `src/pack/` — optional hologram pack generator. It calls `readMcstructure`. It is not the inspector API.
- `src/viewer/systems/*` — used by `PreviewRenderer`. App code uses `pickAtClient` and the camera and layer methods on the renderer.
- `src/ui/*` — chrome (docks, camera bar, inspect window).

Vanilla pack files and Microsoft Learn docs: [official-resources.md](../official-resources.md).
