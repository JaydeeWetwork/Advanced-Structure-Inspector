# Hard validation layer around nbtify

Canonical security write-up: **findings** [`sec_nbt_findings.md`](./sec_nbt_findings.md), **plan** [`sec_nbt_plan.md`](./sec_nbt_plan.md). This page keeps codec-level detail (whitelist fields, encoding notes).

| Field | Value |
|-------|--------|
| **Date** | 2026-08-23 |
| **Status** | Research notes — **not implemented in `src/`** |
| **Related** | [sec_nbt_findings.md](./sec_nbt_findings.md), [sec_nbt_plan.md](./sec_nbt_plan.md), [AUTHORING_CORE.md](./AUTHORING_CORE.md) (K6, K7, R6, Security caps, PR 2), [BEDROCK_ARCHIVES.md](./BEDROCK_ARCHIVES.md), [API.md](./API.md) |

**Rule:** never feed a raw nbtify parse tree into model context, inspect dumps, or LLM prompts. Parse behind a gate; extract a bounded whitelist; pass only that.

nbtify **cannot** be the gate. `nbtify` 2.2.0 and `nbtify-readonly-typeless` 1.1.2 `read()` accept only `rootName`, `endian`, `compression`, `bedrockLevel`, `strict`. There are **no** max-depth, max-nodes, max-string, cycle, or timeout hooks. Limits, a second structural walk, and field extraction live **outside** the library.

Voxel source of truth is uncompressed little-endian `.mcstructure`, not Java gzip/big-endian `.nbt`.

Today `parseStructureFile` only rejects **empty** files. AUTHORING_CORE’s 64 MiB / 8× UI-max cell product caps are documentation only.

---

## 1. What nbtify actually does

Both readers recurse LIST and COMPOUND through `#readTag` with **no** depth or node counter. Pathological nesting would typically `RangeError` (call stack), not a library depth error.

| Tag | Length check |
|-----|----------------|
| BYTE_ARRAY, STRING | `#allocate(length)` against remaining input **before** copy/decode. Overrun: nbtify `Error('Ran out of bytes to read...')`; fork `UnexpectedBufferEndError`. Non-varint STRING length is **u16** (≤ 65,535 bytes). |
| INT_ARRAY, LONG_ARRAY | TypedArray constructed from the **untrusted signed length** *before* remaining-bytes check. **No** `#allocate(length * elementSize)`. Huge length → OOM / `RangeError` (not measured here). |
| Numeric LIST (fork: BYTE/SHORT/INT/LONG/FLOAT/DOUBLE) | Same TypedArray-before-bounds pattern. |
| Non-numeric LIST | Ordinary JS array grown one tag at a time up to declared length (or until buffer ends). |
| COMPOUND | Named tags until TAG.END; duplicate names overwrite. No max-nodes. Remaining-buffer checks only per primitive. |

`nbtify` 2.2.0 `write()` walks `Object.entries` / `for...of` and recurses `#writeTag` with **no visited-set**. Cycles on in-memory graphs can stack-overflow. The 1.1.2 fork has **no** write/stringify API.

Preferred app read: `{ endian: "little", strict: false }`. Catalog fallback is **`NBT.read(buffer)` with no options**, which brute-forces encodings.

### Fallback autodetection (do not use for `.mcstructure`)

Omitting options:

1. Compression: gzip if `getUint16(0) === 0x1F8B`, else zlib if first byte `0x78`, else uncompressed, then deflate-raw.
2. Endian: big, then little, then **little-varint** (network NBT).
3. `rootName` true then false.
4. Auto `bedrockLevel` if `getUint32(4, true) === byteLength - 8` (skips 8-byte `level.dat` prefix).

Decompression concatenates `DecompressionStream` chunks with **no** library max-output-size.

Even the preferred `{ endian: "little", strict: false }` path **still auto-decompresses** and may strip a matching 8-byte header.

---

## 2. Other libraries (do not swap in blindly)

| Library | Limit knobs | Fit for ASI |
|---------|-------------|-------------|
| **prismarine-nbt** | `ParseOptions.noArraySizeCheck` only. Disables ProtoDef `count > 0xffffff` (16,777,215). `parse()` does not pass options. | Not depth/nodes/timeout. |
| **saicone/nbt** | Default **2 MB** byte quota + **512** depth | 2 MB **below** UI-max index payload (~8.4 MB Int32 layers). |
| **go-mclib nbt** | Same 512 / 2 MB (`MaxBytes` 0 = unlimited) | Same. |
| **Querz/NBT** | `maxDepth` default 512 (Minecraft max); `MaxDepthReachedException` as cycle/DoS proxy | No max nodes / string / timeout. |
| **fastnbt** | `DeOpts.max_seq_len` default 100,000,000 on lists **and** Byte/Int/Long arrays | Sequence cap only. |

Minecraft-style limiters (NbtAccounter, BungeeCord NBTLimiter, saicone) use **byte quota + depth**, not a parse timeout. Serialized NBT is a tree; identity cycle detection is not a parse option.

**Keep nbtify.** Wrap it. Do not adopt a 2 MB library default.

---

## 3. Encoding gate — **before** `NBT.read`

Reject at the **byte** layer. Do not call nbtify until these pass.

1. **Empty** — already rejected (`size === 0` or `byteLength === 0`).
2. **File size** — reject `.mcstructure` **> 64 MiB** (AUTHORING_CORE Security). Start tighter (2–8 MiB) only for a debug/LLM extract path, **not** for catalog/preview: UI-max 64×257×64 = **1,052,672** cells × 2 `Int32` layers ≈ **8.4 MB of indices alone**, plus palette, BE, entities.
3. **Magic / encoding** — reject:
   - gzip (`0x1F8B`)
   - zlib (`0x78` first byte) and deflate-raw attempts
   - big-endian
   - little-varint / network NBT
   - `bedrockLevel` 8-byte prefix (`uint32` at offset 4 === `byteLength - 8`)
4. **No option-less fallback** on the product path. Java gzip `.nbt` is `JAVA_NBT_DETECTED` (K7), not a catalog row.
5. **Cell-product peek (optional pre-parse)** — if you parse `size` with a tiny header walk, refuse **open** when `x*y*z > 8,388,608` (8× UI-max). Warn at Learn UI max 64×257×64 and wiki 64×256×64. Never silent clamp.

Call only:

```js
NBT.read(buffer, { endian: "little", compression: "none", strict: false, bedrockLevel: false })
```

If the installed API cannot force `compression: "none"`, **pre-reject** gzip/zlib magics so autodetection cannot inflate. Confirm the exact option name against the pinned nbtify types in PR 2.

---

## 4. Structural whitelist — **after** parse, **before** any consumer

Use the **strict** predicate (`isNBTValidMcstructure`), not catalog lenience. Extract it into `viewer/api/structure.js` (do not import `HoloPrint.js` from viewer tests).

Required root (Bedrock Wiki + HoloPrint):

| Field | Type |
|-------|------|
| `format_version` | number `=== 1` |
| `size` | `Int32Array` length 3 |
| `structure_world_origin` | `Int32Array` length 3 (required on **write** / codec; catalog today allows missing origin) |
| `structure` | object |

Required `structure` (load-fail on disk if wrong):

- `block_indices`: **exactly two** lists/Int32Arrays, **equal length**, length `=== size[0]*size[1]*size[2]`. Values: palette index or **`-1`** (void).
- Index: `i = (x * sizeY + y) * sizeZ + z` (`src/utils/coordinates.js`). Layer 0 solid, layer 1 waterlog.
- `entities`: list of compounds (preserve; no entity studio).
- `palette.default` only: `block_palette` list of `{ name: string, states: compound, version: number }`; `block_position_data` compound keyed by **decimal string** of flat index.

Fork compact: TAG_List of TAG_Int → `Int32Array`; TAG_List of TAG_Float → `Float32Array` (`Pos` / `Rotation` tests). After the fork, NBT bytes surface as JS numbers.

Post-parse quotas (walk the tree **once**; abort if exceeded):

| Quota | Starting value | Why |
|-------|----------------|-----|
| Max compound/list **depth** | **64** (hard fail; Minecraft-style 512 is far above `.mcstructure` needs) | nbtify has none |
| Max **nodes** (compounds + lists + arrays counted) | **2,000,000** | Two index layers at UI-max are ~2e6 ints as two arrays (2 nodes), not 2e6 nodes; budget is for BE/entities |
| Max **entities** | **10,000** warn; **50,000** refuse | Open-ended world NBT |
| Max `block_position_data` keys | **volume** | One per cell is the theoretical max; refuse if keys ≫ volume |
| Max STRING | format u16; still count toward a **16 MiB** total string-bytes budget | Sign/book text |
| Engine cubes / compile | unchanged AUTHORING_CORE | Not NBT |

`tick_queue_data` and `UniqueID` may be present; **preserve on round-trip**, do not require for inspect. Do not write `sdb_*` or stripped namespaces (K23).

Failed whitelist → throw a typed error (`STRUCTURE_NBT_REJECTED`), do not catalog.add, do not preview, do not stringify the tree.

---

## 5. Downstream extract only (inspect / model context)

`inspectStructure.js` already uses a nested subset. **That subset** is what may leave the codec, under the quotas above — not SNBT of the whole file.

Allow (walk depth **≤ 6**):

- Block-entity / entity `id` or `identifier`
- World x/y/z or `Pos` (3 floats) minus origin; `Rotation[2]`; `CustomName`
- Inventory `Items` / `Name` / `Count` / `Slot` / `Damage`
- Chest `pairx` / `pairz` / `forceunpair`
- Sign `FrontText` / `BackText` / `Text` / `Text1`–`4` / `SignTextColor` / `IgnoreLighting` / `IsWaxed`
- Lectern `book` / `pages` / `title` / `author` / `hasBook` / `page`
- Item frame `Item` / `ItemRotation` / `Facing`
- Hopper `states.toggle_bit`; minecart `Enabled`
- `states.redstone_signal` 0–15; `composter_fill_level` 0–8

Everything else stays in the Structure document, not in inspect JSON or prompts.

---

## 6. Write side

Product `NBT.write` (PR 2): `endian: "little"`, **no gzip**, import map only. Re-read with `nbtify-readonly-typeless` and `isNBTValidMcstructure`.

Before write: same cell-product / layer-length checks; refuse serialize if layer length ≠ product. Do not walk cyclic editor graphs (document is a tree of typed arrays + plain objects; freeze that invariant).

`scripts/fill-sign-test-text.mjs` is **not** the write spec (omits endian).

---

## 7. Suggested codec pipeline

```
bytes
  → size / magic / prefix gate          // no nbtify
  → NBT.read({ endian:"little", compression:"none", bedrockLevel:false, strict:false })
  → isNBTValidMcstructure + layer length + quotas
  → StructureDocument (typed fields only)
       ├─ catalog / preview / editor
       └─ inspectExtract(whitelist, depth≤6)  → UI / model context
```

Own the wrapper: `src/viewer/core/nbt/mcstructureCodec.js` (AUTHORING_CORE PR 2). `parseStructureFile` and `readStructureNBT` both call it. **Delete** the no-options fallback on the product path.

Feature-flag: none. This is a security gate; ship default-on with the codec.

---

## 8. Tests (land with PR 2)

| Case | Expect |
|------|--------|
| Empty file | reject (existing) |
| File > 64 MiB | reject **before** `read` |
| gzip `0x1F8B` / first-byte `0x78` | `JAVA_NBT_DETECTED` or encoding reject; **no** IDB row |
| `DataVersion` after a gzip-capable **probe that does not adopt the tree** | refuse (K7) |
| `bedrockLevel`-shaped 8-byte prefix | reject |
| Golden samples (hoppers, signs, rails, …) | read → whitelist → write LE uncompressed → predicate + re-parse |
| Two layers, length ≠ `size` product | reject |
| `format_version !== 1` | reject on codec (catalog must not keep these) |
| Nested list/compound depth > 64 | reject (synthetic fixture) |
| INT_ARRAY with huge length in a small buffer | must not OOM the tab; reject via remaining-bytes or quota |

Do **not** use option-less `NBT.read` in tests except as a negative case that the codec forbids.

---

## 9. Honest gaps

- Nesting/cycle failure mode not runtime-tested (expected `RangeError`).
- Huge TypedArray length OOM vs `RangeError` not measured — gate length against remaining bytes **before** `new Int32Array(n)`.
- Negative BYTE_ARRAY/STRING length vs `#allocate` not runtime-tested.
- Host `DecompressionStream` max output unknown — do not decompress on the product path.
- `compression: "none"` option spelling must be checked against the pinned package.
- Catalog currently summarizes files that fail `format_version == 1` / Int32Array size; tightening that is an ingest behavior change (correct, but changelog it).

---

## References

- Installed: `node_modules/nbtify/dist/read.js`, `node_modules/nbtify-readonly-typeless/dist/read.js`
- Upstream: [Offroaders123/NBTify 2.2.0 read.ts](https://github.com/Offroaders123/NBTify/blob/2.2.0/src/read.ts), [write.ts](https://github.com/Offroaders123/NBTify/blob/2.2.0/src/write.ts)
- Fork: [SuperLlama88888/NBTify-readonly-typeless](https://github.com/SuperLlama88888/NBTify-readonly-typeless/blob/main/src/read.ts)
- In-repo: `src/viewer/parseStructure.js`, `src/holoprint/HoloPrint.js` `isNBTValidMcstructure` / `readStructureNBT`, `src/viewer/inspectStructure.js`, `src/utils/coordinates.js`
- [Bedrock Wiki .mcstructure](https://wiki.bedrock.dev/nbt/mcstructure), [NBT in depth](https://wiki.bedrock.dev/nbt/nbt-in-depth)
