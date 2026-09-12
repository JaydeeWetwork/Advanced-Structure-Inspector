/**
 * Warm Cache Storage + in-memory fetchers before the user selects a structure.
 * Overlaps with IndexedDB hydrate so the first preview hits memory instead of CDN.
 */

import ResourcePackStack from "../ResourcePackStack.js";
import BlockUpdater from "../BlockUpdater.js";
import fetchers from "../fetchers.js";
import { VANILLA_ENTITY_MODELS } from "./entityModels.js";
import { loadItemUpgradeSchemas } from "./itemUpgrade.js";
import { packAssetStore } from "./appearance/PackAssetStore.js";
import { ensureItemIconLoader } from "./itemIconLoader.js";

/** @type {Promise<void>|null} */
let preloadPromise = null;

/**
 * @returns {string[]}
 */
function entityKitPaths() {
	const paths = new Set();
	for (const def of Object.values(VANILLA_ENTITY_MODELS)) {
		paths.add(def.entityFile);
		paths.add(def.geoFile);
		paths.add(`${def.texture}.png`);
	}
	return [...paths];
}

/**
 * Fetch vanilla textures / models / geo / upgrade schemas in the background.
 * Safe to call more than once; shares one in-flight promise.
 * @returns {Promise<void>}
 */
export function preloadVanillaAssets() {
	if (!preloadPromise) {
		preloadPromise = runPreload().catch(err => {
			console.warn("[basi] vanilla preload failed", err);
			preloadPromise = null;
		});
	}
	return preloadPromise;
}

async function runPreload() {
	const rps = new ResourcePackStack();
	const kitPaths = entityKitPaths();
	await packAssetStore.prewarm();
	const hotTextures = [
		"textures/entity/chest/normal",
		"textures/entity/chest/double_normal",
		"textures/entity/chest/trapped",
		"textures/entity/chest/trapped_double"
	];
	await Promise.all([
		ensureItemIconLoader().catch(e => console.warn("[basi] icon prewarm", e)),
		...ResourcePackStack.JSON_FILES_TO_MERGE.map(path => rps.fetchResource(path).catch(() => null)),
		...kitPaths.map(path => rps.fetchResource(path).catch(() => null)),
		...hotTextures.map(path => packAssetStore.decodeTexture(path).catch(() => null)),
		loadItemUpgradeSchemas(fetchers).catch(() => []),
		new BlockUpdater().ensureSchemaIndex().catch(() => {})
	]);
	console.info(
		`[basi] vanilla preload ready (${ResourcePackStack.JSON_FILES_TO_MERGE.length} pack json, ${kitPaths.length} entity kit paths)`
	);
}
