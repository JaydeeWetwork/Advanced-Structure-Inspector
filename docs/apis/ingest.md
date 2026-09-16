# Ingest API

`src/viewer/api/ingest.js`

Turn user `File`s into catalog-ready rows. Java NBT, gzip `.mcstructure`, litematic, and schematic files never become catalog entries.

```js
import {
  ingestFiles,
  detectSourceKind,
  expandSourceFile,
  IngestError
} from "./viewer/api/ingest.js";
```

## Functions

### `detectSourceKind(file)`

Returns `"mcstructure"` | `"mcworld"` | `"mctemplate"` | `"mcpack"` | `"mcaddon"` | `"zip"` | `"java-nbt"` | `"unknown"` from the file name.

### `expandSourceFile(file, opts?)`

Unpacks worlds / packs / zips into `.mcstructure` files. Nested addons: depth 2.

Caps (fail closed):

| Constant | Default |
|----------|---------|
| `ZIP_MAX_ENTRIES` | 10 000 zip members |
| `ZIP_MAX_UNCOMPRESSED` | 64 MiB extracted |
| `ZIP_MAX_ENTRY_BYTES` | 64 MiB per member |
| `ZIP_MAX_STRUCTURES` | 64 `.mcstructure` files per import |
| `INGEST_MAX_TOP_FILES` | 32 files from the picker/drop |

Encrypted zip members are skipped. Entry names are basenames only (no zip comments, no `..`).

World (`.mcworld` / `.mctemplate`) extract still uses `mcbe-leveldb-reader`; after extract, count/size caps apply. Peak RAM during that library call is not fully bounded.

### `ingestFiles(files, opts?)`

`detect` → CRC-32 of bytes → skip duplicates → parse.

- `opts.signal` — abort between files
- `opts.onProgress`
- `opts.knownCrcs` — CRC-32 hex strings already in the catalog

Duplicate bytes (same CRC as `knownCrcs` or an earlier file in this batch) produce a **warning** and are not catalogued. Extra picker files beyond 32 are skipped with a warning.

## `IngestError`

`Error` subclass with `name: "IngestError"` and `code` such as:

- `ZIP_TOO_MANY_ENTRIES` / `ZIP_TOO_LARGE`
- `JAVA_NBT` / gzip / unknown type (rejected before catalog)

Use `error.code` in UI; `error.message` is human-readable.
