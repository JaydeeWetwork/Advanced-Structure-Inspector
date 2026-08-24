# Bedrock ASI

Web app for **Minecraft Bedrock** `.mcstructure` files: import, catalog, 3D preview, layer browse, inventory inspect, materials list, and notes — all in the browser.

No backend required. Catalog and files persist in **IndexedDB**. Geometry uses a HoloPrint-derived pipeline (Three.js) without generating a resource pack for normal viewing. The HoloPrint pack generator is isolated under `src/holoprint/`.

This repository is a **fork / Adapted Material** of [HoloPrint](https://github.com/SuperLlama88888/holoprint) (CC BY-NC-SA 4.0). See [NOTICE.md](./NOTICE.md) and [FORK.md](./FORK.md).

> **License:** [CC BY-NC-SA 4.0](./LICENSE) — Attribution, **NonCommercial**, ShareAlike.

---

## Requirements

| Tool | Version |
|------|---------|
| [Node.js](https://nodejs.org/) | **18+** (20 LTS recommended) |
| npm | Comes with Node |
| Browser | Chromium, Firefox, or Safari with WebGL2 |

For **dev serve**, only a static file server is required. Network is used for:

- ES module deps via **esm.sh** (Three.js, nbtify, …) when serving `src/`
- Vanilla Bedrock textures from **jsDelivr / bedrock-samples** (item icons, terrain for previews)

---

## Development model

- **Local-first**: no GitHub remote required. Product APIs live under `src/viewer/api/` (not HoloPrint pack APIs).
- **Branches**: `dev` (active) → `staging` (your QA) → `main` (stable). See [docs/BRANCHING.md](./docs/BRANCHING.md) and [docs/WORKFLOW.md](./docs/WORKFLOW.md).
- **Appearance / multi-version design** (future): [docs/APPEARANCE_ARCHITECTURE.md](./docs/APPEARANCE_ARCHITECTURE.md).
- **Authoring core** (voxel editor + geo.json + public geometry API): [docs/AUTHORING_CORE.md](./docs/AUTHORING_CORE.md).
- **Bedrock dictionary / archive types** (TMC jargon, TBA farm catalog, ZIP `.mc*`, `.brarchive`): [docs/BEDROCK_ARCHIVES.md](./docs/BEDROCK_ARCHIVES.md).
- **NBT validation around nbtify** (size/encoding gates, whitelist, no raw trees in model context): [docs/NBT_VALIDATION.md](./docs/NBT_VALIDATION.md). Findings: [docs/sec_nbt_findings.md](./docs/sec_nbt_findings.md). Plan: [docs/sec_nbt_plan.md](./docs/sec_nbt_plan.md).
- **Backup without a remote**: `powershell -File scripts/backup-local.ps1`

## Quick start (development)

```bash
# 1. Enter the repo (already local)
cd structure-db-viewer
git checkout dev

# 2. Install workspaces (pipeline + tests)
npm ci

# 3. Serve the source app
npm run serve
```

Open **http://localhost:5173**

That serves the `src/` tree. The browser loads ES modules with the import map in `src/index.html`. Hard-refresh after module changes if `?v=` cache bust advanced.

### Alternative static servers

Any static server pointed at `src/` works:

```bash
npx --yes serve src -p 5173
# or: python -m http.server 5173 --directory src
```

---

## Production build

```bash
npm ci                 # if not already installed
npm run build          # pipeline → dist/
npm run serve:dist     # http://localhost:5173 from dist/
```

Deploy the **`dist/`** folder to any static host (GitHub Pages, Netlify, S3, nginx, …).

---

## npm scripts

| Script | What it does |
|--------|----------------|
| `npm run serve` | Dev server on `src/` port **5173** |
| `npm run serve:dist` | Serve production `dist/` on **5173** |
| `npm run build` | esbuild pipeline → `dist/` |
| `npm run test` | All workspace tests |
| `npm run test:viewer` | Viewer unit tests only (`tests/viewerUnit`) |
| `npm run lint` | Typecheck (`tsc`, filtered noise) |

---

## Features

- Import `.mcstructure`, and structures from `.mcworld` / `.mctemplate` / `.mcpack` / `.zip`
- **Catalog** with categories, search, pins, creator/credits/source link
- **3D preview** — orbit, iso N/S/E/W, fly cam (WASD + Space/Shift), layer slice
- **Inspect** — double-click blocks/entities; chests, hoppers, shulkers, brewing, composters, minecarts
- **Item frames** — show filled item icons (including filled buckets)
- **Materials list** — counts, stacks/shulkers, acquired checkboxes
- **Notes** — per-structure details (no timestamps in UI)
- **Parked previews** — LRU cache of last 2 WebGL sessions for fast reselect
- Original **HoloPrint pack generator** isolated at `src/holoprint/holoprintPack.html`

---

## Project layout

```
src/
  index.html / index.js     # Boot + wire only
  app/                      # state, session helpers, preview lifecycle, import
  ui/                       # catalog list, detail dock, camera/inspect chrome
  viewer/                   # IDB, inspect, icons, structurePreview, layerVisibility
    systems/                # Layer / entity / camera / inspect / pool / session
  PreviewRenderer.js        # Single 3D preview (composes systems)
  types.js                  # Shared JSDoc types (not HoloPrint runtime)
  holoprint/                # Isolated HoloPrint pack generator (not the inspector)
  data/                     # Block shapes, item icon maps, …
pipeline/                   # Build → dist/
tests/viewerUnit/           # Fast unit tests
docs/SETUP.md               # Detailed setup
```

---

## Documentation

| Doc | Contents |
|-----|----------|
| **[docs/SETUP.md](./docs/SETUP.md)** | Prerequisites, install, dev/prod, tests, common issues |
| **[FORK.md](./FORK.md)** | Fork layout, upstream reuse, history |
| **[NOTICE.md](./NOTICE.md)** | Attribution |
| **[TERMS_OF_USE.md](./TERMS_OF_USE.md)** | Terms |

---

## Usage (in the app)

1. **Import** — drop or pick `.mcstructure` (or world/pack zip).
2. **Select** a structure in the left catalog (hover left edge if the dock is auto-hidden).
3. **Preview** builds automatically (or use **Preview** to force rebuild).
4. **Layers** — use the layer controls / keyboard shortcuts when available.
5. **Inspect** — double-click a block or minecart for inventory UI.
6. **Materials / notes** — right dock; pin panels if you want them to stay open.

Data stays in the browser (**IndexedDB**). **Clear list** wipes catalog + stored files.

---

## Tests

```bash
# Viewer unit tests (recommended during ASI work)
npm run test:viewer

# All workspaces (includes HoloPrint sample-structure suite; can be long)
npm test
```

---

## Credit

- **HoloPrint** by [SuperLlama88888](https://github.com/SuperLlama88888) and [contributors](https://github.com/SuperLlama88888/holoprint/graphs/contributors)
- Upstream also credits Structura, NBTify, and others — see [NOTICE.md](./NOTICE.md) and upstream README history

## License

[CC BY-NC-SA 4.0](./LICENSE). NonCommercial use only. ShareAlike applies to adaptations.
