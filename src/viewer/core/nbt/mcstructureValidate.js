/**
 * Shape, layer, and quota checks for one .mcstructure compound.
 */

import {
	fail,
	MCSTRUCTURE_MAX_CELLS,
	MCSTRUCTURE_MAX_DEPTH,
	MCSTRUCTURE_MAX_ENTITIES,
	MCSTRUCTURE_MAX_NODES,
	MCSTRUCTURE_MAX_STRING_BYTES,
	MCSTRUCTURE_SUPPORTED_VERSIONS,
	MCSTRUCTURE_WARN_CELLS,
	MCSTRUCTURE_WARN_ENTITIES
} from "./mcstructureLimits.js";

/**
 * Whole-number format. Version 2 is the 26.50+ save that may omit an empty second (waterlog) layer.
 * @param {object} nbt
 * @returns {number|null}
 */
export function mcstructureFormatVersion(nbt) {
	const raw = nbt?.["format_version"];
	// nbtify typed Int32 etc. extend Number; reject lists, arrays and compounds.
	if (raw == null || (typeof raw === "object" && !(raw instanceof Number))) return null;
	const n = Number(raw);
	return Number.isInteger(n) ? n : null;
}

/**
 * @param {unknown} v
 */
function isWholeNumber(n) {
	if (typeof n === "number") return Number.isInteger(n);
	// nbtify Int8/Int16/Int32 extend Number. A plain string or boolean is not a list element.
	if (typeof n === "object" && n instanceof Number) return Number.isInteger(Number(n));
	return false;
}

/** Typeless reads are Int32Array. Typed reads are a List of Int32. Both are three whole numbers. */
function isIntVec3(v) {
	if (v instanceof Int32Array) return v.length === 3;
	return Array.isArray(v) && v.length === 3 && v.every(isWholeNumber);
}

/**
 * First top-level shape check that fails, or null when the root looks like a supported .mcstructure.
 * Order: root → format_version → supported version → size → structure → structure_world_origin.
 * @param {object} nbt
 * @returns {{ code: string, message: string, extra?: object } | null}
 */
export function mcstructureShapeProblem(nbt) {
	if (!nbt || typeof nbt !== "object" || Array.isArray(nbt) || ArrayBuffer.isView(nbt)) {
		return { code: "STRUCTURE_NBT_REJECTED", message: "root is not an NBT compound" };
	}
	if (!Object.hasOwn(nbt, "format_version")) {
		return { code: "STRUCTURE_NBT_REJECTED", message: "missing format_version" };
	}
	const version = mcstructureFormatVersion(nbt);
	if (version == null) {
		return { code: "STRUCTURE_NBT_REJECTED", message: "format_version is not a whole number" };
	}
	// Format 3 stays here until a version 3 file exists. Do not treat unknown fields as that version.
	if (!MCSTRUCTURE_SUPPORTED_VERSIONS.includes(version)) {
		return {
			code: "STRUCTURE_UNSUPPORTED_VERSION",
			message: `unsupported format_version ${version} (Bedrock Layers reads ${MCSTRUCTURE_SUPPORTED_VERSIONS.join(", ")})`,
			extra: { formatVersion: version }
		};
	}
	if (!Object.hasOwn(nbt, "size")) {
		return { code: "STRUCTURE_NBT_REJECTED", message: "missing size" };
	}
	if (!isIntVec3(nbt["size"])) {
		return { code: "STRUCTURE_NBT_REJECTED", message: "size is not a list of 3 ints" };
	}
	if (!Object.hasOwn(nbt, "structure")) {
		return { code: "STRUCTURE_NBT_REJECTED", message: "missing structure" };
	}
	if (!Object.hasOwn(nbt, "structure_world_origin")) {
		return { code: "STRUCTURE_NBT_REJECTED", message: "missing structure_world_origin" };
	}
	if (!isIntVec3(nbt["structure_world_origin"])) {
		return { code: "STRUCTURE_NBT_REJECTED", message: "structure_world_origin is not a list of 3 ints" };
	}
	return null;
}

/**
 * @param {object} nbt
 * @returns {boolean}
 */
export function isNBTValidMcstructure(nbt) {
	return mcstructureShapeProblem(nbt) == null;
}

function layerLength(layer) {
	if (!layer) return -1;
	if (ArrayBuffer.isView(layer)) return layer.length;
	if (Array.isArray(layer)) return layer.length;
	return -1;
}

/**
 * Validates the root shape and block layers, then normalises a one-layer
 * version 2 file to two layers (`[layer0, Int32Array(volume).fill(-1)]`) in
 * place, so every downstream reader can keep assuming two layers.
 * @param {object} nbt
 * @returns {{ volume: number, warnings: string[], formatVersion: number, layersInFile: number }}
 */
export function assertMcstructureLayers(nbt) {
	const problem = mcstructureShapeProblem(nbt);
	if (problem) fail(problem.code, problem.message, problem.extra);
	const formatVersion = /** @type {number} */ (mcstructureFormatVersion(nbt));
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
	if (layers == null) {
		fail("STRUCTURE_NBT_REJECTED", "missing structure.block_indices");
	}
	const list = Array.isArray(layers) || ArrayBuffer.isView(layers) ? [...layers] : [];
	// Version 1 always stores two layers. Only version 2 may leave the second out.
	const allowed = formatVersion === 2 ? [1, 2] : [2];
	if (!allowed.includes(list.length)) {
		fail(
			"STRUCTURE_NBT_REJECTED",
			`block_indices has ${list.length} layer(s); format_version ${formatVersion} needs ${allowed.join(" or ")}`
		);
	}
	for (const [i, l] of list.entries()) {
		const len = layerLength(l);
		if (len < 0) fail("STRUCTURE_NBT_REJECTED", `block_indices[${i}] is not an int array`);
		if (len !== volume) {
			fail("STRUCTURE_NBT_REJECTED", `block_indices[${i}] length ${len} !== volume ${volume}`);
		}
	}
	if (formatVersion === 2 && list.length === 1) {
		nbt.structure.block_indices = [list[0], new Int32Array(volume).fill(-1)];
	}
	/** @type {string[]} */
	const warnings = [];
	if (volume >= MCSTRUCTURE_WARN_CELLS) {
		warnings.push(`large volume ${volume} (Learn UI-max ${MCSTRUCTURE_WARN_CELLS})`);
	}
	return { volume, warnings, formatVersion, layersInFile: list.length };
}

/**
 * True for an nbtify numeric tag instance (Int8, Int16, Int32, Float32) and a bare Number.
 * A compound that inherited one of those prototypes still has its own keys, so it stays a compound.
 * @param {object} value
 */
function isBareNbtNumber(value) {
	if (!(value instanceof Number)) return false;
	const proto = Object.getPrototypeOf(value);
	if (!proto || Object.getPrototypeOf(proto) !== Number.prototype) return false;
	return Object.keys(value).length === 0 && Object.getOwnPropertySymbols(value).length === 0;
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
		// nbtify Int8/Int16/Int32/Float32 are Number subclasses with no own keys.
		// A compound whose [[Prototype]] was replaced is not one of those boxes.
		if (isBareNbtNumber(value)) continue;
		if (Object.getPrototypeOf(value) !== Object.prototype) {
			fail("STRUCTURE_NBT_REJECTED", "__proto__ key");
		}
		stripDangerousNbtKeys(value);
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

const DANGEROUS_NBT_KEYS = new Set(["__proto__", "prototype", "constructor"]);

/**
 * Drop keys that would pollute Object.prototype if assigned on a parsed compound.
 * @param {object} obj
 */
export function stripDangerousNbtKeys(obj) {
	if (!obj || typeof obj !== "object") return;
	for (const k of Object.getOwnPropertyNames(obj)) {
		if (!DANGEROUS_NBT_KEYS.has(k)) continue;
		try {
			delete obj[k];
		} catch {
			/* ignore */
		}
	}
}


