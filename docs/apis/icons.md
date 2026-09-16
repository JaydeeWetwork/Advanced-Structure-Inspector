# Icons API

`src/viewer/api/icons.js`

Item and block icons for inventory slots and item frames. Atlas and icons share `packAssetStore` so they hit the same vanilla CDN pins.

```js
import {
  ensureItemIconLoader,
  getItemIconUrl,
  hydrateInventoryIcons,
  resetItemIconCache,
  stripItemNs
} from "./viewer/api/icons.js";
```

## Functions

| Export | Role |
|--------|------|
| `stripItemNs(id)` | Drop `minecraft:` |
| `ensureItemIconLoader()` | Load `itemIcons.json` + pack JSON (idempotent) |
| `getItemIconUrl(itemId)` | `Promise<string\|null>` object URL or pack URL |
| `hydrateInventoryIcons(root)` | Fill `img[data-item-icon]` in a container mockup; returns count loaded |
| `resetItemIconCache()` | Drop maps and revoke object URLs (session clear) |

## Resolution order

1. `src/data/itemIcons.json` (exact names + `/regex/` keys, bucket variants)
2. `textures/item_texture.json`
3. `blocks.json` → `terrain_texture.json` → `textures/blocks/*`
4. Heuristic pack paths (planks, logs, shulkers, filled buckets, …)

Unknown ids leave the slot **text label**; they do not throw.
