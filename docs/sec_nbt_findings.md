# Security findings: nbtify and `.mcstructure` parse

| Field | Value |
|-------|--------|
| **ID** | `sec_nbt_findings` |
| **Date** | 2026-08-23 |
| **Status** | Findings (code + library as of this repo pin) |
| **Scope** | Local ASI viewer/catalog; nbtify 2.2.0; nbtify-readonly-typeless 1.1.2 |
| **Mitigation** | [`sec_nbt_plan.md`](./sec_nbt_plan.md) |
| **Related** | [`NBT_VALIDATION.md`](./NBT_VALIDATION.md), [`AUTHORING_CORE.md`](./AUTHORING_CORE.md), [`BEDROCK_ARCHIVES.md`](./BEDROCK_ARCHIVES.md) |

Threat model: a user (or a dropped file from the web) opens a crafted `.mcstructure` / `.zip` / misnamed Java `.nbt` in the browser. There is no ASI backend. Impact is **tab DoS / memory exhaustion**, **wrong files in IndexedDB**, and **unbounded trees** reaching inspect/preview (and any future model context). Not remote RCE.

AUTHORING_CORE Security caps (64 MiB file, 8× UI-max cell product, zip 10k/512 MiB) are **documentation only**. `src/` does not enforce them.

---

## Summary

| ID | Severity | Finding |
|----|----------|---------|
| **F1** | Critical | nbtify has **no** max-depth, max-nodes, max-string, cycle, or timeout hooks |
| **F2** | Critical | INT_ARRAY / LONG_ARRAY / numeric LIST allocate TypedArray from **untrusted length** before remaining-bytes check |
| **F3** | Critical | Product parsers **fall back to option-less `NBT.read()`**, which brute-forces gzip/zlib/endian/varint/`level.dat` |
| **F4** | High | Preferred `{ endian: "little", strict: false }` still **auto-decompresses** unless `compression: null` |
| **F5** | High | Catalog **does not** require `format_version == 1` or Int32Array size/origin |
| **F6** | High | Preview whitelist is **weaker** than HoloPrint `isNBTValidMcstructure` |
| **F7** | High | **Five** independent parse sites duplicate the unsafe pattern |
| **F8** | High | No pre-parse **file-size** or **cell-product** gate in `src/` |
| **F9** | High | `decompress()` concatenates chunks with **no max output size** |
| **F10** | Medium | Ingest treats **unknown extensions as `.mcstructure`** |
| **F11** | Medium | ZIP / `.mcworld` / `.mcpack` expand has **no zip-bomb budget** |
| **F12** | Medium | Fixture `NBT.write(root)` omits **endian**; not a product writer but a footgun |
| **F13** | Medium | Inspect/materials/hopper walk the **full raw tree**; no extract whitelist at the codec |
| **F14** | Low | `strict: false` allows trailing unread bytes and duplicate compound keys |

---

## F1 — Library cannot be the gate

**Where:** `node_modules/nbtify-readonly-typeless/dist/read.js` `read(data, options = {})` (lines 11–106). Options: `rootName`, `endian`, `compression`, `bedrockLevel`, `strict`. Same set on nbtify 2.2.0.

`#readList` / `#readCompound` recurse `#readTag` with **no** depth or node counter (lines 311–341).

**Impact:** Pathological nesting → JS `RangeError` (call stack) or unbounded object graph. No library-specific reject.

**Do not** swap to saicone/go-mclib default **2 MB** quotas: UI-max `.mcstructure` index payload is ~**8.4 MB** (64×257×64 × 2 Int32 layers). Keep nbtify; wrap it.

---

## F2 — TypedArray from untrusted length

**Where:** `#readIntArray` / `#readLongArray` (lines 343–359); numeric `#readList` (316–322).

```js
const length = this.#varint ? this.#readVarIntZigZag() : this.#readInt();
const value = new Int32Array(length); // before remaining-bytes check
```

BYTE_ARRAY and STRING call `#allocate(length)` first (297–308). INT_ARRAY does **not**.

`#allocate` (134–137): throws `UnexpectedBufferEndError` if `offset + byteLength > buffer`. A **negative** length can pass (`offset + negative` is not `>` `byteLength`) and rewind `#byteOffset` (not runtime-tested).

**Impact:** Crafted length → large allocation / tab OOM before any remaining-bytes throw.

---

## F3 — Option-less fallback brute-forces encodings

**Where (product):**

| File | Pattern |
|------|---------|
| `src/viewer/parseStructure.js` 41–46 | little → `NBT.read(arrayBuffer)` |
| `src/viewer/structurePreview.js` 62–65 | same |
| `src/viewer/hopperStats.js` 120–123 | same |
| `src/viewer/materialList.js` 408–411 | same |
| `src/holoprint/HoloPrint.js` 826–834 | little → `readStructureNBTWithOptions` **no options** |

`read()` with omitted fields (read.js 44–104):

1. Compression: gzip if `getUint16(0) === 0x1F8B`, else zlib if first byte `0x78`, else uncompressed, then **deflate-raw**.
2. Endian: **big**, then little, then **little-varint** (network NBT).
3. `rootName` true then false.
4. `bedrockLevel` auto if `endian === "little"` and `getUint32(4, true) === byteLength - 8` (`level.dat` prefix).

**Impact:** Gzip Java `.nbt` (`DataVersion`) can parse. Catalog `parseStructureFile` never calls `isNBTValidMcstructure`, so it can **IndexedDB-store** a non-Bedrock tree (AUTHORING_CORE K7 is not implemented). Preview may still throw after parse (F6).

---

## F4 — Little-endian path still auto-decompresses

**Where:** read.js 44–64. If `endian` is set but `compression === undefined`, gzip/zlib headers still trigger `decompress()`.

API **does** accept `compression: null` (line 32: `"gzip" | "deflate" | "deflate-raw" | null`). **No call site passes it.**

**Impact:** A gzip payload with a little-endian inner NBT still inflates on the “preferred” path.

---

## F5 — Catalog parse is schema-lenient

**Where:** `parseStructureFile` (`parseStructure.js` 51–79).

- Rejects only empty files (36–37).
- Never tests `format_version == 1`.
- `size` / origin via `normalizeVec3` (missing origin → `worldOrigin: null`).
- `block_indices` layer 0 optional; if empty, `blockCount` becomes **volume** (`size[0]*size[1]*size[2]`) even when layers are missing.

HoloPrint `isNBTValidMcstructure` (`src/holoprint/HoloPrint.js` 866–867):

```js
nbt["format_version"] == 1
  && nbt["size"] instanceof Int32Array && nbt["size"].length == 3
  && "structure" in nbt
  && nbt["structure_world_origin"] instanceof Int32Array && nbt["structure_world_origin"].length == 3
```

Not used by ASI catalog.

---

## F6 — Preview check is weaker than pack/HoloPrint

**Where:** `structurePreview.js` `readStructureNBT` 67–69:

```js
if (data?.format_version != 1 || !data?.structure || !data?.size)
```

Does **not** require `structure_world_origin`, Int32Array, length 3, or two equal `block_indices` layers. After a successful F3 fallback, some non-mcstructure NBT still fails preview; some malformed Bedrock-shaped trees **pass**.

Java keys are recognized only in HoloPrint `getInvalidMcstructureErrorMessage` (`DataVersion` → `"nbt"`, etc., lines 878–887). ASI preview/catalog do not use that map on the success path.

---

## F7 — Parse is not a single chokepoint

Each of F3’s five sites re-reads the File into a **new** unbounded tree (plus HoloPrint cache `weaklyCacheUnaryFunc`). `parseStructureFile` then immediately:

- `countStructureEntities(data)`
- `buildMaterialListFromNbt(data)`
- `buildInspectIndex(data)` → hopper stats

`buildMaterialListFromFile` / `scanHopperStatsFromFile` parse **again**.

**Impact:** Fixing one file does not close the hole. Any future “ask the model about this structure” that stringifies `data` dumps the whole NBT.

---

## F8 — No size / volume gate in `src/`

Only empty-file checks exist. AUTHORING_CORE table (64 MiB `.mcstructure`, refuse open if cell product > 8,388,608) is unused.

Legitimate UI-max files are large (~8.4 MB **indices** plus palette/BE). A 2–8 MB **LLM extract** cap must not be the catalog cap.

---

## F9 — Decompression has no output cap

**Where:** `nbtify-readonly-typeless/dist/compression.js` 11–32. `DecompressionStream` chunks are concatenated; `byteLength` grows without a library max. Host Compression Streams may or may not cap (not measured).

**Impact:** Gzip bomb → memory DoS if F3/F4 allow decompress. Mitigation is **do not decompress** on the product path, not a bigger quota.

---

## F10 — Unknown extension → try as `.mcstructure`

**Where:** `detectSourceKind` / `expandSourceFile` (`ingest.js` 11–35).

Unknown → `sourceKind = "mcstructure"` + warning. A renamed `.nbt` / `.litematic` hits `parseStructureFile` and F3/F5.

`.mcaddon` is not a kind; it also falls through as unknown.

---

## F11 — Zip expand has no bomb budget

**Where:** `ingest.js` 38–67.

- `.mcworld` / `.mctemplate` / `.zip` → `extractStructureFilesFromMcworld` (no ASI entry/uncompressed cap).
- `.mcpack` → `@zip.js/zip.js` `getEntries()` then `getData` for every `*.mcstructure`; **no** max entries / max uncompressed.

AUTHORING_CORE 10,000 entries / 512 MiB uncompressed is unused.

---

## F12 — Fixture writer omits endian

**Where:** `scripts/fill-sign-test-text.mjs` 250: `NBT.write(root)` with no endian. Read uses little-endian. Product write is not shipped (`nbtify` is a **devDependency**; `src/index.html` import map has **no** `nbtify`, only `nbtify-readonly-typeless`).

**Impact:** Not a runtime RCE. If PR 2 copies this call, Bedrock files can be written with the **wrong** default endian.

---

## F13 — Raw tree is the inspect/preview input

`buildInspectIndex(data)` walks entities and `block_position_data` with no codec-level depth/node quota. The inspect **field set** is relatively tight (id, Pos, inventories, signs, …) but it is applied **after** the full parse and on the raw object.

No code path currently JSON-stringifies the full NBT into a prompt. The invariant “never feed raw parsed trees into model context” is **policy**, not enforced.

---

## F14 — `strict: false`

All product reads pass `strict: false` (needed for duplicate sections; HoloPrint #68). Unread trailing bytes are allowed (`readRoot` 157–165). Compound duplicate names overwrite (last wins). Acceptable for Bedrock files; do not treat as a size gate.

---

## What is *not* a finding

- Using nbtify itself (keep it).
- Catalog storing the `File` blob (IndexedDB); the issue is parsing without gates, not persistence of bytes.
- HoloPrint `isNBTValidMcstructure` existing — it is the right **shape** predicate; ASI does not call it.
- `compression: null` being available — we simply never pass it (F4).

---

## Evidence (pins)

- `nbtify-readonly-typeless@1.1.2` `dist/read.js`, `dist/compression.js`
- `src/viewer/parseStructure.js`, `structurePreview.js`, `hopperStats.js`, `materialList.js`, `ingest.js`
- `src/holoprint/HoloPrint.js` 813–888
- `scripts/fill-sign-test-text.mjs` 116, 250
- `src/index.html` import map (no writable `nbtify`)
- `docs/AUTHORING_CORE.md` Security caps (unimplemented)

Uncertainties (not runtime-tested here): exact OOM vs `RangeError` on huge `new Int32Array(n)`; negative `#allocate`; host `DecompressionStream` cap.
