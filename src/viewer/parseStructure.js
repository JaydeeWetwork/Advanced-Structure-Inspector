/**
 * Lightweight .mcstructure NBT parse for the catalog (no HoloPrint import).
 */

import { McstructureCodecError, readMcstructure } from "./api/structure.js";
import { normalizeVec3 } from "./palette.js";
import { countStructureEntities } from "./entityCount.js";
import { buildMaterialListFromNbt } from "./materialList.js";
import { buildInspectIndex } from "./inspectStructure.js";
import { computeHopperStats } from "./hopperStats.js";

export { countStructureEntities };

/**
 * @param {unknown} name
 * @returns {string|null}
 */
function blockName(name) {
	if (typeof name === "string") {
		return name.replace(/^minecraft:/, "");
	}
	if (name && typeof name === "object" && "value" in /** @type {object} */ (name)) {
		const v = /** @type {{ value: unknown }} */ (name).value;
		if (typeof v === "string") return v.replace(/^minecraft:/, "");
	}
	return null;
}

/**
 * Read a structure file into catalog fields. Throws on total failure.
 * @param {File} structureFile
 * @param {{ sourceName?: string, sourceKind?: string }} [meta]
 */
export async function parseStructureFile(structureFile, meta = {}) {
	let data;
	try {
		data = (await readMcstructure(structureFile, { fileName: structureFile.name })).nbt;
	} catch (e) {
		if (e instanceof McstructureCodecError) {
			throw e.toError(structureFile.name);
		}
		throw new Error(`Could not read NBT in "${structureFile.name}": ${e?.message ?? e}`);
	}

	const size = normalizeVec3(data?.size);
	const originArr = normalizeVec3(data?.structure_world_origin);
	const hasOrigin =
		Array.isArray(data?.structure_world_origin)
		|| ArrayBuffer.isView(data?.structure_world_origin);
	const worldOrigin = hasOrigin ? originArr : null;

	const palette = data?.structure?.palette?.default?.block_palette ?? [];
	const paletteList = Array.isArray(palette) || ArrayBuffer.isView(palette) ? [...palette] : [];

	const blockNames = [...new Set(
		paletteList
			.map(block => blockName(block?.name))
			.filter(Boolean)
	)].sort();

	const indicesRaw = data?.structure?.block_indices?.[0];
	const indices = indicesRaw && (Array.isArray(indicesRaw) || ArrayBuffer.isView(indicesRaw))
		? indicesRaw
		: [];

	let blockCount = 0;
	for (const idx of indices) {
		const n = Number(idx);
		if (Number.isFinite(n) && n >= 0) blockCount++;
	}

	const entityCount = countStructureEntities(data);
	const materials = buildMaterialListFromNbt(data);
	// Hopper lock: Bedrock toggle_bit on hopper blocks (powered = locked)
	let hopperStats = null;
	try {
		const inspect = buildInspectIndex(data);
		hopperStats = computeHopperStats(inspect);
	} catch {
		hopperStats = null;
	}
	const baseName = structureFile.name.replace(/\.mcstructure$/i, "") || structureFile.name;

	return {
		name: baseName,
		sourceName: meta.sourceName ?? structureFile.name,
		sourceKind: meta.sourceKind ?? "mcstructure",
		size,
		worldOrigin,
		paletteSize: paletteList.length,
		blockCount,
		blockNames,
		entityCount,
		/** @type {{ id: string, label: string, count: number }[]} */
		materials,
		hopperStats,
		file: structureFile
	};
}
