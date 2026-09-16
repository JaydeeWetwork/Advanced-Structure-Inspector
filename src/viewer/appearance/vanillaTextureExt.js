/**
 * Vanilla samples pin: a file is either .tga or .png, never both.
 * VANILLA_TGA_PATHS is the GitHub tree of the current pin (no CDN probe).
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
