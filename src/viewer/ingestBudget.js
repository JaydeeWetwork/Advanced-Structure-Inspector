/**
 * Ingest caps, source sniff, and structure file names.
 */

export const ZIP_MAX_ENTRIES = 10_000;
export const ZIP_MAX_UNCOMPRESSED = 64 * 1024 * 1024;
export const ZIP_MAX_ENTRY_BYTES = 64 * 1024 * 1024;
/** Reject a member whose declared uncompressed size is more than this many times its compressed size. */
export const ZIP_MAX_RATIO = 1000;
export const ZIP_MAX_STRUCTURES = 64;
export const INGEST_MAX_TOP_FILES = 32;

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

const STRUCTURE_NAME_UNSAFE = /[^\p{L}\p{N} ._:-]/gu;

/**
 * Basename plus a tight character set, for names that later become labels or files.
 * @param {string} name
 * @returns {string}
 */
export function safeStructureFileName(name) {
	return sanitizeZipEntryName(name).replace(STRUCTURE_NAME_UNSAFE, "_");
}

/**
 * @param {File} file
 * @returns {File}
 */
export function fileWithSafeStructureName(file) {
	const name = safeStructureFileName(file?.name) || "structure.mcstructure";
	if (file && name === file.name) return file;
	return new File(file ? [file] : [], name, {
		type: file?.type || "",
		lastModified: file?.lastModified
	});
}

/**
 * Declared-size gate. A missing or zero compressed size does not invent a ratio.
 * @param {{ uncompressedSize?: number, compressedSize?: number }} entry
 */
export function assertZipEntryInflation(entry) {
	const declared = Number(entry?.uncompressedSize);
	const compressed = Number(entry?.compressedSize);
	if (Number.isFinite(declared) && declared > ZIP_MAX_ENTRY_BYTES) {
		throw new IngestError(
			"ZIP_TOO_LARGE",
			`zip entry exceeds ${ZIP_MAX_ENTRY_BYTES} bytes`
		);
	}
	if (
		Number.isFinite(compressed) && compressed > 0
		&& Number.isFinite(declared)
		&& declared / compressed > ZIP_MAX_RATIO
	) {
		throw new IngestError(
			"ZIP_TOO_LARGE",
			`zip entry compression ratio exceeds ${ZIP_MAX_RATIO}:1`
		);
	}
}


