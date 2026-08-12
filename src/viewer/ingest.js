/**
 * Ingest Minecraft structure sources into catalog entries.
 */

import { parseStructureFile } from "./parseStructure.js";

/**
 * @param {File} file
 * @returns {"mcstructure"|"mcworld"|"mcpack"|"zip"|"mctemplate"|"unknown"}
 */
export function detectSourceKind(file) {
	const name = (file.name || "").toLowerCase();
	if (name.endsWith(".mcstructure")) return "mcstructure";
	if (name.endsWith(".mcworld")) return "mcworld";
	if (name.endsWith(".mctemplate")) return "mctemplate";
	if (name.endsWith(".mcpack")) return "mcpack";
	if (name.endsWith(".zip")) return "zip";
	return "unknown";
}

/**
 * @param {File} file
 * @returns {Promise<{ structures: File[], sourceKind: ReturnType<typeof detectSourceKind>, warnings: string[] }>}
 */
export async function expandSourceFile(file) {
	let sourceKind = detectSourceKind(file);
	const warnings = [];

	if (sourceKind === "unknown") {
		sourceKind = "mcstructure";
		warnings.push(`Unknown extension for ${file.name}; trying as .mcstructure`);
	}

	if (sourceKind === "mcstructure") {
		return { structures: [file], sourceKind, warnings };
	}

	if (sourceKind === "mcworld" || sourceKind === "mctemplate" || sourceKind === "zip") {
		const { extractStructureFilesFromMcworld } = await import("mcbe-leveldb-reader");
		const map = await extractStructureFilesFromMcworld(file);
		const structures = [...map.values()];
		if (!structures.length) {
			warnings.push(`No structure templates found in ${file.name}`);
		}
		return { structures, sourceKind, warnings };
	}

	if (sourceKind === "mcpack") {
		const { ZipReader, BlobReader, BlobWriter } = await import("@zip.js/zip.js");
		const reader = new ZipReader(new BlobReader(file));
		try {
			const entries = await reader.getEntries();
			const structureEntries = entries.filter(e => e.filename.toLowerCase().endsWith(".mcstructure"));
			const structures = await Promise.all(structureEntries.map(async (entry, i) => {
				const blob = await entry.getData(new BlobWriter());
				const name = entry.comment || entry.filename.split("/").pop() || `structure_${i}.mcstructure`;
				return new File([blob], name.endsWith(".mcstructure") ? name : `${name}.mcstructure`, {
					type: "application/mcstructure"
				});
			}));
			if (!structures.length) {
				warnings.push(`No .mcstructure files found in ${file.name}`);
			}
			return { structures, sourceKind, warnings };
		} finally {
			await reader.close().catch(() => {});
		}
	}

	throw new Error(`Unsupported file type: ${file.name}`);
}

/**
 * @param {FileList|File[]|Iterable<File>} files
 * @param {{ onProgress?: (msg: string) => void }} [opts]
 */
export async function ingestFiles(files, opts = {}) {
	const list = [...files];
	const entries = [];
	const warnings = [];
	const errors = [];

	for (const file of list) {
		opts.onProgress?.(`Reading ${file.name}…`);
		try {
			const { structures, sourceKind, warnings: w } = await expandSourceFile(file);
			warnings.push(...w);
			for (const structure of structures) {
				opts.onProgress?.(`Parsing ${structure.name}…`);
				try {
					const fields = await parseStructureFile(structure, {
						sourceName: file.name,
						sourceKind
					});
					entries.push(fields);
				} catch (e) {
					const msg = e?.message ?? String(e);
					errors.push(`${structure.name}: ${msg}`);
					entries.push({
						name: structure.name.replace(/\.mcstructure$/i, "") || structure.name,
						sourceName: file.name,
						sourceKind,
						size: /** @type {[number, number, number]} */ ([0, 0, 0]),
						worldOrigin: null,
						paletteSize: 0,
						blockCount: 0,
						blockNames: [],
						entityCount: 0,
						materials: [],
						file: structure,
						parseError: msg
					});
				}
			}
		} catch (e) {
			errors.push(`${file.name}: ${e?.message ?? e}`);
		}
	}

	return { entries, warnings, errors };
}
