# Preview API

WebGL preview: session manager (public import) plus `PreviewRenderer` and its systems. App code drives the renderer (`pickAtClient`, camera, layers). It does not construct systems by hand.

```js
import { PreviewSessionManager } from "./viewer/api/previewSession.js";
import PreviewRenderer from "./viewer/engine/PreviewRenderer.js";
```

## `PreviewSessionManager`

`src/app/PreviewSessionManager.js`, re-exported from `api/previewSession.js`.

Parks live WebGL canvases by catalog id so switching structures does not always rebuild. Default `maxParked` is **2** (plus the active view). `selectedId` is not LRU-evicted first.

| Member | Role |
|--------|------|
| `constructor({ maxParked = 2, getPreviewHost, log })` | |
| `primary()` | Active `PreviewRenderer`, or `null` |
| `primaryPreview()` | Same as `primary()`. Deprecated |
| `activeCount` / `hasActive` | |
| `setActive(previews)` / `clearActive()` | Replace or drop the live list. `clearActive` does not dispose |
| `disposeActive()` | Dispose live renderers |
| `parkCurrent(entryId)` | Move the host `.previewCont` into a hidden stash. Aborts in-flight work first |
| `restore(entryId)` | Bring a parked session back. Returns `false` when nothing is parked |
| `disposeParked(entryId, file?)` | Dispose one parked session. A `file` also drops that file's build cache |
| `disposeAllParked()` | |
| `beginPreviewJob()` | New `AbortController`. Returns its `AbortSignal`. Aborts the previous job |
| `endPreviewJob()` | Drop the controller without aborting |
| `cancelWork()` | Abort the current job. Parked canvases stay |
| `clearEverything({ resetIcons = true })` | Dispose active and parked, clear the data-file cache, and (unless `resetIcons` is `false`) revoke item-icon object URLs |
| `selectedId` | Catalog id that `evictIfNeeded` keeps |
| `ensureStash()` / `touchParkOrder(entryId)` / `evictIfNeeded()` | Park bookkeeping used by `parkCurrent` |

## `PreviewRenderer`

`src/viewer/engine/PreviewRenderer.js`. Builds a `PreviewContext`, wires systems, then `init()` / `dispose()`.

```js
new PreviewRenderer(
  cont,                 // host Node
  packName,             // string
  imageBlob,            // atlas Blob
  structureSize,        // I32Vec3
  blockPalette,         // Block[]
  blockFaceTemplates,   // PolyMeshTemplateFaceWithUvs[][]
  blockIndices,         // [Int32Array, Int32Array]  (two layers after read)
  options = {},         // Partial<defaults>; options.entities is a fallback list
  entitiesArg = []      // PreviewEntity[]; wins when non-empty
)
```

`PreviewRenderer.PERFORMANCE_OPTIONS` is the Bedrock Layers viewer default: no point lights, no shadows, no antialias, `maxPixelRatio` 1.5, `materialSide: "front"`, `canvasScale` 0.65, no skybox, entities on, background `0x121214`. The class default `options` (used when those fields are omitted) still enable skybox, shadows, damping, and a higher pixel ratio. Pass `PERFORMANCE_OPTIONS` for the inspector.

`init()` shows the canvas once block meshes exist. `attachEntities` starts after that and is not awaited, so minecarts, cushions, and item-frame items can appear a moment later.

| Member | Role |
|--------|------|
| `init()` | Load Three.js, build block meshes, show the canvas, then start `attachEntities` |
| `dispose()` / `disposed` | Tear down WebGL |
| `previewEntities` | Carts and frames queued for attach |
| `entities` | The attach system |
| `inspectIndex` | Sparse inspect map. Settable |
| `pickAtClient(clientX, clientY)` | Ray → block, entity, or miss |
| `getCameraPreset()` / `setCameraPreset(id)` | iso N/S/E/W, cardinals, top, layer, free, fly |
| `getCameraZoom()` / `setCameraZoom(z)` | 0.5–2 |
| `resetCamera()` | Structure default |
| `getSelectedLayer()` / `setSelectedLayer(layer)` / `stepLayer(delta)` / `showAllLayers()` / `getMaxLayer()` | Y slice. Enter, stay, and leave call `CameraController` |
| `getCameraTilt()` / `setCameraTilt(deg, opts?)` | Layer view and N/S/E/W |
| `isFlyMode` / `orbitControls` | |
| `requestRedraw()` | |
| `attachEntities(entityList, resourcePackStack, opts?)` | Minecarts, cushions, and item-frame items |
| `downloadScreenshot()` / `exportGlb()` | |

Iso presets use an orthographic camera. Entering Free after orbit keeps that camera, so the structure scale stays. Fly is first-person look-drag. WASD needs a keyboard.

## `PreviewContext`

`src/viewer/systems/PreviewContext.js`

Shared bag filled during `init()`: `THREE`, `scene`, `camera`, `controls`, `renderer`, `canvas`, `pool`, `options`, `structureSize`, `blockIndices`, `blockPalette`, `inspectIndex`, `blockFaceTemplates`, plus refs `layers`, `entities`, `cameraCtrl`, `viewport`, `geo`, `inspect`, `lighting`.

`isDisposed()` / `markDisposed()` / `requestRender()`.

## Systems (one context)

| Class | File | Role |
|-------|------|------|
| **PreviewResourcePool** | `PreviewResourcePool.js` | Shared materials and textures, dispose policy |
| **ViewportSystem** | `ViewportSystem.js` | Canvas size, DPR, `visualViewport`, demand RAF |
| **BlockGeoSystem** | `BlockGeoSystem.js` | Palette templates → buffer geos, opacity, waterlog inset |
| **LayerMeshSystem** | `LayerMeshSystem.js` | InstancedMesh per Y. Occupancy-culled full view, unculled layer mode |
| **LightingSystem** | `LightingSystem.js` | Directional light plus pooled point lights |
| **EntityAttachSystem** | `EntityAttachSystem.js` | Minecarts, cushions, cargo, item-frame icons |
| **CameraController** | `CameraController.js` | Presets, ortho iso, zoom, fly handoff, and layer enter, stay, and leave |
| **FlyController** | `FlyController.js` | Pointer look and WASD |
| **InspectRaycaster** | `InspectRaycaster.js` | First classified hit |
| **SpecialBlockOverlay** | `SpecialBlockOverlay.js` | Sign text in `SignTextColor` (glow ink included) and lectern pages |

Supporting modules (functions, not classes): `isoCamera.js`, `orbitBootstrap.js`, `layerVisibility.js`, `occupancySkip.js`, `previewSpace.js`.

## Occupancy

`scanStructureBlocks` stores solid positions as a palette CSR (`off` plus an `xyz` `Int32Array`), filled y then x then z, so one palette's equal-y cells are contiguous. Waterlog liquids go to their own CSR and are not culled. `filterBuriedUnitCubes` drops solid instances whose six neighbors are opaque `"block"` family cubes and writes another CSR. That culled CSR is the full preview. Layer isolation uses the unculled solid CSR. An empty palette is a zero-length range. Meshes take matrices from that buffer. Picking reads `userData.bLayersBlockXyz` at `bLayersBlockXyzAt + instanceId`.

## Drawing rules

Preview calls `makePolyMeshTemplates` then `scaleFaceTemplates`. Scale defaults to 1. The pack generator calls the same two methods and defaults to 0.95 so in-game holograms stay inset. Chests and straw beds stay full size on that pack path so their seams stay flush (`skipSeamScale`).

Volume glass, stained glass, water, and ice use front faces and write depth (`materialSide: "front"` on the transparent material). A face with zero thickness stays double-sided on the card material. Floor meshes use `renderOrder` `-1000`. Other translucent meshes use a per-mesh `renderOrder` from their position count.

Minecarts and cushions more than one block outside the structure box are not meshed (`ENTITY_OUTSIDE_MARGIN` is 1 in `src/viewer/entityExtract.js`). Inspect still lists every entity stored in the file. The preview logs `[bLayers] skipped N entities outside the structure`.

Water and lava on the waterlog layer are drawn slightly inside the cell. `scanStructureBlocks` keeps those positions in `waterlogPositions`. `insetCellShellFaces` (`BlockGeoSystem.js`) moves vertices that sit on the 0 or 16 shell inward by `WATERLOG_FACE_INSET` (0.08). Stairs, slabs, and other partial blocks keep their outer faces. A source liquid top at height 14 stays at 14. Standalone water on layer 0 is full size.

`tweakBlockPalette` (`src/viewer/palette.js`) copies a cell's block-entity data onto a new palette row. The source row is deleted only when no cell still indexes it.

`dedupePalette` (`src/viewer/paletteCore.js`) then collapses identical rows in that one palette and remaps both index layers. Block `version` is part of the identity. The pack generator is the caller of `mergeMultiplePalettesAndIndices`, which runs the same remap across several structures.

`applyNeighborConnections` (`src/viewer/fenceConnections.js`) runs after the palette tweak, in the inspector and in the pack generator. One walk fills missing connection flags for fences and for glass panes. Each palette row records its family and link mask once. Neighbors are read from the layer before the new rows are written. A block with any `minecraft:connection_*` flag already on (`1`, `true`, `"1"`, `"true"`) keeps the saved flags, including an arm toward a neighbor outside the file. Missing flags, and a set that is all 0, are filled from neighbors inside the structure. A side with no in-structure neighbor does not grow an arm. Linked blocks become new palette rows so the shared row stays intact.

Fences link to other fences, fence gates, and sturdy full cubes. Glass, leaves, and barriers do not connect. The preview logs `[bLayers] fence connections`. A glass pane is a center post plus an arm for each flag that is on. Panes link to other panes, bars, and sturdy cubes, including glass. Leaves, barriers, and fences do not connect. Iron bars keep their own sheet. The preview logs `[bLayers] glass pane connections`.

A load prints one `[bLayers] appearance:` line when any block used the default cube, had no geometry, or drew the checkerboard. Default cubes stay a count. Ids with no geometry, and texture keys that used the checkerboard, are named. Placed blocks newer than `BlockUpdater.LATEST_VERSION` also print a `[bLayers]` line and set the preview status. The sentence is "N blocks are newer than the upgrade data, so their states were left as saved", and when some of those cells have no shape it continues ", and M of them are shown as placeholders." A known block keeps the current geometry. Air is not counted. A row above that constant keeps its `version` through that remap, double-chest halves, and linked fence or pane rows. The count reads that `version` after those remaps, then `version` is removed. The pack generator removes `version` before neighbor connections, so a future row still shares a geometry row with an identical current block.

Door `direction` is 0 east, 1 south, 2 west, 3 north, the same turns as `minecraft:cardinal_direction`. A hanging sign stores both `facing_direction` and `ground_sign_direction`. `attached_bit` selects the ground yaw. Otherwise only `facing_direction` is applied. See `kindOfSign(name, states)` in [inventory.md](./inventory.md).

After the block upgrade, `tweakBlockPalette` skips coral fans, then `applyUnrevisedBlockStates` in `src/viewer/blockUpgradeApply.js` rewrites a leftover `stone_slab_type` on an unflattened slab through `applyFlattenedProperty`, and copies `vertical_half` or `top_slot_bit` onto `minecraft:vertical_half`. That changes the preview palette. The geometry pass calls `rotationLookup` in `src/viewer/legacyStateAlias.js`. That reads `weirdo_direction` (0 east, 1 west, 2 south, 3 north) or `direction` (0 south, 1 west, 2 north, 3 east) as `minecraft:cardinal_direction` only when the shape asks for the cardinal name and does not use the old key. The lookup does not copy the block or change the stored states. Coral fan states stay as saved.

Redstone dust in saved structures is drawn from `redstone_signal` as one square. Connection states are not used for its shape.

A floor coral fan is four low blades. Each blade is one texture sheet, tilted 22.5° up from the center, and the tips pass the cell. A wall coral fan is two nearly horizontal sheets hinged on the supporting face and opening away from that block. `coral_direction` yaws the wall fan (0 west, 1 east, 2 north, 3 south). A floor fan uses that same yaw when the file stores `coral_direction`. Shapes are `coral_fan` and `coral_wall_fan` in `src/data/blockShapeGeos.json`.

The viewer material list and the pack material list both count items through `compileMaterialTables` and `materialIdentity` in `src/material/compileMaterial.js`. The viewer counts a layer with one histogram and maps each used palette row once. Totals match a per-cell count. A missing block-entity property is logged once per item name. Multiplier keys split on commas. A bed color is a `+N` suffix on the item name. The viewer still decides which liquids count and how stacks partition. The pack still counts layer-1 water.

## Load timings

A slow open prints `[bLayers]` seconds from `src/viewer/structurePreview.js` and `PreviewRenderer.js`. `bLayers` means `bedrockLayers`. Each name is only the work after the previous mark:

| Line | Span |
|------|------|
| `parse` | NBT read |
| `palette` | Palette tweak, identical-row dedupe, double-chest remap, fence rails, and glass pane arms |
| `pack data` | Block-shape tables, `blocks.json`, terrain and flipbook JSON |
| `geometry` | Palette meshes, including cargo blocks |
| `atlas` | `TextureAtlas.makeAtlas` |
| `uv` | UV resolve and face scale. Preview scale is 1, so faces stay full size |
| `item schemas` | Remainder of the item-upgrade fetch |
| `inspect` | Sparse inspect index |
| `preview setup` | Three.js import through the WebGL renderer and atlas image |
| `preview mesh` | Block scan plus instanced meshes. Entity attach is still running |
| `preview assets` | Whole asset build. About `0.00s` when this page already built that file |
| `preview ready` | Click through the canvas |

`TextureAtlas` logs without the `[bLayers]` prefix (the pack generator uses the same class): `atlas images … load … crop …` and `atlas stitch`. `load` is fetch plus decode. `crop` is the CPU pass after the bytes are in memory. Skybox setup sits between `preview setup` and `preview mesh`, so that wait shows up in `preview ready`.

`AtlasComposer` (`src/viewer/engine/atlasComposer.js`) resolves terrain keys and returns the stitched size, fill, pixels, and UVs. `TextureAtlas` assigns those fields. It still owns image load, the packed-atlas cache, and `exportPackTextures`. `PreviewLoadingChrome` (`previewLoadingChrome.js`) builds the loading message and the options panel. `PreviewRenderer` still owns the scene and `init()`.

Phase order inside `structurePreview.js` is parse, palette, pack data, geometry, atlas, uv, item schemas, then inspect. A cache hit on `getCachedFileBuild` skips those phase lines. The canvas appears when `LayerMeshSystem` finishes the block meshes. Entity attach is not part of `preview mesh`.
