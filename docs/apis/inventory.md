# Inventory / inspect API

`src/viewer/api/inventory.js`

Typed records from structure NBT plus Minecraft-style container mockups. UI should not re-walk raw NBT.

```js
import {
  buildInspectIndex,
  extractInventoryItems,
  normalizeItemStack,
  asList,
  extractSignText,
  extractSignFace,
  parseSignTextLines,
  parseSignStyleRuns,
  signArgbCss,
  extractLecternBook,
  extractBookPages,
  parseDisabledSlots,
  readRedstoneSignal,
  formatInspectText,
  resolveContainerKind,
  layoutForKind,
  renderContainerUi,
  readComposterFillLevel,
  kindOfSign,
  describeSignPlacement,
  signFaceTag,
  placeSignFace
} from "./viewer/api/inventory.js";
```

## Inspect index

`buildInspectIndex(nbt, opts?)` returns a sparse index of block entities and entities:

```js
InspectIndex {
  size: [x, y, z],
  blocks: Map<"x,y,z", InspectBlock>,
  entities: InspectEntity[],
  sparse: true
}

InspectBlock {
  x, y, z, name, states,
  blockEntityId,
  items: ItemStack[],
  doubleChest?, waterlogName?,
  sign?, lectern?, redstone?
}

InspectEntity {
  identifier, rawId,
  pos: [x, y, z],   // structure-local
  items: ItemStack[],
  customName?
}

ItemStack { name, count, slot, damage }
```

The flat cell index is `(x * sy + y) * sz + z`, the same order as [structure.md](./structure.md).

| Function | Role |
|----------|------|
| `extractInventoryItems(beOrEntity)` | Hopper, chest, and minecart `Items` |
| `normalizeItemStack(raw)` | Nested Bedrock item shapes |
| `asList(value)` | Array, `{ value }`, or numeric-key map |
| `parseDisabledSlots(be)` | Hopper and crafter locked slots |
| `extractSignText(be)` | `{ front, back, waxed }` |
| `extractSignFace(faceNbt)` | `{ lines, color, glowing, raw }` |
| `parseSignTextLines(raw, keepCodes?)` | Extra JSON and legacy § codes. Pass `true` to keep § codes for painting. JSON nested past 100 levels returns no lines. A flattened line stops at 8,192 characters |
| `signArgbCss(argb, glowing?)` | CSS for `SignTextColor`. Black glow ink is white |
| `parseSignStyleRuns(line, baseCss)` | §0–§f, §l, §o, and §r runs. §r returns to the face dye |
| `extractLecternBook(be)` / `extractBookPages` | Book on a lectern |
| `readRedstoneSignal(block)` | 0–15 from the block state |
| `formatInspectText(hit)` | Plain-text inspect dump |

## Container UI

`resolveContainerKind(src)` reads `blockEntityId`, `name`, or `identifier` (the `minecraft:` prefix is stripped). Minecarts are matched before chests and hoppers, because those names contain `chest` or `hopper`.

| Kind | Layout |
|------|--------|
| `double_chest` | 6×9 (54). Set when `src.doubleChest` is set, before the single-chest names |
| `chest`, `barrel`, `shulker`, `ender_chest`, `chest_minecart` | 3×9 (27) |
| `hopper`, `hopper_minecart` | 1×5 |
| `dropper`, `dispenser`, `crafter` | 3×3. Crafter has a result slot. Disabled slots come from the block |
| `chiseled_bookshelf` | 2×3 (6). Slots 0–2 are the top row, 3–5 the bottom |
| `furnace`, `blast_furnace`, `smoker` | 3 furnace slots |
| `brewing` | 5 slots (3 bottles, ingredient, fuel) |
| `composter` | Fill level only. `readComposterFillLevel(states)` is 0–8 |
| `sign` | Front and back text. The panel and the 3D overlay paint `SignTextColor`. Glow ink uses that dye, and black glow ink is white. § codes recolor a run when the raw text has them. JSON nested past 100 levels shows no lines |
| `lectern` | Book pages. A page whose JSON passes that depth cap is blank |
| `redstone_wire` | Power readout. Block names `redstone_wire` and `redstone_dust` |
| `generic` | 3×9 fallback |

`layoutForKind(kind)` returns `{ title, rows, cols, slotCount, layout, resultSlot? }`. `renderContainerUi(hit)` builds the DOM mockup (slots, signs, lectern, redstone, composter).

Chiseled-bookshelf books in the 3D preview follow the `books_stored` block state. `fillSlots` places a stack at `Slot` when that byte is inside the grid, and otherwise uses list order. `tests/sampleStructures/chiseled_bookshelves.mcstructure` stores `Slot` on each book. See [structure.md](./structure.md) for the item tag widths.

The inspect location subtitle (`formatInspectLocation`) is applied by the inspect chrome, not this module.

## Sign placement (preview meshes)

Used by the 3D overlay, not by inventory slots.

| Function | Role |
|----------|------|
| `kindOfSign(name, states)` | `"hanging"`, `"wall"`, or `"standing"` |
| `placeSignFace(block, name, isBack)` | Board pose in Three.js space |
| `describeSignPlacement(block, name)` / `signFaceTag(desc, isBack)` | Debug and QA labels |

`kindOfSign` strips `minecraft:` and then:

1. A name matching `/hanging/i` is hanging.
2. A name matching `/wall_?sign/i` is wall.
3. A name matching `/standing_sign/i` is standing.
4. `facing_direction` set and `ground_sign_direction` absent is wall.
5. Otherwise standing.

A hanging sign stores both `facing_direction` and `ground_sign_direction`. When `attached_bit` is set, the mesh uses the 16-step ground yaw. Otherwise only `facing_direction` is applied. The two angles are not added. Door `direction` is a block-state turn (0 east, 1 south, 2 west, 3 north) and is applied in the geometry path, not here. See [preview.md](./preview.md).
