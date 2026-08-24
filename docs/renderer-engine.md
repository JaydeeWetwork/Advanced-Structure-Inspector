# Independent structure renderer engine

Status: **research / product direction** (not an implementation plan).  
Related: [`APPEARANCE_ARCHITECTURE.md`](./APPEARANCE_ARCHITECTURE.md), [`pmmp-schema-vs-blockupdater.md`](./pmmp-schema-vs-blockupdater.md), [`BEDROCK_ARCHIVES.md`](./BEDROCK_ARCHIVES.md).

**Idea we are working toward:** Bedrock ASI’s **structure renderer** is its own engine — as independent as possible of the inspector shell and of HoloPrint pack export — and it should **robustly support all Minecraft Bedrock versions** and **draw anything the game can store**, not only blocks we have hand-authored cubes for.

HoloPrint stays an optional **gameplay pack export**. Official Mojang/Microsoft assets are the **current look**. Community schemas (pmmp) are **back-compat**. This note is the renderer pipeline and what [bedrock-dev/BedrockMap](https://github.com/bedrock-dev/BedrockMap) is useful for.

---

## Goal

```
anything Bedrock can put in a structure / chunk
        │
        ▼
  independent renderer engine
        │
        ├── viewer (cameras, layers)
        ├── inspector (click / NBT)
        └── export (HoloPrint hologram pack)   ← optional, not required to see
```

“Independent” means:

1. **No GUI import.** Engine does not import `src/app/` or `src/ui/`.
2. **No pack compile to preview.** Engine does not call `makePack`.
3. **Version in, meshes out.** Callers pass a structure document + version context; they get drawables + diagnostics.
4. **Never fail closed.** Unknown / unmapped / pre-flatten id still produces *something* (colored cube, missing-texture, diagnostic), not a hole or a crash.
5. **One pipeline** for `.mcstructure` now; same palettes/indices contract should later accept a chunk slice from LevelDB without rewriting the mesher.

“Render anything the game this” = every palette entry the client would place: air skipped, waterlogged layer, stairs/slabs/doors, entities, block entities as meshes or at least as occupied voxels.

---

## BedrockMap (reference, not a dependency)

Repo: https://github.com/bedrock-dev/BedrockMap  
Data lib: https://github.com/bedrock-dev/bedrock-level (submodule, **no Qt**)  
License: **AGPL-3.0** — learn patterns; **do not copy source** into this CC BY-NC-SA tree.

They are a **world map editor**, not a vanilla-faithful structure preview. Still the closest open Bedrock “open anything, draw something” example.

### Split we want to copy as an idea

| Layer | BedrockMap | ASI analogue |
|-------|------------|--------------|
| Data, no GUI | `bedrock-level/` — LevelDB, NBT, chunk, subchunk, palette, actor, `parse_mcstructure` | `viewer/parseStructure.js`, `palette.js`, future codec — must stay free of `app/` / HoloPrint |
| Load / cache | `AsyncLevelLoader`, region tasks, `QThreadPool` | `PreviewSessionManager`, abort, preview cache |
| 2D overview | `MapWidget` — top-down pixels | not a product goal (optional later) |
| 3D voxels | `VoxelWidget` — OpenGL unit cubes | `PreviewRenderer` + `LayerMeshSystem` |
| Inspect | `NbtWidget` on the same document | inspect panel / container UI |
| `.mcstructure` | `McstructurePageWidget` | primary ASI path |

`McstructurePageWidget::buildVoxelData` is the interesting example:

1. `bl::parse_mcstructure` → `size_*`, `palette[]`, `layers[0]` indices  
2. Skip `minecraft:air` and `minecraft:unknown`  
3. Color = `bl::get_block_by_name_tag(name)` — **name only, no states**  
4. Feed a Y×X×Z grid of `{color, transparent}` into the voxel mesher  

Chunk 3D path is the same cubes plus `blend_color_with_biome(name, color, biome)`.

### How they mesh (what to steal)

`VoxelWidget::buildVoxelVertices`:

- One **unit cube** per occupied cell  
- **Face cull** if neighbor is solid (opaque) or non-empty (transparent)  
- Split **opaque / transparent** passes, depth-mask off for glass/water  
- Vertex **colors**, not terrain textures  
- Layer range (`setLayer`) for Y slices  

That is a **fallback mesher**, not a replacement for `BlockGeoMaker`. Stairs become full blocks. Flattened ids they have not painted in `data/colors/` render wrong (their own TODO: “新版本扁平化方块渲染异常”).

### How they handle versions

- Chunk `Old` (1.12–1.17, Y 0–255) vs `New` (1.18+, Y −64–319)  
- Subchunk palette = NBT compounds (name + states) as stored on disk  
- AGENTS.md: test worlds **1.18+, 1.19+, 1.20+, 1.21+**  
- **No pmmp BlockUpdater.** Colors keyed by the **saved name**. Flattening breaks 2D/3D until the color table is updated.  
- Color tables live in `bedrock-level/data/colors/` (community, not Mojang)

### Useful vs not for ASI

**Take as ideas**

- Data library vs renderer vs app (they already did this split).  
- **Never-fail voxel:** name → color cube if geo/texture miss.  
- Face-culled unit cubes as LOD / unknown-block fallback.  
- Chunk version enum if/when `.mcworld` ingest grows.  
- Async region work; don’t block the UI thread on decode.  
- `parse_mcstructure` as a second implementation to compare index/palette layout against our parser.  
- Known-bug list as a test list (flattening, water, biome tint).

**Do not take**

- Color-only as the *primary* 3D look (ASI already has official textures + cube geo).  
- Their NBT/LevelDB C++ (AGPL; we have nbtify / MCT-lineage JS).  
- 2D biome/height map as the main product.  
- Copying `voxelwidget.cpp` or color JSON.

---

## Target pipeline (independent engine)

```
┌─ Ingest ──────────────────────────────────────────────────┐
│  .mcstructure  |  .mcworld LevelDB slice  |  in-memory doc │
│  version-aware codec (nbtify / MCT later)                  │
└───────────────────────────┬────────────────────────────────┘
                            ▼
┌─ Canonical document ──────────────────────────────────────┐
│  size, origin, palette[], indices[2], entities, BEs        │
│  no Three.js, no DOM, no HoloPrint                         │
└───────────────────────────┬────────────────────────────────┘
                            ▼
┌─ Version adapter ─────────────────────────────────────────┐
│  default: pmmp BlockUpdater → current ids  (community BC)  │
│  optional: historical (skip upgrade, pin old samples tag)  │
│  items later: BedrockItemUpgradeSchema                     │
└───────────────────────────┬────────────────────────────────┘
                            ▼
┌─ Appearance resolve ──────────────────────────────────────┐
│  id+states → shape cubes (ASI tables)                      │
│           → textures (Mojang/bedrock-samples)              │
│           → entity geo (official .geo.json)                │
│  miss → color-cube fallback + diagnostic                   │
└───────────────────────────┬────────────────────────────────┘
                            ▼
┌─ Mesher ──────────────────────────────────────────────────┐
│  InstancedMesh / entity Object3D / pick volumes            │
│  optional LOD: BedrockMap-style unit cubes                 │
└───────────────────────────┬────────────────────────────────┘
                            ▼
     PreviewRenderer    Inspect     Export hologram pack
```

HoloPrint **consumes** mesher/appearance outputs (or the same upgraded palette). It does not own vanilla assets.

### Robustness ladder (draw *something*)

| Priority | If this works | Else |
|----------|----------------|------|
| 1 | Official texture + ASI shape (stair, slab, door, …) | |
| 2 | Official texture + unit cube (unknown shape, known id) | |
| 3 | Average-color cube from samples PNG (no UV yet) | |
| 4 | BedrockMap-style name→RGBA table | |
| 5 | Magenta/debug cube + `UNMAPPED_BLOCK` diagnostic | never skip the cell unless air |

Air / `unknown` / ignored light blocks: skip. Waterlog layer: still a cell (translucent). Entities: official geo, else a named box.

That is how “render anything the game has” stays true while `blockShapeGeos.json` lags a new snapshot.

### Version policy (same as earlier research)

| Concern | Source |
|---------|--------|
| How it looks **now** | `Mojang/bedrock-samples` (stable tag) |
| Old **block** ids/states | pmmp `BedrockBlockUpgradeSchema` via `BlockUpdater` |
| Old **item** ids | pmmp `BedrockItemUpgradeSchema` (future) |
| Chunk Y range / subchunk format | BedrockMap/bedrock-level version enum (when worlds land) |
| Block **meshes** | ASI shape JSON — not samples, not BedrockMap colors |

Default mode is **upgrade then render current**. Historical “how it looked in 1.16” is phase 2 (`BedrockVersionContext.mode`).

---

## ASI today vs the engine

| Piece | Today | Engine target |
|-------|--------|----------------|
| Parse | `parseStructure.js` | keep; no HoloPrint |
| Upgrade | `tweakBlockPalette` → `BlockUpdater` | keep; pin **pmmp** JSON |
| Shape | one `blockShapeGeos.json` for “all versions” | keep as current-baseline; fallback cube on miss |
| Texture | samples via `ResourcePackStack` | keep; miss → color cube |
| Entities | official minecart geo | grow the same way |
| Fallback | checkerboard / missing | **explicit** color-cube + diagnostic |
| App | `structurePreview` imports renderer | renderer API: `buildPreviewAssets(document, versionCtx)` |
| Pack | isolated `src/holoprint/` | export-only |

Independence work is mostly **API seams and fallbacks**, not a new mesher from BedrockMap.

---

## Hard limits

1. **AGPL.** BedrockMap/bedrock-level are reference only.  
2. **No official vanilla block meshes.** Color cubes and ASI geos fill that hole.  
3. **“All versions”** for `.mcstructure` is palette upgrade + current pack, not a unique mesher per game version. Pre-string-id worlds need `id_meta_to_nbt` (rare for structure blocks).  
4. **“Anything the game has”** includes custom RP blocks: those need user packs on `ResourcePackStack`, then the same fallback if geo is missing.

---

## Lean order (research, not queued work)

1. Keep renderer free of `app/` / `holoprint/`.  
2. Never-fail appearance: unmapped id → cube + diagnostic (BedrockMap’s real lesson).  
3. Trust pmmp upgrade so flattened names hit current samples.  
4. Optional LOD path: face-culled unit cubes for huge structures (their `VoxelWidget` algorithm, reimplemented).  
5. World ingest later: LevelDB via MCT-lineage reader, same canonical document.

No code changes attached to this note.
