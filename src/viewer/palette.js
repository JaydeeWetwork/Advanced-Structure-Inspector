/**
 * Shared block-palette helpers for catalog + preview.
 * Keeps structure NBT mutation-safe (indices are cloned).
 */

import BlockUpdater from "./engine/BlockUpdater.js";
import { applyUnrevisedBlockStates } from "./blockUpgradeApply.js";
import { isCoralFanBlock } from "./legacyStateAlias.js";
import { JSONMap } from "../utils/containers.js";
import {
	IGNORED_BLOCKS,
	IGNORED_BLOCK_ENTITIES,
	cloneBlockIndices,
	dedupePalette,
	mergeMultiplePalettesAndIndices,
	normalizeVec3
} from "./paletteCore.js";

export {
	IGNORED_BLOCKS,
	IGNORED_BLOCK_ENTITIES,
	cloneBlockIndices,
	dedupePalette,
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
	for (let i = 0; i < palette.length; i++) {
		const block = palette[i];
		const ownName = block && typeof block === "object" && Object.hasOwn(block, "name")
			? block.name
			: undefined;
		if (typeof ownName !== "string") {
			delete palette[i];
			continue;
		}
		for (const key of Object.keys(block)) {
			if (key.startsWith("bLayers_") || key.startsWith("basi_")) delete block[key];
		}
	}

	const blockUpdater = new BlockUpdater();
	await Promise.all(Object.entries(palette).map(async ([i, block]) => {
		if (!block) return;
		if (blockUpdater.blockNeedsUpdating(block)) {
			await blockUpdater.update(block);
		}
		// Coral fans are not a schema flatten. rotationLookup also leaves them alone.
		if (!isCoralFanBlock(block)) applyUnrevisedBlockStates(block);
		block["name"] = String(block["name"] ?? "").replace(/^minecraft:/, "");
		if (ignoredBlocks.includes(block["name"])) {
			delete palette[i];
			return;
		}
		// A version above the schema constant stays so later copies and JSON dedup
		// keep that row apart. stripPaletteVersions removes it after the preview count.
		if (!(Number(block["version"]) > BlockUpdater.LATEST_VERSION)) delete block["version"];
		if (block["states"] && !Object.keys(block["states"]).length) {
			delete block["states"];
		}
	}));

	/** @type {JSONMap<any, number>} */
	const newIndexCache = new JSONMap();
	const entitylessBlockEntityIndices = new Set();
	const blockPositionData = structure?.palette?.default?.block_position_data ?? {};
	const positionKeys = blockPositionData && typeof blockPositionData === "object"
		? Object.keys(blockPositionData)
		: [];
	for (const i of positionKeys) {
		if (!/^\d+$/.test(i)) continue;
		const cell = blockPositionData[i];
		if (!cell || typeof cell !== "object") continue;
		const oldPaletteI = indices[0][i];
		if (!Object.hasOwn(palette, oldPaletteI)) continue;
		if (!Object.hasOwn(cell, "block_entity_data")) continue;

		const blockEntityData = structuredClone(cell["block_entity_data"]);
		if (!blockEntityData || typeof blockEntityData !== "object") continue;
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
	// Count after the remap. A row stays when another cell still points at it.
	/** @type {Map<number, number>} */
	const stillUsed = new Map();
	const layer0 = indices[0];
	if (layer0) {
		for (let i = 0; i < layer0.length; i++) {
			const paletteI = layer0[i];
			if (!entitylessBlockEntityIndices.has(paletteI)) continue;
			stillUsed.set(paletteI, (stillUsed.get(paletteI) ?? 0) + 1);
		}
	}
	for (const paletteI of entitylessBlockEntityIndices) {
		if ((stillUsed.get(paletteI) ?? 0) === 0) delete palette[paletteI];
	}
	return { palette, indices };
}

/**
 * Drop version after the preview count, and on the pack path before neighbor
 * connections so a future row still shares geometry with an identical current row.
 * @param {any[]|null|undefined} palette
 */
export function stripPaletteVersions(palette) {
	if (!palette) return;
	for (const block of Object.values(palette)) {
		if (block && typeof block === "object") delete block.version;
	}
}
