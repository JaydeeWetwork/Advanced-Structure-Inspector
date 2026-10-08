/**
 * Format 2 compression 1: a zlib structure byte array, checksum, then NBT.
 */

import * as NBT from "../../../vendor/nbtify-readonly-typeless/index.js";
import { assertNbtArrayLengths } from "./nbtArrayLengthGate.js";
import {
	fail,
	MCSTRUCTURE_MAX_BYTES,
	MCSTRUCTURE_MAX_DEPTH,
	MCSTRUCTURE_MAX_NODES,
	MCSTRUCTURE_READ_OPTIONS,
	McstructureCodecError
} from "./mcstructureLimits.js";

/**
 * Byte array from the typeless reader, or a Uint8Array written in tests.
 * @param {unknown} value
 * @returns {Uint8Array|null}
 */
function asByteArray(value) {
	if (value instanceof Uint8Array) return value;
	if (value instanceof ArrayBuffer) return new Uint8Array(value);
	if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
	if (!Array.isArray(value)) return null;
	const out = new Uint8Array(value.length);
	for (let i = 0; i < value.length; i++) {
		const n = Number(value[i]);
		if (!Number.isInteger(n)) return null;
		out[i] = n < 0 ? n + 256 : n;
	}
	return out;
}

/**
 * Zlib wrapper (RFC 1950), the same bytes node:zlib deflateSync writes.
 * @param {Uint8Array} bytes
 */
async function inflateZlib(bytes) {
	let stream;
	try {
		stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
	} catch {
		fail("STRUCTURE_COMPRESSED", "compression 1 payload");
	}
	const reader = stream.getReader();
	/** @type {Uint8Array[]} */
	const chunks = [];
	let total = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > MCSTRUCTURE_MAX_BYTES) {
				await reader.cancel();
				fail("STRUCTURE_TOO_LARGE", `inflated ${total} > ${MCSTRUCTURE_MAX_BYTES}`);
			}
			chunks.push(value);
		}
	} catch (e) {
		if (e instanceof McstructureCodecError) throw e;
		fail("STRUCTURE_NBT_REJECTED", `zlib: ${e?.message ?? e}`);
	}
	const out = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		out.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return out;
}

/**
 * RFC 1950 Adler-32 of the inflated bytes.
 * @param {Uint8Array} bytes
 */
function adler32(bytes) {
	let a = 1;
	let b = 0;
	const MOD = 65521;
	const NMAX = 5552;
	for (let i = 0; i < bytes.length;) {
		const end = Math.min(i + NMAX, bytes.length);
		for (; i < end; i++) {
			a += bytes[i];
			b += a;
		}
		a %= MOD;
		b %= MOD;
	}
	return ((b << 16) | a) >>> 0;
}

/**
 * CM 8, a valid FCHECK, and no preset dictionary.
 * @param {Uint8Array} bytes
 */
function assertZlibWrapper(bytes) {
	if (bytes.byteLength < 6) fail("STRUCTURE_NBT_REJECTED", "compressed payload too short");
	const cmf = bytes[0];
	const flg = bytes[1];
	if ((cmf & 0x0f) !== 8 || (((cmf << 8) | flg) % 31) !== 0 || (flg & 0x20) !== 0) {
		fail("STRUCTURE_NBT_REJECTED", "payload is not a zlib stream");
	}
}

/**
 * The last four payload bytes are the checksum. Some inflate implementations
 * return the payload and ignore bytes after the stream. Those fail here.
 * @param {Uint8Array} payload
 * @param {Uint8Array} inflated
 */
export function assertZlibChecksum(payload, inflated) {
	const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
	const stored = view.getUint32(payload.byteLength - 4, false);
	if (stored !== adler32(inflated)) {
		fail("STRUCTURE_NBT_REJECTED", "trailing bytes after zlib stream");
	}
}

/**
 * Replace a zlib-compressed structure byte array with the compound it stores.
 * @param {object} nbt
 */
export async function expandCompressedStructure(nbt) {
	const bytes = asByteArray(nbt.structure);
	if (!bytes) fail("STRUCTURE_NBT_REJECTED", "compression 1 needs structure as BYTE_ARRAY");
	assertZlibWrapper(bytes);
	const inflated = await inflateZlib(bytes);
	assertZlibChecksum(bytes, inflated);
	assertNbtArrayLengths(inflated, fail, {
		maxDepth: MCSTRUCTURE_MAX_DEPTH - 1,
		maxNodes: MCSTRUCTURE_MAX_NODES
	});
	let parsed;
	try {
		parsed = await NBT.read(inflated, { ...MCSTRUCTURE_READ_OPTIONS, strict: true });
	} catch (e) {
		if (e instanceof McstructureCodecError) throw e;
		fail("STRUCTURE_NBT_REJECTED", e?.message ?? "compression 1 payload");
	}
	const structure = parsed?.data;
	if (!structure || typeof structure !== "object" || Array.isArray(structure) || ArrayBuffer.isView(structure)) {
		fail("STRUCTURE_NBT_REJECTED", "compression 1 payload is not a compound", { nbt });
	}
	nbt.structure = structure;
	delete nbt.compression;
}


