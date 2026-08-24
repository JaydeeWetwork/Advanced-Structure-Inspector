# Appearance architecture — geometry, textures, icons, multi-version

Status: **design / future work** (not implemented as a full subsystem yet).  
Related: ASI preview (`PreviewRenderer`, `BlockGeoMaker`, `TextureAtlas`, `itemIconLoader`), HoloPrint heritage. Independent engine direction: [renderer-engine.md](./renderer-engine.md) (BedrockMap as a render-example, not a dependency).

This document captures the target design for making model/block/geometry and texture/icon systems more robust, API-rich, easy to adapt for new Minecraft Bedrock updates, and capable of supporting older structure formats.

---

## 1. Goals

1. **Version-aware by default** — every resolve takes a `BedrockVersionContext` (from structure NBT and/or user setting).
2. **Canonical intermediate model** — one internal representation; version adapters map into it.
3. **Data over code** — renames, variants, and shape rules as versioned datasets + patches, not scattered `if (name === …)`.
4. **Stable public API** — app/UI never touch pack paths or raw shape JSON.
5. **Observable** — resolve returns diagnostics (why this texture/shape; fallback chain).
6. **Backward + forward** — old structures upgrade *up* to a render baseline; new packs load with minimal code changes.

---

## 2. Current state (ASI today)

| Layer | What exists | Weakness |
|--------|-------------|----------|
| **Block ID → shape** | `data/blockShapes.json` (exact + regex) | One static map for “all versions” |
| **Shape → cubes** | `data/blockShapeGeos.json` | Huge hand-maintained file |
| **States → rotation/variant** | `data/blockStateDefinitions.json` | Incomplete for new states |
| **Texture resolve** | `blocks.json` + `terrain_texture.json` via CDN | Single pin in `fetchers.js` |
| **Icons** | `data/itemIcons.json` + heuristics in `itemIconLoader.js` | Breaks on renames (`written_book` → `book_written`) |
| **Legacy blocks** | `BlockUpdater.js` + SuperLlama schemas | Exists but not first-class in ASI preview path. Research: [pmmp schema vs BlockUpdater](./pmmp-schema-vs-blockupdater.md) |
| **Public API** | `viewer/api/*` | Icons/catalog/inventory only — no geometry/texture API |

### Pipeline (simplified)

```
NBT palette entry
  → (optional) BlockUpdater          // version bump
  → BlockGeoMaker                    // shape + cubes + UV refs
  → TextureAtlas                     // pack paths → atlas
  → LayerMeshSystem                  // InstancedMesh

Item id (inventory / frames)
  → itemIconLoader                   // map + pack paths → blob URL
```

“Support all versions” today mostly means: newest pack + hand aliases + upgrade schemas when wired.

---

## 3. Target architecture

### 3.1 Two registries + version bus

```
┌─────────────────────────────────────────────────────────────┐
│  BedrockVersionContext                                       │
│  - structureVersion (from NBT / BlockUpdater)               │
│  - packTag (samples / custom RP)                             │
│  - upgradeSchemas pin                                        │
└───────────────────────────┬─────────────────────────────────┘
                            │
        ┌───────────────────┴───────────────────┐
        ▼                                       ▼
┌───────────────────────┐             ┌───────────────────────┐
│  BlockAppearanceAPI   │             │  IconResolveAPI       │
│  resolveBlock(block)  │             │  resolveIcon(itemId)  │
│  → ShapeSpec + TexRef │             │  → url + provenance   │
└───────────┬───────────┘             └───────────┬───────────┘
            │                                     │
            ▼                                     ▼
┌───────────────────────┐             ┌───────────────────────┐
│  ShapeRegistry        │             │  TextureRegistry      │
│  + GeoCompiler        │             │  + PackAssetStore     │
└───────────────────────┘             └───────────────────────┘
```

### 3.2 `BedrockVersionContext`

```ts
type BedrockVersionContext = {
  /** Runtime block version after upgrade (or raw) */
  blockFormatVersion: number;
  /** User/display: "1.20.80" | "1.21.50" | "preview" */
  label: string;
  /** CDN / local RP tag for assets */
  resourcePackTag: string;
  /** Schema pack for BlockUpdater */
  upgradeSchemaTag: string;
  /** Prefer upgrade-to-latest vs render-as-historical */
  mode: "upgrade" | "historical";
};
```

| Mode | Behavior | Use case |
|------|----------|----------|
| **`upgrade`** (default) | Run `BlockUpdater` → latest known schema; fetch newest samples | Accurate modern look for old saves |
| **`historical`** | Skip upgrade; pin RP tag near structure age | “How it looked then” (phase 2) |

Start with **`upgrade` only**.

---

## 4. Geometry system

### 4.1 Split data into layers

```
data/appearance/geometry/
  shapes/              # logical shape ids (chest, slab, cross_texture)
  geos/                # cube templates per shape
  bindings/
    patterns.json      # regex → shape (shared)
    names/
      1.16.json
      1.20.json
      1.21.json
      latest.json
  states/
    rotations.json
    texture_variants.json
  patches/
    1.21.50-example.json   # additive deltas only
```

**Binding resolution order** (versioned):

1. Exact name in version binding  
2. Regex patterns (stable)  
3. Family heuristics (`*_slab` → slab)  
4. Fallback `block` + diagnostic `shape:fallback`

### 4.2 Canonical `ShapeSpec`

```ts
type ShapeSpec = {
  shapeId: string;
  cubes: CubeTemplate[];
  rotationEuler?: [number, number, number];
  textureVariant?: number;
  specialTexturePath?: string;
  diagnostics: ResolveNote[];
};
```

`BlockGeoMaker` becomes a **compiler**: `ShapeSpec` → poly mesh faces (keep current cube math).

### 4.3 Pluggable shape sources

| Source | Priority | Role |
|--------|----------|------|
| Hand geos (today) | High | Best control for weird blocks |
| Family generators | Medium | Auto slab/stair/wall/fence |
| External data (Prismarine, wiki enums) | Low | Scaffold new shapes |

### 4.4 Proposed public API — `viewer/api/geometry.js`

```ts
resolveBlockShape(block, versionCtx): ShapeSpec
listKnownShapes(): string[]
compilePolyMesh(shapeSpec, textureAtlas): PolyMeshTemplate
diagnoseBlock(block, versionCtx): DiagnosticReport
```

---

## 5. Texture / icon system

### 5.1 One `TextureRegistry`, two consumers

Block atlas and item icons must share one resolve path (no divergent tags/heuristics).

```ts
TextureRegistry.resolve({
  kind: "terrain_key" | "item_texture_key" | "pack_path" | "item_id" | "block_name",
  id: string,
  variant?: number,
  face?: string,
  versionCtx
}): {
  packPath: string;
  extensions: ("png" | "tga")[];
  tags: string[];
  tint?: unknown;
  provenance: ResolveNote[];
}
```

### 5.2 Versioned rename tables

```
data/appearance/textures/
  renames/
    item_ids.json
    terrain_keys.json
    files.json
```

Generate diffs between pack tags with a script; curate failures only.

### 5.3 Pack asset store

```ts
PackAssetStore.fetchTexture(packPath, versionCtx):
  for tag in versionCtx.packTags:
    for ext in ["png", "tga"]:
      try fetch (Cache API)
      return ImageData
  return missingPlaceholder + diagnostic
```

Always try TGA after PNG (modern samples ship TGA-only for some blocks, e.g. cactus).

### 5.4 Icon API (extend `viewer/api/icons.js`)

```ts
resolveIcon(itemId, versionCtx?): Promise<IconResult>
resolveIconBatch(ids): Promise<Map<string, IconResult>>
prewarmIcons(ids): Promise<void>
getIconDiagnostics(itemId): ResolveNote[]
```

---

## 6. Multi-version strategy

### Structure load pipeline

```
1. Parse NBT → palette + format version
2. BlockUpdater.upgradeEach(block) → baseline
3. Appearance resolve against render pack tag
4. Mesh + atlas
```

| Concern | Mechanism |
|---------|-----------|
| Old block names / states | `BlockUpdater` + nbt_upgrade_schema (exists) |
| Renamed textures | Rename tables + multi-tag PackAssetStore |
| Old shapes | Versioned bindings or always upgrade geometry inputs |
| New blocks | Family generators + patch files + CI |
| Pin drift | Single `PACK_MANIFEST.json` |

### `PACK_MANIFEST.json` (single pin file)

```json
{
  "renderPack": {
    "repo": "Mojang/bedrock-samples",
    "tag": "v1.26.40.26-preview"
  },
  "upgradeSchemas": {
    "repo": "SuperLlama88888/BedrockBlockUpgradeSchema",
    "tag": "5.2.0+bedrock-1.21.110"
  },
  "dataRevision": 15,
  "fallbackPacks": ["v1.21.50.7"]
}
```

`fetchers.js`, icons, and recipes all read this file.

---

## 7. Diagnostics

```ts
type ResolveNote = {
  level: "info" | "warn" | "error";
  code:
    | "SHAPE_FALLBACK"
    | "TEXTURE_TGA"
    | "ICON_ALIAS"
    | "UPGRADED_BLOCK"
    | "VARIANT_DEFAULT";
  message: string;
  detail?: object;
};
```

Prefer one **summary line per structure load** instead of hundreds of 404s:

```
[sdb] appearance: 1712 blocks, 3 shape fallbacks, 12 textures via TGA, 0 missing critical
```

---

## 8. Suggested package layout

```
src/viewer/
  appearance/
    VersionContext.js
    BlockAppearance.js
    IconAppearance.js
    TextureRegistry.js
    PackAssetStore.js
    ShapeRegistry.js
    diagnose.js
  api/
    geometry.js
    icons.js          # thin wrapper
    version.js
data/
  appearance/         # versioned JSON
  PACK_MANIFEST.json
scripts/
  diff-pack-textures.mjs
  validate-appearance.mjs
  pin-pack.mjs
docs/
  APPEARANCE_ARCHITECTURE.md   # this file
  BRANCHING.md
```

Keep `BlockGeoMaker` / `TextureAtlas` as **engines**; move policy into `appearance/`.

---

## 9. Phased roadmap

| Phase | Deliverable | Value |
|-------|-------------|--------|
| **P0** | `PACK_MANIFEST` + unify pack tags | Stop tag drift |
| **P1** | `TextureRegistry` + shared resolve for icons + atlas | Fewer 404s |
| **P2** | `BlockUpdater` in ASI `buildPreviewAssets` | Real multi-version structures |
| **P3** | `BlockAppearance` API + load diagnostics | Debuggable |
| **P4** | Split bindings into version layers + patches | Easier MC updates |
| **P5** | Family generators (slab/stair/wall/fence/door) | Less hand JSON |
| **P6** | Optional historical mode | “All eras” fidelity |
| **P7** | CI against latest samples + sample structures | Catch breaks early |

---

## 10. What not to do

- Keep adding one-off aliases only inside `itemIconLoader` forever.
- Pin three different sample tags (icons vs atlas vs recipes).
- Rewrite `BlockGeoMaker` cube math before registries sit in front of it.
- Aim for perfect historical geometry on day one — **upgrade-to-render** covers most old worlds.

---

## 11. Implementation note (current ASI)

Partial work already exists outside this doc:

- Double-chest palette expansion (`viewer/doubleChest.js`)
- Sparse inspect index
- Icon known-path tables and TGA decode
- Systems extraction under `viewer/systems/`
- `viewer/api/*` façade

Appearance registry work should **absorb** icon known-paths and pack pins rather than invent a second system.
