# Official Mojang / Microsoft resources

What Bedrock ASI **fetches or follows** from Mojang and Microsoft, with links and the job each source does.

Vanilla look is **not** stored in this git repo. The browser loads a pinned [Mojang/bedrock-samples](https://github.com/Mojang/bedrock-samples) pack at runtime (jsDelivr). That pack is under the [Minecraft EULA](https://www.minecraft.net/en-us/eula) ([samples LICENSE.md](https://github.com/Mojang/bedrock-samples/blob/main/LICENSE.md)). Do not vendor the pack or Bedrock Dedicated Server into git.

Current render pin is `VANILLA_SAMPLES_TAG` in `src/data/packPins.js` (**v1.26.50.4**). Fallbacks if a file is missing: **v1.26.40.26-preview**, **v1.26.40.05**.

CDN base (current pin):

`https://cdn.jsdelivr.net/gh/Mojang/bedrock-samples@v1.26.50.4/`

GitHub tree (same tag):

https://github.com/Mojang/bedrock-samples/tree/v1.26.50.4

jsDelivr is **not** a Microsoft product; it only mirrors the official GitHub repo so the browser can load files with CORS.

---

## Runtime: Mojang/bedrock-samples

| Path in samples | Link (current pin) | What it provides | Used for |
|-----------------|--------------------|------------------|----------|
| `resource_pack/blocks.json` | [blocks.json](https://github.com/Mojang/bedrock-samples/blob/v1.26.50.4/resource_pack/blocks.json) | Block id → texture / sound / carried texture keys | Atlas packing, item icons that are blocks |
| `resource_pack/textures/terrain_texture.json` | [terrain_texture.json](https://github.com/Mojang/bedrock-samples/blob/v1.26.50.4/resource_pack/textures/terrain_texture.json) | Short texture names → `textures/blocks/…` paths and variants | Block atlas |
| `resource_pack/textures/item_texture.json` | [item_texture.json](https://github.com/Mojang/bedrock-samples/blob/v1.26.50.4/resource_pack/textures/item_texture.json) | Item texture atlas names (apple, bucket variants, …) | Inventory / item-frame icons |
| `resource_pack/textures/flipbook_textures.json` | [flipbook_textures.json](https://github.com/Mojang/bedrock-samples/blob/v1.26.50.4/resource_pack/textures/flipbook_textures.json) | Animated block texture frames | Atlas (first frame) |
| `resource_pack/textures/texture_list.json` | [texture_list.json](https://github.com/Mojang/bedrock-samples/blob/v1.26.50.4/resource_pack/textures/texture_list.json) | Incomplete new-file list (often no extension) | Prewarm only; **not** used to pick PNG vs TGA |
| TGA vs PNG tree | `src/data/vanillaTgaTextures.js` (GitHub tree of the pin) | Every `textures/**/*.tga` on the current pin | Fetch **only** `.tga` or **only** `.png` — no 404 probe of the other |
| `resource_pack/textures/blocks/*` | [textures/blocks](https://github.com/Mojang/bedrock-samples/tree/v1.26.50.4/resource_pack/textures/blocks) | Block PNG/TGA | 3D preview atlas |
| `resource_pack/textures/entity/*` | [textures/entity](https://github.com/Mojang/bedrock-samples/tree/v1.26.50.4/resource_pack/textures/entity) | Entity PNG/TGA (minecarts, chests, item frames, …) | Carts, frames, chest entities |
| `resource_pack/models/entity/*.geo.json` | [models/entity](https://github.com/Mojang/bedrock-samples/tree/v1.26.50.4/resource_pack/models/entity) | Entity geometry (bones/cubes) | Minecart hulls and similar |
| `resource_pack/entity/*.entity.json` | [entity](https://github.com/Mojang/bedrock-samples/tree/v1.26.50.4/resource_pack/entity) | Client entity JSON (which geo/texture to use) | Same |
| `metadata/vanilladata_modules/mojang-blocks.json` | [mojang-blocks.json](https://github.com/Mojang/bedrock-samples/blob/v1.26.50.4/metadata/vanilladata_modules/mojang-blocks.json) | Official vanilla **block id** list | Shape-coverage test (`npm run test:shape-coverage`) |
| `metadata/vanilladata_modules/mojang-items.json` | [mojang-items.json](https://github.com/Mojang/bedrock-samples/blob/v1.26.50.4/metadata/vanilladata_modules/mojang-items.json) | Official **item id** list | Pack generator / item criteria (not required for inspect preview) |
| `behavior_pack/shapes/` | [shapes](https://github.com/Mojang/bedrock-samples/tree/v1.26.50.4/behavior_pack/shapes) | Voxel **culling** AABBs (`minecraft:unit_cube`, named shapes) | Documentation / research. **Not** used as 3D look. Preview cubes are ASI `src/data/blockShapeGeos.json` |

Vanilla **block** visual models (stairs, slabs, doors, …) are **not** published as `.geo.json` in samples. ASI authors those in-repo.

Code: `src/data/packPins.js`, `src/fetchers.js`, `src/viewer/appearance/PackAssetStore.js`.

---

## Microsoft Learn (creator docs)

Fetched **by humans**, not by the web app. These describe formats ASI implements.

| Document | Link | What it provides | How ASI uses it |
|----------|------|------------------|-----------------|
| Minecraft File Extensions | [learn.microsoft.com … minecraftfileextensions](https://learn.microsoft.com/en-us/minecraft/creator/documents/minecraftfileextensions?view=minecraft-bedrock-stable) | `.mcstructure`, `.mcworld`, `.mcpack`, `.mctemplate` are zip/NBT packages | Ingest kinds and zip unpack |
| Voxel Shapes | [learn.microsoft.com … voxelshapes](https://learn.microsoft.com/en-us/minecraft/creator/documents/voxelshapes?view=minecraft-bedrock-stable) | Collision/cull AABBs vs visual geometry | Why we do **not** treat `shapes/` as preview meshes |
| `minecraft:geometry` | [learn.microsoft.com … minecraftblock_geometry](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/blockreference/examples/blockcomponents/minecraftblock_geometry?view=minecraft-bedrock-stable) | Custom-block geo API; `full_block` / `cross` are hardcoded in the game | Entity `.geo.json` cube/pivot rules |
| Actor Storage | [learn.microsoft.com … actorstorage](https://learn.microsoft.com/en-us/minecraft/creator/documents/actorstorage?view=minecraft-bedrock-stable) | LevelDB actor keys | World (`.mcworld`) structure extract, not preview look |
| Pack Optimization (BDS) | [learn.microsoft.com … pack-optimization](https://learn.microsoft.com/en-us/minecraft/creator/documents/bedrockserver/pack-optimization?view=minecraft-bedrock-stable) | `__brarchive` baked packs | We do not write these; samples remain the look source |
| Minecraft EULA | [minecraft.net/eula](https://www.minecraft.net/en-us/eula) | License for samples and BDS | Runtime fetch only; no vendoring |

Creator docs hub: [Microsoft Learn — Minecraft creator](https://learn.microsoft.com/minecraft/creator).

---

## minecraft.net

| Resource | Link | What it provides | How ASI uses it |
|----------|------|------------------|-----------------|
| Bedrock Dedicated Server | [Download Bedrock Dedicated Server](https://www.minecraft.net/en-us/download/server/bedrock) | Official BDS zip (EULA) | **Optional local** extract under `tests/bds/` (gitignored). **Not** fetched by the web app. No block `.geo.json`; `shapes.brarchive` is culling, not look. See [tests/bds/README.md](../tests/bds/README.md). |
| Minecraft EULA | [EULA](https://www.minecraft.net/en-us/eula) | Terms for samples + BDS | Same as above |

---

## Other Mojang

| Resource | Link | What it provides | How ASI uses it |
|----------|------|------------------|-----------------|
| Mojang/leveldb | [github.com/Mojang/leveldb](https://github.com/Mojang/leveldb) | Official LevelDB C++ | Format reference. JS world extract uses a community reader of this format. |
| Mojang/minecraft-creator-tools | [github.com/Mojang/minecraft-creator-tools](https://github.com/Mojang/minecraft-creator-tools) | Official NBT/LevelDB TypeScript (`@minecraft/creator-tools`) | **Not wired** today (parser is nbtify). Listed because it is the first-party alternative. |
| Mojang/bedrock-schemas | [github.com/Mojang/bedrock-schemas](https://github.com/Mojang/bedrock-schemas) | JSON Schema for pack files | Docs / validation research, not runtime preview |
| Mojang bug tracker | [bugs.mojang.com](https://bugs.mojang.com/) e.g. [MCPE-89064](https://bugs.mojang.com/browse/MCPE-89064), [MCPE-180783](https://bugs.mojang.com/browse/MCPE-180783), [MCPE-48224](https://bugs.mojang.com/browse/MCPE-48224) | Official bug reports | Comments in `blockShapeGeos.json` / `blockShapes.json` / `blockStateDefinitions.json` (texture/orientation quirks). Not fetched at runtime. |

---

## What is **not** Mojang/Microsoft

These are **community** projects. ASI uses some of them for **old-file id upgrades**, not for vanilla look:

- [opencollab-incubator/BedrockBlockUpgradeSchema](https://github.com/opencollab-incubator/BedrockBlockUpgradeSchema) (and [pmmp/BedrockBlockUpgradeSchema](https://github.com/pmmp/BedrockBlockUpgradeSchema)) — JSON tables so old palettes match current samples
- [opencollab-incubator/BedrockItemUpgradeSchema](https://github.com/opencollab-incubator/BedrockItemUpgradeSchema) — item id/meta upgrades
- [pmmp/BedrockData](https://github.com/pmmp/BedrockData) — extra BDS dumps (tags), not textures
- [wiki.bedrock.dev](https://wiki.bedrock.dev/) — community docs; not a data feed

How a structure **looks now** always comes from **bedrock-samples** + ASI cube JSON. How an **old** `.mcstructure` id becomes a current id may use the upgrade schemas above.

Pins for those community schemas: `src/data/packPins.js` (`BLOCK_UPGRADE_*`, `ITEM_UPGRADE_*`).
