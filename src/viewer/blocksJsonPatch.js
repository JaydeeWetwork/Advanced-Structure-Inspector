/**
 * Map modern block ids to vanilla resource_pack/blocks.json keys.
 * `name.variant` (e.g. wooden_door.0) also sets the terrain_texture array index.
 *
 * @param {string} blockName
 * @param {Record<string, string>|null|undefined} patches
 * @returns {{ name: string, variant: number|null }}
 */
export function applyBlocksJsonPatch(blockName, patches) {
	if (!patches || !(blockName in patches)) return { name: blockName, variant: null };
	let mapped = patches[blockName];
	let variant = null;
	if (typeof mapped === "string" && mapped.includes(".")) {
		const parts = mapped.split(".");
		mapped = parts[0];
		variant = Number(parts[1]);
	}
	return { name: mapped, variant: Number.isFinite(variant) ? variant : null };
}
