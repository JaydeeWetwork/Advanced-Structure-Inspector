/**
 * Write one .mcstructure and re-read it through the same gates.
 */

import { assertMcstructureLayers, assertNbtQuotas } from "./mcstructureValidate.js";
import { readMcstructureFromBuffer } from "./mcstructureRead.js";

const WRITE_OPTIONS = {
	endian: "little",
	compression: null,
	bedrockLevel: false
};

/**
 * Shallow copy so the layer pad inside assertMcstructureLayers does not land on the caller's object.
 * @param {object} nbt
 */
function layerCheckTarget(nbt) {
	const scratch = { ...nbt };
	if (scratch.structure && typeof scratch.structure === "object") {
		scratch.structure = { ...scratch.structure };
	}
	return scratch;
}

/**
 * Product write: little-endian uncompressed .mcstructure with Bedrock tag types
 * (see mcstructureTyped.js). Accepts the typeless NBT from readMcstructure or a
 * typed root from readMcstructureTyped. The output is re-read through the full
 * read gates before it is returned. The caller's block_indices are left as passed in.
 * @param {object} nbt
 * @returns {Promise<Uint8Array>}
 */
export async function writeMcstructure(nbt) {
	// One check for an Int32Array size and for a typed List<Int>. The copy absorbs the v2 pad.
	const layer = assertMcstructureLayers(layerCheckTarget(nbt));
	assertNbtQuotas(nbt, layer.volume);
	const { loadNbtify, typeMcstructureForWrite } = await import("./mcstructureTyped.js");
	const writable = await loadNbtify();
	const bytes = await writable.write(typeMcstructureForWrite(nbt, writable), WRITE_OPTIONS);
	const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	await readMcstructureFromBuffer(u8);
	return u8;
}

