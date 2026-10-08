/** Minecraft-style container inventory mockups. */
import { largeChestTitle } from "./doubleChest.js";
import { describeSignPlacement } from "./signPlacement.js";
import { formatInspectLocation } from "./inspectPos.js";
import {
	fillSlots,
	formatItemLabel,
	layoutForKind,
	readComposterFillLevel,
	resolveContainerKind,
	shortItemLabel
} from "./containerKind.js";
import {
	renderBrewingLayout,
	renderComposterLayout,
	renderDoubleChestLayout,
	renderFurnaceLayout,
	renderLecternLayout,
	renderOneSlot,
	renderRedstoneLayout,
	renderSignLayout,
	renderSlotGrid
} from "./containerLayouts.js";
export { parseDisabledSlots } from "./inspectStructure.js";
export {
	fillSlots,
	formatItemLabel,
	layoutForKind,
	readComposterFillLevel,
	resolveContainerKind,
	shortItemLabel
} from "./containerKind.js";
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
	let lockedHint = "";
	/** @type {Record<string, unknown>|null} */
	let blockStates = null;
	if (hit.kind === "block" && hit.block) {
		const b = hit.block;
		titleSource = {
			name: b.name,
			blockEntityId: b.blockEntityId,
			doubleChest: b.doubleChest || null
		};
		blockStates = b.states && typeof b.states === "object" ? b.states : null;
		items = b.doubleChest && Array.isArray(b.doubleItems) ? b.doubleItems : (b.items || []);
		if (String(b.name || "").replace(/^minecraft:/, "") === "hopper") {
			const tb = b.states?.toggle_bit;
			const locked = tb === true || tb === 1 || tb === "1" || tb === "true";
			lockedHint = locked ? "Locked (powered)" : "Unlocked";
		}
	} else if (hit.kind === "entity" && hit.entity) {
		const e = hit.entity;
		titleSource = { name: e.identifier, identifier: e.identifier };
		items = e.items || [];
		if (String(e.identifier || "").includes("hopper") && e.enabled != null) {
			lockedHint = e.enabled ? "Enabled" : "Disabled (locked)";
		}
	} else {
		root.classList.add("mc-inv-empty");
		root.textContent = "Nothing selected";
		return root;
	}
	const kind = resolveContainerKind(titleSource);
	const layout = layoutForKind(kind);
	if (kind === "double_chest") {
		layout.title = largeChestTitle(titleSource.name);
	}
	const disabled = kind === "crafter"
		? new Set(hit.kind === "block" ? (hit.block?.disabledSlots ?? []) : [])
		: new Set();
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
	if (kind === "double_chest") {
		root.classList.add("double-chest");
		const half = hit.block?.doubleChest?.half;
		if (half === "left" || half === "right") {
			const halfBadge = document.createElement("span");
			halfBadge.className = "mc-inv-badge";
			halfBadge.textContent = half === "left" ? "Left" : "Right";
			halfBadge.title = "Half you clicked (same 54-slot inventory either side)";
			header.appendChild(halfBadge);
		}
	}
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
	const loc = formatInspectLocation(hit);
	if (loc) {
		const locEl = document.createElement("div");
		locEl.className = "mc-inv-location";
		locEl.textContent = loc;
		root.appendChild(locEl);
	}
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
		body.appendChild(renderSignLayout(hit.kind === "block" ? hit.block : null));
	} else if (layout.layout === "lectern") {
		body.appendChild(renderLecternLayout(hit.kind === "block" ? hit.block : null));
	} else if (layout.layout === "redstone") {
		body.appendChild(renderRedstoneLayout(blockStates));
	} else if (layout.layout === "double_chest") {
		body.appendChild(renderDoubleChestLayout(slots));
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
			void import("./itemIconLoader.js")
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
		console.warn("[bLayers] crafter recipe match failed", e);
	}
}
