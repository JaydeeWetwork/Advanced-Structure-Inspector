# Ingest API

`src/viewer/api/ingest.js`

Turn user `File`s into catalog-ready rows. Java NBT, gzip, zlib, litematic, and schematic files never become catalog entries.

```js
import {
  ingestFiles,
  detectSourceKind,
  expandSourceFile,
  sanitizeZipEntryName,
  assertZipBudget,
  IngestError,
  ZIP_MAX_ENTRIES,
  ZIP_MAX_UNCOMPRESSED,
  ZIP_MAX_ENTRY_BYTES,
  ZIP_MAX_STRUCTURES,
  INGEST_MAX_TOP_FILES
} from "./viewer/api/ingest.js";
```

## Functions

### `detectSourceKind(file)`

Returns a kind from the file name:

| Name ends with | Kind |
|----------------|------|
| `.mcstructure` | `"mcstructure"` |
| `.mcworld` | `"mcworld"` |
| `.mctemplate` | `"mctemplate"` |
| `.mcpack` | `"mcpack"` |
| `.mcaddon` | `"mcaddon"` |
| `.zip` | `"zip"` |
| `.nbt`, `.litematic`, `.schem`, `.schematic` | `"java-nbt"` |
| anything else | `"unknown"` |

An `"unknown"` file is sniffed from its first bytes inside `expandSourceFile`. `sniffSourceMagic` is defined in `src/viewer/ingestBudget.js` and re-exported from `src/viewer/ingest.js`. It is not on this barrel. It returns `"gzip"`, `"zlib"`, `"zip"`, `"nbt-compound"`, or `"other"`. Zip caps and entry names live in that same budget module. World LevelDB reads live in `ingestWorld.js`. Zip members live in `ingestZip.js`.

### `expandSourceFile(file, opts?)`

Unpacks worlds, packs, and zips into `.mcstructure` `File`s. Returns `{ structures, sourceKind, warnings }`. `opts.signal` aborts between zip members.

| Kind | Result |
|------|--------|
| `"mcstructure"`, or unknown bytes that start as an NBT compound (`0x0a`) | The file itself |
| `"mcworld"` / `"mctemplate"` | LevelDB files in the directory that contains `CURRENT` inflate under the same per-member, ratio, and 64 MiB caps. `readLevelDb` then runs on those capped files. LevelDB block decode still runs inside that cap |
| `"mcpack"` / `"zip"` / `"mcaddon"` | `.mcstructure` members. Addons also open nested `.mcworld`, `.mctemplate`, `.mcpack`, and `.mcaddon` members, to depth 2 |
| `"java-nbt"` | `IngestError` `JAVA_NBT_DETECTED` |
| unknown gzip or zlib magic | `IngestError` `SOURCE_COMPRESSED` |
| anything else | `IngestError` `UNRECOGNIZED_SOURCE` |

An archive with no structures returns an empty list plus a warning. It does not throw.

Caps (fail closed):

| Constant | Default |
|----------|---------|
| `ZIP_MAX_ENTRIES` | 10 000 zip members |
| `ZIP_MAX_UNCOMPRESSED` | 64 MiB extracted |
| `ZIP_MAX_ENTRY_BYTES` | 64 MiB per member, counted while the member inflates |
| `ZIP_MAX_RATIO` | 1000:1 declared uncompressed size over compressed size, when the compressed size is a finite number greater than 0 |
| `ZIP_MAX_STRUCTURES` | 64 `.mcstructure` files per import |
| `INGEST_MAX_TOP_FILES` | 32 files from the picker or drop |

`assertZipBudget(entries)` enforces the entry count and the uncompressed sum. `assertZipEntryInflation(entry)` rejects one member over `ZIP_MAX_ENTRY_BYTES`, and a member whose declared sizes exceed `ZIP_MAX_RATIO`, before inflate. A missing or zero compressed size does not invent a ratio. The inflate writer counts bytes and stops past `ZIP_MAX_ENTRY_BYTES`. `sanitizeZipEntryName(filename)` keeps a basename only (no zip comments, no `..`), at most 180 characters. Directory members and encrypted members are skipped. Opening an encrypted member throws `ZIP_ENCRYPTED`. A member over the byte cap or the ratio cap throws `ZIP_TOO_LARGE`.

Structure names taken out of a `.mcworld` or `.mctemplate` then pass `safeStructureFileName`: that basename, with every character outside Unicode letters, digits, underscore, space, period, colon, and hyphen replaced by `_`. The pack page uses the same helper for extracted structures. A coordinate-lock label is plain text.

### `ingestFiles(files, opts?)`

`detect` → CRC-32 of bytes → skip duplicates → parse.

- `opts.signal` — abort between files
- `opts.onProgress(msg)`
- `opts.knownCrcs` — CRC-32 hex strings already in the catalog

Duplicate bytes (same CRC as `knownCrcs` or an earlier file in this batch) produce a warning and are not catalogued. Picker files beyond 32 are skipped with a warning.

Returns `{ entries, warnings, errors }`. Each entry is the object from `parseStructureFile` (`name`, `sourceName`, `sourceKind`, `size`, `worldOrigin`, `paletteSize`, `blockCount`, `blockNames`, `entityCount`, `materials`, `hopperStats`, `file`) plus `contentCrc32` when the bytes hashed. Catalog persistence copies those bytes into IndexedDB.

## `IngestError`

`Error` subclass with `name: "IngestError"` and `code`. Use `error.code` in UI. `error.message` is human-readable.

| `code` | When |
|--------|------|
| `ZIP_TOO_MANY_ENTRIES` | Zip member list missing, or over `ZIP_MAX_ENTRIES` |
| `ZIP_TOO_LARGE` | Uncompressed sum, one member, the 1000:1 ratio cap, or a world template over the byte caps |
| `ZIP_TOO_MANY_STRUCTURES` | More than `ZIP_MAX_STRUCTURES` structure files |
| `ZIP_ENCRYPTED` | An encrypted member was opened as a structure |
| `JAVA_NBT_DETECTED` | Java NBT name (`.nbt`, `.litematic`, `.schem`, `.schematic`) |
| `SOURCE_COMPRESSED` | gzip or zlib magic on an unknown name |
| `UNRECOGNIZED_SOURCE` | Not a `.mcstructure`, zip, world, or pack |

The structure codec still rejects a file that passes ingest and is not a valid `.mcstructure`. See [structure.md](./structure.md).
