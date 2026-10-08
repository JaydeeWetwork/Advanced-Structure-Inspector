/**
 * Warm Cache Storage + in-memory fetchers before the user selects a structure.
 * Overlaps with IndexedDB hydrate so the first preview hits memory instead of CDN.
 */

import ResourcePackStack from "./engine/ResourcePackStack.js";
import BlockUpdater from "./engine/BlockUpdater.js";
import fetchers from "./engine/fetchers.js";
import { VANILLA_ENTITY_MODELS } from "./entityModels.js";
import { loadItemUpgradeSchemas } from "./itemUpgrade.js";
import { packAssetStore } from "./appearance/PackAssetStore.js";
import { ensureItemIconLoader } from "./itemIconLoader.js";

/** @type {Promise<void>|null} */
let preloadPromise = null;

/**
 * @returns {string[]}
 */
function entityKitFiles() {
	const json = [];
	const textures = [];
	const seenJson = new Set();
	const seenTex = new Set();
	for (const def of Object.values(VANILLA_ENTITY_MODELS)) {
		for (const p of [def.entityFile, def.geoFile]) {
			if (seenJson.has(p)) continue;
			seenJson.add(p);
			json.push(p);
		}
		const texs = def.variantTextures?.length ? def.variantTextures : [def.texture];
		for (const t of texs) {
			if (seenTex.has(t)) continue;
			seenTex.add(t);
			textures.push(t);
		}
	}
	return { json, textures };
}

/**
 * Fetch vanilla textures / models / geo / upgrade schemas in the background.
 * Safe to call more than once; shares one in-flight promise.
 * @returns {Promise<void>}
 */
export function preloadVanillaAssets() {
	if (!preloadPromise) {
		preloadPromise = runPreload().catch(err => {
			console.warn("[bLayers] vanilla preload failed", err);
			preloadPromise = null;
		});
	}
	return preloadPromise;
}

async function runPreload() {
	const rps = new ResourcePackStack();
	const { json: kitJson, textures: kitTextures } = entityKitFiles();
	const hotTextures = [
		"textures/entity/chest/normal",
		"textures/entity/chest/double_normal",
		"textures/entity/chest/trapped",
		"textures/entity/chest/trapped_double"
	];
	// Pack JSON first, then color images. Both share the CDN slots with an open structure.
	await packAssetStore.prewarm();
	await Promise.all([
		ensureItemIconLoader().catch(e => console.warn("[bLayers] icon prewarm", e)),
		...ResourcePackStack.JSON_FILES_TO_MERGE.map(path => rps.fetchResource(path).catch(() => null)),
		...kitJson.map(path => rps.fetchResource(path).catch(() => null)),
		loadItemUpgradeSchemas(fetchers).catch(() => []),
		new BlockUpdater().ensureSchemaIndex().catch(() => {})
	]);
	await Promise.all([
		...kitTextures.map(path => packAssetStore.decodeTexture(path, { placeholder: false }).catch(() => null)),
		...hotTextures.map(path => packAssetStore.decodeTexture(path).catch(() => null))
	]);
	console.info(
		`[bLayers] vanilla preload ready (${ResourcePackStack.JSON_FILES_TO_MERGE.length} pack json, ${kitJson.length} entity json, ${kitTextures.length} entity textures)`
	);
}
