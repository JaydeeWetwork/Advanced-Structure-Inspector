# Official Mojang/Microsoft vs community (back-compat)

Status: **research**.  
Related: [renderer-engine.md](./renderer-engine.md), [pmmp-schema-vs-blockupdater.md](./pmmp-schema-vs-blockupdater.md), `src/fetchers.js`.

**Rule:** how it **looks now** comes from Mojang/Microsoft. How **old files** become current ids/states may use community projects generated from BDS. Libraries (Three.js, zip) are not game data.

---

## Official (current render)

| Need | Source | Notes |
|------|--------|--------|
| Textures, `blocks.json`, `terrain_texture.json`, `item_texture.json` | [Mojang/bedrock-samples](https://github.com/Mojang/bedrock-samples) | Prefer **stable** tag `full` zip (e.g. `v1.26.40.05`), not a random preview |
| Entity geo + PNG | same, `models/entity`, `entity/*.entity.json`, `textures/entity` | Minecart path already does this |
| Id lists | samples `metadata/vanilladata_modules/mojang-blocks.json` / `mojang-items.json` / `mojang-entities.json` | |
| Pack JSON shape | [Mojang/bedrock-schemas](https://github.com/Mojang/bedrock-schemas), [learn.microsoft.com/minecraft/creator](https://learn.microsoft.com/minecraft/creator) | Docs/schemas, not meshes |
| NBT **format** | Mojang (little-endian Bedrock) | Parser is separate |
| LevelDB **format** | [Mojang/leveldb](https://github.com/Mojang/leveldb) (C++), actor keys on Microsoft Learn | |
| NBT/LevelDB **code** (ideal later) | [Mojang/minecraft-creator-tools](https://github.com/Mojang/minecraft-creator-tools) `@minecraft/creator-tools` **MIT** `NbtBinary` + `LevelDb` | Fat npm; EULA on bundled `res/` vanilla; evaluate before swap |
| Voxel shapes in samples | custom-block **culling**, not vanilla stair/slab dumps | Do not expect official per-block meshes |

Microsoft: samples are a **reference pack**, not a full dump of vanilla voxel meshing.

`src/data/blockShapeGeos.json` stays **ASI-owned**.

---

## Community (back-compat — allowed)

Bedrock does not rewrite structure/chunk NBT until the chunk is loaded in-game. Inspectors must upgrade.

| Need | Lean on | Why |
|------|---------|-----|
| Block palette upgrade | **[pmmp/BedrockBlockUpgradeSchema](https://github.com/pmmp/BedrockBlockUpgradeSchema)** | JSON from feeding old palettes through **BDS**. Language-agnostic. |
| Item upgrade (chests, frames, cargo) | [pmmp/BedrockItemUpgradeSchema](https://github.com/pmmp/BedrockItemUpgradeSchema) | Same family; ASI does not implement yet |
| Extra dumps (item tags) | [pmmp/BedrockData](https://github.com/pmmp/BedrockData) | BDS dumps; pack/inspect tags — **not** textures |
| LevelDB JS today | `mcbe-leveldb-reader` | SuperLlama extract of **MCT** LevelDB |
| NBT read today | `nbtify-readonly-typeless` | Community parser, official format |
| Color-cube fallback example | [bedrock-dev/BedrockMap](https://github.com/bedrock-dev/BedrockMap) | **AGPL** — patterns only, see [renderer-engine.md](./renderer-engine.md) |
| Second upgrader to debug against | ViaBedrock `JsonBlockStateUpgradeSchema`, df-mc `worldupgrader` | Same pmmp JSON, other languages |

**Do not use as vanilla look:** Prismarine collision boxes, wiki as a data feed, `holoprint-repository-tracker`.

---

## Pins in the repo today

| Role | `fetchers.js` / code | Ideal |
|------|----------------------|--------|
| Render | `Mojang/bedrock-samples@v1.26.40.26-preview` | Latest **stable** `v1.x.y.z` **full** |
| Block BC | `SuperLlama88888/BedrockBlockUpgradeSchema@5.2.0+bedrock-1.21.110` | **pmmp** same tag (upstream, not HoloPrint fork) |
| Extra dumps | `pmmp/BedrockData@6.7.0+bedrock-1.26.30` | Pack/tags only |
| Cache delta | `holoprint-repository-tracker` | Drop; refetch or own hashes |
| `BlockUpdater.LATEST_VERSION` | `18168865` = 1.21.60.33 | Packed field ≠ game 1.26.40; 1.21.110 schemas can still output 1.21.60.33 (Mojang forgot to bump) |

One future `PACK_MANIFEST.json`: render tag + schema tag + packed output version. Do not derive packed version from samples marketing tag.

---

## Flow

```
old .mcstructure / chunk palette
        │  community: pmmp BlockUpdater
        ▼
current ids/states
        │  official: bedrock-samples + ASI cubes
        ▼
renderer engine
```

Never texture from PocketMine. Never skip upgrade if you want old files to match current samples.

HoloPrint export may keep BedrockData, item maps, Supabase — that path has to match **in-game** ids the same way.
