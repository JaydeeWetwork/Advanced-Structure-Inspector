/**
 * Single chokepoint for .mcstructure bytes → NBT.
 * Never call option-less NBT.read. Never decompress.
 *
 * Array lengths are checked by nbtArrayLengthGate before nbtify. nbtify still
 * allocates INT_ARRAY after that walk rejects huge lengths.
 */

import * as NBT from "nbtify-readonly-typeless";
import { assertNbtArrayLengths } from "./nbtArrayLengthGate.js";

export const MCSTRUCTURE_MAX_BYTES = 64 * 1024 * 1024;
export const MCSTRUCTURE_MAX_CELLS = 8_388_608;
export const MCSTRUCTURE_WARN_CELLS = 64 * 257 * 64;
export const MCSTRUCTURE_MAX_DEPTH = 64;
export const MCSTRUCTURE_MAX_NODES = 2_000_000;
export const MCSTRUCTURE_MAX_ENTITIES = 50_000;
export const MCSTRUCTURE_WARN_ENTITIES = 10_000;
export const MCSTRUCTURE_MAX_STRING_BYTES = 16 * 1024 * 1024;

/** nbtify options for Bedrock .mcstructure — compression must be null, not omitted. */
export const MCSTRUCTURE_READ_OPTIONS = {
	endian: "little",
	compression: null,
	bedrockLevel: false,
	strict: false
};

/** Same File object → same parse (catalog + preview + hopper/materials). */
const fileReadCache = typeof WeakMap !== "undefined" ? new WeakMap() : null;

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
				return `${who} is compressed (gzip/zlib). Bedrock .mcstructure is uncompressed little-endian NBT.`;
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
	 * @param {typeof Error} [ErrorType]
	 */
	toError(fileName, ErrorType = Error) {
		const err = new ErrorType(this.userMessage(fileName));
		err.cause = this;
		err.code = this.code;
		return err;
	}
}

function fail(code, message, extra) {
	throw new McstructureCodecError(code, message, extra);
}

/**
 * @param {Blob} blob
 * @returns {Promise<ArrayBuffer>}
 */
async function arrayBufferOrEmpty(blob) {
	try {
		return await blob.arrayBuffer();
	} catch {
		return new ArrayBuffer(0);
	}
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

/**
 * @param {object} nbt
 * @returns {boolean}
 */
export function isNBTValidMcstructure(nbt) {
	return nbt
		&& nbt["format_version"] == 1
		&& nbt["size"] instanceof Int32Array
		&& nbt["size"].length == 3
		&& "structure" in nbt
		&& nbt["structure_world_origin"] instanceof Int32Array
		&& nbt["structure_world_origin"].length == 3;
}

function layerLength(layer) {
	if (!layer) return -1;
	if (ArrayBuffer.isView(layer)) return layer.length;
	if (Array.isArray(layer)) return layer.length;
	return -1;
}

/**
 * @param {object} nbt
 * @returns {{ volume: number, warnings: string[] }}
 */
export function assertMcstructureLayers(nbt) {
	if (!isNBTValidMcstructure(nbt)) {
		fail("STRUCTURE_NBT_REJECTED", "missing format_version/size/structure/origin");
	}
	const sx = Number(nbt.size[0]);
	const sy = Number(nbt.size[1]);
	const sz = Number(nbt.size[2]);
	if (![sx, sy, sz].every(n => Number.isFinite(n) && n >= 0 && n === (n | 0))) {
		fail("STRUCTURE_NBT_REJECTED", "size is not three non-negative ints");
	}
	const volume = sx * sy * sz;
	if (!Number.isSafeInteger(volume) || volume > MCSTRUCTURE_MAX_CELLS) {
		fail("STRUCTURE_NBT_REJECTED", `cell product ${volume} > ${MCSTRUCTURE_MAX_CELLS}`);
	}
	const layers = nbt.structure?.block_indices;
	const list = Array.isArray(layers) || ArrayBuffer.isView(layers) ? [...layers] : [];
	if (list.length !== 2) {
		fail("STRUCTURE_NBT_REJECTED", `block_indices must have exactly 2 layers, got ${list.length}`);
	}
	const len0 = layerLength(list[0]);
	const len1 = layerLength(list[1]);
	if (len0 !== len1 || len0 !== volume) {
		fail("STRUCTURE_NBT_REJECTED", `block_indices length ${len0}/${len1} !== volume ${volume}`);
	}
	/** @type {string[]} */
	const warnings = [];
	if (volume >= MCSTRUCTURE_WARN_CELLS) {
		warnings.push(`large volume ${volume} (Learn UI-max ${MCSTRUCTURE_WARN_CELLS})`);
	}
	return { volume, warnings };
}

/**
 * Iterative quota walk. Hard-fail → STRUCTURE_NBT_REJECTED.
 * @param {object} nbt
 * @param {number} volume
 */
export function assertNbtQuotas(nbt, volume) {
	const skip = new Set();
	const indexLayers = nbt.structure?.block_indices;
	if (indexLayers) {
		skip.add(indexLayers);
		if (Array.isArray(indexLayers) || ArrayBuffer.isView(indexLayers)) {
			for (const layer of indexLayers) skip.add(layer);
		}
	}

	let nodes = 0;
	let stringBytes = 0;
	const stack = [{ value: nbt, depth: 0 }];
	while (stack.length) {
		const { value, depth } = stack.pop();
		if (value == null) continue;
		if (skip.has(value)) {
			nodes++;
			continue;
		}
		if (typeof value === "string") {
			stringBytes += value.length;
			if (stringBytes > MCSTRUCTURE_MAX_STRING_BYTES) {
				fail("STRUCTURE_NBT_REJECTED", "STRING byte budget exceeded");
			}
			continue;
		}
		if (typeof value !== "object") continue;
		if (depth > MCSTRUCTURE_MAX_DEPTH) {
			fail("STRUCTURE_NBT_REJECTED", `NBT depth ${depth} > ${MCSTRUCTURE_MAX_DEPTH}`);
		}
		nodes++;
		if (nodes > MCSTRUCTURE_MAX_NODES) {
			fail("STRUCTURE_NBT_REJECTED", `NBT nodes > ${MCSTRUCTURE_MAX_NODES}`);
		}
		if (ArrayBuffer.isView(value) && !(value instanceof DataView)) continue;
		if (Array.isArray(value)) {
			for (let i = value.length - 1; i >= 0; i--) {
				stack.push({ value: value[i], depth: depth + 1 });
			}
			continue;
		}
		for (const [k, v] of Object.entries(value)) {
			stringBytes += k.length;
			if (stringBytes > MCSTRUCTURE_MAX_STRING_BYTES) {
				fail("STRUCTURE_NBT_REJECTED", "STRING byte budget exceeded");
			}
			stack.push({ value: v, depth: depth + 1 });
		}
	}

	const entities = nbt.structure?.entities;
	const entityCount = Array.isArray(entities) || ArrayBuffer.isView(entities)
		? entities.length
		: 0;
	if (entityCount > MCSTRUCTURE_MAX_ENTITIES) {
		fail("STRUCTURE_NBT_REJECTED", `entities ${entityCount} > ${MCSTRUCTURE_MAX_ENTITIES}`);
	}

	const bpd = nbt.structure?.palette?.default?.block_position_data;
	const bpdKeys = bpd && typeof bpd === "object" && !ArrayBuffer.isView(bpd)
		? Object.keys(bpd).length
		: 0;
	if (bpdKeys > volume) {
		fail("STRUCTURE_NBT_REJECTED", `block_position_data keys ${bpdKeys} > volume ${volume}`);
	}

	/** @type {string[]} */
	const warnings = [];
	if (entityCount >= MCSTRUCTURE_WARN_ENTITIES) {
		warnings.push(`entity count ${entityCount}`);
	}
	return { nodes, stringBytes, entityCount, warnings };
}

/**
 * @param {ArrayBuffer|ArrayBufferView|File} input
 * @param {{ fileName?: string }} [opts]
 * @returns {Promise<{ nbt: object, diagnostics: { warnings: string[], volume: number } }>}
 */
export async function readMcstructure(input, opts = {}) {
	void opts;
	if (typeof File !== "undefined" && input instanceof File && fileReadCache) {
		const hit = fileReadCache.get(input);
		if (hit) return hit;
		const pending = readMcstructureFromBuffer(await arrayBufferOrEmpty(input));
		fileReadCache.set(input, pending);
		try {
			return await pending;
		} catch (e) {
			fileReadCache.delete(input);
			throw e;
		}
	}
	const buffer = typeof Blob !== "undefined" && input instanceof Blob
		? await arrayBufferOrEmpty(input)
		: input;
	return readMcstructureFromBuffer(buffer);
}

/**
 * @param {ArrayBuffer|ArrayBufferView} buffer
 */
async function readMcstructureFromBuffer(buffer) {
	gateMcstructureBytes(buffer);
	assertNbtArrayLengths(buffer, fail);
	let parsed;
	try {
		parsed = await NBT.read(buffer, MCSTRUCTURE_READ_OPTIONS);
	} catch (e) {
		fail("STRUCTURE_NBT_REJECTED", e?.message ?? String(e));
	}
	const nbt = parsed?.data;
	if (nbt && typeof nbt === "object" && "DataVersion" in nbt) {
		fail("JAVA_NBT_DETECTED", "Java DataVersion key", { nbt });
	}
	try {
		const layer = assertMcstructureLayers(nbt);
		const quotas = assertNbtQuotas(nbt, layer.volume);
		return {
			nbt,
			diagnostics: {
				volume: layer.volume,
				warnings: [...layer.warnings, ...quotas.warnings]
			}
		};
	} catch (e) {
		if (e instanceof McstructureCodecError) {
			e.extra = { ...e.extra, nbt };
			throw e;
		}
		throw e;
	}
}

const WRITE_OPTIONS = {
	endian: "little",
	compression: null,
	bedrockLevel: false
};

/**
 * Product write: little-endian uncompressed .mcstructure. Re-reads with P1.
 * @param {object} nbt
 * @returns {Promise<Uint8Array>}
 */
export async function writeMcstructure(nbt) {
	const layer = assertMcstructureLayers(nbt);
	assertNbtQuotas(nbt, layer.volume);
	const writable = await import("nbtify");
	const bytes = await writable.write(nbt, WRITE_OPTIONS);
	const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	await readMcstructureFromBuffer(u8);
	return u8;
}
