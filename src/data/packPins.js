/** CDN pins — no imports (safe for Node unit tests). */

/** Tag that shipped official minecart geo/PNG in this project. Stable `v1.26.40.05` is the same git tree size; keep preview as the known-good pin. */
export const VANILLA_SAMPLES_TAG = "v1.26.40.26-preview";
/** Extra tags to try when a PNG/TGA is missing on the current pin. */
export const VANILLA_SAMPLES_FALLBACK_TAGS = ["v1.26.40.05", "v1.21.50.7"];
export const BLOCK_UPGRADE_OWNER = "opencollab-incubator";
export const BLOCK_UPGRADE_REPO = "BedrockBlockUpgradeSchema";
export const BLOCK_UPGRADE_TAG = "5.2.0";
export const ITEM_UPGRADE_OWNER = "opencollab-incubator";
export const ITEM_UPGRADE_REPO = "BedrockItemUpgradeSchema";
export const ITEM_UPGRADE_TAG = "master";
