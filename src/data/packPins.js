/** Render-pack CDN pins. Schema pins live in schemaPins.js and are re-exported here. */

/** Current render pack. Stable `full` zip; previous pins stay in FALLBACK_TAGS for missing PNG/TGA. */
export const VANILLA_SAMPLES_TAG = "v1.26.50.4";
/** Extra tags to try when a PNG/TGA is missing on the current pin. */
export const VANILLA_SAMPLES_FALLBACK_TAGS = ["v1.26.40.26-preview", "v1.26.40.05"];

export {
	BLOCK_UPGRADE_OWNER,
	BLOCK_UPGRADE_REPO,
	BLOCK_UPGRADE_TAG,
	ITEM_UPGRADE_OWNER,
	ITEM_UPGRADE_REPO,
	ITEM_UPGRADE_TAG
} from "./schemaPins.js";
