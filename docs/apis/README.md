# Viewer APIs

Stable contracts for the Bedrock ASI inspector. App and UI code import from `src/viewer/api/` (or a subpath). Implementation lives under `src/viewer/` and `src/PreviewRenderer.js`.

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

Import:

```js
import { StructureCatalog, ingestFiles, readMcstructure } from "./viewer/api/index.js";
// or a subpath:
import { StructureCatalog } from "./viewer/api/catalog.js";
```

Bedrock `.mcstructure` is uncompressed little-endian NBT: `format_version`, `size`, `structure_world_origin`, `structure.block_indices`, `structure.entities`, `structure.palette.default.{block_palette, block_position_data}`.

## Modules

| Doc | Module | Role |
|-----|--------|------|
| [catalog.md](./catalog.md) | `api/catalog.js` | IndexedDB catalog, named catalogs, taxonomy |
| [ingest.md](./ingest.md) | `api/ingest.js` | Files → catalog rows |
| [structure.md](./structure.md) | `api/structure.js` | Read/write `.mcstructure` |
| [inventory.md](./inventory.md) | `api/inventory.js` | Inspect NBT + container UI |
| [icons.md](./icons.md) | `api/icons.js` | Item / block icon URLs |
| [preview.md](./preview.md) | session + `PreviewRenderer` | 3D preview, systems, pick |
| [build.md](./build.md) | `api/build.js` | Abort + in-memory caches |
| [version.md](./version.md) | `api/version.js` | Vanilla pack pins |

## Main flows

**Import** — `File` → `detectSourceKind` / `expandSourceFile` → parse NBT → `catalog.add` → IndexedDB (byte copy of the file).

**Preview** — selected `entry.file` → geo + atlas → `new PreviewRenderer` → systems `init` → orbit / inspect.

**Inspect** — `pickAtClient` → inspect index → `renderContainerUi` + `hydrateInventoryIcons`.

**Session** — switching structures parks the old WebGL canvas (LRU, max 2) and restores it when you come back.

## Not public contracts

- `src/holoprint/` — optional pack generator, not the inspector API.
- `src/viewer/systems/*` — used by `PreviewRenderer`; prefer `pickAtClient` / camera methods on the renderer from app code.
- `src/ui/*` — chrome (docks, camera bar, inspect window), not a library API.

Vanilla pack files and Microsoft Learn docs: [official-resources.md](../official-resources.md).
