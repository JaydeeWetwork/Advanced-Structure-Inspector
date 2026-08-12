# Fork map — Advanced Structure Inspector

Web-based **Minecraft Bedrock structure inspector** that runs **locally** (static file server) or **on the web** (GitHub Pages / any static host).

Adapted from [HoloPrint](https://github.com/SuperLlama88888/holoprint) under CC BY-NC-SA 4.0. See [NOTICE.md](./NOTICE.md).

## Layout

| Path | Role |
|------|------|
| `src/index.html` + `src/index.js` | **Primary app** — catalog, docks, session |
| `src/viewer/` | Catalog, IndexedDB, inspect, icons, materials, preview glue |
| `src/viewer/systems/` | Layer / entity / camera / inspect / resource pool / session |
| `src/PreviewRenderer.js` | Single 3D preview (composes systems); HoloPrint + ASI |
| `src/HoloPrint.js` + related modules | Upstream core (NBT, pack, shared geometry helpers) |
| `src/holoprintPack.html` + `.js` | Original HoloPrint pack generator UI (kept) |
| `pipeline/` | esbuild / minify → `dist/` |
| `docs/SETUP.md` | Install & run guide |
| `NOTICE.md` / `LICENSE` | CC BY-NC-SA 4.0 attribution |

## Reused upstream capabilities

- Structure NBT parse / validation patterns
- Block geometry + texture atlas pipeline (`BlockGeoMaker`, `TextureAtlas`, `PolyMeshMaker`)
- Material list data tables / mappings
- Optional pack path via `holoprintPack.html`

## ASI-specific (this fork)

- Catalog + **IndexedDB** persistence (metadata + file blobs + categories)
- Lightweight **preview without pack zip** (`structurePreview.js` + unified `PreviewRenderer`)
- Layer mode, fly cam, inspect inventories, item frames, materials acquired flags
- Preview session park/restore LRU
- Extracted preview **systems** under `src/viewer/systems/`

## Run locally

Full steps: **[docs/SETUP.md](./docs/SETUP.md)**.

```bash
# Node 18+
npm ci
npm run serve          # http://localhost:5173  (src/)
# production:
npm run build && npm run serve:dist
```

## Upstream

- https://github.com/SuperLlama88888/holoprint  
- Live reference: https://holoprint-mc.github.io  
