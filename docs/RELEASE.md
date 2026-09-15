# Bedrock ASI 0.1.0

First public snapshot of **Bedrock ASI**, a browser app for Minecraft Bedrock **`.mcstructure`** files.

Import structures, keep a local catalog, preview them in 3D, inspect inventories and signs, and track materials and notes — all in the browser, with no server of your own. Geometry uses a HoloPrint-derived Three.js pipeline. License: [CC BY-NC-SA 4.0](../LICENSE) (non-commercial).

Full how-to: [USAGE.md](./USAGE.md). Install and build: [SETUP.md](./SETUP.md).

---

## Summary

This is the first tagged-style release of the inspector as a product separate from the optional HoloPrint pack generator. You run it locally (`npm run serve` or a static `dist/` host). Catalog data stays in **IndexedDB** for that origin.

---

## Highlights

- **Import** `.mcstructure`, zip archives, `.mcpack` / `.mcaddon`, and structure templates from `.mcworld` / `.mctemplate`
- **Catalog** with categories and entries, search, drag-and-drop assignment, notes, and persistent storage
- **3D preview**: orbit, isometric and cardinal cameras, top-down, fly, Y-layer slicing, compass HUD, centered load status and progress bar
- **iPad Safari**: edge swipes open Structures / Details / the camera bar; two-finger pinch-zoom; long-press inspect; three-finger taps step Y layers (middle restores that structure’s default camera)
- **Inspect** (double-click, or long-press on touch): chests (including double chests), hoppers, droppers, minecart cargo, signs, lecterns, item frames, and similar block entities
- **Details dock**: category/entry, default camera, materials list, hopper summary
- **Editor**: taxonomy (categories, entries, features) and named catalog databases
- **Safety**: Bedrock NBT size/shape checks; Java Edition NBT / gzip / schematics refused; zip entry/size budgets
- **Docs**: usage, setup, credits dialog

---

## How to run

Requires **Node.js 18+** and a WebGL2 browser (Chrome, Edge, Firefox, Safari — including iPad).

```bash
npm ci
npm run serve
```

Open **http://localhost:5173**. Stop the server with **Ctrl+C** in that terminal.

Production: `npm run build` then `npm run serve:dist`.

---

## Known limits

- First load needs **network** (esm.sh for Three.js and related libs; jsDelivr for vanilla Bedrock textures)
- **iPad Safari** uses the desktop layout; there is no dedicated phone UI. Fly camera needs a keyboard to move (look-drag still works)
- Not a Windows installer — browser + local static server
- Optional HoloPrint **pack generator** is not in the default `dist/` build (`npm run build:pack` / `src/` pack page)
- **Clear list** wipes the whole catalog for this origin
- Non-commercial use only (ShareAlike)

---

## Attribution

Adapted from [HoloPrint](https://github.com/SuperLlama88888/holoprint) by SuperLlama88888 and contributors. See [NOTICE.md](../NOTICE.md) and in-app **Credits**.
