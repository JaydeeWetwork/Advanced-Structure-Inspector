/**
 * Lazy-load vanilla Bedrock crafting recipes from bedrock-samples.
 */

import { VANILLA_SAMPLES_TAG } from "../data/packPins.js";

const VANILLA_TAG = VANILLA_SAMPLES_TAG;
const RECIPES_BASE =
	`https://cdn.jsdelivr.net/gh/Mojang/bedrock-samples@${VANILLA_TAG}/behavior_pack/recipes/`;

let cdnRecipes = null;
/** @type {Promise<any[]>|null} */
let cdnLoadPromise = null;

const CDN_RECIPE_FILES = [
	"stick", "chest", "crafting_table", "furnace", "torch", "ladder", "bowl",
	"wooden_pickaxe", "wooden_axe", "wooden_shovel", "wooden_hoe", "wooden_sword",
	"stone_pickaxe", "stone_axe", "stone_shovel", "stone_hoe", "stone_sword",
	"iron_pickaxe", "iron_axe", "iron_shovel", "iron_hoe", "iron_sword",
	"diamond_pickaxe", "diamond_axe", "diamond_shovel", "diamond_hoe", "diamond_sword",
	"bookshelf", "sign", "oak_sign", "boat", "oak_boat", "rail", "golden_rail",
	"detector_rail", "activator_rail", "minecart", "hopper", "dropper", "dispenser",
	"piston", "sticky_piston", "bucket", "shears", "compass", "clock", "bread", "paper",
	"book", "iron_block", "gold_block", "diamond_block", "iron_ingot_from_iron_block",
	"gold_ingot_from_gold_block", "diamond_from_diamond_block", "chest_minecart",
	"hopper_minecart", "tnt_minecart", "crafter", "barrel", "smoker", "blast_furnace",
	"oak_planks", "spruce_planks", "birch_planks", "jungle_planks", "acacia_planks",
	"dark_oak_planks", "mangrove_planks", "cherry_planks", "bamboo_planks",
	"oak_stairs", "oak_slab", "oak_fence", "oak_fence_gate", "oak_door", "oak_trapdoor",
	"oak_pressure_plate", "oak_button", "crafting_table_from_crimson", "planks"
];

/**
 * Lazy-load extra recipes from CDN (best-effort).
 * The builtin count is passed in so this module does not import the matcher.
 * @param {number} builtinCount
 * @returns {Promise<void>}
 */
export async function ensureCdnRecipes(builtinCount) {
	if (cdnRecipes) return;
	if (cdnLoadPromise) return cdnLoadPromise;
	cdnLoadPromise = (async () => {
		const loaded = [];
		// Batch fetch (limit concurrency)
		const batch = 12;
		for (let i = 0; i < CDN_RECIPE_FILES.length; i += batch) {
			const slice = CDN_RECIPE_FILES.slice(i, i + batch);
			const parts = await Promise.all(
				slice.map(async name => {
					try {
						const res = await fetch(`${RECIPES_BASE}${name}.json`, { mode: "cors" });
						if (!res.ok) return null;
						return await res.json();
					} catch {
						return null;
					}
				})
			);
			for (const p of parts) if (p) loaded.push(p);
		}
		cdnRecipes = loaded;
		console.info(`[bLayers] crafting recipes: ${loaded.length} CDN + ${builtinCount} builtin`);
	})().catch(e => {
		cdnLoadPromise = null;
		cdnRecipes = [];
		console.warn("[bLayers] CDN recipes failed", e);
	});
	return cdnLoadPromise;
}


/** @returns {any[]|null} */
export function getCdnRecipes() {
	return cdnRecipes;
}

