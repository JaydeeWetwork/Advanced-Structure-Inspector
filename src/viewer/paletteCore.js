/**
 * Pure palette helpers (no BlockUpdater / network) — unit-test friendly.
 */

import { JSONSet } from "../utils/containers.js";

export const IGNORED_BLOCKS = [
	"air", "piston_arm_collision", "sticky_piston_arm_collision",
	"light_block", "light_block_0", "light_block_1", "light_block_2", "light_block_3",
	"light_block_4", "light_block_5", "light_block_6", "light_block_7", "light_block_8",
	"light_block_9", "light_block_10", "light_block_11", "light_block_12", "light_block_13",
	"light_block_14", "light_block_15"
];

export const IGNORED_BLOCK_ENTITIES = new Set([
	"Beacon", "Beehive", "Bell", "BrewingStand", "ChiseledBookshelf", "CommandBlock",
	"Comparator", "Conduit", "CreakingHeart", "EnchantTable", "EndGateway", "JigsawBlock",
	"Lodestone", "SculkCatalyst", "SculkShrieker", "SculkSensor", "CalibratedSculkSensor",
	"StructureBlock", "BrushableBlock", "TrialSpawner", "Vault"
]);

/**
 * @param {unknown} value
 * @returns {[number, number, number]}
 */
export function normalizeVec3(value) {
	if (!value) return [0, 0, 0];
	if (Array.isArray(value) || ArrayBuffer.isView(value)) {
		const arr = [...value].map(Number);
		return [
			Number.isFinite(arr[0]) ? arr[0] : 0,
			Number.isFinite(arr[1]) ? arr[1] : 0,
			Number.isFinite(arr[2]) ? arr[2] : 0
		];
	}
	return [0, 0, 0];
}

/**
 * Deep-clone block indices so palette remaps never mutate source NBT.
 * Version 2 omits the waterlog layer when it is empty. That becomes a same-length list of -1.
 * @param {[Int32Array|number[], Int32Array|number[]]|unknown} indices
 * @returns {[Int32Array, Int32Array]}
 */
export function cloneBlockIndices(indices) {
	if (!Array.isArray(indices) || indices.length < 1 || indices[0] == null) {
		return [new Int32Array(0), new Int32Array(0)];
	}
	const layer0 = indices[0] instanceof Int32Array ? new Int32Array(indices[0]) : Int32Array.from(indices[0] ?? []);
	const raw1 = indices.length >= 2 ? indices[1] : null;
	const layer1 = raw1 == null
		? new Int32Array(layer0.length).fill(-1)
		: raw1 instanceof Int32Array ? new Int32Array(raw1) : Int32Array.from(raw1 ?? []);
	return [layer0, layer1];
}

/**
 * Add `palette` into `paletteSet` and remap both index layers onto that set.
 * A version still on the block is part of the JSON identity.
 * @param {JSONSet} paletteSet
 * @param {any[]} palette
 * @param {ArrayLike<ArrayLike<number>>} indices
 * @returns {[Int32Array, Int32Array]}
 */
function remapPaletteIndices(paletteSet, palette, indices) {
	/** @type {number[]} */
	const indexRemappings = [];
	palette.forEach((block, i) => {
		paletteSet.add(block);
		indexRemappings[i] = paletteSet.indexOf(block);
	});
	return /** @type {[Int32Array, Int32Array]} */ (
		indices.map(layer =>
			Int32Array.from(layer, paletteI => indexRemappings[paletteI] ?? -1)
		)
	);
}

/**
 * Collapse identical rows in one palette and remap its index layers.
 * @param {any[]} palette
 * @param {ArrayLike<ArrayLike<number>>} indices
 * @returns {{ palette: any[], indices: [Int32Array, Int32Array] }}
 */
export function dedupePalette(palette, indices) {
	const paletteSet = new JSONSet();
	const remapped = remapPaletteIndices(paletteSet, palette, indices);
	return {
		palette: Array.from(paletteSet),
		indices: remapped
	};
}

/**
 * Merge several structure palettes into one, remapping each index pair.
 * The pack is the caller. A single structure uses `dedupePalette`.
 * @param {{ palette: any[], indices: [Int32Array, Int32Array] }[]} palettesAndIndices
 * @returns {{ palette: any[], indices: [Int32Array, Int32Array][] }}
 */
export function mergeMultiplePalettesAndIndices(palettesAndIndices) {
	const paletteSet = new JSONSet();
	const indices = palettesAndIndices.map(item =>
		remapPaletteIndices(paletteSet, item.palette, item.indices)
	);
	return {
		palette: Array.from(paletteSet),
		indices
	};
}
