# APIs, classes, and data structures

Advanced Structure Inspector as of `dev`. App and UI should import product contracts from `src/viewer/api/`, not from `systems/` or HoloPrint.

Related: [WORKFLOW.md](./WORKFLOW.md) (habit 3), [APPEARANCE_ARCHITECTURE.md](./APPEARANCE_ARCHITECTURE.md), [SETUP.md](./SETUP.md).

---

## Layers

```
index.html / index.js
        │
        ▼
   app/  +  ui/          ← shell: selection, import, chrome
        │
        ▼
 viewer/api/*            ← public contracts
        │
        ├── catalog / db / ingest / parse
        ├── inspect / inventory / icons
        └── structurePreview → PreviewRenderer → systems (PreviewContext)
```

Bedrock `.mcstructure` is little-endian NBT: `format_version`, `size`, `structure_world_origin`, and `structure.{block_indices, entities, palette.default.{block_palette, block_position_data}}`.

---

## Public APIs (`src/viewer/api/`)

Import from `./viewer/api/index.js` or a subpath.

| Module | Role | Main exports |
|--------|------|----------------|
| **catalog** | IndexedDB catalog | `StructureCatalog`, `dbPut*` / `dbLoad*` |
| **ingest** | Files → catalog rows | `ingestFiles`, `detectSourceKind`, `expandSourceFile` |
| **inventory** | NBT extract + container UI | `buildInspectIndex`, `extractInventoryItems`, `normalizeItemStack`, `asList`, `extractSignText`, `extractSignFace`, `parseSignTextLines`, `extractLecternBook`, `extractBookPages`, `readRedstoneSignal`, `formatInspectText`, `resolveContainerKind`, `layoutForKind`, `renderContainerUi`, `readComposterFillLevel` |
| **icons** | Item / block icon URLs | `getItemIconUrl`, `hydrateInventoryIcons`, `ensureItemIconLoader`, `resetItemIconCache`, `stripItemNs` |
| **previewSession** | Parked WebGL contexts | `PreviewSessionManager` |
| **build** | Abort + preview caches | `isAbortError`, `throwIfAborted`, `getCachedFileBuild`, `getCachedDataFile`, `clearFileBuildCache`, `clearDataFileCache`, `clearAllPreviewCaches` |

Icon resolution order (inside `itemIconLoader`): `data/itemIcons.json` → `item_texture.json` → `blocks.json` / terrain → heuristic pack paths.

---

## Classes

### Catalog and session

**`StructureCatalog`** (`src/viewer/catalog.js`)  
In-memory maps of entries and categories, persisted to IndexedDB. `add` / `remove` / `patch` / `search` / `hydrateFromDb`. App singleton: `catalog` in `src/app/state.js`.

**`PreviewSessionManager`** (`src/app/PreviewSessionManager.js`)  
Owns live `PreviewRenderer` instances. Parks up to `maxParked` (default 2) by catalog id so switching structures does not rebuild WebGL every time. `primary()`, `setActive()`, `beginPreviewJob()` (AbortSignal). Re-exported as the preview-session API.

**`PreviewRenderer`** (`src/PreviewRenderer.js`)  
Thin orchestrator: builds `PreviewContext`, wires systems, `init()` / dispose. Notable surface: `previewEntities`, `inspectIndex`, camera presets, `pickAtClient`, layer, screenshot / GLB. ASI defaults: `PreviewRenderer.PERFORMANCE_OPTIONS`.

### Preview systems (one shared `PreviewContext`)

| Class | Role |
|-------|------|
| **PreviewContext** | THREE / scene / camera / canvas / options / `inspectIndex` + system refs |
| **PreviewResourcePool** | Shared materials / textures + dispose policy |
| **ViewportSystem** | Canvas size, DPR, demand RAF |
| **BlockGeoSystem** | Palette instancing from `block_indices` |
| **LayerMeshSystem** | Slice visibility |
| **LightingSystem** | Directional + pooled point lights |
| **EntityAttachSystem** | Minecarts + item-frame items (sole entity-list owner) |
| **CameraController** | Orbit presets / tilt |
| **FlyController** | WASD + pointer look (desktop) |
| **InspectRaycaster** | Pointer → block or entity |
| **SpecialBlockOverlay** | Sign text + lectern book meshes |

Supporting modules (not classes):

- `previewSpace.js` — `structurePosToThree`, `geoPointToThree`, `applyBlockGeoEuler`, `blockGeoEulerToThree`
- `signPlacement.js` — sign kind, board table, euler, `placeSignFace`
- `orbitBootstrap.js` — camera + OrbitControls
- `layerVisibility.js` — `isOnActiveLayer`

`entityMeshes.js` and `itemFrameItems.js` re-export preview-space helpers; they must **import** those names to use them locally (a bare `export { x } from` does not bind `x` in the same file).

### App / UI (not product APIs)

- `app/state.js` — `catalog`, `session`, `getSelectedId` / `setSelectedId`, `els`
- `app/previewLifecycle.js` — select → build preview
- `app/importExport.js` — file picker / drop
- `ui/catalogList.js`, `detailPanel.js`, `previewChrome.js`

---

## Data structures

### Catalog

```js
StructureCatalogEntry {
  id, name, sourceName, sourceKind,   // mcstructure | mcworld | mcpack | zip | mctemplate
  size: [x, y, z],
  worldOrigin: [x, y, z] | null,
  paletteSize, blockCount, blockNames[],
  entityCount,
  materials: [{ id, label, count }],
  hopperStats, categoryId,
  acquiredMaterials[], defaultCameraPreset,
  userDetails[], creator, credits, sourceLink,
  addedAt, file: File,
  parseError?, persistError?
}

StructureCategory { id, name, sortOrder, collapsed }
```

`parseStructureFile` fills numeric / name fields from NBT. `ingestFiles` expands worlds / packs, then parses each `.mcstructure`.

### Inspect (click / inventory)

```js
InspectIndex {
  size: [x, y, z],
  blocks: Map<"x,y,z", InspectBlock>,  // sparse: block-entities only
  entities: InspectEntity[],
  sparse: true
}

InspectBlock {
  x, y, z, name, states,
  blockEntityId, blockEntity,
  items: ItemStack[],
  waterlogName
}

InspectEntity {
  identifier, rawId,
  pos: [x, y, z],          // structure-local
  items: ItemStack[],
  customName, raw
}

ItemStack { name, count, slot, damage, raw? }
```

Sign faces (block entity `FrontText` / `BackText`):

```js
SignFace { lines: string[], color: number|null, glowing: boolean, raw: string }
// extractSignText → { front, back, waxed }
```

### Preview entities (3D carts)

```js
PreviewEntity {
  identifier, rawId,
  pos: [x, y, z],   // world Pos − structure_world_origin
  yawDeg, pitchDeg,
  items?, customName?, raw?
}
```

### Sign placement (geo, not NBT)

```js
SignKind = "wall" | "standing" | "hanging"
SIGN_BOARD[kind] = { cx, cy, cz, w, h, front, halfT }
placeSignFace(block, name, isBack) → { kind, board, eulerDeg, side, tx, ty, tz }
```

Boards match `src/data/blockShapeGeos.json` (wall plate at high Z, standing / hanging plaques near cell center).

### Preview runtime

`PreviewContext` holds THREE, scene, camera, OrbitControls, renderer, canvas, pool, options, `structureSize`, `blockIndices`, `blockPalette`, `inspectIndex`, `selectedLayer`, and refs to the systems above.

---

## Main flows

**Import**  
`File` → `detectSourceKind` / `expandSourceFile` → `parseStructureFile` → `catalog.add` → IndexedDB.

**Preview**  
Selected `entry.file` → `structurePreview.renderStructurePreview` (NBT + geo + atlas, cached) → `new PreviewRenderer(...)` → systems `init` → `EntityAttachSystem` + `SpecialBlockOverlay.rebuild`.

**Inspect**  
`pickAtClient` → `InspectRaycaster` → `InspectIndex` / palette → `formatInspectText` / `renderContainerUi` + icons.

**Session**  
Switch structure → park old canvas in a hidden stash (LRU 2) → restore or rebuild.

---

## Not product APIs

- `HoloPrint.js` / pack generation (`holoprintPack.html`) — heritage, not the catalog contract.
- `src/viewer/systems/*` — app shell should not import these directly.
- `nbtify` write (`scripts/fill-sign-test-text.mjs`) — fixture tool only. Runtime parse uses `nbtify-readonly-typeless`.
