/**
 * .mcstructure size caps, the codec error, and the byte gate before nbtify.
 */

export const MCSTRUCTURE_MAX_BYTES = 64 * 1024 * 1024;
export const MCSTRUCTURE_MAX_CELLS = 8_388_608;
export const MCSTRUCTURE_WARN_CELLS = 64 * 257 * 64;
export const MCSTRUCTURE_MAX_DEPTH = 64;
export const MCSTRUCTURE_MAX_NODES = 2_000_000;
export const MCSTRUCTURE_MAX_ENTITIES = 50_000;
export const MCSTRUCTURE_WARN_ENTITIES = 10_000;
export const MCSTRUCTURE_MAX_STRING_BYTES = 16 * 1024 * 1024;
/** `format_version` values this codec reads. 2 = 26.50+ saves (second block layer optional). */
export const MCSTRUCTURE_SUPPORTED_VERSIONS = Object.freeze([1, 2]);

/** nbtify options for Bedrock .mcstructure — compression must be null, not omitted. */
export const MCSTRUCTURE_READ_OPTIONS = {
	endian: "little",
	compression: null,
	bedrockLevel: false,
	strict: false
};

export class McstructureCodecError extends Error {
	/**
	 * @param {string} code
	 * @param {string} message
	 * @param {object} [extra]
	 */
	constructor(code, message, extra = {}) {
		super(message);
		this.name = "McstructureCodecError";
		this.code = code;
		this.extra = extra;
	}

	/**
	 * @param {string} [fileName]
	 */
	userMessage(fileName) {
		const who = fileName ? `"${fileName}"` : "Structure file";
		switch (this.code) {
			case "STRUCTURE_EMPTY":
				return `${who} is empty. Re-import the .mcstructure (Safari / iPad does not keep the original picker file after reload). If it came from cloud storage, export it again from Minecraft.`;
			case "STRUCTURE_TOO_LARGE":
				return `${who} is larger than 64 MiB`;
			case "STRUCTURE_COMPRESSED":
				return `${who} is compressed (${this.message}). Bedrock Layers reads uncompressed files, and a version 2 file whose structure compound is stored as zlib. This file did not match that layout.`;
			case "STRUCTURE_UNSUPPORTED_VERSION":
				return `${who} uses .mcstructure format_version ${this.extra?.formatVersion ?? "?"}, which Bedrock Layers can't read yet (it reads versions ${MCSTRUCTURE_SUPPORTED_VERSIONS.join(" and ")}). It was probably saved by a newer Minecraft.`;
			case "STRUCTURE_LEVEL_DAT":
				return `${who} looks like level.dat, not .mcstructure`;
			case "JAVA_NBT_DETECTED":
				return `${who} looks like a Java edition NBT file, not Bedrock .mcstructure`;
			case "STRUCTURE_NBT_REJECTED":
			default:
				return `${who} is not a valid .mcstructure (${this.message})`;
		}
	}

	/**
	 * @param {string} [fileName]
	 * @param {new (message?: string) => Error} [ErrorType]
	 */
	toError(fileName, ErrorType = Error) {
		const err = /** @type {Error & { code: string }} */ (new ErrorType(this.userMessage(fileName)));
		err.cause = this;
		err.code = this.code;
		return err;
	}
}

export function fail(code, message, extra) {
	throw new McstructureCodecError(code, message, extra);
}

/**
 * P0: reject before nbtify.
 * @param {ArrayBuffer|ArrayBufferView} buffer
 */
export function gateMcstructureBytes(buffer) {
	const byteLength = buffer?.byteLength ?? 0;
	if (!byteLength) fail("STRUCTURE_EMPTY", "empty buffer");
	if (byteLength > MCSTRUCTURE_MAX_BYTES) {
		fail("STRUCTURE_TOO_LARGE", `byteLength ${byteLength} > ${MCSTRUCTURE_MAX_BYTES}`);
	}
	const view = buffer instanceof ArrayBuffer
		? new DataView(buffer)
		: new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
	if (byteLength >= 2 && view.getUint16(0, false) === 0x1f8b) {
		fail("STRUCTURE_COMPRESSED", "gzip magic");
	}
	// Whole-file zlib. The 26.60.29 preview format keeps an uncompressed root and is caught after parse.
	if (byteLength >= 1 && view.getUint8(0) === 0x78) {
		fail("STRUCTURE_COMPRESSED", "zlib magic");
	}
	if (looksLikeLevelDat(view, byteLength)) {
		fail("STRUCTURE_LEVEL_DAT", "bedrockLevel prefix");
	}
}

/**
 * level.dat is `uint32 version` + `uint32 payloadLength` + NBT.
 * Do not treat "uint32le@4 === byteLength-8" alone as magic — that collides
 * with little-endian compound NBT. Require a small version dword, payload
 * length match, NBT compound at offset 8, and a first byte that is not a
 * named-root NBT tag with a fitting name length.
 * @param {DataView} view
 * @param {number} byteLength
 */
function looksLikeLevelDat(view, byteLength) {
	if (byteLength < 9) return false;
	if (view.getUint32(4, true) !== byteLength - 8) return false;
	if (view.getUint8(8) !== 0x0a) return false;
	const version = view.getUint32(0, true);
	if (version < 1 || version > 255) return false;
	// version 1–255 LE is `ver,0,0,0`. Unnamed NBT compound is `0A,0,0,childTag`.
	return view.getUint8(1) === 0 && view.getUint8(2) === 0 && view.getUint8(3) === 0;
}


