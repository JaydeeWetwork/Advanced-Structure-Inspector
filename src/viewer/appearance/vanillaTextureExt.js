/**
 * Color files on the samples pin are either .tga or .png, never both.
 * VANILLA_TGA_PATHS lists color TGA stems only. *_mers companion maps are omitted.
 */

import { VANILLA_TGA_PATHS } from "../../data/vanillaTgaTextures.js";

/**
 * @param {string} pathNoExt pack-relative, no extension
 * @returns {boolean}
 */
export function preferTgaForVanillaPath(pathNoExt) {
	const p = String(pathNoExt || "")
		.replace(/\\/g, "/")
		.replace(/^\//, "")
		.replace(/\.(png|tga)$/i, "");
	return VANILLA_TGA_PATHS.has(p);
}
