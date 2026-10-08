# Catalog API

`src/viewer/api/catalog.js`

In-memory catalog plus IndexedDB. The app holds one `StructureCatalog` instance (`src/app/state.js`). Persistence copies structure **bytes** (not a live file-picker `File`) so reload still parses on Safari.

`StructureCatalog` in `src/viewer/catalog.js` owns the maps. Structure rows (`add`, `patch`, `search`, `remove`, and the entry and feature assignments on a structure) are `CatalogEntryBook` in `src/viewer/catalogEntries.js`. Categories, function-entries, and features stay in `catalogTaxonomy.js`. Those two modules share one store on the catalog. Public methods stay on `StructureCatalog`.

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
| `getDbName()` | Active IndexedDB name |
| `bootFromRegistry()` | Migrate the default DB if needed, then load the active named catalog |
| `hydrateFromDb()` | Fill maps from IndexedDB |
| `reloadFromDb(dbName?)` | Wipe maps and load a DB |
| `subscribe(listener)` | Notify UI after mutations |
| `setPersistEnabled(bool)` | Tests: skip IndexedDB |
| `lastPersistError` | Last put/delete error string, or `null` |
| `add(partial)` | Insert a structure row and persist. Returns the stored entry |
| `patch(id, partial)` | Update metadata (name, counts, camera, notes, features, materials, …) |
| `get(id)` / `list()` / `search({ query })` | Read |
| `remove(id)` / `clear()` | Delete one structure, or every structure |
| `setStructureEntry(structureId, entryId)` | Place a structure on a catalog entry. `null` is Uncategorized |
| `defaultEntryForCategory(categoryId)` | The `isDefault` entry in that category, or the first entry |
| `assignStructureToCategory(structureId, categoryId)` | Place on that category's default entry. `null` or `"uncategorized"` clears `entryId` |
| `setStructureFeatures(structureId, featureIds)` / `toggleStructureFeature(structureId, featureId)` | Assign feature tags |
| `activate(id)` / `saveAs(name)` / `createEmpty(name)` / `deleteActive()` / `renameActive(name)` | Named-catalog wrappers around the functions below |

**Categories**

| Method | Role |
|--------|------|
| `listCategories()` / `getCategory(id)` | Read |
| `getCategoryForStructure(structureId)` | Category of the structure's entry, or `undefined` when Uncategorized |
| `addCategory(nameOrPartial)` / `patchCategory(id, partial)` / `renameCategory(id, name)` / `removeCategory(id)` | Mutate |
| `setCategoryCollapsed(id, collapsed)` | |
| `reorderCategory(id, direction)` | `direction` is `-1` or `1` |
| `moveCategoryTo(id, targetId, place)` | `place` is `"before"` or `"after"` |

**Entries** (function groups under a category)

| Method | Role |
|--------|------|
| `listCatalogEntries(categoryId?)` / `getCatalogEntry(id)` | Read. Omit `categoryId` to list every entry |
| `addCatalogEntry(partial)` / `patchCatalogEntry(id, partial)` / `removeCatalogEntry(id)` | Mutate |
| `setCatalogEntryCollapsed(id, collapsed)` | |
| `reorderCatalogEntry(id, direction)` | `direction` is `-1` or `1`, within that entry's category |

**Features**

| Method | Role |
|--------|------|
| `listFeatures()` / `getFeature(id)` / `listFeaturesForStructure(structureId)` | Read |
| `addFeature(partial)` / `patchFeature(id, partial)` / `removeFeature(id)` | Mutate |
| `reorderFeature(id, direction)` | `direction` is `-1` or `1` |
| `listTree({ query })` | Nested tree for the left list |
| `ensureSeedTaxonomy()` | Default categories and features. Idempotent |

`UNCATEGORIZED_ID` is `null` on `src/viewer/catalog.js`. It is not re-exported from the barrel. A structure with `entryId == null` is Uncategorized.

## Named-catalog functions

Several IndexedDB databases can exist. The registry lives in `localStorage`.

| Export | Role |
|--------|------|
| `DEFAULT_DB_NAME` | `"bedrockLayers-db-viewer"` |
| `listCatalogs()` | `{ id, name, dbName }[]` |
| `getActiveCatalog()` | Current registry row |
| `activateCatalog(catalog, id)` | Switch DB and reload |
| `createEmptyCatalog(catalog, name)` | New empty DB |
| `saveCatalogAs(catalog, name)` | Clone the current DB |
| `renameActiveCatalog(name)` | Rename the registry row |
| `deleteActiveCatalog(catalog)` | Drop the DB. The protected default is kept |

New catalogs use `bLayers-catalog-`. Boot clones only into an empty destination whose source has rows, then deletes that source. Older default databases share `bedrockLayers-db-viewer`, and the newer source is decided first. A source that still has rows, and was not cloned, keeps its name.

## Data

```js
StructureCatalogEntry {
  id, name, sourceName, sourceKind,  // mcstructure | mcworld | mctemplate | mcpack | mcaddon | zip
  size: [x, y, z],
  worldOrigin: [x, y, z] | null,
  paletteSize, blockCount, blockNames[],
  entityCount,
  materials: [{ id, label, count }],
  hopperStats,
  entryId,                            // null = Uncategorized
  featureIds[],
  acquiredMaterials[],
  defaultCameraPreset,                // default "iso-north"
  defaultCameraZoom,                  // 0.5–2, default 1
  userDetails: [{ id, text, addedAt? }],
  creator, credits, sourceLink,
  addedAt, file: File,
  contentCrc32,                       // IEEE CRC-32 of stored bytes (8 hex chars)
  parseError?, persistError?
}

StructureCategory { id, slug, name, description, color, sortOrder, collapsed, isDefault }
CatalogEntry { id, slug, categoryId, name, description, sortOrder, collapsed, isDefault }
CatalogFeature { id, slug, name, description, useCases, color, categoryIds[], sortOrder, isDefault }
```
