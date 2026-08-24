# Mitigation plan: nbtify / `.mcstructure` validation

| Field | Value |
|-------|--------|
| **ID** | `sec_nbt_plan` |
| **Date** | 2026-08-23 |
| **Status** | Plan — not implemented |
| **Findings** | [`sec_nbt_findings.md`](./sec_nbt_findings.md) |
| **Related** | [`NBT_VALIDATION.md`](./NBT_VALIDATION.md), [`AUTHORING_CORE.md`](./AUTHORING_CORE.md) PR 2 / K7 / R6 / R13 |

**Goal:** one codec chokepoint in front of nbtify. Never call option-less `NBT.read`. Never decompress `.mcstructure`. Never put a raw parse tree in inspect dumps, logs, or model context.

Keep **nbtify-readonly-typeless** for read and (later) **nbtify** for write. Do **not** adopt 2 MB library defaults (UI-max indices ≈ 8.4 MB).

This is a **security gate**, not a feature flag. Ship **default on**. Lands as the first slice of AUTHORING_CORE **PR 2** (`mcstructureCodec`), then deletes duplicate `NBT.read` sites.

---

## Strategy

```
bytes
  → P0 byte/magic/size gate          // no nbtify
  → NBT.read({ endian:"little", compression:null, bedrockLevel:false, strict:false })
  → P1 shape + quotas                // isNBTValidMcstructure + layers + walk limits
  → StructureDocument / typed fields only
       ├─ catalog / preview / editor
       └─ inspectExtract(whitelist, depth≤6)  → UI / future model context
```

`compression: null` is a valid nbtify option (`read.js` line 32). Pass it. Do not rely on omitted `compression`.

---

## Finding → fix

| ID | Fix | When |
|----|-----|------|
| F1 | External depth/node walk after parse; do not wait for nbtify | P1 |
| F2 | Pre-check: refuse declared array/list length if `length * elemSize > remaining` **or** `length > cellProduct` for index layers. After parse, quotas. Cannot patch nbtify without a fork — **minimize time in `#readIntArray`** by rejecting huge files first (P0) and adding a tiny **length peek** if we later fork | P0 + P1; optional P5 fork |
| F3 | **Delete** all `NBT.read(buf)` no-options fallbacks | P0 |
| F4 | Always pass `compression: null`, `bedrockLevel: false` | P0 |
| F5 | Catalog uses the **same** codec + `isNBTValidMcstructure` | P1 |
| F6 | Preview uses the same codec (not a weaker `format_version`/`structure`/`size` check) | P1 |
| F7 | Single `readMcstructure(buffer \| File)` used by parse/preview/hopper/materials/HoloPrint | P0–P1 |
| F8 | Reject file **> 64 MiB** before `read`; refuse open if `size` product **> 8,388,608** | P0 / P1 |
| F9 | Do not decompress; P0 magic reject `1F8B` / `0x78` | P0 |
| F10 | Unknown extension: sniff magic/keys; `DataVersion` → `JAVA_NBT_DETECTED`, do not `catalog.add` | P2 |
| F11 | Zip: max **10 000** entries, uncompressed **512 MiB**; per-entry `.mcstructure` still goes through P0 | P2 |
| F12 | Product write: `NBT.write(data, { endian: "little" })` only; comment the fixture | P3 |
| F13 | Inspect extract only after whitelist; ban `JSON.stringify(nbt)` of the root in app/ui | P1 / P4 |
| F14 | Keep `strict: false`; not a size gate | no change |

---

## P0 — Byte gate + stop autodetection (closes F3, F4, F8, F9)

**Files:** new `src/viewer/core/nbt/mcstructureCodec.js`; switch:

- `src/viewer/parseStructure.js`
- `src/viewer/structurePreview.js`
- `src/viewer/hopperStats.js`
- `src/viewer/materialList.js`
- `src/holoprint/HoloPrint.js` `readStructureNBT` (or leave HoloPrint on a thin import of the codec so pack HTML stays isolated)

**Behavior:**

1. Reject empty (keep current messages).
2. Reject `byteLength > 64 * 1024 * 1024` with `STRUCTURE_TOO_LARGE`.
3. Reject gzip (`view.getUint16(0, false) === 0x1F8B`) and zlib (`view.getUint8(0) === 0x78`) with `STRUCTURE_COMPRESSED` / `JAVA_NBT_DETECTED` if `DataVersion` is later confirmed.
4. Reject `bedrockLevel` shape: little-endian and `getUint32(4, true) === byteLength - 8` → `STRUCTURE_LEVEL_DAT`.
5. Call **only**:

```js
NBT.read(buffer, {
  endian: "little",
  compression: null,
  bedrockLevel: false,
  strict: false
})
```

6. **No** catch-all `NBT.read(buffer)`.

**Tests:** empty; 64 MiB+ synthetic; gzip magic; zlib `0x78`; option-less path **absent** from codec (grep CI).

**HoloPrint:** pack path must not regress valid samples. If isolating `src/holoprint/` forbids importing `viewer/core`, **duplicate the 15-line gate** there or extract `src/nbtGate.js` with no viewer deps.

---

## P1 — Shape whitelist + quotas (closes F1, F5, F6, F13-codec)

**Files:** same codec; extract `isNBTValidMcstructure` into `src/viewer/api/structure.js` (copy the predicate; **do not** import `HoloPrint.js` from viewer tests).

**After successful `read`:**

1. Predicate: `format_version == 1`, `size` and `structure_world_origin` `instanceof Int32Array` length 3, `"structure" in nbt`.
2. `block_indices`: exactly **two** Int32Array/list layers, **equal** length, length `=== size[0]*size[1]*size[2]`. Refuse if product **> 8,388,608**. Warn at Learn 64×257×64 and wiki 64×256×64 (no clamp).
3. Walk once (iterative, not recursive if possible):

| Quota | Hard fail |
|-------|-----------|
| Compound/list **depth** | **64** |
| **Nodes** (compound + list + array tags) | **2,000,000** |
| **Entities** | **50,000** (warn 10,000) |
| `block_position_data` keys | **> volume** |
| Total STRING bytes | **16 MiB** |

Abort walk → `STRUCTURE_NBT_REJECTED`. Do not `catalog.add`. Do not preview.

4. Return a **codec result** `{ nbt, diagnostics }` — consumers keep using `nbt` for now, but inspect must go through extract (P4). Document: **do not stringify `nbt`**.

**Tests:** goldens (hoppers, signs, rails) still parse; missing `format_version` rejected; one-layer `block_indices` rejected; product overflow rejected; depth>64 synthetic rejected.

**Catalog behavior change:** files that used to summarize without `format_version == 1` now **fail ingest**. Changelog it.

---

## P2 — Ingest / zip (closes F10, F11)

**Files:** `src/viewer/ingest.js`, `src/viewer/api/ingest.js`.

1. Unknown extension: **do not** default to mcstructure. Probe first 16 bytes:
   - gzip → Java/litematic path → `JAVA_NBT_DETECTED`, no IDB
   - uncompressed little NBT → P0+P1
   - zip magic `PK` → treat as zip
2. `.mcaddon`: unpack as zip (composite), then existing `.mcpack` / `.mcworld` extract, each structure through P0+P1.
3. Zip/`mcpack`/`mcworld`:
   - reject if entries **> 10 000**
   - reject if summed uncompressed **> 512 MiB** (use zip.js uncompressed sizes when present; otherwise running total while extracting)
   - skip non-`.mcstructure` members
4. Every extracted `File` still hits the codec (nested bombs).

**Tests:** renamed gzip `.nbt` does not `catalog.add`; tiny zip with 10k+ empty names rejects; `.mcpack` with one valid sample still ingests.

---

## P3 — Write path (closes F12, R6)

**Files:** codec `writeMcstructure`; `src/index.html` import map add `nbtify` (pipeline already externals import-map keys — **no second bundle**).

```js
NBT.write(root, { endian: "little", compression: null })
```

No gzip. Re-read with readonly + P1 predicate.

`scripts/fill-sign-test-text.mjs`: pass `endian: "little"`; comment that it is **not** the product spec until it imports the codec.

**Tests:** read sample → write → `isNBTValidMcstructure` → re-parse; `size` / `structure_world_origin` still `Int32Array`.

---

## P4 — Inspect / model-context extract (closes F13)

**Files:** `inspectStructure.js` (or `viewer/core/nbt/extractInspect.js`).

Allow walk **depth ≤ 6** only:

- `id` / `identifier`, `Pos` / xyz, `Rotation[2]`, `CustomName`
- `Items` / `Name` / `Count` / `Slot` / `Damage`
- chest `pairx` / `pairz` / `forceunpair`
- sign `FrontText` / `BackText` / `Text` / `Text1`–`4` / `SignTextColor` / `IgnoreLighting` / `IsWaxed`
- lectern `book` / `pages` / `title` / `author` / `hasBook` / `page`
- item frame `Item` / `ItemRotation` / `Facing`
- hopper `toggle_bit`; cart `Enabled`; `redstone_signal` 0–15; `composter_fill_level` 0–8

Preserve full `nbt` inside the Structure document for editor round-trip; **UI and any LLM** receive extract only.

Lint/grep: no `JSON.stringify(nbt)` / `JSON.stringify(data)` on codec roots in `src/app`, `src/ui`, `src/viewer` except tests.

---

## P5 — Optional nbtify fork (F2 residual)

P0 file-size cap bounds how large `length` can be for a **well-formed** remaining-bytes story, but a **4-byte length** of `0x7FFFFFFF` still hits `new Int32Array(n)` **before** `#allocate` on a small buffer.

If P0+P1 tests show tab OOM on a <64 MiB file with a huge INT_ARRAY length:

- Fork `nbtify-readonly-typeless` `#readIntArray` / `#readLongArray` / numeric list to `#allocate(length * bytesPerElem)` **before** `new TypedArray(length)`, and reject `length < 0`.
- Pin the fork; do not wait on upstream.

Do **not** block P0–P4 on this.

---

## Caps (authoritative)

| Cap | Action |
|-----|--------|
| `.mcstructure` bytes | Reject **> 64 MiB** |
| Gzip/zlib/`level.dat` prefix | Reject (no decompress) |
| Cell product | Warn at 64×257×64; **refuse open > 8,388,608** |
| Layer length ≠ product | Reject |
| NBT depth | Reject **> 64** |
| NBT nodes | Reject **> 2,000,000** |
| Entities | Warn 10k; reject **> 50,000** |
| STRING bytes total | Reject **> 16 MiB** |
| Zip entries / uncompressed | Reject **> 10,000** / **> 512 MiB** |
| LLM/debug dump (if added) | Separate **2–8 MiB extract** cap — not catalog |

---

## Rollout

1. Land P0+P1 together on `dev` (codec + all five read sites). Inspector must still open `tests/sampleStructures`.
2. P2 ingest in the same or next PR (Java refuse is K7; do not leave a window where fallback is gone but unknown `.nbt` still catalogs).
3. P3 when write ships (AUTHORING_CORE PR 2 remainder).
4. P4 with inspect if not already using a bounded index.
5. Screenshot/unit goldens; **no flag off** for the gate.

Rollback: revert the codec PR. Do not re-enable option-less `read`.

---

## Verification

| Check | Pass |
|-------|------|
| `rg "NBT\\.read\\(" src` | Only `mcstructureCodec.js` (plus holoprint if duplicated gate) |
| Every `NBT.read` | includes `compression: null` and `endian: "little"` |
| Sample structures | catalog + preview + hopper + materials |
| gzip fixture | no IDB row |
| 64 MiB+ empty-ish buffer | reject before parse |
| Layer length mismatch | reject |
| Zip bomb (entry count) | reject |
| `fill-sign` | little-endian write |

---

## Out of scope

- Replacing nbtify with prismarine-nbt / fastnbt
- Baking `.brarchive`
- Java structure import mapping (AUTHORING_CORE PR 20) — P2 only **refuses**
- Executing pack scripts (already forbidden)
- Measuring host `DecompressionStream` limits (we will not decompress)
