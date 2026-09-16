/**
 * Ingest Minecraft structure sources into catalog entries.
 * Unknown extensions are sniffed; Java/gzip never become catalog rows.
 */

import { parseStructureFile } from "./parseStructure.js";
import { throwIfAborted } from "./abortUtil.js";
import { crc32Hex } from "./crc32.js";

export const ZIP_MAX_ENTRIES = 10_000;
export const ZIP_MAX_UNCOMPRESSED = 64 * 1024 * 1024;
export const ZIP_MAX_ENTRY_BYTES = 64 * 1024 * 1024;
export const ZIP_MAX_STRUCTURES = 64;
export const INGEST_MAX_TOP_FILES = 32;
const ADDON_NEST_MAX_DEPTH = 2;

export class IngestError extends Error {
	/**
	 * @param {string} code
	 * @param {string} message
	 */
	constructor(code, message) {
		super(message);
		this.name = "IngestError";
		this.code = code;
	}
}

/**
 * @param {File} file
 * @returns {"mcstructure"|"mcworld"|"mcpack"|"mcaddon"|"zip"|"mctemplate"|"java-nbt"|"unknown"}
 */
export function detectSourceKind(file) {
	const name = (file.name || "").toLowerCase();
	if (name.endsWith(".mcstructure")) return "mcstructure";
	if (name.endsWith(".mcworld")) return "mcworld";
	if (name.endsWith(".mctemplate")) return "mctemplate";
	if (name.endsWith(".mcpack")) return "mcpack";
	if (name.endsWith(".mcaddon")) return "mcaddon";
	if (name.endsWith(".zip")) return "zip";
	if (
		name.endsWith(".nbt")
		|| name.endsWith(".litematic")
		|| name.endsWith(".schem")
		|| name.endsWith(".schematic")
	) return "java-nbt";
	return "unknown";
}

/**
 * @param {ArrayBuffer|ArrayBufferView|Uint8Array} bytes
 * @returns {"gzip"|"zlib"|"zip"|"nbt-compound"|"other"}
 */
export function sniffSourceMagic(bytes) {
	const u8 = bytes instanceof Uint8Array
		? bytes
		: bytes instanceof ArrayBuffer
			? new Uint8Array(bytes)
			: new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (u8.length >= 2 && u8[0] === 0x1f && u8[1] === 0x8b) return "gzip";
	if (u8.length >= 1 && u8[0] === 0x78) return "zlib";
	if (u8.length >= 2 && u8[0] === 0x50 && u8[1] === 0x4b) return "zip";
	if (u8.length >= 1 && u8[0] === 0x0a) return "nbt-compound";
	return "other";
}

/**
 * @param {{ length: number, uncompressedSize?: number }[]} entries
 */
export function assertZipBudget(entries) {
	if (!Array.isArray(entries)) {
		throw new IngestError("ZIP_TOO_MANY_ENTRIES", "zip entry list missing");
	}
	if (entries.length > ZIP_MAX_ENTRIES) {
		throw new IngestError(
			"ZIP_TOO_MANY_ENTRIES",
			`zip has ${entries.length} entries (max ${ZIP_MAX_ENTRIES})`
		);
	}
	let sum = 0;
	for (const e of entries) {
		sum += Math.max(0, Number(e.uncompressedSize) || 0);
		if (sum > ZIP_MAX_UNCOMPRESSED) {
			throw new IngestError(
				"ZIP_TOO_LARGE",
				`zip uncompressed size exceeds ${ZIP_MAX_UNCOMPRESSED} bytes`
			);
		}
	}
}

/**
 * Zip-slip-safe basename for a catalog File.name. Never uses zip comments.
 * @param {string} filename
 * @returns {string}
 */
export function sanitizeZipEntryName(filename) {
	const raw = String(filename || "").replace(/\\/g, "/");
	let base = raw.split("/").pop() || "";
	base = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
	if (!base || base === "." || base === "..") return "";
	return base.slice(0, 180);
}

function javaRefuse() {
	throw new IngestError(
		"JAVA_NBT_DETECTED",
		"looks like a Java edition NBT file, not Bedrock .mcstructure"
	);
}

/**
 * @param {string} filename
 */
function isAddonNestedArchive(filename) {
	const n = filename.toLowerCase();
	return n.endsWith(".mcworld")
		|| n.endsWith(".mctemplate")
		|| n.endsWith(".mcpack")
		|| n.endsWith(".mcaddon");
}

/**
 * @param {File} file
 * @param {(entries: any[], zip: typeof import("@zip.js/zip.js")) => Promise<T>} fn
 * @returns {Promise<T>}
 * @template T
 */
async function withZipEntries(file, fn) {
	const zip = await import("@zip.js/zip.js");
	const reader = new zip.ZipReader(new zip.BlobReader(file));
	try {
		const entries = await reader.getEntries();
		assertZipBudget(entries);
		return await fn(entries, zip);
	} finally {
		await reader.close().catch(() => {});
	}
}

/**
 * @param {any} entry
 * @param {number} i
 * @param {typeof import("@zip.js/zip.js")} zip
 * @param {string} [fallbackName]
 */
async function zipEntryToFile(entry, i, zip, fallbackName, signal) {
	throwIfAborted(signal);
	if (entry.encrypted) {
		throw new IngestError("ZIP_ENCRYPTED", "encrypted zip entries are not imported");
	}
	const declared = Number(entry.uncompressedSize);
	if (Number.isFinite(declared) && declared > ZIP_MAX_ENTRY_BYTES) {
		throw new IngestError(
			"ZIP_TOO_LARGE",
			`zip entry exceeds ${ZIP_MAX_ENTRY_BYTES} bytes`
		);
	}
	const opts = signal ? { signal } : {};
	const blob = await entry.getData(new zip.BlobWriter(), opts);
	if (blob.size > ZIP_MAX_ENTRY_BYTES) {
		throw new IngestError(
			"ZIP_TOO_LARGE",
			`zip entry exceeds ${ZIP_MAX_ENTRY_BYTES} bytes`
		);
	}
	const name = sanitizeZipEntryName(entry.filename) || fallbackName || `file_${i}`;
	return new File([blob], name);
}

/**
 * @param {File} file
 * @param {{ nest?: boolean, nestDepth?: number, running: { n: number } }} ctx
 * @returns {Promise<File[]>}
 */
async function extractMcstructuresFromZip(file, ctx) {
	const nest = !!ctx.nest;
	const nestDepth = ctx.nestDepth ?? 0;
	const running = ctx.running;
	const signal = ctx.signal;
	return withZipEntries(file, async (entries, zip) => {
		const structures = [];
		const addSize = n => {
			running.n += n;
			if (running.n > ZIP_MAX_UNCOMPRESSED) {
				throw new IngestError(
					"ZIP_TOO_LARGE",
					`extracted bytes exceed ${ZIP_MAX_UNCOMPRESSED}`
				);
			}
		};
		const addStructure = f => {
			running.structures = (running.structures || 0) + 1;
			if (running.structures > ZIP_MAX_STRUCTURES) {
				throw new IngestError(
					"ZIP_TOO_MANY_STRUCTURES",
					`more than ${ZIP_MAX_STRUCTURES} .mcstructure files in this import`
				);
			}
			structures.push(f);
		};
		for (let i = 0; i < entries.length; i++) {
			throwIfAborted(signal);
			const entry = entries[i];
			if (entry.directory || entry.encrypted) continue;
			const lower = (entry.filename || "").toLowerCase();
			if (lower.endsWith(".mcstructure")) {
				const f = await zipEntryToFile(entry, i, zip, `structure_${i}.mcstructure`, signal);
				const name = f.name.endsWith(".mcstructure") ? f.name : `${f.name}.mcstructure`;
				const structure = new File([f], name, { type: "application/mcstructure" });
				addSize(structure.size);
				addStructure(structure);
				continue;
			}
			if (nest && nestDepth < ADDON_NEST_MAX_DEPTH && isAddonNestedArchive(lower)) {
				const nested = await zipEntryToFile(entry, i, zip, `nested_${i}`, signal);
				addSize(nested.size);
				const inner = await expandSource(nested, {
					nestDepth: nestDepth + 1,
					running,
					signal
				});
				structures.push(...inner.structures);
			}
		}
		return structures;
	});
}

/**
 * @param {File} file
 * @param {{ nestDepth: number, running: { n: number } }} ctx
 * @returns {Promise<{ structures: File[], sourceKind: ReturnType<typeof detectSourceKind>, warnings: string[] }>}
 */
async function expandSource(file, ctx) {
	let sourceKind = detectSourceKind(file);
	const warnings = [];

	if (sourceKind === "java-nbt") javaRefuse();

	if (sourceKind === "unknown") {
		const magic = sniffSourceMagic(await file.slice(0, 16).arrayBuffer());
		if (magic === "gzip" || magic === "zlib") javaRefuse();
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
		throwIfAborted(ctx.signal);
		await withZipEntries(file, async () => {});
		const { extractStructureFilesFromMcworld } = await import("mcbe-leveldb-reader");
		const map = await extractStructureFilesFromMcworld(file);
		const structures = [...map.values()];
		if (!structures.length) {
			warnings.push(`No structure templates found in ${file.name}`);
		}
		let sum = 0;
		if (structures.length > ZIP_MAX_STRUCTURES) {
			throw new IngestError(
				"ZIP_TOO_MANY_STRUCTURES",
				`world has ${structures.length} structures (max ${ZIP_MAX_STRUCTURES})`
			);
		}
		for (const s of structures) {
			const n = Number(s?.size) || 0;
			if (n > ZIP_MAX_ENTRY_BYTES) {
				throw new IngestError("ZIP_TOO_LARGE", `structure in world exceeds ${ZIP_MAX_ENTRY_BYTES} bytes`);
			}
			sum += n;
			if (sum > ZIP_MAX_UNCOMPRESSED) {
				throw new IngestError("ZIP_TOO_LARGE", `world structures exceed ${ZIP_MAX_UNCOMPRESSED} bytes`);
			}
		}
		ctx.running.n += sum;
		ctx.running.structures = (ctx.running.structures || 0) + structures.length;
		return { structures, sourceKind, warnings };
	}

	if (sourceKind === "mcpack" || sourceKind === "zip" || sourceKind === "mcaddon") {
		const structures = await extractMcstructuresFromZip(file, {
			nest: sourceKind === "mcaddon",
			nestDepth: ctx.nestDepth,
			running: ctx.running,
			signal: ctx.signal
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
