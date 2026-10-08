/**
 * Bedrock item/block icons for inventory mockups.
 *
 * Resolution order:
 *  1. data/itemIcons.json name map
 *  2. textures/item_texture.json (true items: apple, diamond, …)
 *  3. blocks.json texture / carried_textures keys
 *  4. textures/terrain_texture.json → textures/blocks/*.png
 *  5. Heuristic path guesses (planks_oak, log_oak, chest_front, …)
 */

import { packAssetStore } from "./appearance/PackAssetStore.js";
import {
	BOAT_VARIANT,
	BUCKET_TEXTURE_INDEX,
	heuristicBlockPaths,
	KNOWN_ITEM_PATHS,
	pathFromTextureEntry,
	stripItemNs,
	textureKeysFromBlock
} from "./itemIconPaths.js";
export { stripItemNs };

/** @type {Promise<void>|null} */
let initPromise = null;
/** @type {Map<string, string>} */
let exactIconMap = new Map();
/** @type {[RegExp, string][]} */
let patternIcons = [];
/** @type {Record<string, any>} */
let itemTextureData = {};
/** @type {Record<string, any>} */
let terrainTextureData = {};
/** @type {Record<string, any>} */
let blocksDotJson = {};
/** @type {Map<string, Promise<string|null>>} */
const urlCache = new Map();
/** @type {Set<string>} */
const failedIds = new Set();
/** Object URLs we own — revoke on cache reset to avoid blob: leaks. */
/** @type {Set<string>} */
const ownedObjectUrls = new Set();

/**
 * @param {string} text
 */
function parseJsonc(text) {
	const stripped = text
		.replace(/\/\*[\s\S]*?\*\//g, "")
		.replace(/^\s*\/\/.*$/gm, "");
	return JSON.parse(stripped);
}

/**
 * @param {string} url
 */
async function fetchJson(url) {
	const res = await fetch(url, { mode: "cors" });
	if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
	return parseJsonc(await res.text());
}

/**
 * @param {Record<string, unknown>} icons
 */
function buildIconMaps(icons) {
	exactIconMap = new Map();
	patternIcons = [];
	for (const [k, v] of Object.entries(icons || {})) {
		if (k === "$schema" || typeof v !== "string") continue;
		if (k.startsWith("/") && k.endsWith("/")) {
			try {
				patternIcons.push([new RegExp(k.slice(1, -1)), v]);
			} catch {
				/* skip */
			}
		} else {
			exactIconMap.set(k, v);
		}
	}
}

/**
 * @param {string} bareName
 */
function mapItemIconKey(bareName) {
	if (exactIconMap.has(bareName)) return /** @type {string} */ (exactIconMap.get(bareName));
	for (const [re, repl] of patternIcons) {
		if (re.test(bareName)) {
			try {
				return bareName.replace(re, repl);
			} catch {
				return repl;
			}
		}
	}
	return bareName;
}

export async function ensureItemIconLoader() {
	if (initPromise) return initPromise;
	initPromise = (async () => {
		// Local name map (optional)
		try {
			const icons = await fetchJson(new URL("data/itemIcons.json", location.href).href);
			buildIconMaps(icons);
		} catch (e) {
			console.warn("[bLayers] itemIcons.json:", e);
			buildIconMaps({});
		}

		await packAssetStore.prewarm();
		const [itemTex, terrainTex, blocks] = await Promise.all([
			packAssetStore.getJson("resource_pack/textures/item_texture.json"),
			packAssetStore.getJson("resource_pack/textures/terrain_texture.json"),
			packAssetStore.getJson("resource_pack/blocks.json")
		]);

		itemTextureData = itemTex?.texture_data ?? {};
		terrainTextureData = terrainTex?.texture_data ?? {};
		// blocks.json is a flat map of block id → def (plus format_version keys)
		blocksDotJson = blocks || {};

		console.info(
			`[bLayers] item icons ready: items=${Object.keys(itemTextureData).length} ` +
			`terrain=${Object.keys(terrainTextureData).length} ` +
			`blocks=${Object.keys(blocksDotJson).length} maps=${exactIconMap.size}`
		);
	})().catch(e => {
		initPromise = null;
		console.warn("[bLayers] item icon init failed", e);
		throw e;
	});
	return initPromise;
}

/**
 * Resolve a terrain shortname (e.g. oak_planks) to a pack path.
 * @param {string} shortName
 * @returns {string|null}
 */
function resolveTerrainPath(shortName) {
	if (!shortName) return null;
	const entry = terrainTextureData[shortName];
	const path = pathFromTextureEntry(entry);
	if (path) return path;
	// short name itself might already be a path
	if (shortName.startsWith("textures/")) return shortName;
	return null;
}

/**
 * Collect candidate pack-relative texture paths for an item/block id.
 * Prefer known-good paths first so we don't 404-spam the console.
 * @param {string} bareName
 * @returns {string[]}
 */
function collectPackPaths(bareName) {
	/** @type {string[]} */
	const paths = [];
	const add = p => {
		if (typeof p === "string" && p && !paths.includes(p)) paths.push(p);
	};

	// 0) Hard-coded known paths (fast, few 404s)
	if (KNOWN_ITEM_PATHS[bareName]) {
		for (const a of KNOWN_ITEM_PATHS[bareName]) add(a);
	}

	// Boat / chest_boat via item_texture arrays
	const boatM = bareName.match(/^(\w+)_boat$/);
	if (boatM && BOAT_VARIANT[boatM[1]] != null) {
		add(pathFromTextureEntry(itemTextureData.boat, BOAT_VARIANT[boatM[1]]));
		add(`textures/items/boat_${boatM[1] === "dark_oak" ? "darkoak" : boatM[1]}`);
	}
	const darkOakBoat = bareName === "dark_oak_boat";
	if (darkOakBoat) {
		add(pathFromTextureEntry(itemTextureData.boat, 5));
		add("textures/items/boat_darkoak");
	}
	const chestBoatM = bareName.match(/^(\w+)_chest_boat$/);
	if (chestBoatM) {
		const wood = chestBoatM[1];
		const idx = BOAT_VARIANT[wood];
		if (idx != null) add(pathFromTextureEntry(itemTextureData.chest_boat, idx));
		add(`textures/items/${wood}_chest_boat`);
		add(`textures/items/${wood === "dark_oak" ? "dark_oak" : wood}_chest_boat`);
	}

	const mapped = mapItemIconKey(bareName);
	let variant = -1;
	let key = mapped;
	const dot = key.lastIndexOf(".");
	if (dot > 0 && /^\d+$/.test(key.slice(dot + 1))) {
		variant = +key.slice(dot + 1);
		key = key.slice(0, dot);
	}

	// 1) item_texture.json (supports mapped "bucket.2" → bucket textures[2])
	for (const k of [key, bareName, mapped]) {
		const path = pathFromTextureEntry(itemTextureData[k], variant);
		add(path);
	}
	if (bareName.endsWith("_bucket") || bareName === "bucket") {
		const bucketIdx = BUCKET_TEXTURE_INDEX[bareName];
		if (bucketIdx != null) {
			add(pathFromTextureEntry(itemTextureData.bucket, bucketIdx));
		}
	}

	// 2) blocks.json → terrain (carried first)
	const blockKeys = [bareName, key];
	if (bareName === "shulker_box") blockKeys.push("undyed_shulker_box");
	if (bareName === "undyed_shulker_box") blockKeys.push("shulker_box");
	for (const bk of blockKeys) {
		const blockDef =
			blocksDotJson[bk]
			|| blocksDotJson[`minecraft:${bk}`]
			|| null;
		if (!blockDef || typeof blockDef !== "object") continue;
		for (const short of textureKeysFromBlock(blockDef)) {
			add(resolveTerrainPath(short));
			if (typeof short === "string" && !short.startsWith("textures/")) {
				// Prefer terrain resolve only; avoid blind textures/blocks/${short} when
				// short is a terrain key that already resolved (or failed).
				if (!resolveTerrainPath(short)) {
					add(`textures/blocks/${short}`);
				}
			} else if (typeof short === "string") {
				add(short);
			}
		}
	}

	// 3) terrain_texture by bare name
	for (const k of [bareName, key]) {
		add(resolveTerrainPath(k));
	}

	// 4) Limited heuristics (avoid shotgun path spam)
	for (const p of heuristicBlockPaths(bareName)) add(p);

	return paths;
}

/**
 * Resolve an item icon through the shared pack store (one color extension, stable pin).
 * @param {string} itemName
 * @returns {Promise<string|null>}
 */
export async function getItemIconUrl(itemName) {
	const bare = stripItemNs(itemName);
	if (!bare) return null;
	if (failedIds.has(bare)) return null;
	if (urlCache.has(bare)) return urlCache.get(bare);

	const p = (async () => {
		try {
			await ensureItemIconLoader();
		} catch {
			failedIds.add(bare);
			return null;
		}

		const packPaths = collectPackPaths(bare);
		for (const path of packPaths) {
			try {
				const objectUrl = await packAssetStore.getIconObjectUrl(path);
				if (objectUrl) return objectUrl;
			} catch {
				/* next path */
			}
		}

		console.debug("[bLayers] no icon for", bare, "tried", packPaths.slice(0, 8));
		failedIds.add(bare);
		return null;
	})();

	urlCache.set(bare, p);
	return p;
}

/**
 * Clear failed/cache so a loader upgrade can retry.
 * Revokes any blob: object URLs we created.
 */
export function resetItemIconCache() {
	urlCache.clear();
	failedIds.clear();
	for (const u of ownedObjectUrls) {
		try {
			URL.revokeObjectURL(u);
		} catch {
			/* ignore */
		}
	}
	ownedObjectUrls.clear();
	initPromise = null;
	itemTextureData = {};
	terrainTextureData = {};
	blocksDotJson = {};
}

/**
 * @param {ParentNode} root
 * @returns {Promise<number>}
 */
export async function hydrateInventoryIcons(root) {
	if (!root?.querySelectorAll) return 0;
	const imgs = [...root.querySelectorAll("img[data-item-icon]")];
	if (!imgs.length) return 0;

	try {
		await ensureItemIconLoader();
	} catch (e) {
		console.warn("[bLayers] hydrate init failed", e);
		return 0;
	}

	let loaded = 0;
	await Promise.all(
		imgs.map(async el => {
			const name = el.getAttribute("data-item-icon") || "";
			const bare = stripItemNs(name);
			// Only clear failure so we can retry once; keep successful blob URLs cached
			// (deleting urlCache every open was re-creating object URLs without revoke).
			if (failedIds.has(bare) && !urlCache.has(bare)) {
				failedIds.delete(bare);
			}
			const url = await getItemIconUrl(name);
			if (!url) return;
			el.src = url;
			el.classList.add("loaded");
			el.style.cssText = [
				"position:absolute",
				"left:50%",
				"top:50%",
				"right:auto",
				"bottom:auto",
				"transform:translate(-50%,-50%)",
				"width:32px",
				"height:32px",
				"max-width:32px",
				"max-height:32px",
				"margin:0",
				"padding:0",
				"border:none",
				"display:block",
				"object-fit:contain",
				"object-position:center",
				"z-index:1"
			].join(";");
			el.closest(".mc-slot")?.querySelector(".mc-slot-name")?.classList.add("icon-loaded");
			loaded++;
		})
	);
	console.info(`[bLayers] item icons: ${loaded}/${imgs.length} loaded`);
	return loaded;
}
