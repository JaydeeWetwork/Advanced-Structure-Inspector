/**
 * Ingest Minecraft structure sources into catalog entries.
 * Unknown extensions are sniffed. Java names and gzip/zlib magic never become catalog rows.
 */

import { parseStructureFile } from "./parseStructure.js";
import { throwIfAborted } from "./abortUtil.js";
import { crc32Hex } from "./crc32.js";
import {
	detectSourceKind,
	IngestError,
	INGEST_MAX_TOP_FILES,
	sniffSourceMagic
} from "./ingestBudget.js";
import { extractMcstructuresFromZip } from "./ingestZip.js";
import { readCappedWorldStructures } from "./ingestWorld.js";

export {
	assertZipBudget,
	assertZipEntryInflation,
	detectSourceKind,
	fileWithSafeStructureName,
	IngestError,
	INGEST_MAX_TOP_FILES,
	safeStructureFileName,
	sanitizeZipEntryName,
	sniffSourceMagic,
	ZIP_MAX_ENTRIES,
	ZIP_MAX_ENTRY_BYTES,
	ZIP_MAX_RATIO,
	ZIP_MAX_STRUCTURES,
	ZIP_MAX_UNCOMPRESSED
} from "./ingestBudget.js";
export { extractWorldStructureFiles } from "./ingestWorld.js";

function javaRefuse() {
	throw new IngestError(
		"JAVA_NBT_DETECTED",
		"looks like a Java edition NBT file, not Bedrock .mcstructure"
	);
}

/**
 * Gzip and zlib on an unknown name are compressed bytes, not a Java file we identified by name.
 * @param {"gzip"|"zlib"} kind
 */
function compressedSourceRefuse(kind) {
	throw new IngestError(
		"SOURCE_COMPRESSED",
		`${kind} data is not a Bedrock .mcstructure`
	);
}

/**
 * @param {File} file
 * @param {{ nestDepth: number, running: { n: number, structures?: number }, signal?: AbortSignal }} ctx
 * @returns {Promise<{ structures: File[], sourceKind: ReturnType<typeof detectSourceKind>, warnings: string[] }>}
 */
async function expandSource(file, ctx) {
	let sourceKind = detectSourceKind(file);
	const warnings = [];

	if (sourceKind === "java-nbt") javaRefuse();

	if (sourceKind === "unknown") {
		const magic = sniffSourceMagic(await file.slice(0, 16).arrayBuffer());
		if (magic === "gzip" || magic === "zlib") compressedSourceRefuse(magic);
		if (magic === "zip") sourceKind = "zip";
		else if (magic === "nbt-compound") sourceKind = "mcstructure";
		else {
			throw new IngestError(
				"UNRECOGNIZED_SOURCE",
				"not a .mcstructure, zip, world, or pack"
			);
		}
	}

	if (sourceKind === "mcstructure") {
		return { structures: [file], sourceKind, warnings };
	}

	if (sourceKind === "mcworld" || sourceKind === "mctemplate") {
		const structures = await readCappedWorldStructures(file, ctx);
		if (!structures.length) {
			warnings.push(`No structure templates found in ${file.name}`);
		}
		return { structures, sourceKind, warnings };
	}

	if (sourceKind === "mcpack" || sourceKind === "zip" || sourceKind === "mcaddon") {
		const structures = await extractMcstructuresFromZip(file, {
			nest: sourceKind === "mcaddon",
			nestDepth: ctx.nestDepth,
			running: ctx.running,
			signal: ctx.signal,
			expandNested: expandSource
		});
		if (!structures.length) {
			warnings.push(`No .mcstructure files found in ${file.name}`);
		}
		return { structures, sourceKind, warnings };
	}

	throw new IngestError("UNRECOGNIZED_SOURCE", "not a .mcstructure, zip, world, or pack");
}

/**
 * @param {File} file
 * @returns {Promise<{ structures: File[], sourceKind: ReturnType<typeof detectSourceKind>, warnings: string[] }>}
 */
export async function expandSourceFile(file, opts = {}) {
	return expandSource(file, {
		nestDepth: 0,
		running: { n: 0, structures: 0 },
		signal: opts.signal
	});
}

/**
 * @param {FileList|File[]|Iterable<File>} files
 * @param {{ onProgress?: (msg: string) => void, signal?: AbortSignal, knownCrcs?: Iterable<string> }} [opts]
 */
export async function ingestFiles(files, opts = {}) {
	const signal = opts.signal;
	throwIfAborted(signal);
	let list = [...files];
	const entries = [];
	const warnings = [];
	const errors = [];
	const seenCrc = new Set(opts.knownCrcs || []);
	if (list.length > INGEST_MAX_TOP_FILES) {
		warnings.push(`Only the first ${INGEST_MAX_TOP_FILES} files were imported.`);
		list = list.slice(0, INGEST_MAX_TOP_FILES);
	}

	for (const file of list) {
		throwIfAborted(signal);
		opts.onProgress?.(`Reading ${file.name}…`);
		try {
			const { structures, sourceKind, warnings: w } = await expandSourceFile(file, { signal });
			warnings.push(...w);
			for (const structure of structures) {
				throwIfAborted(signal);
				let crc = "";
				try {
					const buf = await structure.arrayBuffer();
					crc = crc32Hex(buf);
				} catch {
					crc = "";
				}
				if (crc && seenCrc.has(crc)) {
					warnings.push(
						`Skipped duplicate "${structure.name}" (same bytes already imported).`
					);
					continue;
				}
				opts.onProgress?.(`Parsing ${structure.name}…`);
				try {
					const fields = await parseStructureFile(structure, {
						sourceName: file.name,
						sourceKind
					});
					if (crc) {
						fields.contentCrc32 = crc;
						seenCrc.add(crc);
					}
					entries.push(fields);
				} catch (e) {
					if (e && typeof e === "object" && e.name === "AbortError") throw e;
					errors.push(`${structure.name}: ${e?.message ?? String(e)}`);
				}
			}
		} catch (e) {
			if (e && typeof e === "object" && e.name === "AbortError") throw e;
			errors.push(`${file.name}: ${e?.message ?? e}`);
		}
	}

	return { entries, warnings, errors };
}

