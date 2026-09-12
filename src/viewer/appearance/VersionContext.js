/**
 * Render-pack version bus. Upgrade mode uses the current pin + fallback tags.
 */

import {
	VANILLA_SAMPLES_TAG,
	VANILLA_SAMPLES_FALLBACK_TAGS
} from "../../data/packPins.js";

/**
 * @typedef {object} BedrockVersionContext
 * @property {string} renderPackTag
 * @property {string[]} fallbackPackTags
 * @property {string} label
 * @property {"upgrade"|"historical"} mode
 */

/**
 * @returns {BedrockVersionContext}
 */
export function defaultVersionContext() {
	return {
		renderPackTag: VANILLA_SAMPLES_TAG,
		fallbackPackTags: [...VANILLA_SAMPLES_FALLBACK_TAGS],
		label: VANILLA_SAMPLES_TAG,
		mode: "upgrade"
	};
}

/**
 * Primary tag first, then fallbacks (unique, non-empty).
 * @param {BedrockVersionContext} [ctx]
 * @returns {string[]}
 */
export function packTags(ctx) {
	const c = ctx ?? defaultVersionContext();
	const out = [];
	const seen = new Set();
	for (const t of [c.renderPackTag, ...(c.fallbackPackTags ?? [])]) {
		if (!t || seen.has(t)) continue;
		seen.add(t);
		out.push(t);
	}
	return out;
}
