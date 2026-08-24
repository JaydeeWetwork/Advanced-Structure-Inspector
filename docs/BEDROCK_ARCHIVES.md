# Bedrock technical dictionary and archive types

| Field | Value |
|-------|--------|
| **Date** | 2026-08-23 |
| **Status** | Research notes (verified against live pages) |
| **Product** | Advanced Structure Inspector (ASI / structure-db-viewer) |
| **Related** | [AUTHORING_CORE.md](./AUTHORING_CORE.md), [NBT_VALIDATION.md](./NBT_VALIDATION.md), [APPEARANCE_ARCHITECTURE.md](./APPEARANCE_ARCHITECTURE.md), [API.md](./API.md) |

Two different “dictionaries” and two different “archives” show up in Bedrock search results. Keep them separate.

1. **TMC dictionary** — player/tech jargon (BUD, gt, perimeter, …). Not a file codec.
2. **TBA Tech Archive** — community farm *catalog* taxonomy. Not a file format.
3. **ZIP `.mc*` packages** — official one-click import/share (`.mcpack`, `.mcworld`, …).
4. **`.brarchive`** — engine pack-bake under `__brarchive/`. Not an import type.

ASI’s structure document is none of those: uncompressed little-endian NBT `.mcstructure`.

---

## 1. Technical Minecraft dictionary (jargon)

There is **no Microsoft Learn glossary** of TMC terms. The Creator Style Guide covers product naming (“Minecraft: Bedrock Edition”) and capitalization, not farm slang.

### 1.1 Bedrock WIKI Tech Dictionary (WIP)

Source: [Tech Dictionary (content will be moved to individual pages)](https://bedrockwiki.com/books/tech-dictionary-wip/page/tech-dictionary-content-will-be-moved-to-individual-pages).

Billed as a single dictionary of technical Minecraft definitions and abbreviations. Many rows are **named with empty Description cells** (Binary, Box Comparer, Chest Hall, Decoder, Encoder, Latch, mspt, Redstone Tick, T-flipflop). Defined entries that ASI UI/docs may need:

| Term | Abbr | Tag | Definition (as on the wiki) |
|------|------|-----|-----------------------------|
| Technical Minecraft Community | TMC | Term | Players dedicated to technical gameplay |
| Gametick | gt | Game Mechanic | Code execution tick; **20 gt in 1 second** |
| Signal Strength | ss | Term | Redstone line strength **0–15** |
| Simulation Distance | sim distance | Game Mechanic | Chunks loaded around the player; also the sim a farm requires |
| Soft Inversion | si | Tech Mechanic | Redstone torch on a piston turns off when the piston is powered |
| Point of Interest | poi | Term | Blocks villagers claim: beds, bells, workstations |
| Hardcoded Spawning Area | hsa | Game Mechanic | Chunks given to a structure where certain mobs can spawn |
| Hardcoded Spawning Spot | hss | Game Mechanic | One spawn coordinate set per HSA |
| Gravity Block Conversion | gbc | Tech Mechanic | Gravity block → random item via end gateway (pre-1.16.100) |
| Gravity Block Duping | gbd | Tech Mechanic | Duplicate falling entity via unload / sim distance / gateways |
| Global Mob Cap | — | Game Mechanic | World-wide; wiki says **n=200**; when full, no mobs spawn |
| Local / density mob cap | — | Game Mechanic | Smaller per-player caps |
| Drops per Hour | dph | Descriptor | Farm item rate |
| Blocks per second | bps | Descriptor | Entity or machine speed |
| Hopper Speed | hs | Descriptor | Item transfer rate |
| Double Piston Extender | dpe | Contraption | Extends a block 2, then returns it |
| Block Update Detector | BUD | Contraption | (name only in table; format page exists under CIRCUITRY) |
| Comparator Update Detector | CUD | Contraption | — |
| Fully Hopper Locked | FHL | Descriptor | All hoppers locked when idle |
| General Mob Farm | gmf | Farm | Zombie, skeleton, spider, creeper, witch |
| Trident Killer | tk | Contraption | Piston-pushed trident kills mobs without player input |
| Flying Machine | — | Contraption | Piston + slime/honey mover |
| World Eater | — | Contraption | Flying machine dropping TNT on a planned destroy region |
| Quarry | — | Contraption | Flying machine shooting TNT and collecting items |
| Perimeter | — | Term | Large mined-out volume to cut lag and extra spawns |
| AB Tileable | AB | Descriptor | Alternating A/B slices |
| Area of Effect | aoe | Term | Function that affects an area; mostly villager tech |
| Aligner | — | Term | Sub-full collision box used to align items |
| Batcher | — | Contraption | Groups items periodically before releasing into a stream |
| Loader | — | Contraption | Loads a shulker and breaks it when full |
| Unstackable filter / sorter | — | Contraption | Split or sort non-stackables |
| Universal Tree Farm | UTF | Farm | Oak, spruce, birch, jungle, acacia, cherry |
| Survival / Creative Multiplayer | smp / CMP | Server | Survival tech worlds vs creative collab |
| World Download | wdl | Term | Exported world meant for others to download |
| Overworld Only | owo | Descriptor | Farm that only works in the Overworld |
| Village / merging / stacking / stretching | — | Mechanic | POI village data; merge on overlap; stack to prevent merge; stretch with edge POI |
| Mob Switch | — | Contraption | Fills Global Mob Cap to block spawning |
| Silent | — | Descriptor | Contraption makes no sound when used |
| Advanced Automation, TechRock, Stratos, Xploit | AA / TR / … | SMP | Named Bedrock tech servers |

Empty-description names still appear in TBA archive-format pages (latch, encoder, T-flipflop, …). Treat those as **labels**, not definitions, until a page fills them.

### 1.2 Other glossaries

| Source | Role | Bedrock-relevant entries | Caveat |
|--------|------|--------------------------|--------|
| [Tutorial:Glossary](https://minecraft.wiki/w/Tutorial:Glossary) (Minecraft Wiki) | Community slang, not official | **add-on**, **Bugrock**, **Lagva**, **perimeter**, **slimestone**, **TPS** (default 20), steak = Cooked Beef in Bedrock | Edition-agnostic; update suppression, E-ray/F3 are Java-oriented |
| [Storage Tech Dictionary](https://storagetechdictionary.github.io/) | Storage-tech terms | Filters, loaders, silos | Cross-edition |
| In-game Encyclopedia | Bedrock/Education *How to Play* | Structure Block modes Save / Load / Corner / 3D export; Jigsaw fields | Player guide, not TMC jargon |
| [Molang Query Functions](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/molangreference/examples/molangconcepts/queryfunctions?view=minecraft-bedrock-stable) | Official creator API | `query.health`, `query.time_of_day`, `query.is_sneaking`, … | Not farm slang |
| [wiki.bedrock.dev queries](https://wiki.bedrock.dev/documentation/queries) | Extra Molang argument tables | Armor slot indices, `slot.weapon.mainhand`, … | Community supplement |
| Japanese Minecraft Wiki ゲームの用語 | Edition abbreviations | **BE** = Bedrock Edition, **JE**, **PE**, **LCE**, 統合版 | Not TMC |

TMC link index: [JoakimThorsen gist](https://gist.github.com/JoakimThorsen/e90bd7a588af25ae529530987d9acc8a) (TMC Discord, Tech MC Archive / TMA, Storage Tech, TMCC).

---

## 2. Technical Bedrock Archive (TBA) — farm catalog

This is a **community archive of builds**, not a binary type.

- Discord: [Technical Bedrock Archive](https://discord.com/servers/technical-bedrock-archive-715182000440475648) — created 2020-05-27. “Archive server for the best farms and creations for Minecraft Bedrock.” Designs are shared, then archived once finalized.
- Website mirror: [Bedrock WIKI — 5. Tech Archive](https://bedrockwiki.com/shelves/5-tech-archive) — “the website version of TBA.”

Submissions follow [Archive format](https://bedrockwiki.com/books/archive-format) (name, creator, version, rates, …). Standard Format says Discord files were also meant to land on the website because of Discord limits, and that the site archive “is currently under construction.” Several category *books* still have no chapters; the wiki documents **intended taxonomy** more than a complete public catalog. Discord channel contents were not inspectable without joining.

### Categories (shelf + format book)

| Category | Format pages include |
|----------|----------------------|
| **MOB FARMING** | Overworld/Nether/End environmental farms, dragon killers, trident killers (generic / mob-specific), wither rose / cage / killer |
| **VILLAGER FARMING** | Iron farm, raid farm, breeder, trading hall, villager crop, cat farm, baby/adult separator |
| **BLOCK/ITEM FARMING** | Tree, growth, block, froglight (non-spawner), wither-block, item farms |
| **STORAGE TECH** | Item filter/sorter, shulker loader/unloader, other shulker processing, storage hall, silo/bulk/hybrid, item caller, full storage, interfaces, tricks, crafting station, potion brewer, furnace array |
| **TRANSPORTATION** | Piston bolt systems and H/V/diagonal bolts, pearl cannon, pearl stasis, player transport, block/mob/item conveyors, auto dropper, minecart loader/unloader |
| **SLIMESTONE** | Tunnel bore, quarry, world eater, liquid creator/sweeper, sand filler, flyer variants (observerless, programmable, diagonal, 2/3/4-way, …), rail curver, platform pusher, wall/floor/bridge maker |
| **CIRCUITRY** | Binary/decimal/hex, display, RAM, logic gate, redcoder, latch, pulse (multiplier/limiter/extender/divider/generator/detector), flip-flop, adder, BUD, block swapper, clock, piston extender, piston door |
| **MISCELLANEOUS** | Minigame, randomizer, horse stats, chunk overload, player detector, hidden entrance, TNT cannon, lag/crash machines, bedrock-breaking, dupes, enchanting setup, unobtainable block/item/terrain/structure, RP/BP/addon, external program/website, game knowledge, world/template, decoration, world seed |

Do **not** map TBA categories onto `detectSourceKind`. They are farm tags, not file extensions.

---

## 3. Official ZIP `.mc*` packages (import/share)

Microsoft: [Minecraft File Extensions](https://learn.microsoft.com/en-us/minecraft/creator/documents/minecraftfileextensions?view=minecraft-bedrock-stable) (updated 2023-11-14).

Community taxonomy ([wiki.bedrock.dev File Types](https://wiki.bedrock.dev/documentation/file-types)): import packages are **renamed ZIP archives** in three sets. Microsoft itself calls `.mcaddon`, `.mcpack`, `.mctemplate`, and `.mcworld` zip/zipped. It does **not** call `.mcproject` a ZIP on that page.

On import, packages unpack into `com.mojang`. `mcproject` and `mceditoraddon` launch **Editor** mode; the rest launch normal play. Composite archives import **at most one** level (world or project), including across nested composites. Duplicate world imports create a duplicate save.

| Set | Extension | Official wording | ASI today (`src/viewer/ingest.js`) |
|-----|-----------|------------------|-------------------------------------|
| **Level** | `.mcworld` | Zip of everything needed to load a Bedrock/Education world (e.g. `.dat`, `.txt`) | `detectSourceKind` → extract `.mcstructure` via `mcbe-leveldb-reader` |
| **Level** | `.mcproject` | Bedrock Editor filetype; only opens in Editor; can contain Editor extensions. Import `.mcworld` → convert to `.mcproject`. Export as `.mcworld` **removes** extensions | **Not** detected. Editor-only |
| **Asset** | `.mcpack` | Zipped resource or behavior pack, typically to transfer resources | Zip scan for `*.mcstructure` |
| **Asset** | `.mctemplate` | Zip archive containing a world template | Same extract path as `.mcworld` |
| **Composite** | `.mcaddon` | Zip that contains `.mcpack` or `.mcworld` files; distribute add-ons | **Not** detected (`unknown` → tried as `.mcstructure`) |
| **Composite** | `.mceditoraddon` | Packaged Editor extension (RP+BP); double-click installs | **Not** on Microsoft File Extensions. Documented on [Mojang editor-extension-starter-kit](https://github.com/Mojang/minecraft-editor-extension-starter-kit) (`npm run make-addon`) |

World template construction (Microsoft *Create a World Template*): zip the **contents** of an exported world, rename to `.mctemplate`, add a world-template `manifest.json` and typically a `texts/` folder. The `.mcworld` itself is a renamed zip.

### Same Microsoft page, not ZIP distribution archives

| Extension | Official wording | ASI |
|-----------|------------------|-----|
| `.mcstructure` | Structure Block save (building or natural feature); shareable | Catalog document. Uncompressed LE NBT — see [AUTHORING_CORE.md](./AUTHORING_CORE.md) K6 |
| `.mcmeta` | Custom resource pack configuration file | Unused |

Minecraft Wiki also lists `.mcperf` and `.mcshortcut`. Those are absent from Microsoft’s File Extensions page and are not this ZIP import family.

Generic `.zip` is treated like `.mcworld` / `.mctemplate` in `expandSourceFile` (LevelDB structure extract).

---

## 4. `.brarchive` — pack bake, not an import type

`.brarchive` is **not** a `.mcpack` and **not** ZIP. It is an in-pack binary bundle so the client loads many small files faster.

### Official (loosely named)

| Source | What it actually says |
|--------|------------------------|
| [Bedrock 1.21.40 changelog](https://www.minecraft.net/en-us/article/minecraft-1-21-40-bedrock-changelog) | “Built-in packs now include **archive files** for improved load performance on some platforms.” Does **not** name `.brarchive`, `__brarchive/`, or a magic number |
| [1.26.40 creator notes](https://learn.microsoft.com/en-us/minecraft/creator/documents/update1.26.40?view=minecraft-bedrock-stable) | Pack files are **compressed and stored in archives**; duplicate raw files in `behavior_pack` / `resource_pack` were **removed** |
| [Pack Optimization (BDS)](https://learn.microsoft.com/en-us/minecraft/creator/documents/bedrockserver/pack-optimization?view=minecraft-bedrock-stable) | Minify JSON (strip whitespace) and package loose files. Output includes **`__brarchive/`**. Optimized packs need client **≥ 1.26.40**. CLI: `bedrock_server.exe PackOptimizerConfigPath=<config.json>` |

`manifest.json` `header.pack_optimization_version` exists in the wild but is **undocumented** in Microsoft’s pack-manifest reference.

Mojang has **not** published a public `.brarchive` specification. Layout below is community reverse-engineering.

### Community layout ([brarchive-rs FORMAT.md](https://raw.githubusercontent.com/bedrock-crustaceans/brarchive-rs/main/FORMAT.md))

Little-endian, format version **1**. No compression in the format itself; value is bundling many small files so an outer compressor works better.

```
Header (16 bytes)
  0   u64 LE  magic 0x267052A0B125277D   (on disk: 7D 27 25 B1 A0 52 70 26)
  8   u32 LE  entry_count
  12  u32 LE  version (must be 1)

Entry descriptor (256 bytes × entry_count)
  0    u8     name length (0–247)
  1    247    UTF-8 name, zero-padded
  248  u32 LE content_offset  (from start of content section)
  252  u32 LE content_len

Content section
  content_base = 16 + entry_count × 256
  payload      = bytes[content_base + offset .. + offset + len]
```

Observed usage (not official rules):

- Archives sit at pack-root **`__brarchive/`**, mirroring directories: `RP/entity/` → `RP/__brarchive/entity.brarchive`.
- `content_len = 0` entries are **name-only stubs** (category registry without payload).
- Identical `content_offset`/`content_len` is **dedup**.
- Newer vanilla archives can embed **binary MCB** blobs (magic `7F 4D 43 42` = `\x7FMCB`) for particles, cameras, trades, shapes. Do not assume UTF-8 JSON.
- Engine appears to **prefer the archive if present**, else loose files.
- Known Mojang tooling exclusions (community): `font`, `loot_tables`, `materials`, `scripts`, `sounds`, `subpacks`, `texts`, `textures`. 26.40 notes also say **vanilla textures** packed into brarchive on samples — treat exclusions as observed, not a frozen spec.

Creator packs are **not required** to ship `.brarchive` unless run through Pack Optimization (then min client 1.26.40).

---

## 5. World database vs structure NBT

| Layer | Format | Role |
|-------|--------|------|
| Import/share pack or world | ZIP renamed `.mcpack` / `.mcaddon` / `.mcworld` / `.mctemplate` / `.mcproject` / `.mceditoraddon` | One-click install; unpacked on import |
| Pack load optimization | Uncompressed `.brarchive` under `__brarchive/` | Faster load of many small pack files |
| World save | Mojang LevelDB fork in `db/` | Chunks, biomes, actors |
| Actors (1.18.30+) | LevelDB keys `actorprefix<ActorUniqueID>`, digest `digp<Chunk Key>` | [Actor Storage](https://learn.microsoft.com/en-us/minecraft/creator/documents/actorstorage?view=minecraft-bedrock-stable). Legacy per-chunk actor blobs before 1.18.30 |
| Structures | Uncompressed little-endian NBT `.mcstructure` | Structure Block / ASI source of truth |

`.brarchive` only bundles **named pack files**. It does not store chunks, entities, or structure NBT.

Chunk non-actor LevelDB tag IDs (from Actor Storage) include `BlockEntity`, `Entity` (legacy), `PendingTicks`, `HardcodedSpawners`, `ActorDigestVersion`, subchunk prefixes, etc. That is world `db/`, not overlay RP/BP.

---

## 6. Implications for ASI

Aligned with [AUTHORING_CORE.md](./AUTHORING_CORE.md):

| Kind | Treat as | v1 product call |
|------|----------|-----------------|
| `.mcstructure` | Canonical voxel document | Read/write (K6). Catalog ingest already independent of HoloPrint |
| `.mcworld` / `.mctemplate` / `.zip` | Level ZIP → extract structures | Already in `expandSourceFile` |
| `.mcpack` | Asset ZIP → extract `*.mcstructure` | Already in `expandSourceFile` |
| `.mcaddon` | Composite ZIP | Not ingested today; later: unpack nested `.mcpack`/`.mcworld` then reuse extract. Do not treat as NBT |
| `.mcproject` / `.mceditoraddon` | Editor-only | Non-goal unless Editor import is requested |
| Overlay RP/BP / project zip | ZIP of pack folders + `asi_project.json` | K18. Write pack manifests per K27. **Do not** emit `.brarchive` |
| `.brarchive` / `__brarchive/` | Bake artifact | **Do not bake in v1.** Optional later: *read* if a user drops an optimized vanilla pack (1.26.40+). Writing would impose min client 1.26.40 |
| TBA categories | Farm tags / search facets | Optional UI copy; not `sourceKind` |
| TMC dictionary | Labels, tooltips, notes | Optional; empty wiki cells stay undefined |
| Java `.nbt` | Import adapter | Refused at ingest until PR 20 (K7) |

Security caps in AUTHORING_CORE (zip entry count / uncompressed size) apply to every ZIP `.mc*` path, including a future `.mcaddon` unpack.

---

## 7. Honest gaps

- No official Mojang `.brarchive` spec; magic / layout / `__brarchive/` path are community.
- 1.21.40 changelog says only “archive files.”
- `pack_optimization_version` is undocumented.
- No official TMC glossary.
- TBA website catalog is incomplete; Discord library not verified here.
- `.mceditoraddon` is Mojang GitHub, not Learn File Extensions.
- `.mcproject` ZIP-ness is community wording, not Microsoft’s extensions page.
- Wiki HSA/HSS and global mob-cap **n=200** are community; confirm against current Bedrock sim-distance rules before encoding as game logic.
- `.mcperf` / `.mcshortcut` exist on Minecraft Wiki only.

---

## References

### Official

- [Minecraft File Extensions](https://learn.microsoft.com/en-us/minecraft/creator/documents/minecraftfileextensions?view=minecraft-bedrock-stable)
- [Create a World Template from an Exported World](https://learn.microsoft.com/en-us/minecraft/creator/documents/createaworldtemplate?view=minecraft-bedrock-stable)
- [Pack Optimization with Bedrock Dedicated Server](https://learn.microsoft.com/en-us/minecraft/creator/documents/bedrockserver/pack-optimization?view=minecraft-bedrock-stable)
- [Minecraft Bedrock 1.26.40 Update Notes for Creators](https://learn.microsoft.com/en-us/minecraft/creator/documents/update1.26.40?view=minecraft-bedrock-stable)
- [Actor Storage in Minecraft — Bedrock Edition](https://learn.microsoft.com/en-us/minecraft/creator/documents/actorstorage?view=minecraft-bedrock-stable)
- [Molang Query Functions](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/molangreference/examples/molangconcepts/queryfunctions?view=minecraft-bedrock-stable)
- [Bedrock 1.21.40 changelog](https://www.minecraft.net/en-us/article/minecraft-1-21-40-bedrock-changelog)
- [Mojang/minecraft-editor-extension-starter-kit](https://github.com/Mojang/minecraft-editor-extension-starter-kit)

### Community

- [Bedrock WIKI Tech Dictionary (WIP)](https://bedrockwiki.com/books/tech-dictionary-wip/page/tech-dictionary-content-will-be-moved-to-individual-pages)
- [Bedrock WIKI Tech Archive](https://bedrockwiki.com/shelves/5-tech-archive)
- [Bedrock WIKI Archive format](https://bedrockwiki.com/books/archive-format)
- [wiki.bedrock.dev File Types](https://wiki.bedrock.dev/documentation/file-types)
- [Tutorial:Glossary](https://minecraft.wiki/w/Tutorial:Glossary)
- [brarchive-rs FORMAT.md](https://raw.githubusercontent.com/bedrock-crustaceans/brarchive-rs/main/FORMAT.md)
- [TMC links gist](https://gist.github.com/JoakimThorsen/e90bd7a588af25ae529530987d9acc8a)

### In-repo

- `src/viewer/ingest.js` — `detectSourceKind` / `expandSourceFile`
- `src/viewer/parseStructure.js` — HoloPrint-free `.mcstructure` parse
- `docs/AUTHORING_CORE.md` — K6, K7, K18, K27
