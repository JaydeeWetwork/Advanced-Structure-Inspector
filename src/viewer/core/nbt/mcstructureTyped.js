/**
 * Typed .mcstructure writing.
 *
 * The product reader (nbtify-readonly-typeless) returns plain JS numbers, so a
 * naive nbtify write turns every number into TAG_Double and every `size` /
 * origin into TAG_Int_Array. Minecraft may refuse such files. This module
 * rebuilds the tag types Bedrock expects before writing:
 *
 * - `format_version`: Int
 * - `size`, `structure_world_origin`: List<Int>
 * - `structure.block_indices`: v1 → List<List<Int>> (two layers);
 *   v2 → List<Int_Array>, the second layer left out when it is all -1 (as the game does)
 * - block palette: `name` String, `version` Int, states → Byte for bool states
 *   (Mojang's vanilla block property list), Int for other numbers, String kept
 * - already-typed scalars (Int8, Int16, Int32, Float32) and bigint are kept
 * - NBT array tags are kept: Int8Array, Uint8Array, Int32Array, Uint32Array,
 *   BigInt64Array, BigUint64Array
 * - Float32Array becomes a float list (whole values stay Float, not Int)
 * - Float64Array becomes a list of plain numbers (nbtify writes Double)
 * - Int16Array becomes a short list
 * - Every other typed array is walked element by element
 *
 * Free-form NBT (entities, block_position_data) has no schema here. Untyped numbers
 * there fall back to Int (whole) or Float (fraction). Scripts that edit an existing
 * file should read it with {@link readMcstructureTyped} so those types survive.
 */

import { mcstructureFormatVersion, readMcstructure, MCSTRUCTURE_READ_OPTIONS } from "./mcstructureCodec.js";

/**
 * Bool block states (TAG_Byte). Every `type: "bool"` entry in Mojang's
 * bedrock-samples metadata/vanilladata_modules/mojang-blocks.json,
 * 1.26.50.4 (main) ∪ 1.26.60.29-preview. Other numeric states are TAG_Int.
 */
export const BEDROCK_BOOL_BLOCK_STATES = Object.freeze(new Set([
	"active", "age_bit", "allow_underwater_bit", "attached_bit", "big_dripleaf_head", "bloom",
	"brewing_stand_slot_a_bit", "brewing_stand_slot_b_bit", "brewing_stand_slot_c_bit",
	"button_pressed_bit", "can_summon", "color_bit", "conditional_bit", "coral_hang_type_bit",
	"covered_bit", "crafting", "dead_bit", "disarmed_bit", "door_hinge_bit", "drag_down",
	"end_portal_eye_bit", "explode_bit", "extinguished", "hanging", "head_piece_bit", "in_wall_bit",
	"infiniburn_bit", "item_frame_map_bit", "item_frame_photo_bit", "lit",
	"minecraft:connection_down", "minecraft:connection_east", "minecraft:connection_north",
	"minecraft:connection_south", "minecraft:connection_up", "minecraft:connection_west",
	"natural", "no_drop_bit", "occupied_bit", "ominous", "open_bit", "output_lit_bit",
	"output_subtract_bit", "persistent_bit", "powered_bit", "rail_data_bit", "stability_check",
	"stripped_bit", "suspended_bit", "tip", "toggle_bit", "top_slot_bit", "triggered_bit",
	"update_bit", "upper_block_bit", "upside_down_bit", "wall_post_bit"
]));

/** @returns {Promise<typeof import("nbtify")>} */
export async function loadNbtify() {
	return import("nbtify");
}

/**
 * @param {unknown} v
 * @param {typeof import("nbtify")} NBT
 */
function isTypedScalar(v, NBT) {
	return v instanceof NBT.Int8 || v instanceof NBT.Int16 || v instanceof NBT.Int32 || v instanceof NBT.Float32;
}

/**
 * @param {unknown} v
 * @param {typeof import("nbtify")} NBT
 */
function toInt(v, NBT) {
	if (v instanceof NBT.Int32) return v;
	return new NBT.Int32(Number(v));
}

/**
 * @param {unknown} v
 */
function isPlainObject(v) {
	return v != null && typeof v === "object" && !Array.isArray(v) && !ArrayBuffer.isView(v);
}

/** Views nbtify writes as BYTE_ARRAY, INT_ARRAY, or LONG_ARRAY. */
function isNbtArrayTag(v) {
	return v instanceof Int8Array
		|| v instanceof Uint8Array
		|| v instanceof Int32Array
		|| v instanceof Uint32Array
		|| v instanceof BigInt64Array
		|| v instanceof BigUint64Array;
}

/**
 * Best-effort typing for schema-less NBT.
 * @param {unknown} v
 * @param {typeof import("nbtify")} NBT
 * @returns {unknown}
 */
export function typeFreeformNbt(v, NBT) {
	if (v == null) return v;
	if (isTypedScalar(v, NBT)) return v;
	switch (typeof v) {
		case "boolean": return new NBT.Int8(v ? 1 : 0);
		case "bigint":
		case "string": return v;
		case "number":
			if (Number.isInteger(v) && v >= -2147483648 && v <= 2147483647) return new NBT.Int32(v);
			if (Number.isInteger(v)) return BigInt(v);
			return new NBT.Float32(v);
	}
	// Whole values inside a float buffer must stay floats. Recursing the number
	// rule would turn them into Int and make a mixed list fail the writer.
	if (v instanceof Float32Array) return Array.from(v, x => new NBT.Float32(x));
	if (v instanceof Float64Array) return Array.from(v);
	if (v instanceof Int16Array) return Array.from(v, x => new NBT.Int16(x));
	if (isNbtArrayTag(v)) return v;
	if (Array.isArray(v) || ArrayBuffer.isView(v)) return Array.from(v, x => typeFreeformNbt(x, NBT));
	if (typeof v === "object") {
		/** @type {Record<string, unknown>} */
		const out = {};
		for (const [k, x] of Object.entries(v)) out[k] = typeFreeformNbt(x, NBT);
		return out;
	}
	return v;
}

/**
 * @param {Record<string, unknown>} states
 * @param {typeof import("nbtify")} NBT
 */
export function typeBlockStates(states, NBT) {
	/** @type {Record<string, unknown>} */
	const out = {};
	for (const [k, v] of Object.entries(states ?? {})) {
		if (isTypedScalar(v, NBT) || typeof v === "string") out[k] = v;
		else if (typeof v === "boolean") out[k] = new NBT.Int8(v ? 1 : 0);
		else if (typeof v === "number") out[k] = BEDROCK_BOOL_BLOCK_STATES.has(k) ? new NBT.Int8(v) : new NBT.Int32(v);
		else out[k] = typeFreeformNbt(v, NBT);
	}
	return out;
}

/**
 * @param {Record<string, unknown>} block
 * @param {typeof import("nbtify")} NBT
 */
function typePaletteBlock(block, NBT) {
	/** @type {Record<string, unknown>} */
	const out = {};
	for (const [k, v] of Object.entries(block)) {
		if (k === "name") out.name = String(v);
		else if (k === "states") out.states = typeBlockStates(/** @type {any} */ (v), NBT);
		else if (k === "version") out.version = toInt(v, NBT);
		else out[k] = typeFreeformNbt(v, NBT);
	}
	return out;
}

/**
 * @param {unknown[]} layers
 * @param {number} formatVersion
 * @param {typeof import("nbtify")} NBT
 */
function typeBlockIndices(layers, formatVersion, NBT) {
	const list = [...layers];
	if (formatVersion === 2) {
		const asIntArray = list.map(l => l instanceof Int32Array ? new Int32Array(l) : Int32Array.from(/** @type {any} */ (l), n => Number(n)));
		if (asIntArray.length === 2 && asIntArray[1].every(n => n === -1)) asIntArray.length = 1;
		return asIntArray;
	}
	if (formatVersion !== 1) {
		throw new TypeError(`unsupported format_version ${formatVersion}`);
	}
	return list.map(l => Array.from(/** @type {any} */ (l), n => toInt(n, NBT)));
}

/**
 * Typed copy of a parsed .mcstructure, ready for nbtify write. Does not mutate `nbt`.
 * Root key order follows Minecraft's own saves.
 * @param {object} nbt typeless (readMcstructure) or typed (readMcstructureTyped) root
 * @param {typeof import("nbtify")} NBT
 */
export function typeMcstructureForWrite(nbt, NBT) {
	const root = /** @type {Record<string, any>} */ (nbt);
	const formatVersion = mcstructureFormatVersion(root);
	if (formatVersion == null) throw new TypeError("format_version is not a whole number");
	const structure = root.structure ?? {};
	/** @type {Record<string, unknown>} */
	const typedStructure = {};
	for (const [k, v] of Object.entries(structure)) {
		if (k === "block_indices") {
			typedStructure.block_indices = typeBlockIndices(/** @type {any} */ (v), formatVersion, NBT);
		} else if (k === "palette" && isPlainObject(v)) {
			/** @type {Record<string, unknown>} */
			const palettes = {};
			for (const [pname, p] of Object.entries(v)) {
				if (!isPlainObject(p)) {
					palettes[pname] = typeFreeformNbt(p, NBT);
					continue;
				}
				/** @type {Record<string, unknown>} */
				const tp = {};
				for (const [pk, pv] of Object.entries(p)) {
					tp[pk] = pk === "block_palette" && Array.isArray(pv)
						? pv.map(b => typePaletteBlock(b, NBT))
						: typeFreeformNbt(pv, NBT);
				}
				palettes[pname] = tp;
			}
			typedStructure.palette = palettes;
		} else {
			typedStructure[k] = typeFreeformNbt(v, NBT);
		}
	}
	/** @type {Record<string, unknown>} */
	const out = {
		format_version: new NBT.Int32(formatVersion),
		size: Array.from(root.size, n => toInt(n, NBT)),
		structure: typedStructure,
		structure_world_origin: Array.from(root.structure_world_origin, n => toInt(n, NBT))
	};
	for (const [k, v] of Object.entries(root)) {
		if (!(k in out)) out[k] = typeFreeformNbt(v, NBT);
	}
	return out;
}

/**
 * Typed read for scripts that edit an existing file and write it back.
 * Runs the full product gates first (readMcstructure), then parses again with
 * the typed nbtify so Byte/Short/Float/Long fields keep their tag types.
 * @param {ArrayBuffer|ArrayBufferView} buffer
 * @returns {Promise<{ nbt: Record<string, any>, typeless: object }>}
 */
export async function readMcstructureTyped(buffer) {
	const { nbt: typeless } = await readMcstructure(buffer);
	const NBT = await loadNbtify();
	const parsed = await NBT.read(buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer, {
		...MCSTRUCTURE_READ_OPTIONS,
		rootName: true
	});
	return { nbt: /** @type {any} */ (parsed.data), typeless };
}
