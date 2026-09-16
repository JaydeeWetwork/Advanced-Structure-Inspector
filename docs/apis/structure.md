# Structure codec API

`src/viewer/api/structure.js`

Single chokepoint for `.mcstructure` bytes. Runtime parse uses **uncompressed little-endian** NBT (`compression: null`). Do not call nbtify with omitted compression.

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
| `gateMcstructureBytes(buffer)` | Reject empty, oversized, gzip/zlib, `level.dat` **before** nbtify |
| `readMcstructure(input, opts?)` | `File` / `Blob` / `ArrayBuffer` → `{ nbt }` |
| `writeMcstructure(nbt)` | Product write; re-reads with the same gates |
| `isNBTValidMcstructure(nbt)` | Shape check |
| `assertMcstructureLayers(nbt)` | Two `block_indices` layers, cell product |
| `assertNbtQuotas(nbt, volume)` | Depth / node / entity caps |
| `MCSTRUCTURE_READ_OPTIONS` | `{ endian: "little", compression: null, bedrockLevel: false, strict: false }` |
| `MCSTRUCTURE_MAX_BYTES` | 64 MiB |
| `MCSTRUCTURE_MAX_CELLS` | 8 388 608 |

`readMcstructure` caches by `File` object so catalog + preview + materials share one parse.

## `McstructureCodecError`

| Field | Role |
|-------|------|
| `code` | `STRUCTURE_EMPTY`, `STRUCTURE_TOO_LARGE`, `STRUCTURE_COMPRESSED`, `STRUCTURE_LEVEL_DAT`, `JAVA_NBT_DETECTED`, `STRUCTURE_NBT_REJECTED`, … |
| `userMessage(fileName?)` | UI string |
| `toError(fileName?, ErrorType?)` | Wrap for the app (`UserError` in the shell) |

Empty stored files (Safari file-picker after reload) use `STRUCTURE_EMPTY` — re-import the structure; new imports store a byte copy.
