# Version / pack pins API

`src/viewer/api/version.js`

Which vanilla Bedrock samples zip the atlas and icons fetch. Appearance goes through `packAssetStore` so preview and inventory share URLs.

The product version is separate. It is `0.1.158` in `src/buildId.js`, shown on the title and stored in the `version` field in `package.json`.

```js
import {
  defaultVersionContext,
  packTags,
  packAssetStore
} from "./viewer/api/version.js";
```

## Functions

| Export | Role |
|--------|------|
| `defaultVersionContext()` | `{ renderPackTag, fallbackPackTags, label, mode: "upgrade" }` |
| `packTags(ctx?)` | Primary pin first, then unique fallbacks |
| `packAssetStore` | Singleton `PackAssetStore` |

Render pins live in `src/data/packPins.js` (`VANILLA_SAMPLES_TAG`, `VANILLA_SAMPLES_FALLBACK_TAGS`). Upgrade-schema pins live in `src/data/schemaPins.js` and are re-exported from `packPins.js`.

## `PackAssetStore`

`src/viewer/appearance/PackAssetStore.js`

| Method | Role |
|--------|------|
| `prewarm(ctx?)` | Load pack JSON (`blocks.json`, terrain/item textures). Does not fetch `texture_list.json` |
| `getJson(path, ctx?)` | Cached pack JSON for one pin |
| `fetchVanilla(path, ctx?)` | `{ res, tag, status }`. Current pin, then older pins only after a 404. A 403 or 5xx stays on this pin |
| `fetchVanillaResponse(path, ctx?)` | The `Response` from `fetchVanilla`, or a 404 response |
| `fetchTexture(pathNoExt, ctx?)` | One extension, then `fetchVanilla` walks pins. Returns `{ imageRes, ext, tag, status }` |
| `extensionsToTry(pathNoExt)` | `".tga"` or `".png"` from the color stem set. One extension, no per-tag override |
| `decodeTexture(pathNoExt, opts?)` | Vanilla PNG/TGA → image data. `opts.ctx` selects the pin. `opts.placeholder` defaults to true. Cached per pin |
| `decodeTexturePreferLocal(pathNoExt, stack?, opts?)` | Local `.png` then `.tga`, then `decodeTexture`. A local hit is not stored in the pin cache |
| `loadColorImage(pathNoExt, stack?)` | `decodeTexturePreferLocal` with no placeholder, as an `HTMLImageElement` or `null` |
| `getIconObjectUrl(pathNoExt, ctx?)` | One color extension, drawn to a PNG object URL. A missing texture returns `null` and is not cached |

A 404 is remembered per tag. A transient CDN error is not, so a later preview can retry that URL.

Color downloads share the 64-wide FIFO gate in `src/viewer/engine/fetchers.js` (`VANILLA_CDN_SLOTS`). Cache hits do not take a slot. There is no preview-versus-background priority.

`npm run bump:pins` updates `VANILLA_SAMPLES_TAG` in `packPins.js` and the schema tags in `schemaPins.js`, rebuilds `src/data/vanillaTgaTextures.js` (color `resource_pack/textures/**/*.tga`, skip `*_mers`), refreshes the fancy-versus-opaque eigenvariants and the carried-texture list, and refreshes the block and item schema file lists. Item filenames live in `src/data/itemUpgradeSchemaList.json` (`path` only when a file is outside `id_meta_upgrade_schema/`). The command fetches every list first and then writes both pin files, even when only one tag changed. A constant defined twice in one file, or in both files, fails the read. It then runs the shape-coverage check against the new samples tag. Optional flags: `--samples`, `--block-schema`, `--item-schema`.

Block upgrade pin is `BLOCK_UPGRADE_TAG` **5.3.0** on `opencollab-incubator/BedrockBlockUpgradeSchema`. Item upgrade pin is `ITEM_UPGRADE_TAG` **1.18.0**. Both include the 1.26.50 step. `BlockUpdater.LATEST_VERSION` stays `18168865` (1.21.60.33) because those schemas still advertise that packed field. The bump command changes that constant only when a schema file's packed field changes.

`.github/workflows/pinFreshness.yml` compares those three tags with the latest stable GitHub release, walking next-page links until a stable tag appears, and the committed TGA stem list with the `.tga` files on the samples tag, on the first day of each month. A difference opens or updates an issue titled `Pins are behind upstream`. The body names the pin, the upstream tag, and `npm run bump:pins`. `node scripts/check-pin-freshness.mjs` prints that body and exits 2 when a pin is behind.

`schemaSkeletonsToApply` returns the schema-list entries for a block version, including `path` when a file is not under `nbt_upgrade_schema/`. The 1.26.50 file `0351_1.26.40_to_1.26.50.json` is fetched from the schema repo root. Item schema rows are filenames under `id_meta_upgrade_schema/` unless a row sets `path`.

See [official-resources.md](../official-resources.md) for Mojang URLs and pins.
