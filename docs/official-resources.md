# Official Mojang / Microsoft resources

What Bedrock Layers **fetches or follows** from Mojang and Microsoft, with links and the job each source does.

Vanilla look is **not** stored in this git repo. The browser loads a pinned [Mojang/bedrock-samples](https://github.com/Mojang/bedrock-samples) pack at runtime (jsDelivr). That pack is under the [Minecraft EULA](https://www.minecraft.net/en-us/eula) ([samples LICENSE.md](https://github.com/Mojang/bedrock-samples/blob/main/LICENSE.md)). Do not vendor the pack or Bedrock Dedicated Server into git.

Current render pin is `VANILLA_SAMPLES_TAG` in `src/data/packPins.js` (**v1.26.50.4**). That is the latest **stable** samples release: `version.json` on `Mojang/bedrock-samples` `main` lists `"latest": "1.26.50.4"` (15 Sep 2026), and the GitHub release is marked Latest. Newer tags such as `v1.26.60.29-preview` (2 Oct 2026) are pre-releases and are not the render pin. Fallbacks if a file is missing on the stable pin: **v1.26.40.26-preview**, **v1.26.40.05**.

CDN base (current pin):

`https://cdn.jsdelivr.net/gh/Mojang/bedrock-samples@v1.26.50.4/`

GitHub tree (same tag):

https://github.com/Mojang/bedrock-samples/tree/v1.26.50.4

jsDelivr is **not** a Microsoft product; it only mirrors the official GitHub repo so the browser can load files with CORS. It serves HTTP/2. Color downloads share one FIFO gate of 64 (`VANILLA_CDN_SLOTS` in `src/viewer/engine/fetchers.js`). A Cache Storage hit does not take a slot. There is no separate preview queue. `403`, `429`, and `5xx` retry the same URL. Only a `404` walks the fallback pins.

---

## Runtime: Mojang/bedrock-samples

| Path in samples | Link (current pin) | What it provides | Used for |
|-----------------|--------------------|------------------|----------|
| `resource_pack/blocks.json` | [blocks.json](https://github.com/Mojang/bedrock-samples/blob/v1.26.50.4/resource_pack/blocks.json) | Block id → texture / sound / carried texture keys | Atlas packing, item icons that are blocks |
| `resource_pack/textures/terrain_texture.json` | [terrain_texture.json](https://github.com/Mojang/bedrock-samples/blob/v1.26.50.4/resource_pack/textures/terrain_texture.json) | Short texture names → `textures/blocks/…` paths and variants | Block atlas |
| `resource_pack/textures/item_texture.json` | [item_texture.json](https://github.com/Mojang/bedrock-samples/blob/v1.26.50.4/resource_pack/textures/item_texture.json) | Item texture atlas names (apple, bucket variants, …) | Inventory / item-frame icons |
| `resource_pack/textures/flipbook_textures.json` | [flipbook_textures.json](https://github.com/Mojang/bedrock-samples/blob/v1.26.50.4/resource_pack/textures/flipbook_textures.json) | Animated block texture frames | Atlas (first frame) |
| `resource_pack/textures/texture_list.json` | [texture_list.json](https://github.com/Mojang/bedrock-samples/blob/v1.26.50.4/resource_pack/textures/texture_list.json) | Incomplete new-file list (often no extension) | **Not fetched.** Extension choice does not use it |
| TGA vs PNG tree | `src/data/vanillaTgaTextures.js` (color stems from the pin tree) | Color `.tga` files on the current pin. `*_mers` companion maps are omitted | Fetch **only** `.tga` or **only** `.png` — no 404 probe of the other. A 404 may try an older pin. A 403 stays on this pin and is retried |
| `resource_pack/textures/blocks/*` | [textures/blocks](https://github.com/Mojang/bedrock-samples/tree/v1.26.50.4/resource_pack/textures/blocks) | Block PNG/TGA | 3D preview atlas |
| `resource_pack/textures/entity/*` | [textures/entity](https://github.com/Mojang/bedrock-samples/tree/v1.26.50.4/resource_pack/textures/entity) | Entity PNG/TGA (minecarts, chests, cushions, item frames, …) | Carts, cushions, frames, chest entities |
| `resource_pack/models/entity/*.geo.json` | [models/entity](https://github.com/Mojang/bedrock-samples/tree/v1.26.50.4/resource_pack/models/entity) | Entity geometry (bones/cubes) | Minecart hulls and similar |
| `resource_pack/entity/*.entity.json` | [entity](https://github.com/Mojang/bedrock-samples/tree/v1.26.50.4/resource_pack/entity) | Client entity JSON (which geo/texture to use) | Same |
| `metadata/vanilladata_modules/mojang-blocks.json` | [mojang-blocks.json](https://github.com/Mojang/bedrock-samples/blob/v1.26.50.4/metadata/vanilladata_modules/mojang-blocks.json) | Official vanilla **block id** list | Shape-coverage test (`npm run test:shape-coverage`). A new id with no shape family fails. The preview still draws it as a unit cube |
| `metadata/vanilladata_modules/mojang-items.json` | [mojang-items.json](https://github.com/Mojang/bedrock-samples/blob/v1.26.50.4/metadata/vanilladata_modules/mojang-items.json) | Official **item id** list | Pack generator / item criteria (not required for inspect preview) |
| `behavior_pack/shapes/` | [shapes](https://github.com/Mojang/bedrock-samples/tree/v1.26.50.4/behavior_pack/shapes) | Voxel **culling** AABBs (`minecraft:unit_cube`, named shapes) | Documentation / research. **Not** used as 3D look. Preview cubes are Bedrock Layers `src/data/blockShapeGeos.json` |

Vanilla **block** visual models (stairs, slabs, doors, …) are **not** published as `.geo.json` in samples. Bedrock Layers authors those in-repo.

Code: `src/data/packPins.js`, `src/viewer/engine/fetchers.js`, `src/viewer/appearance/PackAssetStore.js`.

---

## Microsoft Learn (creator docs)

Fetched **by humans**, not by the web app. These describe formats Bedrock Layers implements. The `.mcstructure` contract Bedrock Layers reads and writes is [apis/structure.md](./apis/structure.md).

| Document | Link | What it provides | How Bedrock Layers uses it |
|----------|------|------------------|-----------------|
| Minecraft File Extensions | [learn.microsoft.com … minecraftfileextensions](https://learn.microsoft.com/en-us/minecraft/creator/documents/minecraftfileextensions?view=minecraft-bedrock-stable) | `.mcstructure`, `.mcworld`, `.mcpack`, `.mctemplate` are zip/NBT packages | Ingest kinds and zip unpack |
| Voxel Shapes | [learn.microsoft.com … voxelshapes](https://learn.microsoft.com/en-us/minecraft/creator/documents/voxelshapes?view=minecraft-bedrock-stable) | Collision/cull AABBs vs visual geometry | Why we do **not** treat `shapes/` as preview meshes |
| `minecraft:geometry` | [learn.microsoft.com … minecraftblock_geometry](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_geometry?view=minecraft-bedrock-stable) | Custom-block geo API; `full_block` / `cross` are hardcoded in the game | Entity `.geo.json` cube/pivot rules |
| Actor Storage | [learn.microsoft.com … actorstorage](https://learn.microsoft.com/en-us/minecraft/creator/documents/actorstorage?view=minecraft-bedrock-stable) | LevelDB actor keys | World (`.mcworld`) structure extract, not preview look |
| Pack Optimization (BDS) | [learn.microsoft.com … pack-optimization](https://learn.microsoft.com/en-us/minecraft/creator/documents/bedrockserver/pack-optimization?view=minecraft-bedrock-stable) | `__brarchive` baked packs | We do not write these; samples remain the look source |
| Minecraft EULA | [minecraft.net/eula](https://www.minecraft.net/en-us/eula) | License for samples and BDS | Runtime fetch only; no vendoring |

Creator docs hub: [Microsoft Learn — Minecraft creator](https://learn.microsoft.com/minecraft/creator). The pages are published from [MicrosoftDocs/minecraft-creator](https://github.com/MicrosoftDocs/minecraft-creator). That repo is not fetched at runtime.

---

## minecraft.net

| Resource | Link | What it provides | How Bedrock Layers uses it |
|----------|------|------------------|-----------------|
| Bedrock Dedicated Server | [Download Bedrock Dedicated Server](https://www.minecraft.net/en-us/download/server/bedrock) | Official BDS zip (EULA) | **Optional local** extract under `tests/bds/` (gitignored). **Not** fetched by the web app. No block `.geo.json`; `shapes.brarchive` is culling, not look. See [tests/bds/README.md](../tests/bds/README.md). |
| Minecraft EULA | [EULA](https://www.minecraft.net/en-us/eula) | Terms for samples + BDS | Same as above |

---

## Other Mojang

| Resource | Link | What it provides | How Bedrock Layers uses it |
|----------|------|------------------|-----------------|
| Mojang/leveldb | [github.com/Mojang/leveldb](https://github.com/Mojang/leveldb) | Official LevelDB C++ | Format reference. JS world extract uses a community reader of this format. |
| Mojang/minecraft-creator-tools | [github.com/Mojang/minecraft-creator-tools](https://github.com/Mojang/minecraft-creator-tools) | Official NBT/LevelDB TypeScript (`@minecraft/creator-tools`) | **Not wired.** The product parser is the vendored `nbtify-readonly-typeless` 1.1.2 build. Listed because it is the first-party alternative. |
| Mojang/bedrock-schemas | [github.com/Mojang/bedrock-schemas](https://github.com/Mojang/bedrock-schemas) | JSON Schema for pack files | Docs / validation research, not runtime preview |
| Mojang bug tracker | [bugs.mojang.com](https://bugs.mojang.com/) e.g. [MCPE-89064](https://bugs.mojang.com/browse/MCPE-89064), [MCPE-180783](https://bugs.mojang.com/browse/MCPE-180783), [MCPE-48224](https://bugs.mojang.com/browse/MCPE-48224) | Official bug reports | Comments in `blockShapeGeos.json` / `blockShapes.json` / `blockStateDefinitions.json` (texture/orientation quirks). Not fetched at runtime. |

---

## Microsoft sample repos

First-party Bedrock samples besides [Mojang/bedrock-samples](https://github.com/Mojang/bedrock-samples). Not fetched by the app. Listed because we may consult them for add-on and GameTest behavior.

| Resource | Link | What it provides | How Bedrock Layers uses it |
|----------|------|------------------|-----------------|
| Add-on samples | [microsoft/minecraft-samples](https://github.com/microsoft/minecraft-samples) | Custom behavior and resource pack samples | Reference only |
| Scripting samples | [microsoft/minecraft-scripting-samples](https://github.com/microsoft/minecraft-scripting-samples) | GameTest Framework JavaScript samples | Reference only |
| GameTest samples | [microsoft/minecraft-gametests](https://github.com/microsoft/minecraft-gametests) | Sample GameTests for Bedrock | Reference only |

---

## What is **not** Mojang/Microsoft

These are **community** projects. Bedrock Layers uses some of them for **old-file id upgrades**, not for vanilla look:

- [opencollab-incubator/BedrockBlockUpgradeSchema](https://github.com/opencollab-incubator/BedrockBlockUpgradeSchema) **5.3.0** (and [pmmp/BedrockBlockUpgradeSchema](https://github.com/pmmp/BedrockBlockUpgradeSchema)) — JSON tables so old palettes match current samples, through the 1.26.50 step. The 1.26.50 file is at the repo root.
- [opencollab-incubator/BedrockItemUpgradeSchema](https://github.com/opencollab-incubator/BedrockItemUpgradeSchema) **1.18.0** — item id/meta upgrades through 1.26.50
- [pmmp/BedrockData](https://github.com/pmmp/BedrockData) — extra BDS dumps (tags), not textures
- [Bedrock-OSS/bedrock-wiki](https://github.com/Bedrock-OSS/bedrock-wiki) — community add-on docs, tutorials, and how-tos, published at [wiki.bedrock.dev](https://wiki.bedrock.dev/). Not an official Mojang or Microsoft source, and not a data feed. Useful when the Learn pages do not cover a format detail.

How a structure **looks now** always comes from **bedrock-samples** + Bedrock Layers cube JSON. How an **old** `.mcstructure` id becomes a current id may use the upgrade schemas above.

Pins for those community schemas: `src/data/schemaPins.js` (`BLOCK_UPGRADE_*`, `ITEM_UPGRADE_*`), re-exported from `src/data/packPins.js`. The render tag stays in `packPins.js`.
