import { readMcstructure } from "./api/structure.js";
import { stripJsonc } from "../utils/conversions.js";
import { compileMaterialTables, materialIdentity } from "../material/compileMaterial.js";

/**
 * Build a grouped material list (item counts) from structure NBT.
 * Groups variants; sorts most → least; partitions into shulkers / stacks / loose
 * using correct max stack sizes (1 / 16 / 64).
 *
 * Block names and count multipliers come from data/materialListMappings.json,
 * the same table the pack material list uses. Stack sizes stay here.
 */

/** @type {ReturnType<typeof compileMaterialTables>} */
let materialTables = compileMaterialTables({});

async function readMaterialMappingsText() {
	const url = new URL("../data/materialListMappings.json", import.meta.url);
	if (url.protocol === "file:") {
		const specifier = "node:fs/promises";
		const { readFile } = await import(specifier);
		return readFile(url, "utf8");
	}
	const res = await fetch(url);
	if (!res.ok) throw new Error(`materialListMappings HTTP ${res.status}`);
	return res.text();
}

function installMaterialMappings(mappings) {
	materialTables = compileMaterialTables(mappings);
}

await readMaterialMappingsText().then(text => installMaterialMappings(JSON.parse(stripJsonc(text))));

/** Max stack size 1 (unstackable / unique items). */
const STACK_SIZE_1 = new Set([
	// tools & weapons
	"wooden_sword", "stone_sword", "iron_sword", "golden_sword", "diamond_sword", "netherite_sword",
	"wooden_pickaxe", "stone_pickaxe", "iron_pickaxe", "golden_pickaxe", "diamond_pickaxe", "netherite_pickaxe",
	"wooden_axe", "stone_axe", "iron_axe", "golden_axe", "diamond_axe", "netherite_axe",
	"wooden_shovel", "stone_shovel", "iron_shovel", "golden_shovel", "diamond_shovel", "netherite_shovel",
	"wooden_hoe", "stone_hoe", "iron_hoe", "golden_hoe", "diamond_hoe", "netherite_hoe",
	"bow", "crossbow", "trident", "mace", "shield", "elytra", "fishing_rod", "carrot_on_a_stick",
	"warped_fungus_on_a_stick", "flint_and_steel", "shears", "brush",
	// armor
	"leather_helmet", "leather_chestplate", "leather_leggings", "leather_boots",
	"chainmail_helmet", "chainmail_chestplate", "chainmail_leggings", "chainmail_boots",
	"iron_helmet", "iron_chestplate", "iron_leggings", "iron_boots",
	"golden_helmet", "golden_chestplate", "golden_leggings", "golden_boots",
	"diamond_helmet", "diamond_chestplate", "diamond_leggings", "diamond_boots",
	"netherite_helmet", "netherite_chestplate", "netherite_leggings", "netherite_boots",
	"turtle_helmet", "leather_horse_armor", "iron_horse_armor", "golden_horse_armor",
	"diamond_horse_armor", "wolf_armor",
	// beds
	"bed", "white_bed", "orange_bed", "magenta_bed", "light_blue_bed", "yellow_bed", "lime_bed",
	"pink_bed", "gray_bed", "light_gray_bed", "cyan_bed", "purple_bed", "blue_bed", "brown_bed",
	"green_bed", "red_bed", "black_bed",
	// vehicles
	"minecart", "chest_minecart", "hopper_minecart", "tnt_minecart", "command_block_minecart",
	"oak_boat", "spruce_boat", "birch_boat", "jungle_boat", "acacia_boat", "dark_oak_boat",
	"mangrove_boat", "cherry_boat", "bamboo_raft", "pale_oak_boat",
	"oak_chest_boat", "spruce_chest_boat", "birch_chest_boat", "jungle_chest_boat",
	"acacia_chest_boat", "dark_oak_chest_boat", "mangrove_chest_boat", "cherry_chest_boat",
	"bamboo_chest_raft", "pale_oak_chest_boat",
	// filled buckets / liquids as items
	"water_bucket", "lava_bucket", "powder_snow_bucket", "milk_bucket",
	"axolotl_bucket", "cod_bucket", "salmon_bucket", "tropical_fish_bucket", "pufferfish_bucket",
	"tadpole_bucket",
	// misc unstackable
	"saddle", "enchanted_book", "writable_book", "written_book", "filled_map", "map",
	"cake", "mushroom_stew", "rabbit_stew", "beetroot_soup", "suspicious_stew",
	"totem_of_undying", "music_disc", "goat_horn", "spyglass", "bundle",
	"potion", "splash_potion", "lingering_potion",
	// shulker boxes themselves stack to 1
	"shulker_box", "undyed_shulker_box",
	"white_shulker_box", "orange_shulker_box", "magenta_shulker_box", "light_blue_shulker_box",
	"yellow_shulker_box", "lime_shulker_box", "pink_shulker_box", "gray_shulker_box",
	"light_gray_shulker_box", "cyan_shulker_box", "purple_shulker_box", "blue_shulker_box",
	"brown_shulker_box", "green_shulker_box", "red_shulker_box", "black_shulker_box"
]);

/** Max stack size 16. */
const STACK_SIZE_16 = new Set([
	"snowball", "egg", "ender_pearl", "experience_bottle", "honey_bottle",
	"armor_stand", "bucket", // empty bucket stacks to 16
	// signs (item form after wall/standing map)
	"oak_sign", "spruce_sign", "birch_sign", "jungle_sign", "acacia_sign", "dark_oak_sign",
	"mangrove_sign", "cherry_sign", "bamboo_sign", "crimson_sign", "warped_sign", "pale_oak_sign",
	"oak_hanging_sign", "spruce_hanging_sign", "birch_hanging_sign", "jungle_hanging_sign",
	"acacia_hanging_sign", "dark_oak_hanging_sign", "mangrove_hanging_sign", "cherry_hanging_sign",
	"bamboo_hanging_sign", "crimson_hanging_sign", "warped_hanging_sign", "pale_oak_hanging_sign",
	// banners
	"standing_banner", "white_banner", "orange_banner", "magenta_banner", "light_blue_banner",
	"yellow_banner", "lime_banner", "pink_banner", "gray_banner", "light_gray_banner",
	"cyan_banner", "purple_banner", "blue_banner", "brown_banner", "green_banner", "red_banner",
	"black_banner"
]);

const STACK_1_REGEX = [
	/^music_disc_/,
	/_boat$/,
	/_chest_boat$/,
	/_raft$/,
	/_bed$/,
	/_shulker_box$/,
	/_helmet$/,
	/_chestplate$/,
	/_leggings$/,
	/_boots$/,
	/_sword$/,
	/_pickaxe$/,
	/_axe$/,
	/_shovel$/,
	/_hoe$/,
	/_bucket$/ // filled and empty caught; empty is 16 so check empty first in getStackSize
];

const STACK_16_REGEX = [
	/_sign$/,
	/_hanging_sign$/,
	/_banner$/
];

/**
 * Max stack size for a material id (1, 16, or 64).
 * @param {string} materialId
 * @returns {1|16|64}
 */
export function getStackSize(materialId) {
	if (!materialId) return 64;
	const id = String(materialId).replace(/\+\d+$/, "");
	// empty bucket is 16 — check before generic _bucket → 1
	if (id === "bucket") return 16;
	if (STACK_SIZE_1.has(id)) return 1;
	if (STACK_SIZE_16.has(id)) return 16;
	for (const re of STACK_1_REGEX) {
		if (re.test(id) && id !== "bucket") return 1;
	}
	// filled buckets already in STACK_SIZE_1 or _bucket$
	if (/_bucket$/.test(id)) return 1;
	for (const re of STACK_16_REGEX) {
		if (re.test(id)) return 16;
	}
	return 64;
}

/**
 * Partition total count into shulkers (27 stacks), leftover stacks, and loose items.
 * @param {number} count
 * @param {number} [stackSize]
 * @returns {{ stackSize: number, shulkers: number, stacks: number, loose: number, total: number }}
 */
export function partitionCount(count, stackSize = 64) {
	const total = Math.max(0, Math.floor(Number(count) || 0));
	const S = stackSize === 1 || stackSize === 16 || stackSize === 64 ? stackSize : 64;

	if (S === 1) {
		// Each item fills one inventory slot; shulker holds 27 slots
		const shulkers = Math.floor(total / 27);
		const loose = total % 27;
		return { stackSize: 1, shulkers, stacks: 0, loose, total };
	}

	const fullStacks = Math.floor(total / S);
	const loose = total % S;
	const shulkers = Math.floor(fullStacks / 27);
	const stacks = fullStacks % 27;
	return { stackSize: S, shulkers, stacks, loose, total };
}

/**
 * Human-readable partition, e.g. "2 shulkers + 5 stacks + 12"
 * @param {{ shulkers: number, stacks: number, loose: number, stackSize: number, total: number }} p
 * @returns {string}
 */
export function formatPartition(p) {
	if (!p || p.total <= 0) return "0";
	const parts = [];
	if (p.shulkers > 0) {
		parts.push(`${p.shulkers} shulker${p.shulkers === 1 ? "" : "s"}`);
	}
	if (p.stacks > 0) {
		parts.push(`${p.stacks} stack${p.stacks === 1 ? "" : "s"}`);
	}
	if (p.loose > 0) {
		parts.push(String(p.loose));
	}
	if (!parts.length) return "0";
	// Only total if smaller than one stack and no shulkers
	if (p.shulkers === 0 && p.stacks === 0) {
		return String(p.loose);
	}
	return parts.join(" + ");
}

/**
 * Read a numeric block state (handles nbtify wrappers).
 * @param {any} states
 * @param {string[]} keys
 * @returns {number|undefined}
 */
function readStateNumber(states, keys) {
	if (!states || typeof states !== "object") return undefined;
	for (const key of keys) {
		let v = states[key];
		if (v != null && typeof v === "object" && "value" in v) v = v.value;
		if (v != null && v !== "" && Number.isFinite(Number(v))) return Number(v);
	}
	return undefined;
}

/**
 * Full source water/lava only (not flowing, not waterlogged layer fill).
 * Bedrock: liquid_depth 0 = source; 1–15 = flowing. Legacy: flowing_water id.
 * @param {string} blockName
 * @param {any} block full palette entry
 * @param {number} layerI 0 = solid layer, 1 = liquid/waterlog layer
 * @returns {boolean}
 */
export function isCountableLiquid(blockName, block, layerI = 0) {
	if (blockName === "flowing_water" || blockName === "flowing_lava") return false;
	if (blockName !== "water" && blockName !== "lava") return true; // not a liquid

	// Waterlogged second-layer entries are not free-standing sources → skip
	if (layerI > 0) return false;

	const states = block?.states ?? block?.["states"];
	const depth = readStateNumber(states, [
		"liquid_depth",
		"depth",
		"level",
		"liquid_level"
	]);
	// Missing depth → treat as source (common for saved sources)
	if (depth === undefined) return true;
	// 0 = full source block only
	return depth === 0;
}

/**
 * @param {string} blockName no namespace
 * @param {any} [block] palette entry (for liquid states)
 * @param {number} [layerI]
 * @returns {{ material: string, mult: number }|null}
 */
export function blockToMaterial(blockName, block = null, layerI = 0) {
	if (!blockName || materialTables.ignored.has(blockName)) return null;
	if (!isCountableLiquid(blockName, block, layerI)) return null;

	const subject = block && typeof block === "object"
		? { name: blockName, block_entity_data: block.block_entity_data ?? block["block_entity_data"] }
		: blockName;
	const mapped = materialIdentity(materialTables, subject, 1);
	if (!mapped) return null;
	return { material: mapped.itemName, mult: mapped.count };
}

/**
 * @param {unknown} name
 * @returns {string|null}
 */
function stripName(name) {
	if (typeof name === "string") return name.replace(/^minecraft:/, "");
	if (name && typeof name === "object" && "value" in /** @type {object} */ (name)) {
		const v = /** @type {{ value: unknown }} */ (name).value;
		if (typeof v === "string") return v.replace(/^minecraft:/, "");
	}
	return null;
}

/**
 * @param {string} id
 */
export function formatMaterialLabel(id) {
	return id
		.replace(/_/g, " ")
		.replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * @typedef {object} MaterialRow
 * @property {string} id
 * @property {string} label
 * @property {number} count
 * @property {number} stackSize
 * @property {number} shulkers
 * @property {number} stacks
 * @property {number} loose
 * @property {string} partition  // e.g. "1 shulker + 3 stacks + 12"
 */

/**
 * Count materials from structure NBT (both block index layers).
 * Sorted most → least.
 * @param {any} data root MCStructure NBT
 * @returns {MaterialRow[]}
 */
export function buildMaterialListFromNbt(data) {
	const palette = data?.structure?.palette?.default?.block_palette ?? [];
	const paletteList = Array.isArray(palette) || ArrayBuffer.isView(palette) ? [...palette] : [];
	const layers = data?.structure?.block_indices ?? [];

	/** @type {Map<string, number>} */
	const counts = new Map();

	layers.forEach((layer, layerI) => {
		if (!layer || !(Array.isArray(layer) || ArrayBuffer.isView(layer))) return;
		const hist = new Float64Array(paletteList.length);
		for (let i = 0; i < layer.length; i++) {
			const n = Number(layer[i]);
			if (!Number.isFinite(n) || n < 0 || n >= hist.length) continue;
			hist[n]++;
		}
		for (let pi = 0; pi < hist.length; pi++) {
			const n = hist[pi];
			if (!n) continue;
			const block = paletteList[pi];
			if (!block) continue;
			const name = stripName(block?.name);
			const mapped = blockToMaterial(name, block, layerI);
			if (!mapped) continue;
			counts.set(mapped.material, (counts.get(mapped.material) ?? 0) + mapped.mult * n);
		}
	});

	const rows = [...counts.entries()].map(([id, raw]) => {
		const count = Number.isInteger(raw) ? raw : Math.ceil(raw - 1e-9);
		const finalCount = count < 1 && raw > 0 ? 1 : count;
		const stackSize = getStackSize(id);
		const part = partitionCount(finalCount, stackSize);
		return {
			id,
			label: formatMaterialLabel(id),
			count: finalCount,
			stackSize: part.stackSize,
			shulkers: part.shulkers,
			stacks: part.stacks,
			loose: part.loose,
			partition: formatPartition(part)
		};
	});

	// Most → least, then label
	rows.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
	return rows;
}

/**
 * @param {File} structureFile
 * @returns {Promise<MaterialRow[]>}
 */
export async function buildMaterialListFromFile(structureFile) {
	const { nbt: data } = await readMcstructure(structureFile);
	return buildMaterialListFromNbt(data);
}
