/**
 * Build click-inspect data from .mcstructure NBT (blocks + inventories + entities).
 *
 * Performance: only indexes block-entity positions (chests, frames, signs, …),
 * not every solid cell. Pick falls back to palette for plain blocks.
 */

import { describeSignPlacement } from "./signPlacement.js";
import { upgradeItemStack } from "./itemUpgrade.js";
import { linkInspectDoubleChests } from "./doubleChest.js";

/**
 * @param {unknown} v
 * @returns {number[]}
 */
function toNums(v) {
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
function stripNs(id) {
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
function coerceStringId(v) {
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
 * @returns {{ name: string, count: number, slot: number|null, damage: number|null, raw: any }|null}
 */
export function normalizeItemStack(item) {
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
		});
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

	return {
		name: stripNs(name),
		count: Number.isFinite(count) && count > 0 ? count : 1,
		slot: Number.isFinite(slot) ? slot : null,
		damage: Number.isFinite(damage) ? damage : null,
		raw: item
	};
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
 * @returns {{ name: string, count: number, slot: number|null, damage: number|null, raw: any }[]}
 */
export function extractInventoryItems(nbt, itemSchemas = []) {
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

	/** @type {ReturnType<typeof normalizeItemStack>[]} */
	const out = [];
	for (const raw of lists) {
		const n = normalizeItemStack(raw);
		if (n) out.push(itemSchemas.length ? upgradeItemStack(n, itemSchemas) : n);
	}
	return out;
}

export const CONTAINER_BLOCK_ENTITY_IDS = new Set([
	"Chest",
	"Barrel",
	"Hopper",
	"Dropper",
	"Dispenser",
	"ShulkerBox",
	"Crafter",
	"BrewingStand",
	"Furnace",
	"BlastFurnace",
	"Smoker",
	"TrappedChest",
	"EnderChest",
	"Jukebox",
	"ChiseledBookshelf",
	"DecoratedPot",
	"BrushableBlock",
	"Lectern",
	"Sign",
	"HangingSign",
	"ItemFrame",
	"GlowItemFrame"
]);

/**
 * @param {any} be
 * @returns {any}
 */
function stripBlockEntityCoords(be) {
	if (!be || typeof be !== "object") return be;
	const copy = { ...be };
	delete copy.x;
	delete copy.y;
	delete copy.z;
	return copy;
}

/**
 * @typedef {object} InspectBlock
 * @property {number} x
 * @property {number} y
 * @property {number} z
 * @property {string} name
 * @property {Record<string, unknown>|undefined} states
 * @property {string|null} blockEntityId
 * @property {any|null} blockEntity
 * @property {{ name: string, count: number, slot: number|null, damage: number|null }[]} items
 * @property {string|null} waterlogName
 * @property {{ half: "left"|"right", partnerKey: string }} [doubleChest]
 * @property {{ name: string, count: number, slot: number|null, damage: number|null }[]} [doubleItems]
 */

/**
 * @typedef {object} InspectEntity
 * @property {string} identifier
 * @property {string} rawId
 * @property {[number, number, number]} pos
 * @property {{ name: string, count: number, slot: number|null, damage: number|null }[]} items
 * @property {string|null} customName
 * @property {any} raw
 */

/**
 * @typedef {object} InspectIndex
 * @property {[number, number, number]} size
 * @property {Map<string, InspectBlock>} blocks
 * @property {InspectEntity[]} entities
 * @property {boolean} [sparse] true when only block-entities are indexed
 */

/**
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {string}
 */
export function blockKey(x, y, z) {
	return `${x},${y},${z}`;
}

/**
 * Unpack structure flat index → local x,y,z.
 * @param {number} i
 * @param {number} sy
 * @param {number} sz
 */
function unpackIndex(i, sy, sz) {
	const t = Math.floor(i / sz);
	const z = i % sz;
	const y = t % sy;
	const x = Math.floor(t / sy);
	return [x, y, z];
}

/**
 * Build inspect index from root MCStructure NBT.
 * **Sparse by default**: only block-entity cells (O(BE count)), not full volume.
 * Plain block pick uses mesh palette fallback in InspectRaycaster.
 *
 * @param {any} data
 * @param {{ full?: boolean }} [opts] full=true walks every cell (slow on huge structures)
 * @returns {InspectIndex}
 */
export function buildInspectIndex(data, opts = {}) {
	const sizeArr = toNums(data?.size);
	const sx = sizeArr[0] ?? 0;
	const sy = sizeArr[1] ?? 0;
	const sz = sizeArr[2] ?? 0;
	/** @type {InspectIndex} */
	const index = {
		size: [sx, sy, sz],
		blocks: new Map(),
		entities: [],
		sparse: !opts.full
	};

	const itemSchemas = opts.itemSchemas ?? [];
	const structure = data?.structure;
	if (!structure) return index;

	const palette = structure?.palette?.default?.block_palette ?? [];
	const indices0 = structure?.block_indices?.[0];
	const indices1 = structure?.block_indices?.[1];
	const bpd = structure?.palette?.default?.block_position_data ?? {};

	const origin = toNums(data?.structure_world_origin);
	const ox = origin[0] ?? 0;
	const oy = origin[1] ?? 0;
	const oz = origin[2] ?? 0;

	/**
	 * @param {number} x
	 * @param {number} y
	 * @param {number} z
	 * @param {number} i flat index
	 * @param {any|null} beRaw
	 */
	const addBlock = (x, y, z, i, beRaw) => {
		if (!indices0 || x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz) return;
		const p0 = Number(indices0[i] ?? -1);
		if (p0 < 0 || !(p0 in palette)) return;
		const block = palette[p0];
		const name = stripNs(String(block?.name ?? "unknown"));
		if (name === "air" || name === "unknown") return;

		let waterlogName = null;
		const p1 = indices1 ? Number(indices1[i] ?? -1) : -1;
		if (p1 >= 0 && p1 in palette) {
			const n1 = stripNs(String(palette[p1]?.name ?? ""));
			if (n1 && n1 !== "air") waterlogName = n1;
		}

		let be = null;
		if (beRaw) {
			try {
				be = stripBlockEntityCoords(structuredClone(beRaw));
			} catch {
				be = stripBlockEntityCoords({ ...beRaw });
			}
		}
		const beId = be?.id != null ? String(be.id) : null;
		const items = extractInventoryItems(be, itemSchemas);

		let states;
		if (block?.states && typeof block.states === "object") {
			try {
				states = { ...block.states };
			} catch {
				states = block.states;
			}
			if (!Object.keys(states).length) states = undefined;
		}

		index.blocks.set(blockKey(x, y, z), {
			x,
			y,
			z,
			name,
			states,
			blockEntityId: beId,
			blockEntity: be,
			items,
			waterlogName
		});
	};

	if (opts.full && indices0 && sx > 0 && sy > 0 && sz > 0) {
		// Legacy full walk — only when explicitly requested
		for (let x = 0; x < sx; x++) {
			for (let y = 0; y < sy; y++) {
				for (let z = 0; z < sz; z++) {
					const i = (x * sy + y) * sz + z;
					const beRaw = bpd[i]?.block_entity_data ?? bpd[String(i)]?.block_entity_data ?? null;
					addBlock(x, y, z, i, beRaw);
				}
			}
		}
	} else {
		// Fast path: only cells with block_entity_data
		for (const [k, v] of Object.entries(bpd || {})) {
			const beRaw = v?.block_entity_data ?? null;
			if (!beRaw) continue;
			const i = Number(k);
			let x;
			let y;
			let z;
			if (beRaw.x != null && beRaw.y != null && beRaw.z != null) {
				x = Math.floor(Number(beRaw.x) - ox);
				y = Math.floor(Number(beRaw.y) - oy);
				z = Math.floor(Number(beRaw.z) - oz);
			} else if (Number.isFinite(i) && i >= 0 && sz > 0 && sy > 0) {
				[x, y, z] = unpackIndex(i, sy, sz);
			} else {
				continue;
			}
			const flat =
				Number.isFinite(i) && i >= 0
					? i
					: (x * sy + y) * sz + z;
			addBlock(x, y, z, flat, beRaw);
		}
	}

	const paired = linkInspectDoubleChests(index.blocks, ox, oz);
	if (paired) {
		console.info(`[basi] inspect: ${paired} double-chest halves linked`);
	}

	// Entities (minecarts, etc.)
	const entList = structure.entities;
	const entities = asList(entList);
	for (const ent of entities) {
		if (!ent || typeof ent !== "object") continue;
		const rawId = String(ent.identifier ?? ent.id ?? ent.Identifier ?? "unknown");
		const identifier = stripNs(rawId);
		const posArr = toNums(ent.Pos);
		if (posArr.length < 3) continue;
		const pos = /** @type {[number, number, number]} */ ([
			posArr[0] - ox,
			posArr[1] - oy,
			posArr[2] - oz
		]);
		const customName =
			ent.CustomName
			?? ent.customName
			?? ent.CustomNameRaw
			?? null;
		index.entities.push({
			identifier,
			rawId,
			pos,
			items: extractInventoryItems(ent, itemSchemas),
			customName: customName != null ? String(customName) : null,
			raw: ent
		});
	}

	return index;
}

// —— Sign / lectern / redstone helpers (unchanged API) ——

/**
 * @param {string} raw
 * @returns {string[]}
 */
export function parseSignTextLines(raw) {
	if (raw == null) return [];
	let s = String(raw);
	if (!s.trim()) return [];
	const t = s.trim();
	if (t.startsWith("{") || t.startsWith("[")) {
		try {
			const j = JSON.parse(t);
			const flat = flattenTextComponent(j);
			if (flat) s = flat;
		} catch {
			/* keep raw */
		}
	}
	s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
	s = s.replace(/§./g, "");
	const lines = s.split("\n").map(l => l.trimEnd());
	while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
	return lines;
}

/**
 * @param {any} node
 * @returns {string}
 */
function flattenTextComponent(node) {
	if (node == null) return "";
	if (typeof node === "string" || typeof node === "number") return String(node);
	if (Array.isArray(node)) return node.map(flattenTextComponent).join("");
	if (typeof node !== "object") return "";
	if (Array.isArray(node.rawtext)) {
		return node.rawtext.map(flattenTextComponent).join("");
	}
	let out = "";
	if (node.text != null) out += String(node.text);
	if (node.translate != null) out += String(node.translate);
	if (Array.isArray(node.extra)) out += node.extra.map(flattenTextComponent).join("");
	return out;
}

/**
 * @param {any} face
 */
export function extractSignFace(face) {
	if (!face || typeof face !== "object") {
		return { lines: [], color: null, glowing: false, raw: "" };
	}
	const raw =
		face.Text != null
			? String(face.Text)
			: face.text != null
				? String(face.text)
				: "";
	let lines = parseSignTextLines(raw);
	if (!lines.length) {
		const legacy = [];
		for (let i = 1; i <= 4; i++) {
			const k = `Text${i}`;
			const v = face[k] ?? face[`text${i}`];
			if (v != null && String(v).length) legacy.push(...parseSignTextLines(String(v)));
		}
		lines = legacy;
	}
	const colorRaw = face.SignTextColor ?? face.Color ?? face.color;
	const color =
		colorRaw == null || colorRaw === ""
			? null
			: Number(colorRaw);
	const glowing =
		face.IgnoreLighting === 1
		|| face.IgnoreLighting === true
		|| face.GlowingText === 1
		|| face.GlowingText === true;
	return {
		lines,
		color: Number.isFinite(color) ? color : null,
		glowing: !!glowing,
		raw
	};
}

/**
 * @param {any} blockEntity
 */
export function extractSignText(blockEntity) {
	if (!blockEntity || typeof blockEntity !== "object") return null;
	const id = stripNs(String(blockEntity.id ?? ""));
	const isSign =
		id === "Sign"
		|| id === "HangingSign"
		|| /sign/i.test(id);
	if (!isSign && !blockEntity.FrontText && !blockEntity.front_text && blockEntity.Text1 == null) {
		return null;
	}
	const front = extractSignFace(
		blockEntity.FrontText ?? blockEntity.front_text ?? blockEntity
	);
	const back = extractSignFace(
		blockEntity.BackText ?? blockEntity.back_text ?? null
	);
	const waxed =
		blockEntity.IsWaxed === 1
		|| blockEntity.IsWaxed === true
		|| blockEntity.isWaxed === 1;
	return { front, back, waxed: !!waxed };
}

/**
 * @param {any} bookItem
 */
export function extractBookPages(bookItem) {
	const empty = { title: null, author: null, pages: [], itemName: "book" };
	if (!bookItem || typeof bookItem !== "object") return empty;
	const itemName = stripNs(
		coerceStringId(bookItem.Name)
		?? coerceStringId(bookItem.name)
		?? "book"
	);
	const tag = bookItem.tag ?? bookItem.Tag ?? bookItem;
	const title =
		tag.title != null
			? String(tag.title)
			: tag.Title != null
				? String(tag.Title)
				: null;
	const author =
		tag.author != null
			? String(tag.author)
			: tag.Author != null
				? String(tag.Author)
				: null;

	/** @type {string[]} */
	const pages = [];
	const pushPage = p => {
		if (p == null) return;
		if (typeof p === "string" || typeof p === "number") {
			const lines = parseSignTextLines(String(p));
			pages.push(lines.join("\n") || String(p));
			return;
		}
		if (typeof p === "object") {
			const flat = flattenTextComponent(p) || (p.text != null ? String(p.text) : "");
			if (flat) pages.push(parseSignTextLines(flat).join("\n") || flat);
		}
	};

	const pageSrc =
		tag.pages
		?? tag.Pages
		?? bookItem.pages
		?? bookItem.Pages
		?? null;
	const list = asList(pageSrc);
	if (list.length) {
		for (const p of list) pushPage(p);
	} else if (pageSrc && typeof pageSrc === "object" && !Array.isArray(pageSrc)) {
		for (const p of asList(pageSrc)) pushPage(p);
	}

	return { title, author, pages, itemName };
}

/**
 * @param {any} blockEntity
 */
export function extractLecternBook(blockEntity) {
	if (!blockEntity || typeof blockEntity !== "object") return null;
	const id = stripNs(String(blockEntity.id ?? ""));
	if (id && id !== "Lectern" && !/lectern/i.test(id)) {
		if (!blockEntity.book && !blockEntity.Book && !blockEntity.BookItem) return null;
	}
	const rawBook =
		blockEntity.book
		?? blockEntity.Book
		?? blockEntity.BookItem
		?? null;
	const hasBookFlag =
		blockEntity.hasBook === 1
		|| blockEntity.hasBook === true
		|| !!rawBook;
	const page = Number(blockEntity.page ?? blockEntity.Page ?? 0) || 0;
	const book = rawBook ? extractBookPages(rawBook) : null;
	const totalPages =
		Number(blockEntity.totalPages ?? blockEntity.TotalPages ?? book?.pages?.length ?? 0)
		|| (book?.pages?.length ?? 0);
	return {
		hasBook: !!hasBookFlag,
		page,
		totalPages,
		book,
		rawBook
	};
}

/**
 * @param {Record<string, unknown>|null|undefined} states
 * @returns {number|null}
 */
export function readRedstoneSignal(states) {
	if (!states || typeof states !== "object") return null;
	const raw =
		states.redstone_signal
		?? states.power
		?? states.Power;
	if (raw == null || raw === "") return null;
	const n = Number(raw);
	return Number.isFinite(n) ? Math.max(0, Math.min(15, Math.floor(n))) : null;
}

/**
 * @param {{ kind: "block"|"entity"|"miss", block?: InspectBlock, entity?: InspectEntity, layer?: number|null }} hit
 * @returns {string}
 */
export function formatInspectText(hit) {
	if (!hit || hit.kind === "miss") {
		return "Nothing under cursor.";
	}
	const lines = [];
	if (hit.kind === "block" && hit.block) {
		const b = hit.block;
		lines.push(`Block: ${b.name}`);
		lines.push(`Pos: ${b.x}, ${b.y}, ${b.z}`);
		if (b.states && Object.keys(b.states).length) {
			const st = Object.entries(b.states)
				.map(([k, v]) => `${k}=${v}`)
				.join(", ");
			lines.push(`States: ${st}`);
		}
		const power = readRedstoneSignal(b.states);
		if (power != null && String(b.name || "").includes("redstone")) {
			lines.push(`Redstone power: ${power}/15`);
		}
		if (b.waterlogName) lines.push(`Also: ${b.waterlogName}`);
		if (b.blockEntityId) lines.push(`Block entity: ${b.blockEntityId}`);

		const sign = extractSignText(b.blockEntity);
		if (sign) {
			const d = describeSignPlacement(b, b.name);
			lines.push(`Sign ${d.kind} ${d.wood} ${d.facing}`);
			lines.push(`  euler ${d.eulerDeg.join(",")}  F side=${d.front.side} B side=${d.back.side}`);
			const f = sign.front.lines.filter(Boolean);
			const bk = sign.back.lines.filter(Boolean);
			if (f.length) {
				lines.push("Front:");
				f.forEach(l => lines.push(`  ${l}`));
			} else {
				lines.push("Front: (blank)");
			}
			if (bk.length) {
				lines.push("Back:");
				bk.forEach(l => lines.push(`  ${l}`));
			} else {
				lines.push("Back: (blank)");
			}
			if (sign.waxed) lines.push("Waxed");
		}

		const lectern = extractLecternBook(b.blockEntity);
		if (lectern) {
			if (!lectern.hasBook) {
				lines.push("Lectern: no book");
			} else {
				const bk = lectern.book;
				lines.push(
					`Lectern book: ${bk?.itemName || "book"}`
					+ (bk?.title ? ` “${bk.title}”` : "")
					+ (bk?.author ? ` by ${bk.author}` : "")
				);
				lines.push(`Page ${lectern.page + 1}/${Math.max(lectern.totalPages, 1)}`);
				if (bk?.pages?.length) {
					const cur = bk.pages[lectern.page] ?? bk.pages[0];
					if (cur) {
						lines.push("— page text —");
						String(cur).split("\n").forEach(l => lines.push(l));
					}
				} else {
					lines.push("(no page text in NBT)");
				}
			}
		}

		const inv = b.doubleChest && Array.isArray(b.doubleItems) ? b.doubleItems : b.items;
		if (inv?.length) {
			lines.push(`Inventory (${inv.length}):`);
			for (const it of inv) {
				const slot = it.slot != null ? `[${it.slot}] ` : "";
				const dmg = it.damage != null ? ` dmg=${it.damage}` : "";
				lines.push(`  ${slot}${it.count}× ${it.name}${dmg}`);
			}
		} else if (b.blockEntityId && CONTAINER_BLOCK_ENTITY_IDS.has(b.blockEntityId) && !lectern) {
			lines.push("Inventory: empty");
		} else if (b.blockEntity && !inv?.length && !sign && !lectern) {
			const keys = Object.keys(b.blockEntity).filter(k => !["id", "isMovable"].includes(k)).slice(0, 8);
			if (keys.length) lines.push(`Entity data keys: ${keys.join(", ")}`);
		}
	} else if (hit.kind === "entity" && hit.entity) {
		const e = hit.entity;
		lines.push(`Entity: ${e.identifier}`);
		if (e.customName) lines.push(`Name: ${e.customName}`);
		lines.push(`Pos: ${e.pos.map(n => Number(n).toFixed(2)).join(", ")}`);
		if (e.items?.length) {
			lines.push(`Inventory (${e.items.length}):`);
			for (const it of e.items) {
				const slot = it.slot != null ? `[${it.slot}] ` : "";
				const dmg = it.damage != null ? ` dmg=${it.damage}` : "";
				lines.push(`  ${slot}${it.count}× ${it.name}${dmg}`);
			}
		} else {
			lines.push("Inventory: empty / none");
		}
	}
	return lines.join("\n");
}
