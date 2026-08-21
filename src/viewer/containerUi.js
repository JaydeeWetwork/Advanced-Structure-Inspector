/**
 * Minecraft-style container inventory mockups (slots + items only).
 */

import {
	extractInventoryItems,
	extractSignText,
	extractLecternBook,
	readRedstoneSignal
} from "./inspectStructure.js";
import { describeSignPlacement } from "./signPlacement.js";

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
 * @param {{ name?: string, blockEntityId?: string|null, identifier?: string }} src
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
	if (id === "crafter" || name === "crafter") return "crafter";
	if (id === "furnace" || name === "furnace") return "furnace";
	if (id === "blastfurnace" || name === "blast_furnace") return "blast_furnace";
	if (id === "smoker" || name === "smoker") return "smoker";
	if (id === "brewingstand" || name === "brewing_stand") return "brewing";
	if (id === "composter" || name === "composter") return "composter";
	if (id === "lectern" || name === "lectern") return "lectern";
	if (id === "sign" || id === "hangingsign" || name.includes("sign")) return "sign";
	if (id === "enderchest" || name === "ender_chest" || name.includes("ender_chest")) return "ender_chest";
	if (id === "trappedchest" || name.includes("trapped_chest") || name.includes("trappedchest")) return "chest";
	if (id === "chest" || name === "chest" || name.endsWith("_chest") || name.includes("chest")) return "chest";
	// Redstone wire — power readout, no inventory
	if (name === "redstone_wire" || name === "redstone_dust") return "redstone_wire";
	return "generic";
}

/**
 * Slot layout config per kind.
 * @param {string} kind
 * @returns {{ title: string, rows: number, cols: number, slotCount: number, layout: "grid"|"furnace"|"brewing"|"hopper"|"composter", resultSlot?: boolean }}
 */
export function layoutForKind(kind) {
	switch (kind) {
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
		barrel: "Barrel",
		shulker: "Shulker Box",
		ender_chest: "Ender Chest",
		hopper: "Hopper",
		hopper_minecart: "Minecart with Hopper",
		chest_minecart: "Minecart with Chest",
		dropper: "Dropper",
		dispenser: "Dispenser",
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
 * Parse crafter disabled slots from block entity.
 * Bedrock/Java may store as int array of slot indexes or a bitmask.
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

	// Int array of slot indexes
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
	// Bitmask integer (bit i = slot i disabled)
	const mask = Number(raw);
	if (Number.isFinite(mask) && mask > 0) {
		for (let i = 0; i < 9; i++) {
			if (mask & (1 << i)) disabled.add(i);
		}
	}
	return disabled;
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

/**
 * Build a DOM node for the inventory mockup (no pos/states).
 * @param {{
 *   kind: "block"|"entity",
 *   block?: any,
 *   entity?: any
 * }} hit
 * @returns {HTMLElement}
 */
export function renderContainerUi(hit) {
	const root = document.createElement("div");
	root.className = "mc-inv";

	if (!hit || hit.kind === "miss") {
		root.classList.add("mc-inv-empty");
		root.textContent = "Nothing selected";
		return root;
	}

	let titleSource = {};
	/** @type {ItemStack[]} */
	let items = [];
	/** @type {any} */
	let blockEntity = null;
	let lockedHint = "";

	/** @type {Record<string, unknown>|null} */
	let blockStates = null;

	if (hit.kind === "block" && hit.block) {
		const b = hit.block;
		titleSource = { name: b.name, blockEntityId: b.blockEntityId };
		// Prefer live re-parse from block entity NBT so we pick up nested shapes
		const fromBe = b.blockEntity ? extractInventoryItems(b.blockEntity) : [];
		items = fromBe.length ? fromBe : (b.items || []);
		blockEntity = b.blockEntity;
		blockStates = b.states && typeof b.states === "object" ? b.states : null;
		// Hopper lock from block states (Bedrock: toggle_bit)
		if (String(b.name || "").replace(/^minecraft:/, "") === "hopper") {
			const tb = b.states?.toggle_bit;
			const locked = tb === true || tb === 1 || tb === "1" || tb === "true";
			lockedHint = locked ? "Locked (powered)" : "Unlocked";
		}
	} else if (hit.kind === "entity" && hit.entity) {
		const e = hit.entity;
		titleSource = { name: e.identifier, identifier: e.identifier };
		// Always re-parse from raw entity NBT (hopper/chest minecart Items, nested forms)
		const raw = e.raw || e;
		const fromRaw = extractInventoryItems(raw);
		items = fromRaw.length ? fromRaw : (e.items || []);
		// Hopper minecart enable flag if present
		const en = raw.Enabled ?? raw.enabled;
		if (String(e.identifier || "").includes("hopper") && en != null) {
			const on = en === true || en === 1 || en === "1";
			lockedHint = on ? "Enabled" : "Disabled (locked)";
		}
	} else {
		root.classList.add("mc-inv-empty");
		root.textContent = "Nothing selected";
		return root;
	}

	const kind = resolveContainerKind(titleSource);
	const layout = layoutForKind(kind);
	const disabled = kind === "crafter" ? parseDisabledSlots(blockEntity) : new Set();
	const slots = fillSlots(items, layout.slotCount);

	// Composter fill badge (Bedrock: composter_fill_level 0–8)
	let compostHint = "";
	if (kind === "composter") {
		const lvl = readComposterFillLevel(blockStates);
		if (lvl != null) {
			compostHint = lvl === 0 ? "Empty (0/8)" : lvl === 8 ? "Full (8/8) · ready" : `Fill ${lvl}/8`;
		} else {
			compostHint = "Fill unknown";
		}
	}

	const header = document.createElement("div");
	header.className = "mc-inv-header";
	const title = document.createElement("span");
	title.className = "mc-inv-title";
	title.textContent = layout.title;
	if (kind === "sign" && hit.kind === "block" && hit.block) {
		const d = describeSignPlacement(hit.block, hit.block.name);
		title.textContent = `Sign · ${d.kind}`;
	}
	header.appendChild(title);
	const badgeText = lockedHint || compostHint;
	if (badgeText) {
		const badge = document.createElement("span");
		const isLock =
			lockedHint
			&& (lockedHint.toLowerCase().includes("lock") || lockedHint.includes("Disabled"));
		const isFull = compostHint.includes("Full");
		badge.className =
			"mc-inv-badge"
			+ (isLock ? " locked" : "")
			+ (isFull ? " ready" : "");
		badge.textContent = badgeText;
		header.appendChild(badge);
	}
	const close = document.createElement("button");
	close.type = "button";
	close.className = "mc-inv-close";
	close.setAttribute("aria-label", "Close");
	close.textContent = "×";
	close.dataset.action = "close-inspect";
	header.appendChild(close);
	root.appendChild(header);

	const body = document.createElement("div");
	body.className = "mc-inv-body";

	/** @type {HTMLElement|null} */
	let crafterResultSlot = null;

	if (layout.layout === "furnace") {
		body.appendChild(renderFurnaceLayout(slots));
	} else if (layout.layout === "brewing") {
		body.appendChild(renderBrewingLayout(slots));
	} else if (layout.layout === "hopper") {
		body.appendChild(renderSlotGrid(slots, 1, 5, disabled, "hopper"));
	} else if (layout.layout === "composter") {
		body.appendChild(renderComposterLayout(blockStates));
	} else if (layout.layout === "sign") {
		body.appendChild(renderSignLayout(blockEntity, hit.kind === "block" ? hit.block : null));
	} else if (layout.layout === "lectern") {
		body.appendChild(renderLecternLayout(blockEntity));
	} else if (layout.layout === "redstone") {
		body.appendChild(renderRedstoneLayout(blockStates));
	} else {
		const gridWrap = document.createElement("div");
		gridWrap.className = "mc-inv-row-wrap";
		gridWrap.appendChild(renderSlotGrid(slots, layout.rows, layout.cols, disabled, kind));
		if (layout.resultSlot) {
			const arrow = document.createElement("div");
			arrow.className = "mc-inv-arrow";
			arrow.textContent = "→";
			gridWrap.appendChild(arrow);
			// Crafter: fill via recipe match (sync builtin, then CDN refresh)
			crafterResultSlot = renderOneSlot(null, false, "result");
			crafterResultSlot.dataset.craftResult = "1";
			gridWrap.appendChild(crafterResultSlot);
		}
		body.appendChild(gridWrap);
	}

	root.appendChild(body);

	// No footer line under inventory mockups (slots + counts only)

	// Crafter recipe → result slot
	if (kind === "crafter" && crafterResultSlot) {
		root.dataset.kind = "crafter";
		void applyCrafterResult(root, crafterResultSlot, slots, disabled);
	}

	return root;
}

/**
 * Detect craftable output for a crafter grid and paint the result slot.
 * @param {HTMLElement} root
 * @param {HTMLElement} resultSlot
 * @param {(ItemStack|null)[]} slots
 * @param {Set<number>} disabled
 */
async function applyCrafterResult(root, resultSlot, slots, disabled) {
	try {
		const { matchCrafterOutput, ensureCdnRecipes } = await import("./craftRecipe.js");
		const paint = result => {
			resultSlot.replaceChildren();
			if (!result) {
				resultSlot.classList.remove("filled");
				resultSlot.title = "No matching recipe";
				const empty = document.createElement("span");
				empty.className = "mc-slot-name";
				empty.textContent = "—";
				resultSlot.appendChild(empty);
				return;
			}
			resultSlot.classList.add("filled");
			// rebuild slot contents
			const img = document.createElement("img");
			img.className = "mc-slot-icon";
			img.alt = "";
			img.decoding = "async";
			img.draggable = false;
			img.dataset.itemIcon = String(result.item).replace(/^minecraft:/i, "");
			img.style.cssText =
				"position:absolute;left:50%;top:50%;right:auto;bottom:auto;"
				+ "transform:translate(-50%,-50%);width:32px;height:32px;"
				+ "margin:0;padding:0;border:none;display:block;object-fit:contain";
			resultSlot.appendChild(img);
			const label = document.createElement("span");
			label.className = "mc-slot-name";
			label.textContent = shortItemLabel(result.item);
			label.title = formatItemLabel(result.item);
			resultSlot.appendChild(label);
			if (result.count > 1) {
				const c = document.createElement("span");
				c.className = "mc-slot-count";
				c.textContent = String(result.count);
				resultSlot.appendChild(c);
			}
			resultSlot.title = `${formatItemLabel(result.item)} × ${result.count} (crafted)`;
			// load icon
			void import("./itemIconLoader.js?v=judo17")
				.then(m => m.hydrateInventoryIcons(resultSlot))
				.catch(() => {});
		};

		// Instant match from builtin recipes
		paint(matchCrafterOutput(slots, disabled));
		// Enrich with CDN vanilla recipes, re-match once
		await ensureCdnRecipes();
		if (!root.isConnected) return;
		paint(matchCrafterOutput(slots, disabled));
	} catch (e) {
		console.warn("[sdb] crafter recipe match failed", e);
	}
}

/**
 * @param {(ItemStack|null)[]} slots
 * @param {number} rows
 * @param {number} cols
 * @param {Set<number>} disabled
 * @param {string} kind
 */
function renderSlotGrid(slots, rows, cols, disabled, kind) {
	const grid = document.createElement("div");
	grid.className = `mc-inv-grid cols-${cols}`;
	grid.style.setProperty("--mc-cols", String(cols));
	const n = rows * cols;
	for (let i = 0; i < n; i++) {
		grid.appendChild(renderOneSlot(slots[i] ?? null, disabled.has(i), kind));
	}
	return grid;
}

/**
 * @param {ItemStack|null} item
 * @param {boolean} blocked
 * @param {string} [extraClass]
 */
function renderOneSlot(item, blocked, extraClass = "") {
	const slot = document.createElement("div");
	slot.className = "mc-slot" + (blocked ? " blocked" : "") + (item ? " filled" : "") + (extraClass ? ` ${extraClass}` : "");
	if (blocked) {
		const x = document.createElement("span");
		x.className = "mc-slot-block-mark";
		x.textContent = "✕";
		slot.appendChild(x);
		slot.title = "Disabled slot";
		return slot;
	}
	if (item) {
		const bare = String(item.name || "").replace(/^minecraft:/i, "");
		// Icon filled async by hydrateInventoryIcons (Bedrock samples)
		const img = document.createElement("img");
		img.className = "mc-slot-icon";
		img.alt = "";
		img.decoding = "async";
		img.draggable = false;
		img.dataset.itemIcon = bare;
		// Pre-center so layout is correct before/as the image loads
		img.style.cssText =
			"position:absolute;left:50%;top:50%;right:auto;bottom:auto;"
			+ "transform:translate(-50%,-50%);width:32px;height:32px;"
			+ "margin:0;padding:0;border:none;display:block;object-fit:contain";
		slot.appendChild(img);

		// Text fallback until icon loads (or if missing)
		const label = document.createElement("span");
		label.className = "mc-slot-name";
		label.textContent = shortItemLabel(item.name);
		label.title = formatItemLabel(item.name);
		slot.appendChild(label);
		if (item.count > 1) {
			const c = document.createElement("span");
			c.className = "mc-slot-count";
			c.textContent = String(item.count);
			slot.appendChild(c);
		}
		slot.title = `${formatItemLabel(item.name)} × ${item.count}`;
	}
	return slot;
}

/** @param {(ItemStack|null)[]} slots */
function renderFurnaceLayout(slots) {
	const wrap = document.createElement("div");
	wrap.className = "mc-inv-furnace";
	const col = document.createElement("div");
	col.className = "mc-inv-furnace-col";
	// slot 0 input, 1 fuel, 2 result (Bedrock convention often 0=input 1=fuel 2=result)
	const input = renderOneSlot(slots[0] ?? null, false, "furnace-in");
	const fuel = renderOneSlot(slots[1] ?? null, false, "furnace-fuel");
	const flame = document.createElement("div");
	flame.className = "mc-inv-flame";
	flame.textContent = "▲";
	col.appendChild(input);
	col.appendChild(flame);
	col.appendChild(fuel);
	const arrow = document.createElement("div");
	arrow.className = "mc-inv-arrow";
	arrow.textContent = "→";
	const out = renderOneSlot(slots[2] ?? null, false, "furnace-out");
	wrap.appendChild(col);
	wrap.appendChild(arrow);
	wrap.appendChild(out);
	return wrap;
}

/**
 * Minecraft brewing stand layout:
 *   [Fuel]     [Ingredient]
 *        ↘ bubbles ↙
 *   [Bottle] [Bottle] [Bottle]
 * Slots: 0–2 bottles, 3 ingredient, 4 fuel (Java/Bedrock).
 * @param {(ItemStack|null)[]} slots
 */
function renderBrewingLayout(slots) {
	const wrap = document.createElement("div");
	wrap.className = "mc-inv-brewing";

	// Top row: fuel (left) + ingredient (center)
	const top = document.createElement("div");
	top.className = "mc-inv-brewing-top";

	const fuelCol = document.createElement("div");
	fuelCol.className = "mc-inv-brewing-col";
	const fuelLabel = document.createElement("span");
	fuelLabel.className = "mc-inv-slot-label";
	fuelLabel.textContent = "Fuel";
	fuelCol.append(fuelLabel, renderOneSlot(slots[4] ?? null, false, "brew-fuel"));

	const ingCol = document.createElement("div");
	ingCol.className = "mc-inv-brewing-col";
	const ingLabel = document.createElement("span");
	ingLabel.className = "mc-inv-slot-label";
	ingLabel.textContent = "Ingredient";
	ingCol.append(ingLabel, renderOneSlot(slots[3] ?? null, false, "brew-ingredient"));

	// Spacer keeps fuel left-ish, ingredient centered over bottles
	const topSpacer = document.createElement("div");
	topSpacer.className = "mc-inv-brewing-top-spacer";
	top.append(fuelCol, topSpacer, ingCol);

	const mid = document.createElement("div");
	mid.className = "mc-inv-brewing-mid";
	mid.setAttribute("aria-hidden", "true");
	mid.textContent = "↓";

	// Bottom: three potion bottles
	const bottles = document.createElement("div");
	bottles.className = "mc-inv-brewing-bottles";
	for (let i = 0; i < 3; i++) {
		const col = document.createElement("div");
		col.className = "mc-inv-brewing-col";
		const lab = document.createElement("span");
		lab.className = "mc-inv-slot-label";
		lab.textContent = "Bottle";
		col.append(renderOneSlot(slots[i] ?? null, false, `brew-bottle-${i}`), lab);
		bottles.appendChild(col);
	}

	wrap.append(top, mid, bottles);
	return wrap;
}

/**
 * Composter inspect: visual fill 0–8 from block state.
 * @param {Record<string, unknown>|null|undefined} states
 */
function renderComposterLayout(states) {
	const wrap = document.createElement("div");
	wrap.className = "mc-inv-composter";

	const level = readComposterFillLevel(states);
	const known = level != null;
	const fill = known ? level : 0;

	const barrel = document.createElement("div");
	barrel.className = "mc-composter-barrel";
	barrel.setAttribute("role", "img");
	barrel.setAttribute(
		"aria-label",
		known ? `Composter fill level ${fill} of 8` : "Composter fill level unknown"
	);

	// 8 fill steps from bottom (level 1..8); level 0 empty
	const layers = document.createElement("div");
	layers.className = "mc-composter-layers";
	for (let step = 1; step <= 8; step++) {
		const layer = document.createElement("div");
		layer.className =
			"mc-composter-layer"
			+ (known && fill >= step ? " is-filled" : "")
			+ (known && fill === 8 && step === 8 ? " is-ready" : "");
		layer.title = `Level ${step}`;
		layers.appendChild(layer);
	}
	barrel.appendChild(layers);

	const rim = document.createElement("div");
	rim.className = "mc-composter-rim";
	barrel.appendChild(rim);

	const readout = document.createElement("div");
	readout.className = "mc-composter-readout";
	if (known) {
		readout.textContent =
			fill === 0
				? "Empty · 0 / 8"
				: fill === 8
					? "Full · 8 / 8 · bone meal ready"
					: `Fill level · ${fill} / 8`;
	} else {
		readout.textContent = "Fill level not in structure data";
	}

	wrap.append(barrel, readout);
	return wrap;
}

/**
 * Sign face text panel + placement dump for overlay QA.
 * @param {any} blockEntity
 * @param {import("./inspectStructure.js").InspectBlock|null} [block]
 */
function renderSignLayout(blockEntity, block = null) {
	const wrap = document.createElement("div");
	wrap.className = "mc-inv-text-panel mc-inv-sign";
	const data = extractSignText(blockEntity);
	if (!data) {
		wrap.textContent = "No sign text in block entity.";
		return wrap;
	}

	if (block) {
		wrap.appendChild(renderSignPlacementDump(block));
	}

	const addFace = (label, face) => {
		const sec = document.createElement("div");
		sec.className = "mc-text-face";
		const h = document.createElement("div");
		h.className = "mc-text-face-label";
		const bits = [label];
		if (face.glowing) bits.push("glowing");
		if (face.color != null) bits.push(`argb=${face.color >>> 0}`);
		h.textContent = bits.join(" · ");
		sec.appendChild(h);
		const pre = document.createElement("pre");
		pre.className = "mc-text-lines";
		pre.textContent = (face.lines.length ? face.lines : ["(blank)"]).join("\n");
		if (face.color != null) {
			const c = face.color >>> 0;
			const r = (c >> 16) & 0xff;
			const g = (c >> 8) & 0xff;
			const b = c & 0xff;
			if (!(r === 0 && g === 0 && b === 0)) {
				pre.style.color = `rgb(${r},${g},${b})`;
			}
		}
		sec.appendChild(pre);
		wrap.appendChild(sec);
	};

	addFace("Front", data.front);
	addFace("Back", data.back);
	if (data.waxed) {
		const w = document.createElement("div");
		w.className = "mc-text-meta";
		w.textContent = "Waxed";
		wrap.appendChild(w);
	}
	return wrap;
}

/**
 * @param {import("./inspectStructure.js").InspectBlock} block
 */
function renderSignPlacementDump(block) {
	const desc = describeSignPlacement(block, block.name);
	const box = document.createElement("pre");
	box.className = "mc-sign-debug";
	const st = Object.entries(desc.states)
		.map(([k, v]) => `${k}=${v}`)
		.join(" ");
	const f = desc.front;
	const b = desc.back;
	box.textContent = [
		`${desc.kind} ${desc.wood}  ${desc.facing}`,
		`cell ${desc.pos.x},${desc.pos.y},${desc.pos.z}  euler ${desc.eulerDeg.join(",")}`,
		st ? `states ${st}` : "states (none)",
		`board three ${desc.boardThree.join(",")}`,
		`F side=${f.side} localZ=${f.localZ} three=${f.three.join(",")}`,
		`B side=${b.side} localZ=${b.localZ} three=${b.three.join(",")}`,
		"3D: green L / red R — L should be on your left when facing that side."
	].join("\n");
	return box;
}

/**
 * Lectern book reader panel.
 * @param {any} blockEntity
 */
function renderLecternLayout(blockEntity) {
	const wrap = document.createElement("div");
	wrap.className = "mc-inv-text-panel mc-inv-lectern";
	const data = extractLecternBook(blockEntity);
	if (!data) {
		wrap.textContent = "No lectern data.";
		return wrap;
	}
	if (!data.hasBook) {
		wrap.textContent = "Lectern is empty (no book).";
		return wrap;
	}

	const meta = document.createElement("div");
	meta.className = "mc-text-meta";
	const bk = data.book;
	const bits = [];
	bits.push(bk?.itemName || "book");
	if (bk?.title) bits.push(`“${bk.title}”`);
	if (bk?.author) bits.push(`by ${bk.author}`);
	bits.push(`page ${data.page + 1}/${Math.max(data.totalPages || bk?.pages?.length || 1, 1)}`);
	meta.textContent = bits.join(" · ");
	wrap.appendChild(meta);

	const pre = document.createElement("pre");
	pre.className = "mc-text-lines mc-book-page";
	if (bk?.pages?.length) {
		const idx = Math.max(0, Math.min(data.page, bk.pages.length - 1));
		pre.textContent = bk.pages[idx] || "(empty page)";
		if (bk.pages.length > 1) {
			const all = document.createElement("details");
			all.className = "mc-book-all";
			const sum = document.createElement("summary");
			sum.textContent = `All ${bk.pages.length} pages`;
			all.appendChild(sum);
			bk.pages.forEach((p, i) => {
				const pg = document.createElement("pre");
				pg.className = "mc-text-lines mc-book-page";
				pg.textContent = `— ${i + 1} —\n${p || "(empty)"}`;
				all.appendChild(pg);
			});
			wrap.append(pre, all);
			return wrap;
		}
	} else {
		pre.textContent =
			"Book present but no page text in NBT "
			+ "(empty writable book, or pages not stored in this structure).";
	}
	wrap.appendChild(pre);
	return wrap;
}

/**
 * Redstone power meter from block states.
 * @param {Record<string, unknown>|null|undefined} states
 */
function renderRedstoneLayout(states) {
	const wrap = document.createElement("div");
	wrap.className = "mc-inv-text-panel mc-inv-redstone";
	const power = readRedstoneSignal(states);
	const label = document.createElement("div");
	label.className = "mc-text-meta";
	label.textContent =
		power == null
			? "redstone_signal not present on this block"
			: `Power ${power} / 15`;
	wrap.appendChild(label);

	const bar = document.createElement("div");
	bar.className = "mc-rs-bar";
	bar.setAttribute("role", "meter");
	bar.setAttribute("aria-valuemin", "0");
	bar.setAttribute("aria-valuemax", "15");
	bar.setAttribute("aria-valuenow", String(power ?? 0));
	for (let i = 0; i < 15; i++) {
		const cell = document.createElement("div");
		cell.className = "mc-rs-cell" + (power != null && power > i ? " on" : "");
		// Approximate Bedrock dust brightness
		const t = (i + 1) / 15;
		const r = Math.round(77 + (255 - 77) * t);
		const g = Math.round(0 + 51 * t);
		cell.style.setProperty("--rs", `rgb(${r},${g},0)`);
		bar.appendChild(cell);
	}
	wrap.appendChild(bar);
	return wrap;
}

