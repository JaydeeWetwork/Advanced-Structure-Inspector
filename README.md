# Structure DB Viewer

Web-based **Minecraft Bedrock structure database viewer** — browse, search, and preview `.mcstructure` files **locally** or from static web hosting.

This repository is a **fork / Adapted Material** of [HoloPrint](https://github.com/SuperLlama88888/holoprint) (CC BY-NC-SA 4.0). See [NOTICE.md](./NOTICE.md) and [FORK.md](./FORK.md).

> **License:** [CC BY-NC-SA 4.0](./LICENSE) — Attribution, **NonCommercial**, ShareAlike.

## Features (scaffold)

- Import `.mcstructure`, `.mcworld`, `.mctemplate`, `.mcpack`, `.zip`
- Catalog list with size, block count, palette, world origin
- Search by name / blocks / size
- Download individual structures
- Optional 3D preview (HoloPrint geometry + three.js pipeline)
- Original HoloPrint pack generator kept at `holoprintPack.html`

## Quick start

```bash
# Node 18+ recommended for builds
npm ci -w pipeline   # optional; only for production build

# Dev: serve source (browser loads ES modules + esm.sh import map)
npm run serve
# → http://localhost:5173
```

Production static build:

```bash
npm run build
npm run serve:dist
```

No backend is required for parse / catalog / preview. Network is used for esm.sh dependencies and vanilla resource data fetched by HoloPrint’s resource stack (same model as upstream).

## Project layout

```
src/
  index.html / index.js     # Structure DB Viewer (primary)
  viewer/                   # Catalog + ingest + styles
  holoprintPack.html / .js  # Upstream pack generator UI
  HoloPrint.js              # Core NBT / pack / preview
  …
pipeline/                   # Build → dist/
```

## Roadmap

See [FORK.md](./FORK.md). Next up: IndexedDB/OPFS persistence, lighter preview path, richer filters.

## Credit

- **HoloPrint** by [SuperLlama88888](https://github.com/SuperLlama88888) and [contributors](https://github.com/SuperLlama88888/holoprint/graphs/contributors)
- Upstream also credits Structura, NBTify, and many others — see historical credits in git history / upstream README

## License

[CC BY-NC-SA 4.0](./LICENSE). NonCommercial use only. ShareAlike applies to adaptations.
