/**
 * Ingest Minecraft structure sources into catalog entries.
 * Reuses HoloPrint / mcbe-leveldb-reader extractors.
 */

import { extractStructureFilesFromMcworld } from "mcbe-leveldb-reader";
import * as HoloPrint from "../HoloPrint.js";

/**
 * @param {File} file
 * @returns {"mcstructure"|"mcworld"|"mcpack"|"zip"|"mctemplate"|"unknown"}
 */
export function detectSourceKind(file) {
	const name = file.name.toLowerCase();
	if (name.endsWith(".mcstructure")) return "mcstructure";
	if (name.endsWith(".mcworld")) return "mcworld";
	if (name.endsWith(".mctemplate")) return "mctemplate";
	if (name.endsWith(".mcpack")) return "mcpack";
	if (name.endsWith(".zip")) return "zip";
	return "unknown";
}

/**
 * Expand a dropped/selected file into zero or more structure Files.
 * @param {File} file
 * @returns {Promise<{ structures: File[], sourceKind: ReturnType<typeof detectSourceKind>, warnings: string[] }>}
 */
export async function expandSourceFile(file) {
	const sourceKind = detectSourceKind(file);
	const warnings = [];

	if (sourceKind === "mcstructure") {
		return { structures: [file], sourceKind, warnings };
	}

	if (sourceKind === "mcworld" || sourceKind === "mctemplate" || sourceKind === "zip") {
		const map = await extractStructureFilesFromMcworld(file);
		const structures = [...map.values()];
		if (!structures.length) {
			warnings.push(`No structure templates found in ${file.name}`);
		}
		return { structures, sourceKind, warnings };
	}

	if (sourceKind === "mcpack") {
		const structures = await HoloPrint.extractStructureFilesFromPack(file);
		if (!structures.length) {
			warnings.push(`No .mcstructure files found in ${file.name}`);
		}
		return { structures, sourceKind, warnings };
	}

	throw new Error(`Unsupported file type: ${file.name}`);
}

/**
 * Read NBT and build catalog fields (no pack generation).
 * @param {File} structureFile
 * @param {{ sourceName?: string, sourceKind?: ReturnType<typeof detectSourceKind> }} [meta]
 */
export async function structureFileToCatalogFields(structureFile, meta = {}) {
	const nbt = await HoloPrint.readStructureNBT(structureFile);
	const size = /** @type {[number, number, number]} */ (nbt.size.map(Number));
	const worldOrigin = Array.isArray(nbt.structure_world_origin)
		? /** @type {[number, number, number]} */ (nbt.structure_world_origin.map(Number))
		: null;

	const palette = nbt.structure?.palette?.default?.block_palette ?? [];
	const blockNames = [...new Set(
		palette
			.map(block => {
				const name = block?.name;
				return typeof name === "string" ? name.replace(/^minecraft:/, "") : null;
			})
			.filter(Boolean)
	)].sort();

	const indices = nbt.structure?.block_indices?.[0] ?? [];
	let blockCount = 0;
	for (const idx of indices) {
		if (typeof idx === "number" && idx >= 0) blockCount++;
	}
	// Fallback when indices missing / empty: volume minus air is unknown → use volume
	if (!blockCount && size.every(n => Number.isFinite(n))) {
		blockCount = size[0] * size[1] * size[2];
	}

	const baseName = structureFile.name.replace(/\.mcstructure$/i, "");

	return {
		name: baseName,
		sourceName: meta.sourceName ?? structureFile.name,
		sourceKind: meta.sourceKind ?? "mcstructure",
		size,
		worldOrigin,
		paletteSize: palette.length,
		blockCount,
		blockNames,
		file: structureFile
	};
}

/**
 * Ingest one or more user files into catalog field objects.
 * @param {FileList|File[]} files
 * @returns {Promise<{ entries: Awaited<ReturnType<typeof structureFileToCatalogFields>>[], warnings: string[], errors: string[] }>}
 */
export async function ingestFiles(files) {
	const list = [...files];
	const entries = [];
	const warnings = [];
	const errors = [];

	for (const file of list) {
		try {
			const { structures, sourceKind, warnings: w } = await expandSourceFile(file);
			warnings.push(...w);
			for (const structure of structures) {
				try {
					const fields = await structureFileToCatalogFields(structure, {
						sourceName: file.name,
						sourceKind
					});
					entries.push(fields);
				} catch (e) {
					errors.push(`${structure.name}: ${e?.message ?? e}`);
				}
			}
		} catch (e) {
			errors.push(`${file.name}: ${e?.message ?? e}`);
		}
	}

	return { entries, warnings, errors };
}
