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

`buildInspectIndex(nbt, opts?)` → sparse index of block-entities and entities:

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

| Function | Role |
|----------|------|
| `extractInventoryItems(beOrEntity)` | Hopper / chest / minecart `Items` |
| `normalizeItemStack(raw)` | Nested Bedrock item shapes |
| `asList(value)` | Array, `{ value }`, or numeric-key map |
| `parseDisabledSlots(be)` | Hopper locked slots |
| `extractSignText(be)` | `{ front, back, waxed }` |
| `extractSignFace(faceNbt)` | `{ lines, color, glowing, raw }` |
| `parseSignTextLines(raw)` | Extra/JSON/legacy § codes |
| `extractLecternBook(be)` / `extractBookPages` | Book on lectern |
| `readRedstoneSignal(block)` | 0–15 |
| `formatInspectText(hit)` | Plain-text inspect dump |

## Container UI

| Function | Role |
|----------|------|
| `resolveContainerKind(src)` | `"chest"`, `"double_chest"`, `"hopper"`, `"sign"`, `"lectern"`, `"redstone_wire"`, `"generic"`, … |
| `layoutForKind(kind)` | Rows/cols/title |
| `renderContainerUi(hit)` | DOM mockup (slots, signs, lectern, redstone) |
| `readComposterFillLevel(states)` | 0–8 |

Inspect location subtitle (`formatInspectLocation`) is applied by the inspect chrome, not this module.

## Sign placement (preview meshes)

Used by the 3D overlay, not inventory slots.

| Function | Role |
|----------|------|
| `kindOfSign(name)` | `"wall"` \| `"standing"` \| `"hanging"` |
| `placeSignFace(block, name, isBack)` | Board pose in Three.js space |
| `describeSignPlacement` / `signFaceTag` | Debug/QA labels |
