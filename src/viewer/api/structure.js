/**
 * Structure codec API (P0/P1 nbtify gate).
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
	readMcstructure
} from "../core/nbt/mcstructureCodec.js";
