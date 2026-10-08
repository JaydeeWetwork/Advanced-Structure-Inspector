/** Block-entity inspect index. Plain cells stay out of the map. */
import { linkInspectDoubleChests } from "./doubleChest.js";
import {
	asList,
	extractInventoryItems,
	nbtBool,
	parseDisabledSlots,
	stripNs,
	toNums
} from "./inspectItems.js";
import { extractLecternBook, extractSignText } from "./signText.js";
function inspectDisabledSlots(be) {
	return [...parseDisabledSlots(be)];
}
function inspectPairCoord(v) {
	if (v == null) return null;
	if (typeof v === "object" && v && "value" in v) return Number(/** @type {{ value: unknown }} */ (v).value);
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
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
 * @typedef {object} InspectBlock
 * @property {number} x
 * @property {number} y
 * @property {number} z
 * @property {string} name
 * @property {Record<string, unknown>|undefined} states
 * @property {string|null} blockEntityId
 * @property {{ name: string, count: number, slot: number|null, damage: number|null }[]} items
 * @property {string|null} waterlogName
 * @property {number|null} [pairx]
 * @property {number|null} [pairz]
 * @property {boolean} [forceunpair]
 * @property {ReturnType<typeof extractSignText>|null} [sign]
 * @property {ReturnType<typeof extractLecternBook>|null} [lectern]
 * @property {number} [itemRotation]
 * @property {number[]} [disabledSlots]
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
 * @property {boolean|null} [enabled]
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
		const beId = beRaw?.id != null ? String(beRaw.id) : null;
		const items = beRaw ? extractInventoryItems(beRaw, itemSchemas) : [];
		const sign = beRaw ? extractSignText(beRaw) : null;
		const lectern = beRaw ? extractLecternBook(beRaw) : null;
		const pairx = inspectPairCoord(beRaw?.pairx);
		const pairz = inspectPairCoord(beRaw?.pairz);
		const fu = beRaw?.forceunpair;
		const rotRaw = beRaw?.ItemRotation ?? beRaw?.itemRotation;
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
			items,
			waterlogName,
			pairx,
			pairz,
			forceunpair: fu === 1 || fu === true,
			sign,
			lectern,
			itemRotation: Number(rotRaw) || 0,
			disabledSlots: beRaw ? inspectDisabledSlots(beRaw) : []
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
		console.info(`[bLayers] inspect: ${paired} double-chest halves linked`);
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
			enabled: nbtBool(ent.Enabled ?? ent.enabled)
		});
	}
	return index;
}
