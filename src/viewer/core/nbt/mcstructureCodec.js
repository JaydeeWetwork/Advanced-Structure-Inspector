/**
 * Single chokepoint for .mcstructure bytes → NBT.
 * Never call option-less NBT.read. Whole-file gzip/zlib is rejected.
 * Format 2 `compression: 1` is the structure compound stored as a zlib
 * NBT byte array (26.60.29). Inflation stops past 64 MiB. The zlib checksum
 * must match that output, so bytes after the stream are rejected. There is
 * no compression-ratio cap. Format version 3 is still refused.
 *
 * Array lengths are checked by nbtArrayLengthGate before nbtify. nbtify still
 * allocates INT_ARRAY after that walk rejects huge lengths.
 */

export {
	McstructureCodecError,
	MCSTRUCTURE_MAX_BYTES,
	MCSTRUCTURE_MAX_CELLS,
	MCSTRUCTURE_MAX_DEPTH,
	MCSTRUCTURE_MAX_ENTITIES,
	MCSTRUCTURE_MAX_NODES,
	MCSTRUCTURE_MAX_STRING_BYTES,
	MCSTRUCTURE_READ_OPTIONS,
	MCSTRUCTURE_SUPPORTED_VERSIONS,
	MCSTRUCTURE_WARN_CELLS,
	MCSTRUCTURE_WARN_ENTITIES,
	gateMcstructureBytes
} from "./mcstructureLimits.js";
export {
	assertMcstructureLayers,
	assertNbtQuotas,
	isNBTValidMcstructure,
	mcstructureFormatVersion,
	mcstructureShapeProblem,
	stripDangerousNbtKeys
} from "./mcstructureValidate.js";
export { assertZlibChecksum } from "./mcstructureInflate.js";
export { readMcstructure } from "./mcstructureRead.js";
export { writeMcstructure } from "./mcstructureWrite.js";

