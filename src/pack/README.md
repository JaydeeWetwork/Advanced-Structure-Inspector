# HoloPrint (heritage pack generator)

Isolated from **Bedrock Layers**, the `.mcstructure` inspector. Bedrock Layers, including this pack page, is co-authored and co-developed by JaydeeWetwork and Grok Build (xAI).

| Path | Role |
|------|------|
| `HoloPrint.js` | Re-exports `makePack`, `readStructureNBT`, and pack config. Also `extractStructureFilesFromPack` and `updatePack` |
| `makePackStages.js` | `makePack`: load inputs, build geometry, build hologram entities, describe the pack, zip it |
| `packLoad.js` | Template and data loaders. Template fetches use `/pack/packTemplate/...` |
| `packConfig.js` | Version, player controls, defaults, `readStructureNBT` |
| `packPages.js` | Info pages, langs, material-list UI |
| `packRetexture.js` | Control-item retexture and the pack icon |
| `hologramMotion.js` | Layer animations, validation particles, player-control render controllers. Particle effects use the same ids as `particleName.js` |
| `holoprintPack.html` / `holoprintPack.js` | Pack UI. Coordinate-lock labels are plain text |
| `structureCoordRow.js` | One coordinate-lock row, built as DOM nodes |
| `particleName.js` | Validation particle ids (`validate_` plus a safe block id) and a check that zip entry names stay inside the pack |
| `packTemplate/` | In-game hologram RP template |
| `MaterialList.js`, `EntityManager.js`, `SpawnAnimationMaker.js`, `StructureDiagramMaker.js` | Pack-only helpers |

This page imports shared modules from `src/viewer/engine/`: `BlockGeoMaker`, `TextureAtlas`, `EntityGeoMaker`, `PreviewRenderer`, `ResourcePackStack`, `LocalResourcePack`, and `fetchers`. `PolyMeshMaker.js` lives in this folder and is pack-only. Inspector JSDoc types live in `src/types.js` (`bedrockLayersPreviewConfig`). Pack types live in `packTypes.js` (`HoloPrintConfig`). Pack-only UI lives here too (`components/`, `itemCriteria.js`, `entityScripts.molang.js`, `WebGL2QuadRenderer.js`). Bedrock Layers preview still uses `src/components/LilGui.js`.

Do not import this folder from `src/app/`, `src/ui/`, or `src/viewer/`. Pack UI does not send telemetry.

Pack terms: [TERMS_OF_USE.md](./TERMS_OF_USE.md). Upstream Chinese README: [README.zh-CN.md](./README.zh-CN.md).

Serve: `http://localhost:5173/pack/holoprintPack.html` (`/holoprintPack.html` and `/holoprint/holoprintPack.html` redirect here).
