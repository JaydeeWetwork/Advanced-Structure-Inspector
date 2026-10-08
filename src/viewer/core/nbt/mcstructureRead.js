/**
 * Read one .mcstructure buffer through the byte gate, inflate, and quotas.
 */

import * as NBT from "../../../vendor/nbtify-readonly-typeless/index.js";
import { assertNbtArrayLengths } from "./nbtArrayLengthGate.js";
import {
	fail,
	gateMcstructureBytes,
	MCSTRUCTURE_MAX_DEPTH,
	MCSTRUCTURE_MAX_NODES,
	MCSTRUCTURE_READ_OPTIONS,
	McstructureCodecError
} from "./mcstructureLimits.js";
import { assertMcstructureLayers, assertNbtQuotas } from "./mcstructureValidate.js";
import { expandCompressedStructure } from "./mcstructureInflate.js";

/** Same File object → same parse (catalog + preview + hopper/materials). */
const fileReadCache = typeof WeakMap !== "undefined" ? new WeakMap() : null;

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
export async function readMcstructureFromBuffer(buffer) {
	gateMcstructureBytes(buffer);
	assertNbtArrayLengths(buffer, fail, {
		maxDepth: MCSTRUCTURE_MAX_DEPTH,
		maxNodes: MCSTRUCTURE_MAX_NODES
	});
	let parsed;
	try {
		parsed = await NBT.read(buffer, MCSTRUCTURE_READ_OPTIONS);
	} catch (e) {
		fail("STRUCTURE_NBT_REJECTED", e?.message ?? String(e));
	}
	const nbt = parsed?.data;
	if (nbt && typeof nbt === "object" && Object.hasOwn(nbt, "DataVersion")) {
		fail("JAVA_NBT_DETECTED", "Java DataVersion key", { nbt });
	}
	// Format 3 is refused in mcstructureShapeProblem. compression 1 is the only decoded payload.
	if (nbt && typeof nbt === "object" && Object.hasOwn(nbt, "compression")) {
		const compression = nbt.compression;
		if (typeof compression !== "number" || !Number.isInteger(compression)) {
			fail("STRUCTURE_NBT_REJECTED", "compression is not an int");
		}
		if (compression === 1) {
			await expandCompressedStructure(nbt);
		} else if (compression !== 0) {
			fail("STRUCTURE_COMPRESSED", `compression ${compression} payload`, { nbt });
		}
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


