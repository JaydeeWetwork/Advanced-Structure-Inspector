# Structure codec API

`src/viewer/api/structure.js` re-exports the product read/write gate from `src/viewer/core/nbt/mcstructureCodec.js`. That file re-exports read, write, limits, shape checks, and the zlib checksum. The definitions are `mcstructureRead.js`, `mcstructureWrite.js`, `mcstructureLimits.js`, `mcstructureValidate.js`, and `mcstructureInflate.js`.

Runtime parse uses **uncompressed little-endian** NBT (`compression: null`) through the vendored `nbtify-readonly-typeless` 1.1.2 build (`src/vendor/nbtify-readonly-typeless`). `INT_ARRAY` and `LONG_ARRAY` are read with indexed loops. Do not call nbtify with omitted compression. The typed writer (`mcstructureTyped.js`) is loaded only when something calls `writeMcstructure`.

```js
import {
  readMcstructure,
  writeMcstructure,
  gateMcstructureBytes,
  isNBTValidMcstructure,
  assertMcstructureLayers,
  assertNbtQuotas,
  McstructureCodecError,
  MCSTRUCTURE_READ_OPTIONS,
  MCSTRUCTURE_MAX_BYTES,
  MCSTRUCTURE_MAX_CELLS
} from "./viewer/api/structure.js";
```

## Functions

| Export | Role |
|--------|------|
| `gateMcstructureBytes(buffer)` | Reject empty, oversized, whole-file gzip/zlib, and `level.dat` before nbtify |
| `readMcstructure(input, opts?)` | `File` / `Blob` / `ArrayBuffer` → `{ nbt }`. `block_indices` always has two layers afterwards |
| `writeMcstructure(nbt)` | Typed product write (see [Writing](#writing)). Re-reads the bytes with the same gates. Does not change the caller's `block_indices` |
| `isNBTValidMcstructure(nbt)` | `true` when `mcstructureShapeProblem(nbt)` is `null` |
| `assertMcstructureLayers(nbt)` | Shape, supported version, layer count for that version, each layer length = cell product. Pads a one-layer version 2 file to two layers **in place** |
| `assertNbtQuotas(nbt, volume)` | Depth, node, string, and entity caps |
| `MCSTRUCTURE_READ_OPTIONS` | `{ endian: "little", compression: null, bedrockLevel: false, strict: false }` |
| `MCSTRUCTURE_MAX_BYTES` | 64 MiB |
| `MCSTRUCTURE_MAX_CELLS` | 8 388 608 |

`readMcstructure` caches by `File` object so catalog, preview, and materials share one parse.

`mcstructureShapeProblem(nbt)` is the single shape check. It is defined in `mcstructureValidate.js` and re-exported from `mcstructureCodec.js`. It is not on `api/structure.js`. It returns `{ code, message, extra? }` or `null`. Check order: root → `format_version` → supported version → `size` → `structure` → `structure_world_origin`. A field counts as present only when the root owns that key.

| `message` | When |
|-----------|------|
| `root is not an NBT compound` | Missing root, array, or typed-array root |
| `missing format_version` | Key absent |
| `format_version is not a whole number` | `null`, a non-`Number` object, or a non-integer. nbtify `Int32` is a `Number`, so a typed tag is accepted |
| `unsupported format_version N (Bedrock Layers reads 1, 2)` | Code `STRUCTURE_UNSUPPORTED_VERSION`. `extra.formatVersion` is `N` |
| `missing size` / `size is not a list of 3 ints` | Length 3, every element a whole number. An `Int32Array` (typeless read) or a list of nbtify `Int32` (typed read) |
| `missing structure` | |
| `missing structure_world_origin` / `structure_world_origin is not a list of 3 ints` | Same length-3 whole-number rule |

Layer checks run in `assertMcstructureLayers`, after that shape check:

| `message` | When |
|-----------|------|
| `size is not three non-negative ints` | A component is negative or not a whole number |
| `cell product V > 8388608` | Over `MCSTRUCTURE_MAX_CELLS` |
| `missing structure.block_indices` | |
| `block_indices has N layer(s); format_version V needs 2` | Version 1 |
| `block_indices has N layer(s); format_version 2 needs 1 or 2` | Version 2 |
| `block_indices[i] is not an int array` | |
| `block_indices[i] length L !== volume V` | |

The pad runs only when `format_version === 2` and the list length is 1: `block_indices` becomes `[layer0, Int32Array(volume).fill(-1)]`. The return value is `{ volume, warnings, formatVersion, layersInFile }`. `layersInFile` is the count before that pad. A volume at or above `MCSTRUCTURE_WARN_CELLS` (`64 * 257 * 64`) adds a warning and still loads.

## Format

Cell index is `(x * sy + y) * sz + z`. `getCoordinatesFromStructureIndex` in `src/utils/coordinates.js` is the inverse. `size[0]` is unused. In structure space, +X is east and +Z is south.

| | Version 1 | Version 2 (Minecraft 26.50+) |
|---|---|---|
| `format_version` | Int 1 | Int 2 |
| `size`, `structure_world_origin` | `List<Int>` ×3 on disk | `List<Int>` ×3 on disk |
| `structure.block_indices` | `List<List<Int>>`, always 2 layers | `List<Int_Array>`, 1 or 2 layers. The second (waterlog) layer is omitted when every index is `-1` |

The typeless reader turns both list-of-int and int-array into `Int32Array`, so a loaded `size` is an `Int32Array` of length 3. A float list arrives as `Float32Array`. Entity `Pos` is that array. Writing it back keeps `List<Float>`, including whole values.

- Each present layer must be exactly `size[0] * size[1] * size[2]` long.
- A one-layer version 2 file is normalised in `assertMcstructureLayers` so preview, materials, inspect, hopper stats, and the pack page see two layers. `cloneBlockIndices` in `src/viewer/paletteCore.js` also pads a missing second layer with `-1`.
- Any other whole-number `format_version` fails with `STRUCTURE_UNSUPPORTED_VERSION`. `userMessage` names the file, the version, and versions 1 and 2, and says the file was probably saved by a newer Minecraft.
- Whole-file gzip (`0x1f 0x8b`) and zlib (first byte `0x78`) fail as `STRUCTURE_COMPRESSED` before parse. A version 2 root with `compression` 1 stores `structure` as a zlib-compressed NBT byte array. That compound is inflated up to 64 MiB, the zlib checksum must match the output, and the compound replaces `structure`. `compression` is then removed. There is no compression-ratio cap. Any other `compression` value fails as `STRUCTURE_COMPRESSED`. A `compression` value that is not an integer, a `compression` 1 value that is not a zlib byte array, a bad header, a truncated stream, a checksum or trailing-byte mismatch, or an inflated payload that is not a compound, fails as `STRUCTURE_NBT_REJECTED`. Format version 3 is still `STRUCTURE_UNSUPPORTED_VERSION`.
- Before `NBT.read`, `assertNbtArrayLengths` checks array and list lengths against the bytes still left, and it also refuses depth past 64, more than 2,000,000 nodes, and a compound entry named `__proto__`. Numeric arrays do not add their element counts to that node total. Failure is `STRUCTURE_NBT_REJECTED`, and `NBT.read` is not called. A walk that succeeds returns that node count.
- `MCSTRUCTURE_SUPPORTED_VERSIONS` is `Object.freeze([1, 2])` in `mcstructureLimits.js`, re-exported from `mcstructureCodec.js`.

## Limits

These constants are defined in `mcstructureLimits.js` and re-exported from `mcstructureCodec.js`. The pre-parse walk and `assertNbtQuotas` both enforce depth and node caps. `MCSTRUCTURE_MAX_BYTES` and `MCSTRUCTURE_MAX_CELLS` are re-exported from `api/structure.js`. The other constants in this table stay off that public barrel.

`assertNbtQuotas` rejects a compound whose prototype is not `Object.prototype` (`STRUCTURE_NBT_REJECTED`). A bare nbtify number box (`Int8`, `Int16`, `Int32`, or `Float32` with no own keys) is a number, so a typed write still passes. A compound that only inherits one of those prototypes and still has its own keys fails. Own keys named `__proto__`, `prototype`, or `constructor` are removed before the walk continues.

| Constant | Value | Effect |
|----------|-------|--------|
| `MCSTRUCTURE_MAX_BYTES` | 64 MiB | `STRUCTURE_TOO_LARGE`. Re-exported |
| `MCSTRUCTURE_MAX_CELLS` | 8,388,608 | `STRUCTURE_NBT_REJECTED` when the cell product is larger. Re-exported |
| `MCSTRUCTURE_WARN_CELLS` | `64 * 257 * 64` | Warning only |
| `MCSTRUCTURE_MAX_DEPTH` | 64 | `STRUCTURE_NBT_REJECTED`, before parse and again in `assertNbtQuotas` |
| `MCSTRUCTURE_MAX_NODES` | 2 000 000 | `STRUCTURE_NBT_REJECTED`, before parse and again in `assertNbtQuotas` |
| `MCSTRUCTURE_MAX_STRING_BYTES` | 16 MiB | `STRUCTURE_NBT_REJECTED` |
| `MCSTRUCTURE_WARN_ENTITIES` | 10 000 | Warning only |
| `MCSTRUCTURE_MAX_ENTITIES` | 50 000 | `STRUCTURE_NBT_REJECTED` |

## Writing

`writeMcstructure` accepts the typeless object from `readMcstructure` or a typed root from `readMcstructureTyped`. It rebuilds Bedrock tag types in `typeMcstructureForWrite` (`core/nbt/mcstructureTyped.js`) because a plain JavaScript number would otherwise become `TAG_Double`, and an `Int32Array` would become `TAG_Int_Array`.

The write always checks layers and quotas on a shallow copy first (`structure` is copied, `block_indices` is not written back). That accepts an `Int32Array` size and a typed list of whole numbers. The caller's arrays stay as passed in. The written bytes are checked again by the re-read.

`typeMcstructureForWrite` does not mutate its input. It throws `TypeError` when `format_version` is not a whole number. Root key order is `format_version`, `size`, `structure`, `structure_world_origin`, then any other keys.

| Field | Written tag |
|-------|-------------|
| `format_version` | Int |
| `size`, `structure_world_origin` | `List<Int>` |
| Version 1 `block_indices` | `List<List<Int>>`, both layers |
| Version 2 `block_indices` | `List<Int_Array>`. A second layer that is entirely `-1` is omitted. Any other version throws `TypeError` |
| Palette `version` | Int |
| Bool block states | Byte. Names are `BEDROCK_BOOL_BLOCK_STATES` (Mojang `type: "bool"` properties from samples 1.26.50.4 and the 1.26.60.29 preview, including `lit`, `crafting`, `hanging`, and `minecraft:connection_*`) |
| Other numeric states | Int |
| Strings | Unchanged |
| Already-typed `Int8`, `Int16`, `Int32`, `Float32` | Kept |
| `Int8Array`, `Uint8Array`, `Int32Array`, `Uint32Array`, `BigInt64Array`, `BigUint64Array` | Kept as byte, int, or long arrays |

Entities and `block_position_data` have no schema. `typeFreeformNbt` types them as follows:

- A JavaScript boolean becomes Byte `0` or `1`. A bigint stays a bigint.
- A whole number inside int32 range becomes Int. A whole number outside that range becomes a bigint. A fraction becomes Float.
- An NBT array tag from the list above is kept.
- A `Float32Array` becomes a float list. Whole values stay Float.
- A `Float64Array` becomes a list of plain numbers, which nbtify writes as Double.
- An `Int16Array` becomes a short list.
- Every other array is walked element by element under the same number rule.

Write options are `{ endian: "little", compression: null, bedrockLevel: false }`. nbtify's default root name `""` is left in place.

Scripts that edit an existing file and need Byte, Short, Float, or Long fields to survive should read with `readMcstructureTyped` (in `mcstructureTyped.js`). It runs `readMcstructure`, then parses again with typed nbtify (`rootName: true`) and returns `{ nbt, typeless }`. A typed rewrite of a one-layer version 2 save writes one layer. The product re-read pads that layer again in the returned object.

`tests/sampleStructures/chiseled_bookshelves.mcstructure` stores each book as `Count` Byte, `Damage` Short, `WasPickedUp` Byte, and `Slot` Byte at the face index (0–5). Empty `Name` placeholders are absent. The block state `books_stored` is the bitmask of those slots (`1 << slot`). Each shelf block entity has `BlockEntityVersion` Int 0. Public samples whose palette version was the unshipped packed value `18168864` (1.21.60.32) now store `18168865` (1.21.60.33). Older versions such as `18163713` stay. `signs.mcstructure` and `hanging_signs.mcstructure` still store some sign numeric fields as Double.

## `McstructureCodecError`

| Field | Role |
|-------|------|
| `code` | `STRUCTURE_EMPTY`, `STRUCTURE_TOO_LARGE`, `STRUCTURE_COMPRESSED`, `STRUCTURE_LEVEL_DAT`, `JAVA_NBT_DETECTED`, `STRUCTURE_UNSUPPORTED_VERSION`, `STRUCTURE_NBT_REJECTED` |
| `userMessage(fileName?)` | UI string. The file name is quoted when passed. Otherwise the subject is `Structure file` |
| `toError(fileName?, ErrorType?)` | Wrap for the app (`UserError` in the shell). Sets `err.code` and `err.cause` |

`STRUCTURE_COMPRESSED` `userMessage` includes `this.message` and says the file did not match uncompressed NBT or a version 2 structure compound stored as zlib. `STRUCTURE_NBT_REJECTED` `userMessage` is `${who} is not a valid .mcstructure (${this.message})`.

Empty stored files (Safari file-picker after reload) use `STRUCTURE_EMPTY`. Re-import the structure. New imports store a byte copy.

The pack page reads structures with `readStructureNBT` in `src/pack/packConfig.js` (re-exported from `HoloPrint.js`), which calls `readMcstructure`. For `STRUCTURE_NBT_REJECTED` and `JAVA_NBT_DETECTED` it appends the codec reason in parentheses. Other codec errors go through `toError`.
