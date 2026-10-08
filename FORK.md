# Fork map — Bedrock Layers

Web-based **Minecraft Bedrock structure inspector** that runs **locally** (static file server) or **on the web** (GitHub Pages / any static host).

Adapted from [HoloPrint](https://github.com/SuperLlama88888/holoprint) under CC BY-NC-SA 4.0. See [NOTICE.md](./NOTICE.md).

## This fork

- **Inspector** — import and catalog `.mcstructure` files, 3D preview, inspect inventories and signs, materials and notes
- **Pack generator** — optional hologram pack UI, kept separate from the inspector (`src/pack/`)

## Run locally

Full steps: **[docs/SETUP.md](./docs/SETUP.md)**.

```bash
# Node 22 or 24 LTS
npm ci
npm run serve          # http://localhost:5173
# production:
npm run build && npm run serve:dist
```

## Upstream

- https://github.com/SuperLlama88888/holoprint
- Live reference: https://holoprint-mc.github.io
