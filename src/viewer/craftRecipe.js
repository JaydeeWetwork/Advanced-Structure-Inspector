/**
 * Match a crafter 3×3 grid to a crafting result.
 * Loads vanilla Bedrock shaped/shapeless recipes from bedrock-samples (CDN)
 * plus a built-in common set for instant offline-ish matches.
 */

import { builtinRecipeCount } from "./craftMatch.js";
import { ensureCdnRecipes as loadCdnRecipes } from "./craftCdn.js";

export { gridFromSlots, matchCrafterOutput, matchCraftingGrid } from "./craftMatch.js";

/** @returns {Promise<void>} */
export function ensureCdnRecipes() {
	return loadCdnRecipes(builtinRecipeCount);
}

