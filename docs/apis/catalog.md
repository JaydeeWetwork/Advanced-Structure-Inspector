# Catalog API

`src/viewer/api/catalog.js`

In-memory catalog plus IndexedDB. The app holds one `StructureCatalog` instance (`src/app/state.js`). Persistence copies structure **bytes** (not a live file-picker `File`) so reload still parses on Safari.

```js
import {
  StructureCatalog,
  DEFAULT_DB_NAME,
  listCatalogs,
  getActiveCatalog,
  activateCatalog,
  createEmptyCatalog,
  saveCatalogAs,
  renameActiveCatalog,
  deleteActiveCatalog
} from "./viewer/api/catalog.js";
```

## `StructureCatalog`

| Method | Role |
|--------|------|
| `bootFromRegistry()` | Migrate default DB if needed, load the active named catalog |
| `hydrateFromDb()` | Fill maps from IndexedDB |
| `reloadFromDb(dbName?)` | Wipe maps and load a DB |
| `add(partial)` | Insert a structure row and persist |
| `patch(id, partial)` | Update metadata (camera, notes, features, …) |
| `get(id)` / `list()` / `search({ query })` | Read |
| `remove(id)` / `clear()` | Delete one or all structures |
| `subscribe(listener)` | Notify UI after mutations |
| `getDbName()` | Active IndexedDB name |
| `setPersistEnabled(bool)` | Tests: skip IDB |
| `lastPersistError` | Last put/delete error string, or `null` |

**Taxonomy**

| Method | Role |
|--------|------|
| `listCategories()` / `getCategory(id)` | Categories |
| `addCategory` / `patchCategory` / `renameCategory` / `removeCategory` | Mutate |
| `reorderCategory` / `moveCategoryTo` / `setCategoryCollapsed` | Order / UI |
| `listCatalogEntries(categoryId)` / `addCatalogEntry` / `patchCatalogEntry` / `removeCatalogEntry` | Entries under a category |
| `assignStructureToCategory` / `setStructureEntry` | Place a structure |
| `listFeatures()` / `addFeature` / `patchFeature` / `removeFeature` | Feature tags |
| `setStructureFeatures` / `toggleStructureFeature` / `listFeaturesForStructure` | Assign tags |
| `listTree({ query })` | Nested tree for the left list |
| `ensureSeedTaxonomy()` | Default categories/features (idempotent) |

**Named catalogs** (wrappers around the functions below): `activate`, `saveAs`, `createEmpty`, `deleteActive`, `renameActive`.

## Named-catalog functions

Several IndexedDB databases can exist. Registry lives in `localStorage`.

| Export | Role |
|--------|------|
| `DEFAULT_DB_NAME` | `"asi-db-viewer"` |
| `listCatalogs()` | `{ id, name, dbName }[]` |
| `getActiveCatalog()` | Current registry row |
| `activateCatalog(catalog, id)` | Switch DB and reload |
| `createEmptyCatalog(catalog, name)` | New empty DB |
| `saveCatalogAs(catalog, name)` | Clone current DB |
| `renameActiveCatalog(name)` | Rename registry row |
| `deleteActiveCatalog(catalog)` | Drop DB (not the protected default) |

## Data

```js
StructureCatalogEntry {
  id, name, sourceName, sourceKind,  // mcstructure | mcworld | mcpack | zip | mctemplate
  size: [x, y, z],
  worldOrigin: [x, y, z] | null,
  paletteSize, blockCount, blockNames[],
  entityCount,
  materials: [{ id, label, count }],
  hopperStats,
  entryId, featureIds[],
  acquiredMaterials[],
  defaultCameraPreset,               // e.g. "iso-north"
  defaultCameraZoom,                 // 0.5–2, default 1
  userDetails[], creator, credits, sourceLink,
  addedAt, file: File,
  contentCrc32,                   // IEEE CRC-32 of stored bytes (8 hex chars)
  parseError?, persistError?
}

StructureCategory { id, name, sortOrder, collapsed }
CatalogEntry { id, categoryId, name, sortOrder, collapsed }
CatalogFeature { id, name, sortOrder, color? }
```

`UNCATEGORIZED_ID` is `null` (structures with no `entryId`).
