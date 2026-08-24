# HoloPrint (heritage pack generator)

Isolated from **Bedrock ASI**, the `.mcstructure` inspector.

| Path | Role |
|------|------|
| `HoloPrint.js` | `makePack` hologram resource-pack compiler |
| `holoprintPack.html` / `holoprintPack.js` | Pack UI |
| `packTemplate/` | In-game hologram RP template |
| `MaterialList.js`, `EntityManager.js`, `SpawnAnimationMaker.js`, `StructureDiagramMaker.js`, `SupabaseLogger.js` | Pack-only helpers |

Shared geo used by **both** ASI preview and this pack path stays in `src/` (`BlockGeoMaker`, `TextureAtlas`, `PolyMeshMaker`, `ResourcePackStack`, …). Inspector JSDoc types live in `src/types.js` (`AsiPreviewConfig`). Pack types live in `packTypes.js` (`HoloPrintConfig`). Pack-only UI lives here too (`components/`, `itemCriteria.js`, `entityScripts.molang.js`, `WebGL2QuadRenderer.js`). ASI preview still uses `src/components/LilGui.js`.

Do not import this folder from `src/app/`, `src/ui/`, or `src/viewer/`. Inspector `index.html` does not load supabase.

Serve: `http://localhost:5173/holoprint/holoprintPack.html` (old `/holoprintPack.html` redirects here).
