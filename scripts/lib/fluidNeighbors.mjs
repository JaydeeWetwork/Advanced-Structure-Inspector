/**
 * Shared water and lava neighborhood for sample scripts.
 * Glass and other solid blocks stop a step. Plants, torches, rails,
 * buttons, and the rest of BREAKS do not. A living sea pickle or a living
 * coral fan becomes a source when Minecraft places it, even when the
 * file does not already have water in that cell.
 */

/** Orthogonal spread, plus down. Bedrock does not spread fluids up. */
export const FLUID_FLOW = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]];

export const FLUID_IDS = new Set(["water", "flowing_water", "lava", "flowing_lava"]);

/** Water destroys these and then keeps spreading. */
const BREAKS = new Set([
	"short_grass", "tall_grass", "fern", "large_fern", "deadbush", "dead_bush",
	"vine", "fire", "soul_fire", "snow_layer", "reeds", "sugar_cane",
	"wheat", "carrots", "potatoes", "beetroot", "melon_stem", "pumpkin_stem", "pitcher_crop", "torchflower_crop",
	"torch", "soul_torch", "redstone_torch", "unlit_redstone_torch", "redstone_wire",
	"rail", "golden_rail", "detector_rail", "activator_rail",
	"lever", "tripwire", "trip_wire", "string",
	"brown_mushroom", "red_mushroom", "crimson_fungus", "warped_fungus",
	"poppy", "dandelion", "blue_orchid", "allium", "azure_bluet", "red_tulip", "orange_tulip",
	"white_tulip", "pink_tulip", "oxeye_daisy", "cornflower", "lily_of_the_valley", "wither_rose",
	"oak_sapling", "spruce_sapling", "birch_sapling", "jungle_sapling", "acacia_sapling",
	"dark_oak_sapling", "cherry_sapling", "pale_oak_sapling", "mangrove_propagule"
]);

/**
 * @param {unknown} name
 * @returns {string}
 */
export function bareBlockName(name) {
	return String(name ?? "").replace(/^minecraft:/, "");
}

/**
 * @param {unknown} states
 * @param {string} key
 */
function stateValue(states, key) {
	if (!states || typeof states !== "object") return undefined;
	const v = /** @type {Record<string, unknown>} */ (states)[key];
	if (v != null && typeof v === "object" && "value" in v) return /** @type {{ value: unknown }} */ (v).value;
	return v;
}

/**
 * Empty cells and blocks water breaks, including every button.
 * Glass and other full blocks return false.
 * @param {unknown} name bare or namespaced. Empty string is an empty cell.
 */
export function letsFluidThrough(name) {
	const id = bareBlockName(name);
	if (!id || id === "air" || id === "cave_air" || id === "void_air") return true;
	if (id === "button" || id.endsWith("_button")) return true;
	return BREAKS.has(id);
}

/**
 * True when placing this block in Minecraft creates a fluid source the file
 * does not already store. Already-waterlogged cells are ordinary fluid cells.
 * @param {unknown} name
 * @param {unknown} states
 * @param {boolean} waterlogged
 */
export function placedAsFluidSource(name, states, waterlogged) {
	if (waterlogged) return false;
	const id = bareBlockName(name);
	const dead = stateValue(states, "dead_bit");
	const living = dead !== 1 && dead !== true;
	if (id === "sea_pickle") return living;
	if (!id.startsWith("dead_") && /coral(_wall)?_fan$/.test(id)) return living;
	return false;
}
