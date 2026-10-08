/**
 * Structure codec API (nbtify gate).
 */

export {
	McstructureCodecError,
	MCSTRUCTURE_READ_OPTIONS,
	MCSTRUCTURE_MAX_BYTES,
	MCSTRUCTURE_MAX_CELLS,
	gateMcstructureBytes,
	isNBTValidMcstructure,
	assertMcstructureLayers,
	assertNbtQuotas,
	readMcstructure,
	writeMcstructure
} from "../core/nbt/mcstructureCodec.js";
