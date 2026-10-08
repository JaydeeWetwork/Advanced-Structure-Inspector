/** Item stacks and small NBT coercions used by inspect. */
import { upgradeItemStack } from "./itemUpgrade.js";
export function toNums(v) {
	if (v == null) return [];
	if (ArrayBuffer.isView(v)) return Array.from(/** @type {ArrayLike<number>} */ (v), Number);
	if (Array.isArray(v)) return v.map(Number);
	if (typeof v === "object") {
		if (Array.isArray(/** @type {any} */ (v).value) || ArrayBuffer.isView(/** @type {any} */ (v).value)) {
			return toNums(/** @type {any} */ (v).value);
		}
		const keys = Object.keys(v).filter(k => /^\d+$/.test(k)).sort((a, b) => +a - +b);
		if (keys.length) return keys.map(k => Number(/** @type {any} */ (v)[k]));
	}
	return [];
}
/**
 * @param {string|undefined|null} id
 * @returns {string}
 */
export function stripNs(id) {
	if (!id || typeof id !== "string") return "unknown";
	return id.replace(/^minecraft:/, "");
}
/**
 * Coerce NBT list-like values to a plain array.
 * @param {any} nbtList
 * @returns {any[]}
 */
export function asList(nbtList) {
	if (nbtList == null) return [];
	if (Array.isArray(nbtList)) return nbtList;
	if (ArrayBuffer.isView(nbtList)) return [...nbtList];
	if (typeof nbtList !== "object") return [];
	if (Array.isArray(nbtList.value)) return nbtList.value;
	if (ArrayBuffer.isView(nbtList.value)) return [...nbtList.value];
	if (nbtList.value && typeof nbtList.value === "object") {
		const nested = asList(nbtList.value);
		if (nested.length) return nested;
	}
	const keys = Object.keys(nbtList).filter(k => /^\d+$/.test(k)).sort((a, b) => +a - +b);
	if (keys.length) return keys.map(k => nbtList[k]);
	return [];
}
/**
 * @param {unknown} v
 * @returns {string|null}
 */
export function coerceStringId(v) {
	if (typeof v === "string" && v.length) return v;
	if (v && typeof v === "object" && typeof /** @type {any} */ (v).value === "string") {
		return /** @type {any} */ (v).value;
	}
	return null;
}
/**
 * @param {unknown} v
 * @param {number} fallback
 */
function coerceNumber(v, fallback) {
	if (v == null || v === "") return fallback;
	const n = Number(v);
	return Number.isFinite(n) ? n : fallback;
}
/**
 * @param {any} o
 */
function looksLikeItemStack(o) {
	if (!o || typeof o !== "object" || Array.isArray(o)) return false;
	if (coerceStringId(o.Name) || coerceStringId(o.name)) return true;
	if (coerceStringId(o.id) && (o.Count != null || o.count != null || o.Slot != null || o.slot != null)) {
		return true;
	}
	if (o.Item && typeof o.Item === "object" && (coerceStringId(o.Item.Name) || coerceStringId(o.Item.name))) {
		return true;
	}
	return false;
}
/**
 * @param {any} item
 * @param {{ includeRaw?: boolean }} [opts]
 * @returns {{ name: string, count: number, slot: number|null, damage: number|null, raw?: any }|null}
 */
export function normalizeItemStack(item, opts = {}) {
	if (!item || typeof item !== "object") return null;
	if (
		item.Item
		&& typeof item.Item === "object"
		&& (coerceStringId(item.Item.Name) || coerceStringId(item.Item.name) || coerceStringId(item.Item.id))
		&& !coerceStringId(item.Name)
		&& !coerceStringId(item.name)
	) {
		return normalizeItemStack({
			...item.Item,
			Slot: item.Slot ?? item.slot ?? item.Item.Slot,
			slot: item.slot ?? item.Item.slot
		}, opts);
	}
	const name =
		coerceStringId(item.Name)
		?? coerceStringId(item.name)
		?? coerceStringId(item.id)
		?? coerceStringId(item.Item?.Name)
		?? coerceStringId(item.Item?.name)
		?? coerceStringId(item.Item?.id)
		?? coerceStringId(item.Block?.name)
		?? coerceStringId(item.block_name)
		?? coerceStringId(item.BlockName)
		?? null;
	if (!name) return null;
	const count = coerceNumber(
		item.Count
		?? item.count
		?? item.StackSize
		?? item.stackSize
		?? item.Item?.Count
		?? item.Item?.count,
		1
	);
	const slotRaw = item.Slot ?? item.slot ?? item.Item?.Slot ?? item.Item?.slot;
	const slot =
		slotRaw == null || slotRaw === ""
			? null
			: coerceNumber(slotRaw, NaN);
	const damageRaw = item.Damage ?? item.damage ?? item.tag?.Damage ?? item.Item?.Damage;
	const damage = damageRaw == null || damageRaw === "" ? null : coerceNumber(damageRaw, NaN);
	/** @type {{ name: string, count: number, slot: number|null, damage: number|null, raw?: any }} */
	const out = {
		name: stripNs(name),
		count: Number.isFinite(count) && count > 0 ? count : 1,
		slot: Number.isFinite(slot) ? slot : null,
		damage: Number.isFinite(damage) ? damage : null
	};
	if (opts.includeRaw) out.raw = item;
	return out;
}
const INVENTORY_LIST_KEYS = [
	"Items",
	"items",
	"Item",
	"inventory",
	"Inventory",
	"ChestItems",
	"chest_items",
	"StorageItem",
	"FindableItems",
	"ItemInventory",
	"item_inventory",
	"ContainerItems",
	"container_items"
];
/**
 * @param {any} nbt
 * @param {any[]} out
 * @param {number} depth
 * @param {WeakSet<object>} seen
 */
function deepCollectItemStacks(nbt, out, depth, seen) {
	if (!nbt || typeof nbt !== "object" || depth > 6) return;
	if (seen.has(nbt)) return;
	seen.add(nbt);
	for (const [key, val] of Object.entries(nbt)) {
		if (key === "x" || key === "y" || key === "z" || key === "id" || key === "isMovable") continue;
		if (looksLikeItemStack(val)) {
			out.push(val);
			continue;
		}
		const list = asList(val);
		if (list.length && list.some(looksLikeItemStack)) {
			out.push(...list.filter(looksLikeItemStack));
			continue;
		}
		if (
			key === "internalComponents"
			|| key === "definitions"
			|| key === "components"
			|| key === "Properties"
			|| key === "properties"
			|| key === "ActorStorage"
			|| depth < 3
		) {
			deepCollectItemStacks(val, out, depth + 1, seen);
		}
	}
}
/**
 * @param {any} nbt
 * @param {any[]} [itemSchemas]
 * @param {{ includeRaw?: boolean }} [opts]
 * @returns {{ name: string, count: number, slot: number|null, damage: number|null, raw?: any }[]}
 */
export function extractInventoryItems(nbt, itemSchemas = [], opts = {}) {
	if (!nbt || typeof nbt !== "object") return [];
	/** @type {any[]} */
	const lists = [];
	const pushList = (v) => {
		const arr = asList(v);
		if (arr.length) lists.push(...arr);
		else if (v && typeof v === "object" && looksLikeItemStack(v)) lists.push(v);
	};
	for (const k of INVENTORY_LIST_KEYS) {
		if (k in nbt) pushList(nbt[k]);
	}
	if (!lists.length) {
		deepCollectItemStacks(nbt, lists, 0, new WeakSet());
	}
	/** @type {NonNullable<ReturnType<typeof normalizeItemStack>>[]} */
	const out = [];
	for (const raw of lists) {
		const n = normalizeItemStack(raw, opts);
		if (n) out.push(itemSchemas.length ? upgradeItemStack(n, itemSchemas) : n);
	}
	return out;
}
/**
 * Crafter disabled slots from block-entity NBT (int array or bitmask).
 * @param {any} blockEntity
 * @returns {Set<number>}
 */
export function parseDisabledSlots(blockEntity) {
	/** @type {Set<number>} */
	const disabled = new Set();
	if (!blockEntity || typeof blockEntity !== "object") return disabled;
	const raw =
		blockEntity.disabled_slots
		?? blockEntity.disabledSlots
		?? blockEntity.DisabledSlots
		?? null;
	if (raw == null) return disabled;
	if (Array.isArray(raw) || ArrayBuffer.isView(raw)) {
		for (const v of raw) {
			const n = Number(v);
			if (Number.isFinite(n) && n >= 0 && n < 9) disabled.add(n);
		}
		return disabled;
	}
	if (typeof raw === "object" && Array.isArray(raw.value)) {
		for (const v of raw.value) {
			const n = Number(v);
			if (Number.isFinite(n) && n >= 0 && n < 9) disabled.add(n);
		}
		return disabled;
	}
	const mask = Number(raw);
	if (Number.isFinite(mask) && mask > 0) {
		for (let i = 0; i < 9; i++) {
			if (mask & (1 << i)) disabled.add(i);
		}
	}
	return disabled;
}
/**
 * Coerce NBT / state flag to boolean. Unknown values are null.
 * @param {unknown} v
 * @returns {boolean|null}
 */
export function nbtBool(v) {
	if (v === true || v === 1 || v === "1" || v === "true") return true;
	if (v === false || v === 0 || v === "0" || v === "false") return false;
	return null;
}
