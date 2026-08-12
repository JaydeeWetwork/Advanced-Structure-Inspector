/**
 * Public Icon Resolve API — single entry for inventory / item-frame icons.
 *
 * Resolution order (inside itemIconLoader):
 *  1. data/itemIcons.json map (+ bucket variants)
 *  2. textures/item_texture.json
 *  3. blocks.json → terrain_texture
 *  4. Heuristic pack paths (planks, logs, shulkers, buckets, …)
 */

export {
	ensureItemIconLoader,
	getItemIconUrl,
	hydrateInventoryIcons,
	resetItemIconCache,
	stripItemNs
} from "../itemIconLoader.js?v=judo15";
