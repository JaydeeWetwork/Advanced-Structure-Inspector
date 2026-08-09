# Fork map — Structure DB Viewer

Scaffold for a **web-based structure database viewer** that runs **locally** (static file server) or **on the web** (GitHub Pages / any static host).

## Layout

| Path | Role |
|------|------|
| `src/index.html` + `src/index.js` | **Primary app** — catalog UI |
| `src/viewer/` | Catalog store, ingest helpers, viewer CSS |
| `src/HoloPrint.js` + related modules | Upstream core (parse, extract, pack, preview) |
| `src/holoprintPack.html` + `src/holoprintPack.js` | Original HoloPrint pack generator UI (kept) |
| `pipeline/` | esbuild / minify static build → `dist/` |
| `NOTICE.md` / `LICENSE` | CC BY-NC-SA 4.0 attribution |

## Reused APIs

- `HoloPrint.readStructureNBT` — validate & parse `.mcstructure`
- `extractStructureFilesFromMcworld` (mcbe-leveldb-reader) — world / template / zip
- `HoloPrint.extractStructureFilesFromPack` — structures inside `.mcpack`
- `HoloPrint.makePack` + `PreviewRenderer` — optional 3D preview (via pack pipeline for now)
- `MaterialList` types / data tables — available for later materials views

## Not yet implemented (next milestones)

1. **Binary persistence** — IndexedDB / OPFS for structure files (metadata index only in `localStorage` today)
2. **Lightweight preview path** — geometry without full pack zip generation
3. **Hosted catalog** optional remote index (still NonCommercial)
4. **Entity browser** — `structure.entities` is not a first-class catalog surface yet
5. Strip or deeply hide pack generation if product stays viewer-only

## Run locally

```bash
# From repo root (Node 18+)
npm ci -w pipeline   # only needed for production build
npx serve src -p 5173
# open http://localhost:5173
```

Or any static server pointed at `src/` (import map loads deps from esm.sh).

Production build:

```bash
npm run build
npx serve dist -p 5173
```

## Upstream

- https://github.com/SuperLlama88888/holoprint  
- Live reference: https://holoprint-mc.github.io  
