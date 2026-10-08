# Bedrock Layers — usage guide

How to run the app, use the catalog and 3D preview, iPad Safari / touch controls, and fix common problems.

For install, tests, and deploy details see [SETUP.md](./SETUP.md).

---

## What it is

Bedrock Layers is a **browser app** for Minecraft Bedrock **`.mcstructure`** files:

- Import structures (and extract them from worlds / packs / zips)
- Catalog with categories, search, and notes
- 3D preview (orbit, isometric, fly, layer slice)
- Inspect inventories, signs, lecterns, item frames
- Materials list

There is **no backend**. Files and metadata stay in this browser origin’s **IndexedDB**. Geometry is drawn with Bedrock Layers’ Three.js pipeline. Normal viewing does not generate a resource pack.

---

## Setup (once)

1. Install **Node.js 18+** (20 LTS recommended): https://nodejs.org/
2. Open a terminal in the repo root and install workspaces:

```bash
npm ci
```

If that fails (lockfile mismatch): `npm install`.

You need a **WebGL2** browser (Chrome, Edge, Firefox, Safari) and network for first-load CDN deps (esm.sh) and vanilla textures (jsDelivr / bedrock-samples).

---

## Start, stop, pause the web server

The app is static files. `npm run serve` starts a local HTTP server; it does **not** pause when you close the browser tab.

### Start (development)

Serves the `src/` tree:

```bash
npm run serve
```

Open **http://localhost:5173**

Leave that terminal open while you use the app.

### Start (production build)

```bash
npm run build
npm run serve:dist
```

Same URL, files from **`dist/`**.

### Stop

Focus the **terminal that is running serve**, then press **Ctrl+C** (Windows, macOS, Linux).

Closing the browser does **not** stop the server.

### Pause / resume

`npx serve` has **no pause command**.

- **Stop**, then **start** again (`npm run serve`).
- On **macOS / Linux bash/zsh** you can suspend with **Ctrl+Z** and resume with `fg` in the same shell.
- **Windows PowerShell** does not support that job control — use Ctrl+C, then start again.

### Port already in use

```bash
npx --yes serve src -p 5180
```

Then open **http://localhost:5180**. Only one process can bind a given port.

### PowerShell

```powershell
Set-Location path\to\Advanced-Structure-Inspector
npm.cmd run serve
```

Do not use `cd /d` (that is cmd.exe).

---

## First run

1. Start the server and open the URL above.
2. Wait until the header badge shows **Ready** (not Loading…).
3. Hover the **left** edge of the window for the **Structures** list (or pin it). On iPad, swipe **right** from the left of the 3D view ([Touch / iPad Safari](#touch--ipad-safari)).
4. **Import…** or drop files onto the page.
5. Click a structure. A centered **progress** card appears while the preview builds, then the 3D view.

---

## Import

**Import…** accepts multiple files. You can also drop them on the stage.

| Kind | What happens |
|------|----------------|
| `.mcstructure` | Added to the catalog |
| `.zip` / `.mcpack` / `.mcaddon` | `.mcstructure` files inside are extracted (addons may nest packs/worlds) |
| `.mcworld` / `.mctemplate` | Structure templates extracted from the world |

**Accepted structure format:** `format_version` 1 or 2. Version 1 has two block layers. Version 2 may leave out an empty waterlog layer. A newer version says the file was probably saved by a newer Minecraft and names the versions Bedrock Layers reads. A version 2 file with `compression` 1 stores the `structure` compound as a zlib byte array, and that payload is read up to 64 MiB. The zlib checksum must match. Bytes after the stream are rejected. There is no compression-ratio cap. If that array inflates and is not NBT, the file is rejected. **Rejected:** version 3 and above, Java Edition NBT / gzip / zlib wrappers / `.litematic` / `.schem`, empty files, any other `compression` value, files over **64 MiB**, NBT nested past 64 levels or past **2,000,000** nodes, invalid Bedrock NBT.

A name taken from a world or a template keeps Unicode letters and digits. Any other character in that name becomes `_`.

Imported files land in **Uncategorized** until you assign a category.

---

## Catalog (left dock)

Hover the left edge to open; **pin** (« / ») to keep it open. On iPad, swipe right from the left of the 3D view (see [Touch / iPad Safari](#touch--ipad-safari)).

- **Search** filters names.
- Tree: **Uncategorized** → **categories** → **entries** → structures.
- **Drag** a structure onto Uncategorized, a category, or an entry. Use the **mouse wheel** while dragging to scroll the list; the list also auto-scrolls near the top/bottom.
- Click a row to select and load the preview.
- Focus a row and press **Delete** or **Backspace** to remove that structure from the catalog (not from disk outside the browser).
- **Clear list** wipes **all** catalog data for this origin in IndexedDB. This cannot be undone in the app.

---

## Details (right dock)

Hover the right edge when a structure is selected; **pin** to keep it open. Click the 3D view (or outside the dock) to tuck it unless pinned. On iPad, swipe left from the right of the 3D view (see [Touch / iPad Safari](#touch--ipad-safari)).

**Above Information:**

- **Category** — Uncategorized or a named category (uses that category’s default/first entry; empty categories get a General entry).
- **Entry** — function group inside the category (disabled when Uncategorized).

**Information:** default camera for this structure, creator / credits / source link, feature chips, size/block/entity stats, hopper lock percent (Bedrock `toggle_bit` — locked when powered), notes.

**Materials:** block counts, stacks/shulkers, acquired checkboxes.

**Reload** rebuilds the preview. **Download** saves the stored `.mcstructure`. **Remove** deletes this catalog entry.

---

## Preview

While loading, a **centered card** shows status and a **progress bar**. It disappears when the canvas is ready. If some blocks are newer than the upgrade data, the status line says how many and keeps their saved states. Blocks with no shape are named in that same sentence.

- **Drag** on the canvas to orbit (not in Fly).
- **Compass** (bottom-left) shows facing.
- **Camera bar** — hover the **bottom** edge or press **C**. On iPad / touch, swipe up from the bottom of the 3D view (see [Touch / iPad Safari](#touch--ipad-safari)).

| Control | Meaning |
|---------|---------|
| Iso N | Cycle isometric 3/4 (orthographic, 45° around, 35.264° down). Parallel lines, equal scale. |
| N / S / E / W | Cardinal views (tilt slider in layer mode) |
| Top | Top-down |
| Layer | Frame the current Y slice |
| Free | No auto reframe (orbit still works; keeps current zoom / projection) |
| Fly | WASD move, Space up, Shift down, drag to look |

**Default camera** and **Zoom** on the details dock are used the next time this structure opens. 100% is the usual fit; higher is closer. Hover and scroll the mouse wheel to cycle the camera or nudge zoom.

The app parks up to **two** previous WebGL previews so reselecting is faster. Browsers limit WebGL contexts — close extra 3D tabs if preview fails.

Minecarts and cushions more than one block outside the structure box are not drawn. Inspect still lists every entity in the file.

Waterlogged stairs, slabs, and other partial blocks keep a steady texture. The water sits just inside the block instead of on the same faces. Open water that fills its own cell is unchanged.

Fence posts that touch another fence, a fence gate, or a full solid block inside the structure draw rails. A connection that the file already saved as on stays on, including a rail toward a block outside the structure. Glass, leaves, and empty neighbors stay unconnected. Glass panes are a thin center post, plus an arm toward another pane, iron bars, or a solid block, including glass. A saved pane connection stays on. Leaves, barriers, fences, and empty neighbors stay unconnected. Iron bars stay a full sheet. Doors use direction 0 east, 1 south, 2 west, 3 north. A hanging sign turns from one state: the ground yaw when it is attached, otherwise its facing. Floor coral fans are a low four-blade cross. Wall coral fans are two sheets that open away from the block they are attached to.

---

## Keyboard (preview)

Shortcuts apply when the preview is focused and you are **not** typing in a search/input field.

| Key | Action |
|-----|--------|
| **C** | Toggle camera bar |
| **1** | Cycle iso N → S → E → W |
| **2** | North |
| **3** | South |
| **4** | East |
| **5** | West |
| **6** | Top |
| **7** | Free |
| **8** | Fly |
| **↑** / **↓** | Layer up / down |
| **←** | Show all layers |
| **→** | Re-frame current camera (or N / iso if Free) |
| **Esc** | Close inspect panel; close camera bar |
| **Fly:** W A S D | Move |
| **Fly:** Space / Shift | Up / down |
| **Fly:** drag | Look |
| **Double-click** canvas | Inspect block or entity |
| **Long-press** canvas (touch) | Inspect block or entity |
| Catalog row: **Enter** / **Space** | Select |
| Catalog row: **Delete** / **Backspace** | Remove from catalog |

---

## Inspect

Double-click a block or entity on the canvas (on iPad Safari, **long-press**). A floating **Inspect** window opens (drag the title bar; double-click title to collapse).

Opens inventories / mockups for chests (including double chests), hoppers, droppers, barrels, shulkers, brewing stands, composters, crafters, lecterns, signs, item frames, minecarts with cargo, and similar block entities. Other hits show a name chip. Sign and book JSON nested past 100 levels is left blank. A flattened line stops at 8,192 characters.

**Esc** or **×** closes inspect. With **Fly** on, the window also closes once the camera is more than 8 blocks from that block. Opened from farther away, it stays until you fly another 8 blocks farther out.

---

## Touch / iPad Safari

**iPad Safari** is a supported client (tablets, WebGL2). Other WebGL2 browsers still work with a mouse and keyboard. There is no separate phone layout — the desktop chrome stays: **Structures** on the left, **Details** on the right, camera bar on the bottom.

Start swipes and pinches **on the 3D view**, not the iPad screen edge. Safari uses the left bezel for **Back** and the bottom home indicator for the Dock.

| Gesture | Action |
|---------|--------|
| Swipe **right** from the left of the view | Open **Structures** |
| Swipe **left** from the right of the view (or tap that edge) | Open **Details** (when a structure is selected) |
| Swipe **up** from the bottom of the view | Open the **camera bar** |
| Swipe the open panel away (left / right / down) | Close that panel |
| Tap the 3D view | Hide open panels (Structures, Details, camera bar, inspect) |
| One-finger drag (center of the view) | Orbit |
| Two-finger pinch / pan | Zoom / pan |
| Three-finger tap near the **top** of the view | Layer up (`↑`) |
| Three-finger tap near the **bottom** | Layer down (`↓`) |
| Three-finger tap in the **middle** | Default camera for this structure (usually iso) |
| Long-press a block or entity | Inspect (same as double-click on desktop) |

**Safari notes**

- **Pin** (« / ») still keeps a dock open when you tap the view.
- **Import…** uses the iPad file picker. Drag-and-drop from Files is a desktop gesture.
- Move a structure with the Details **Category** / **Entry** menus. Catalog drag-and-drop needs a mouse.
- **Fly** is look-drag only without a keyboard (WASD / Space / Shift).
- Open the app over **http(s)** (`npm run serve` or a static host). `file://` will not load modules.
- First load still needs network (esm.sh libraries, jsDelivr vanilla textures).

---

## Editor

Header **Viewer** / **Editor** switches modes.

In **Editor** you manage the taxonomy: categories, entries, features, and which catalog **database** is active. Drag categories to reorder. Select a node to edit it in the inspector. Uncategorized structures can be assigned to an entry there as well as by drag-drop in Viewer.

---

## Other chrome

| Control | What it does |
|---------|----------------|
| **Dark** / **Light** | Theme |
| **Credits** | Attribution and libraries |
| **Boot badge** | Loading… → Ready (or Error) |

---

## Data stored in the browser

| Store | Purpose |
|-------|---------|
| IndexedDB catalog | Structure files + metadata + categories |
| localStorage | Dock pins, theme, small prefs |
| Memory | Parked previews (max 2), icon URLs |

This is per **origin** (scheme + host + port). `localhost:5173` and `localhost:5180` are different catalogs.

---

## Common issues

**Port 5173 in use** — start on another port (see above) or stop the old serve (Ctrl+C).

**Blank page / failed modules** — serve `src/` or `dist/`, not the repo root. Do not open `index.html` as `file://`. Hard-refresh after pulls (`Ctrl+Shift+R`).

**Preview fails / WebGL** — enable hardware acceleration; close other WebGL tabs. iPad Safari needs iPadOS 15+ and an **http(s)** URL.

**iPad: swipe goes Back or shows the Dock** — start the swipe on the 3D canvas, not the screen edge or home indicator.

**iPad: docks stay closed** — they do not open on hover. Swipe from the view (or pin them). See [Touch / iPad Safari](#touch--ipad-safari).

**iPad: pinch zooms the page** — pinch on the 3D view, not the header or a dock.

**Icons missing** — needs jsDelivr / bedrock-samples. Hard-refresh after updates.

**First preview is slow** — Three.js and vanilla textures download once, then cache. A large structure prints `[bLayers]` phase seconds in the console (`bLayers` means `bedrockLayers`; phases are `parse`, `pack data`, `geometry`, `atlas`, `preview mesh`). `atlas images … load` is the texture fetch. Block meshes show before cushion and minecart attach finishes. See [apis/preview.md](./apis/preview.md#load-timings).

**Details dock stays open** — unpin it, then click the 3D view. Category dropdowns keep it open until you click outside.

**Preview failed: not a valid .mcstructure after reload** — the list survived in this browser, but the file bytes did not (common on **Safari / iPad** and GitHub Pages). **Import…** the `.mcstructure` again. New imports store a byte copy so reload keeps working.

**Java / gzip / schematic files rejected** — Bedrock Layers is Bedrock `.mcstructure` only.

**Zip / world too large** — import stops if an archive or world database expands past 64 MiB, a single entry is over 64 MiB, declared sizes exceed 1000:1, the zip lists more than 10,000 members, or more than 64 `.mcstructure` files are inside. Encrypted zip members are skipped.

**Too many files dropped** — only the first 32 files from one Import / drop are read.

**Duplicate structure** — the same file bytes (CRC-32) as something already in the catalog is skipped with a warning. Other files in that import still load.

**Clear list** — destroys the whole catalog for this origin.

**`npm test` noisy** — use `npm run test:viewer` for day-to-day Bedrock Layers tests.

---

## Optional: HoloPrint pack generator

When serving **`src/`**:

http://localhost:5173/pack/holoprintPack.html

`/holoprintPack.html` and `/holoprint/holoprintPack.html` redirect to that page. Default `npm run build` does **not** include the pack page in `dist/`. Use `npm run build:pack` when you want it.

---

## License

[CC BY-NC-SA 4.0](../LICENSE) — non-commercial; share adaptations under the same license; credit HoloPrint / SuperLlama88888 per [NOTICE.md](../NOTICE.md). Bedrock Layers is co-authored and co-developed by JaydeeWetwork and Grok Build (xAI).
