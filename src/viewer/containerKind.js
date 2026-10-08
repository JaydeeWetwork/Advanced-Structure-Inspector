/** Container kind, slot plan, and item labels for the inspect mockup. */
/**
 * @typedef {{ name: string, count: number, slot: number|null, damage: number|null }} ItemStack
 */
/**
 * Pretty label for an item id.
 * @param {string} name
 */
export function formatItemLabel(name) {
	const n = String(name || "item").replace(/^minecraft:/, "");
	return n
		.split(/[._]/)
		.map(w => (w ? w[0].toUpperCase() + w.slice(1) : w))
		.join(" ");
}
/**
 * Short label that fits a slot.
 * @param {string} name
 */
export function shortItemLabel(name) {
	const full = formatItemLabel(name);
	if (full.length <= 10) return full;
	const parts = full.split(" ");
	if (parts.length >= 2) {
		const a = parts[0].slice(0, 4);
		const b = parts[parts.length - 1].slice(0, 4);
		return `${a}…${b}`;
	}
	return full.slice(0, 9) + "…";
}
/**
 * Resolve container UI kind from block/entity name + block entity id.
 * @param {{ name?: string, blockEntityId?: string|null, identifier?: string, doubleChest?: { half?: string }|null }} src
 * @returns {string}
 */
export function resolveContainerKind(src) {
	const be = String(src.blockEntityId || "").replace(/^minecraft:/, "");
	const name = String(src.name || src.identifier || "").replace(/^minecraft:/, "").toLowerCase();
	const id = (be || name).toLowerCase();
	// Minecarts first (names contain chest/hopper)
	if (id === "hopper_minecart" || id === "minecart_hopper" || (name.includes("hopper") && name.includes("minecart"))) {
		return "hopper_minecart";
	}
	if (id === "chest_minecart" || id === "minecart_chest" || (name.includes("chest") && name.includes("minecart"))) {
		return "chest_minecart";
	}
	if (id === "barrel" || name === "barrel") return "barrel";
	if (id === "shulkerbox" || name.includes("shulker")) return "shulker";
	if (id === "hopper" || name === "hopper") return "hopper";
	if (id === "dropper" || name === "dropper") return "dropper";
	if (id === "dispenser" || name === "dispenser") return "dispenser";
	// Block-entity id is ChiseledBookshelf (no underscore). Plain bookshelf is not a container.
	if (id === "chiseledbookshelf" || name === "chiseled_bookshelf") return "chiseled_bookshelf";
	if (id === "crafter" || name === "crafter") return "crafter";
	if (id === "furnace" || name === "furnace") return "furnace";
	if (id === "blastfurnace" || name === "blast_furnace") return "blast_furnace";
	if (id === "smoker" || name === "smoker") return "smoker";
	if (id === "brewingstand" || name === "brewing_stand") return "brewing";
	if (id === "composter" || name === "composter") return "composter";
	if (id === "lectern" || name === "lectern") return "lectern";
	if (id === "sign" || id === "hangingsign" || name.includes("sign")) return "sign";
	if (id === "enderchest" || name === "ender_chest" || name.includes("ender_chest")) return "ender_chest";
	if (src.doubleChest) return "double_chest";
	if (id === "trappedchest" || name.includes("trapped_chest") || name.includes("trappedchest")) return "chest";
	if (id === "chest" || name === "chest" || name.endsWith("_chest") || name.includes("chest")) return "chest";
	// Redstone wire — power readout, no inventory
	if (name === "redstone_wire" || name === "redstone_dust") return "redstone_wire";
	return "generic";
}
/**
 * Slot layout config per kind.
 * @param {string} kind
 * @returns {{ title: string, rows: number, cols: number, slotCount: number, layout: "grid"|"furnace"|"brewing"|"hopper"|"composter"|"double_chest", resultSlot?: boolean }}
 */
export function layoutForKind(kind) {
	switch (kind) {
		case "double_chest":
			return { title: kindTitle(kind), rows: 6, cols: 9, slotCount: 54, layout: "double_chest" };
		case "chest":
		case "barrel":
		case "shulker":
		case "ender_chest":
		case "chest_minecart":
			return { title: kindTitle(kind), rows: 3, cols: 9, slotCount: 27, layout: "grid" };
		case "hopper":
		case "hopper_minecart":
			return { title: kindTitle(kind), rows: 1, cols: 5, slotCount: 5, layout: "hopper" };
		case "dropper":
		case "dispenser":
			return { title: kindTitle(kind), rows: 3, cols: 3, slotCount: 9, layout: "grid" };
		case "chiseled_bookshelf":
			// Face slots: 0–2 top, 3–5 bottom (books_stored bits 1, 2, 4, 8, 16, 32).
			return { title: kindTitle(kind), rows: 2, cols: 3, slotCount: 6, layout: "grid" };
		case "crafter":
			return { title: "Crafter", rows: 3, cols: 3, slotCount: 9, layout: "grid", resultSlot: true };
		case "furnace":
		case "blast_furnace":
		case "smoker":
			return { title: kindTitle(kind), rows: 1, cols: 3, slotCount: 3, layout: "furnace" };
		case "brewing":
			// 5 slots: 0–2 bottles, 3 ingredient, 4 fuel (Bedrock/Java)
			return { title: "Brewing Stand", rows: 1, cols: 5, slotCount: 5, layout: "brewing" };
		case "composter":
			// No inventory slots — fill level is a block state
			return { title: "Composter", rows: 0, cols: 0, slotCount: 0, layout: "composter" };
		case "sign":
			return { title: "Sign", rows: 0, cols: 0, slotCount: 0, layout: "sign" };
		case "lectern":
			return { title: "Lectern", rows: 0, cols: 0, slotCount: 0, layout: "lectern" };
		case "redstone_wire":
			return { title: "Redstone Dust", rows: 0, cols: 0, slotCount: 0, layout: "redstone" };
		default:
			return { title: "Container", rows: 3, cols: 9, slotCount: 27, layout: "grid" };
	}
}
function kindTitle(kind) {
	const map = {
		chest: "Chest",
		double_chest: "Large Chest",
		barrel: "Barrel",
		shulker: "Shulker Box",
		ender_chest: "Ender Chest",
		hopper: "Hopper",
		hopper_minecart: "Minecart with Hopper",
		chest_minecart: "Minecart with Chest",
		dropper: "Dropper",
		dispenser: "Dispenser",
		chiseled_bookshelf: "Chiseled Bookshelf",
		crafter: "Crafter",
		furnace: "Furnace",
		blast_furnace: "Blast Furnace",
		smoker: "Smoker",
		brewing: "Brewing Stand",
		composter: "Composter",
		sign: "Sign",
		lectern: "Lectern",
		redstone_wire: "Redstone Dust"
	};
	return map[kind] || "Container";
}
/**
 * Read Bedrock/Java composter fill level (0–8) from block states.
 * Bedrock: composter_fill_level · Java: level
 * @param {Record<string, unknown>|null|undefined} states
 * @returns {number|null}
 */
export function readComposterFillLevel(states) {
	if (!states || typeof states !== "object") return null;
	const raw =
		states.composter_fill_level
		?? states.composterFillLevel
		?? states.level
		?? states.FillLevel
		?? null;
	if (raw == null || raw === "") return null;
	const n = Number(raw);
	if (!Number.isFinite(n)) return null;
	return Math.max(0, Math.min(8, Math.round(n)));
}
/**
 * Map items into fixed slots.
 * @param {ItemStack[]} items
 * @param {number} slotCount
 * @returns {(ItemStack|null)[]}
 */
export function fillSlots(items, slotCount) {
	/** @type {(ItemStack|null)[]} */
	const slots = Array.from({ length: slotCount }, () => null);
	const list = Array.isArray(items) ? items : [];
	let auto = 0;
	for (const it of list) {
		if (!it) continue;
		let s = it.slot;
		if (s == null || !Number.isFinite(s) || s < 0 || s >= slotCount) {
			// place in next free
			while (auto < slotCount && slots[auto]) auto++;
			if (auto >= slotCount) continue;
			s = auto++;
		}
		slots[s] = it;
	}
	return slots;
}
