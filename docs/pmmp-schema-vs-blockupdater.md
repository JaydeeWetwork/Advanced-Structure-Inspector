# pmmp schema vs `BlockUpdater`

Status: **research notes** (not a change plan).  
Related: [`APPEARANCE_ARCHITECTURE.md`](./APPEARANCE_ARCHITECTURE.md), `src/BlockUpdater.js`, `src/viewer/palette.js`, `src/fetchers.js`.

Bedrock does **not** rewrite structure/chunk blockstate NBT until that chunk is loaded in-game. Any inspector that wants old `.mcstructure` files to match **current** `Mojang/bedrock-samples` textures and ids must upgrade palettes itself. Mojang does not publish those upgrade tables.

**Ideal path for ASI:** current look from official samples; **back-compat from community schemas generated off BDS**. This doc is the schema vs our upgrader gap.

---

## What the pmmp schema is

Repo: [pmmp/BedrockBlockUpgradeSchema](https://github.com/pmmp/BedrockBlockUpgradeSchema) (also under `opencollab-incubator`). Language-agnostic JSON. PocketMine generates it by feeding an old vanilla palette through **Bedrock Dedicated Server** and diffing states.

| Path in the repo | Role |
|------------------|------|
| `schema_list.json` | Ordered list of schema files + `maxVersionMajor/Minor/Patch/Revision` |
| `nbt_upgrade_schema/*.json` | One step: old blockstate NBT → next step |
| `id_meta_to_nbt/*.bin` | Pre-string-id (1.9 / 1.12 numeric id+meta) → NBT **without** upgrading. Translate only. |
| `nbt_upgrade_schema_schema.json` | JSON Schema for the JSON files |

Packed `version` on a palette entry is **not** the marketing game version. It is:

```
(major << 24) | (minor << 16) | (patch << 8) | revision
```

Example: `18168865` = `1.21.60.33`. Mojang sometimes **changes states without bumping this field** (1.18.x, 1.21.110). Then several JSON files share the same `maxVersion*`. The reference upgrader must apply **all** of those files, not “already at this number, stop.”

Sibling (items in chests / frames / carts, not blocks): [pmmp/BedrockItemUpgradeSchema](https://github.com/pmmp/BedrockItemUpgradeSchema). ASI does not implement that yet.

Reference implementations:

- PocketMine-MP `BlockStateUpgrader.php` (source of the JSON)
- ViaBedrock `JsonBlockStateUpgradeSchema.java` (second consumer; same data)
- df-mc `worldupgrader` (Go; same remote schemas)

Do **not** treat Prismarine collision boxes or the wiki as a second upgrade table.

---

## What `BlockUpdater` is

`src/BlockUpdater.js` is a JS port of the PocketMine / ViaBedrock apply loop. Comments in the file point at:

- https://github.com/pmmp/PocketMine-MP/blob/5.21.0/src/data/bedrock/block/upgrade/BlockStateUpgrader.php
- https://github.com/RaphiMC/ViaBedrock/blob/main/src/main/java/net/raphimc/viabedrock/api/chunk/blockstate/JsonBlockStateUpgradeSchema.java

It is **already on the ASI preview path**: `tweakBlockPalette` (`src/viewer/palette.js`) clones the palette, then `await blockUpdater.update(block)` when `block.version < LATEST_VERSION`. HoloPrint’s pack `tweakBlockPalette` does the same with its own copy of the loop.

After upgrade, ASI **strips `minecraft:` and deletes `version`**. Preview geo never sees the packed version again.

### Schema rules it applies (per JSON file)

Order in `#applyUpdateSchema`:

1. **`remappedStates`** — match `oldState` (or null = any), then `newName` **or** `newFlattenedName`, replace `newState`, optional `copiedState`. First match wins; rest of that schema is skipped.
2. **`addedProperties`**
3. **`removedProperties`**
4. **`remappedPropertyValues`** + **`remappedPropertyValuesIndex`**
5. **`renamedProperties`**
6. **`flattenedProperties`** — `prefix + embedValue + suffix`, delete the flattened state
7. **`renamedIds`**

Refuses flatten **and** rename on the same id in one schema (`console.error` and abort that file).

Flatten embed: `flattenedValueRemaps[value] ?? value`. Typedef already has `flattenedPropertyType` (`int` \| `string` \| `byte`); the apply function does **not** branch on it (JS just concatenates).

### How it picks which files to run

1. Load `schema_list.json` once, bucket filenames by packed `maxVersion*`.
2. For each bucket `version`:
   - skip if `block.version > version`
   - skip if **exactly one** schema in the bucket **and** `block.version == version`
   - otherwise include every filename in the bucket
3. Apply included files in object-entry order, then **force** `block.version = LATEST_VERSION`.

The “length == 1 && versions equal → skip” / “length > 1 && versions equal → apply” split is the PocketMine handling for **forgot-to-bump**: multiple JSON files share one packed output version.

---

## Pins today (drift)

| Pin | Where | Value |
|-----|--------|--------|
| Schema **repo** | `fetchers.js` `bedrockBlockUpgradeSchema` | **`SuperLlama88888/BedrockBlockUpgradeSchema`** |
| Schema **tag** | same | `5.2.0+bedrock-1.21.110` |
| `BlockUpdater.LATEST_VERSION` | `BlockUpdater.js` | `18168865` = **1.21.60.33** |
| Render pack | `fetchers.js` `vanillaData` | `Mojang/bedrock-samples@v1.26.40.26-preview` |

Ideal research target: pin **pmmp** (upstream BDS-generated JSON), not the HoloPrint author’s fork. The `5.2.0+bedrock-1.21.110` tag exists on pmmp as well.

`LATEST_VERSION` lagging the schema tag is expected until a dedicated bump: 1.21.110 schemas can still advertise packed output **1.21.60.33** because Mojang did not bump the field (pmmp issue #22). Do **not** set `LATEST_VERSION` from the samples marketing tag (`1.26.40`). Packed blockstate version ≠ game version.

---

## Feature gap

| Schema / PMMP behavior | `BlockUpdater` | Notes |
|------------------------|----------------|-------|
| `renamedIds`, add/remove/rename properties, remapped values | Yes | Core loop matches 5.21-era PHP |
| `remappedStates` + `newFlattenedName` | Yes | Flatten-inside-remap |
| Root `flattenedProperties` (schema 5.0, compact flattening) | Yes | Same helper as remap flatten |
| Several JSON files, same packed `maxVersion*` | Partially | Multi-file same version is applied; single-file equal version is skipped |
| `flattenedPropertyType` byte/int + `map_not_list` dummy | Typedef only | PHP needs the dummy because numeric object keys; JS may stringify `0` fine, but remaps that only list `map_not_list` would miss |
| Flatten when **several** old values map to one new id (`tallgrass`) | Likely ok if encoded as remaps | Confirm against 5.0 `tallgrass` schema if a sample fails |
| `id_meta_to_nbt` (1.9 / 1.12 numeric palette) | **No** | Pre-string-id structures would not upgrade |
| Item NBT (`BedrockItemUpgradeSchema`) | **No** | Chests / frames / cargo keep old item ids |
| `pmmp/BedrockData` `r16_to_current_item_map.json` | Pack path only | HoloPrint `HoloPrint.js`, not ASI inspect |
| Chunker-style `version` = **game** version (1.21.100 stored instead of 1.21.60.33) | **No** | Schemas whose packed max is *less* than that fake version are skipped — same footgun pmmp documents |
| Derive `LATEST_VERSION` from `schema_list.json` max | **No** | Hardcoded `18168865` |
| Fetch from **pmmp** upstream | **No** | SuperLlama fork |
| Diagnostics (which file, which rule, skipped) | `console.debug` / `error` | Not in inspect UI |
| `id_meta` binary maps | Unused | Not in `schema_list` fetch path |

### Selection-loop footguns to keep in mind

```js
if (block["version"] > +version || schemaSkeletons.length == 1 && block["version"] == +version) {
  return; // skip this bucket
}
```

- Object-key order of `#schemaIndex` is insertion order from `schema_list.json` — must stay file order, not numeric sort of packed ints.
- `+version` on a string key is fine for these packed ints.
- After all files, version is **always** set to `LATEST_VERSION`, even if no rule matched. Preview then deletes `version`. Failed/partial upgrades can still look like “current” to later code.

### Flatten helper vs 5.x JSON

`#applyFlattenedProperty` always does string concat. 5.x JSON may set `"flattenedPropertyType": "int"` and put `"map_not_list"` in `flattenedValueRemaps` as a PHP object-key workaround. If a real remap key is missing because the value is a number and the JSON keys are strings (or the dummy is the only entry), flatten silently uses the raw number / fails the `in states` check. Worth a fixture if we ever see `stonebrick` / numeric flatten bugs.

---

## How this sits in ASI vs HoloPrint

```
.mcstructure palette (maybe 1.16 ids)
        │
        ▼
BlockUpdater  ←  nbt_upgrade_schema JSON  (community, BDS-generated)
        │
        ▼
current block ids/states
        │
        ▼
official Mojang/bedrock-samples textures + ASI block cubes
```

- **ASI** should keep using this for preview (`tweakBlockPalette` clone only; never mutate catalog NBT).
- **HoloPrint export** can keep using the same `BlockUpdater` so hologram packs match in-game ids.
- Item-id back-compat is a **separate** schema family; do not overload `BlockUpdater` with it.

Official samples never replace this file. They are the **target** look after upgrade.

---

## Lean targets (research, not work queued)

1. Treat **pmmp/BedrockBlockUpgradeSchema** as the canonical JSON; SuperLlama fork is a pin convenience.
2. Keep `BlockUpdater` as the JS consumer; do not rewrite it onto viewer/api.
3. Next useful check (when implementing): fixture a 1.21.100-era palette that needs the 1.21.110 schema despite packed version **not** moving, and a flatten block (`concrete` / `stonebrick`).
4. `BedrockItemUpgradeSchema` for inspect inventories is the matching community lean for **items**, once block upgrade is trusted.
5. `id_meta_to_nbt` only if we ingest pre-1.13 structures (unlikely for `.mcstructure` from modern export).

No code changes attached to this note.
