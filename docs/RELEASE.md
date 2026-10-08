# Bedrock Layers 0.1.157

Current version of **Bedrock Layers**, a browser app for Minecraft Bedrock **`.mcstructure`** files. The title and the npm package `bedrockLayers` use this number. There is no separate “build” label.

Import structures, keep a local catalog, preview them in 3D, inspect inventories and signs, and track materials and notes — all in the browser, with no server of your own. Geometry is Bedrock Layers’ Three.js pipeline. License: [CC BY-NC-SA 4.0](../LICENSE) (non-commercial).

Full how-to: [USAGE.md](./USAGE.md). Install and build: [SETUP.md](./SETUP.md).

---

## Summary

This is the first tagged-style release of the inspector as its own product. The optional pack generator is separate. You run it locally (`npm run serve` or a static `dist/` host). Catalog data stays in **IndexedDB** for that origin.

---

## Highlights

- **Import** `.mcstructure`, zip archives, `.mcpack` / `.mcaddon`, and structure templates from `.mcworld` / `.mctemplate`. A name taken from a world or a template keeps Unicode letters and digits
- **Catalog** with categories and entries, search, drag-and-drop assignment, notes, and persistent storage
- **3D preview**: orbit, isometric and cardinal cameras, top-down, fly, Y-layer slicing, compass HUD, centered load status and progress bar. Blocks newer than the upgrade data keep their saved states, and the status line says how many. Blocks with no shape are named in that same sentence
- **iPad Safari**: edge swipes open Structures / Details / the camera bar; two-finger pinch-zoom; long-press inspect; three-finger taps step Y layers (middle restores that structure’s default camera)
- **Inspect** (double-click, or long-press on touch): chests (including double chests), hoppers, droppers, minecart cargo, signs, lecterns, item frames, and similar block entities. With Fly on, the window closes once the camera is more than 8 blocks from that block
- **Coral fans** match the vanilla floor cross (four low blades) and the wall pair (two sheets hinged on the supporting face)
- **Glass panes** are a thin center post plus an arm toward another pane, iron bars, or a solid block, including glass. Iron bars stay a full sheet
- **Details dock**: category/entry, default camera, materials list, hopper summary
- **Editor**: taxonomy (categories, entries, features) and named catalog databases
- **Safety**: Bedrock NBT size/shape checks; `.mcstructure` format 1 and 2 (version 2 may omit an empty waterlog layer; `compression` 1 inflates the `structure` compound from zlib up to 64 MiB with a matching checksum and no ratio cap; a payload that inflates and is not NBT, or bytes after the zlib stream, is refused); Java Edition NBT, gzip, zlib wrappers, schematics, format version 3, and any other `compression` value refused; NBT nested past 64 levels or past 2,000,000 nodes refused before parse; zip imports and a world or template database stop at 10,000 members, 64 MiB extracted, or a 1000:1 expansion; sign and book JSON nested past 100 levels is not shown, and a flattened line stops at 8,192 characters
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
- The optional **pack generator** is not in the default `dist/` build (`npm run build:pack` / `src/pack/holoprintPack.html`)
- Waterlogged stairs and slabs draw their liquid just inside the block so the shared faces do not flicker. Open water is unchanged.
- **Clear list** wipes the whole catalog for this origin
- Non-commercial use only (ShareAlike)

---

## Attribution

Bedrock Layers is co-authored and co-developed by JaydeeWetwork and Grok Build (xAI). Adapted from [HoloPrint](https://github.com/SuperLlama88888/holoprint) by SuperLlama88888 and contributors. See [NOTICE.md](../NOTICE.md) and in-app **Credits**.
