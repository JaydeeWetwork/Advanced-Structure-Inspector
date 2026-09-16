# Version / pack pins API

`src/viewer/api/version.js`

Which vanilla Bedrock samples zip the atlas and icons fetch. Appearance goes through `packAssetStore` so preview and inventory share URLs.

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

Pins live in `src/data/packPins.js` (`VANILLA_SAMPLES_TAG`, `VANILLA_SAMPLES_FALLBACK_TAGS`).

## `PackAssetStore`

`src/viewer/appearance/PackAssetStore.js`

| Method | Role |
|--------|------|
| `prewarm(ctx?)` | Load pack JSON (`blocks.json`, terrain/item textures). Indexes `texture_list.json` if present (that file is incomplete on current samples — not used to pick PNG vs TGA) |
| `getJson(path, ctx?)` | Cached pack JSON |
| `fetchVanilla(path, ctx?)` | Try current pin then fallbacks (exact path, including extension) |
| `fetchTexture(pathNoExt, ctx?)` | One extension only, then fallback tags |
| `extensionsToTry(pathNoExt, ctx?)` | **One** of `.tga` or `.png`. Source: `src/data/vanillaTgaTextures.js` (GitHub tree of the current pin). Samples never ship both. Does **not** probe the other extension (avoids jsDelivr 404/403 spam) |
| `decodeTexture(pathNoExt)` | PNG/TGA → `ImageData` |
| `getIconObjectUrl(pathNoExt)` | PNG object URL for inventory `<img>` |

Missing files are remembered per tag so 404s are not retried every frame.

When you bump `VANILLA_SAMPLES_TAG`, rebuild `src/data/vanillaTgaTextures.js` from that tag’s GitHub tree (`resource_pack/textures/**/*.tga`).

See [official-resources.md](../official-resources.md) for Mojang URLs and pins.
