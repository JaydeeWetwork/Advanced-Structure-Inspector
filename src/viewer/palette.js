/**
 * Shared block-palette helpers for catalog + preview.
 * Keeps structure NBT mutation-safe (indices are cloned).
 */

import BlockUpdater from "../BlockUpdater.js";
import { JSONMap } from "../utils/containers.js";
import {
	IGNORED_BLOCKS,
	IGNORED_BLOCK_ENTITIES,
	cloneBlockIndices,
	mergeMultiplePalettesAndIndices,
	normalizeVec3
} from "./paletteCore.js";

export {
	IGNORED_BLOCKS,
	IGNORED_BLOCK_ENTITIES,
	cloneBlockIndices,
	mergeMultiplePalettesAndIndices,
	normalizeVec3
};

/**
 * Removes ignored blocks, upgrades old blocks, folds block-entity data into palette.
 * Does not mutate the input structure (palette + indices are copied).
 * @param {any} structure de-NBT structure compound
 * @param {string[]} [ignoredBlocks]
 * @returns {Promise<{ palette: any[], indices: [Int32Array, Int32Array] }>}
 */
export async function tweakBlockPalette(structure, ignoredBlocks = IGNORED_BLOCKS) {
	const srcPalette = structure?.palette?.default?.block_palette ?? [];
	/** @type {any[]} */
	let palette = structuredClone(Array.isArray(srcPalette) || ArrayBuffer.isView(srcPalette) ? [...srcPalette] : []);
	let indices = cloneBlockIndices(structure?.block_indices);

	const blockUpdater = new BlockUpdater();
	for (const [i, block] of Object.entries(palette)) {
		if (!block) continue;
		if (blockUpdater.blockNeedsUpdating(block)) {
			await blockUpdater.update(block);
		}
		block["name"] = String(block["name"] ?? "").replace(/^minecraft:/, "");
		if (ignoredBlocks.includes(block["name"])) {
			delete palette[i];
			continue;
		}
		delete block["version"];
		if (block["states"] && !Object.keys(block["states"]).length) {
			delete block["states"];
		}
	}

	/** @type {JSONMap<any, number>} */
	const newIndexCache = new JSONMap();
	const entitylessBlockEntityIndices = new Set();
	const blockPositionData = structure?.palette?.default?.block_position_data ?? {};
	for (const i in blockPositionData) {
		const oldPaletteI = indices[0][i];
		if (!(oldPaletteI in palette)) continue;
		if (!("block_entity_data" in blockPositionData[i])) continue;

		const blockEntityData = structuredClone(blockPositionData[i]["block_entity_data"]);
		if (IGNORED_BLOCK_ENTITIES.has(blockEntityData["id"])) continue;
		delete blockEntityData["x"];
		delete blockEntityData["y"];
		delete blockEntityData["z"];

		const newBlock = structuredClone(palette[oldPaletteI]);
		newBlock["block_entity_data"] = blockEntityData;

		if (newIndexCache.has(newBlock)) {
			indices[0][i] = newIndexCache.get(newBlock);
		} else {
			const paletteI = palette.length;
			palette[paletteI] = newBlock;
			indices[0][i] = paletteI;
			newIndexCache.set(newBlock, paletteI);
			entitylessBlockEntityIndices.add(oldPaletteI);
		}
	}
	for (const paletteI of entitylessBlockEntityIndices) {
		delete palette[paletteI];
	}
	return { palette, indices };
}
