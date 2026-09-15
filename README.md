# Bedrock ASI

Web app for **Minecraft Bedrock** `.mcstructure` files: import, catalog, 3D preview, layer browse, inventory inspect, materials list, and notes — all in the browser.

No backend required. Catalog and files persist in this browser’s **IndexedDB**. Geometry uses a HoloPrint-derived pipeline (Three.js) without generating a resource pack for normal viewing. The optional HoloPrint pack generator is separate from the inspector.

This repository is a **fork / Adapted Material** of [HoloPrint](https://github.com/SuperLlama88888/holoprint) (CC BY-NC-SA 4.0). See [NOTICE.md](./NOTICE.md) and [FORK.md](./FORK.md).

> **License:** [CC BY-NC-SA 4.0](./LICENSE) — Attribution, **NonCommercial**, ShareAlike.

---

## Features

- Import `.mcstructure`, and structures from `.mcworld` / `.mctemplate` / `.mcpack` / `.zip`
- **Catalog** with categories, search, pins, creator/credits/source link
- **3D preview** — orbit, iso N/S/E/W, fly cam (WASD + Space/Shift), layer slice
- **Inspect** — double-click blocks/entities; chests, hoppers, shulkers, brewing, composters, minecarts
- **Item frames** — show filled item icons (including filled buckets)
- **Materials list** — counts, stacks/shulkers, acquired checkboxes
- **Notes** — per-structure details

---

## Usage

See **[docs/USAGE.md](./docs/USAGE.md)** for hotkeys, catalog, preview, inspect, and common issues.

Short path: **Import…** → pick a structure in the left list → preview builds → double-click to inspect. Data stays in this browser. **Clear list** wipes the catalog and stored files for this site.

Java Edition NBT, gzip `.mcstructure`, litematic, and schematic files are rejected.

---

## How to run

Requires **Node.js 18+** (20 LTS recommended) and a browser with **WebGL2**.

```bash
npm ci
npm run serve
```

Open **http://localhost:5173**. Stop the server with **Ctrl+C** in that terminal.

First load uses the network for libraries (esm.sh) and vanilla Bedrock textures (jsDelivr). Any static server pointed at `src/` also works.

Production:

```bash
npm run build
npm run serve:dist
```

Deploy the **`dist/`** folder to any static host.

Full install, tests, and troubleshooting: **[docs/SETUP.md](./docs/SETUP.md)**.

---

## Documentation

| Doc | Contents |
|-----|----------|
| **[docs/USAGE.md](./docs/USAGE.md)** | Using the app: catalog, preview, hotkeys, inspect |
| **[docs/SETUP.md](./docs/SETUP.md)** | Install, run, build, tests, common issues |
| **[docs/RELEASE.md](./docs/RELEASE.md)** | 0.1.0 release notes |
| **[NOTICE.md](./NOTICE.md)** | Attribution |

---

## Credit

- **HoloPrint** by [SuperLlama88888](https://github.com/SuperLlama88888) and [contributors](https://github.com/SuperLlama88888/holoprint/graphs/contributors)
- Upstream also credits Structura, NBTify, and others — see [NOTICE.md](./NOTICE.md)

## License

[CC BY-NC-SA 4.0](./LICENSE). NonCommercial use only. ShareAlike applies to adaptations.
