# Preview API

WebGL preview: session manager (public import) plus `PreviewRenderer` and its systems. App code should drive the renderer (`pickAtClient`, camera, layers), not construct systems by hand.

```js
import { PreviewSessionManager } from "./viewer/api/previewSession.js";
import PreviewRenderer from "./PreviewRenderer.js";
```

## `PreviewSessionManager`

`src/app/PreviewSessionManager.js` — re-exported from `api/previewSession.js`.

Parks live WebGL canvases by catalog id so switching structures does not always rebuild. Default `maxParked` is **2** (plus the active view). The currently selected id is not LRU-evicted first.

| Method | Role |
|--------|------|
| `constructor({ maxParked, getPreviewHost, log })` | |
| `primary()` | Active `PreviewRenderer` or `null` |
| `hasActive` / `activeCount` | |
| `setActive(previews)` / `clearActive()` | Replace the live list |
| `disposeActive()` | Dispose live renderers |
| `parkCurrent(entryId)` | Move canvas into a hidden stash |
| `restore(entryId)` | Bring a parked session back |
| `disposeParked(entryId)` / `disposeAllParked()` | |
| `beginPreviewJob()` / `endPreviewJob()` | AbortController for in-flight builds |
| `cancelWork()` | Abort the current job |
| `clearEverything(opts?)` | Dispose all + optional cache wipe |
| `selectedId` | Do not evict this park slot first |

## `PreviewRenderer`

`src/PreviewRenderer.js` — orchestrator. Builds `PreviewContext`, wires systems, `init()` / `dispose()`.

Constructor takes the host element, structure data (size, indices, palette, templates, atlas), and options. Use `PreviewRenderer.PERFORMANCE_OPTIONS` for ASI defaults.

| Member | Role |
|--------|------|
| `init()` | Load Three.js, build scene, first frame |
| `dispose()` | Tear down WebGL |
| `disposed` | |
| `previewEntities` | Carts / frames for attach |
| `inspectIndex` | Sparse inspect map |
| `pickAtClient(x, y)` | Ray → block / entity / miss |
| `getCameraPreset()` / `setCameraPreset(id)` | iso-N/S/E/W, cardinals, top, layer, free, fly |
| `getCameraZoom()` / `setCameraZoom(z)` | 0.5–2 |
| `resetCamera()` | Structure default |
| `getSelectedLayer()` / `setSelectedLayer` / `stepLayer` / `showAllLayers` / `getMaxLayer` | Y slice |
| `getCameraTilt()` / `setCameraTilt` | Layer + N/S/E/W |
| `isFlyMode` / `orbitControls` | |
| `requestRedraw()` | |
| `attachEntities(...)` | Minecarts + item-frame items |
| `downloadScreenshot()` / `exportGlb()` | |

Iso presets use an **orthographic** camera. Entering **Free** after orbit does **not** switch to perspective (keeps scale). Fly is first-person look-drag (WASD needs a keyboard).

## `PreviewContext`

`src/viewer/systems/PreviewContext.js`

Shared bag filled during `init()`: `THREE`, `scene`, `camera`, `controls`, `renderer`, `canvas`, `pool`, `options`, `structureSize`, `blockIndices`, `blockPalette`, `inspectIndex`, `polyMeshTemplatePalette`, plus refs `layers`, `entities`, `cameraCtrl`, `viewport`, `geo`, `inspect`, `lighting`.

`isDisposed()` / `markDisposed()` / `requestRender()`.

## Systems (one context)

| Class | File | Role |
|-------|------|------|
| **PreviewResourcePool** | `PreviewResourcePool.js` | Shared materials / textures, dispose policy |
| **ViewportSystem** | `ViewportSystem.js` | Canvas size, DPR, `visualViewport`, demand RAF |
| **BlockGeoSystem** | `BlockGeoSystem.js` | Palette templates → buffer geos, opacity |
| **LayerMeshSystem** | `LayerMeshSystem.js` | InstancedMesh per Y; occupancy-culled full view vs unculled layer mode |
| **LightingSystem** | `LightingSystem.js` | Directional + pooled point lights |
| **EntityAttachSystem** | `EntityAttachSystem.js` | Minecarts, cargo, item-frame icons (owns entity list) |
| **CameraController** | `CameraController.js` | Presets, ortho iso, zoom, fly handoff |
| **FlyController** | `FlyController.js` | Pointer look + WASD |
| **InspectRaycaster** | `InspectRaycaster.js` | First classified hit |
| **SpecialBlockOverlay** | `SpecialBlockOverlay.js` | Sign text + lectern pages |

Supporting modules (functions, not classes): `isoCamera.js` (true-iso math), `orbitBootstrap.js`, `layerVisibility.js`, `occupancySkip.js` (hide unit cubes buried in opaque neighbors), `previewSpace.js` (structure ↔ Three.js).

## Occupancy

`filterBuriedUnitCubes` drops instances whose six neighbors are opaque `"block"` family cubes. Used for the **full** preview only; layer isolation uses the unculled list. Returns a **dense** array (empty palettes are `[]`).
