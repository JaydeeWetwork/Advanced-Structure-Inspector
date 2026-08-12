/**
 * Extract structure entities for 3D preview.
 * Positions are converted to structure-local space (world Pos − structure_world_origin).
 */

import { extractInventoryItems } from "./inspectStructure.js";

/**
 * @typedef {object} PreviewEntity
 * @property {string} identifier  // without minecraft: prefix when possible
 * @property {string} rawId
 * @property {[number, number, number]} pos  // structure-local continuous coords
 * @property {number} yawDeg  // Bedrock Rotation[0]
 * @property {number} pitchDeg // Bedrock Rotation[1]
 * @property {{ name: string, count: number, slot: number|null, damage: number|null }[]} [items]
 * @property {string|null} [customName]
 * @property {any} [raw]
 */

/**
 * @param {unknown} v
 * @returns {number[]}
 */
function toNums(v) {
	if (v == null) return [];
	// Typed arrays (Float32Array from nbtify) and arrays
	if (ArrayBuffer.isView(v)) {
		return Array.from(/** @type {ArrayLike<number>} */ (v), Number);
	}
	if (Array.isArray(v)) return v.map(Number);
	if (typeof v === "object") {
		// nbtify may yield {0:x,1:y,2:z} or {value:[...]}
		if (Array.isArray(v.value) || ArrayBuffer.isView(v.value)) {
			return toNums(v.value);
		}
		const keys = Object.keys(v).filter(k => /^\d+$/.test(k)).sort((a, b) => +a - +b);
		if (keys.length) return keys.map(k => Number(/** @type {any} */ (v)[k]));
	}
	return [];
}

/**
 * @param {any} data root MCStructure NBT
 * @returns {any[]}
 */
export function getEntityList(data) {
	const e = data?.structure?.entities;
	if (!e) return [];
	if (Array.isArray(e) || ArrayBuffer.isView(e)) return [...e];
	if (Array.isArray(e?.value)) return e.value;
	return [];
}

/**
 * @param {string|undefined|null} id
 * @returns {string}
 */
export function normalizeEntityId(id) {
	if (!id || typeof id !== "string") return "unknown";
	return id.replace(/^minecraft:/, "");
}

/**
 * Entity types we can currently mesh in the viewer.
 */
export const RENDERABLE_ENTITY_IDS = new Set([
	"minecart",
	"hopper_minecart",
	"chest_minecart",
	"tnt_minecart",
	"command_block_minecart",
	"minecart_hopper", // alias if any
	"minecart_chest"
]);

/**
 * @param {string} id normalized without namespace
 * @returns {boolean}
 */
export function isRenderableEntity(id) {
	const n = normalizeEntityId(id);
	return RENDERABLE_ENTITY_IDS.has(n);
}

/**
 * Map aliases to a mesh kind.
 * @param {string} id
 * @returns {"minecart"|"hopper_minecart"|"chest_minecart"|"tnt_minecart"|"command_block_minecart"|null}
 */
export function entityMeshKind(id) {
	const n = normalizeEntityId(id);
	switch (n) {
		case "minecart":
			return "minecart";
		case "hopper_minecart":
		case "minecart_hopper":
			return "hopper_minecart";
		case "chest_minecart":
		case "minecart_chest":
			return "chest_minecart";
		case "tnt_minecart":
			return "tnt_minecart";
		case "command_block_minecart":
			return "command_block_minecart";
		default:
			return null;
	}
}

/**
 * @param {any} data root structure NBT
 * @returns {PreviewEntity[]}
 */
export function extractPreviewEntities(data) {
	const origin = toNums(data?.structure_world_origin);
	const ox = origin[0] ?? 0;
	const oy = origin[1] ?? 0;
	const oz = origin[2] ?? 0;

	const list = getEntityList(data);
	/** @type {PreviewEntity[]} */
	const out = [];

	for (const ent of list) {
		if (!ent || typeof ent !== "object") continue;
		const rawId = String(ent.identifier ?? ent.id ?? ent.Identifier ?? "unknown");
		const identifier = normalizeEntityId(rawId);
		const posArr = toNums(ent.Pos);
		if (posArr.length < 3) continue;
		const rotArr = toNums(ent.Rotation);
		// Structure-local: world position minus structure origin
		const pos = /** @type {[number, number, number]} */ ([
			posArr[0] - ox,
			posArr[1] - oy,
			posArr[2] - oz
		]);
		// Inventory for hopper/chest minecarts — same robust path as block containers
		let items = [];
		try {
			items = extractInventoryItems(ent).map(it => ({
				name: it.name,
				count: it.count,
				slot: it.slot,
				damage: it.damage
			}));
		} catch {
			items = [];
		}
		const customName = ent.CustomName ?? ent.customName ?? null;
		out.push({
			identifier,
			rawId,
			pos,
			yawDeg: Number.isFinite(rotArr[0]) ? rotArr[0] : 0,
			pitchDeg: Number.isFinite(rotArr[1]) ? rotArr[1] : 0,
			items,
			customName: customName != null ? String(customName) : null,
			raw: ent
		});
	}
	return out;
}

/**
 * Only entities we know how to draw.
 * @param {any} data
 * @returns {PreviewEntity[]}
 */
export function extractRenderableEntities(data) {
	return extractPreviewEntities(data).filter(e => isRenderableEntity(e.identifier));
}
