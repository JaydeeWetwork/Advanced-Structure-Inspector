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

import { VANILLA_SAMPLES_TAG } from "../data/packPins.js";

// Match main preview pack tag (fetchers.js vanilla samples).
const VANILLA_TAG = VANILLA_SAMPLES_TAG;
const VANILLA_RP =
	`https://cdn.jsdelivr.net/gh/Mojang/bedrock-samples@${VANILLA_TAG}/resource_pack/`;
// Older tag still has some PNG-only assets
const VANILLA_TAG_FALLBACK = "v1.21.50.7";
const VANILLA_RP_FALLBACK =
	`https://cdn.jsdelivr.net/gh/Mojang/bedrock-samples@${VANILLA_TAG_FALLBACK}/resource_pack/`;

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
 * @param {string|undefined|null} id
 */
export function stripItemNs(id) {
	if (!id || typeof id !== "string") return "";
	return id.replace(/^minecraft:/i, "").trim();
}

/**
 * Decode a TGA blob → PNG object URL for <img> use.
 * @param {Blob} blob
 * @returns {Promise<string|null>}
 */
async function tgaBlobToObjectUrl(blob) {
	try {
		const TGALoader = (await import("tga-js")).default;
		const loader = new TGALoader();
		loader.load(new Uint8Array(await blob.arrayBuffer()));
		const imageData = loader.getImageData();
		if (!imageData) return null;
		const can = document.createElement("canvas");
		can.width = imageData.width;
		can.height = imageData.height;
		can.getContext("2d").putImageData(imageData, 0, 0);
		const pngBlob = await new Promise(resolve => can.toBlob(resolve, "image/png"));
		if (!pngBlob) return null;
		return URL.createObjectURL(pngBlob);
	} catch (e) {
		console.debug("[basi] TGA icon decode failed", e);
		return null;
	}
}

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
			console.warn("[basi] itemIcons.json:", e);
			buildIconMaps({});
		}

		// Parallel vanilla pack JSONs
		const [itemTex, terrainTex, blocks] = await Promise.all([
			fetchJson(`${VANILLA_RP}textures/item_texture.json`).catch(e => {
				console.warn("[basi] item_texture.json failed", e);
				return {};
			}),
			fetchJson(`${VANILLA_RP}textures/terrain_texture.json`).catch(e => {
				console.warn("[basi] terrain_texture.json failed", e);
				return {};
			}),
			fetchJson(`${VANILLA_RP}blocks.json`).catch(e => {
				console.warn("[basi] blocks.json failed", e);
				return {};
			})
		]);

		itemTextureData = itemTex?.texture_data ?? {};
		terrainTextureData = terrainTex?.texture_data ?? {};
		// blocks.json is a flat map of block id → def (plus format_version keys)
		blocksDotJson = blocks || {};

		console.info(
			`[basi] item icons ready: items=${Object.keys(itemTextureData).length} ` +
			`terrain=${Object.keys(terrainTextureData).length} ` +
			`blocks=${Object.keys(blocksDotJson).length} maps=${exactIconMap.size}`
		);
	})().catch(e => {
		initPromise = null;
		console.warn("[basi] item icon init failed", e);
		throw e;
	});
	return initPromise;
}

/**
 * @param {any} entry
 * @param {number} [variant]
 * @returns {string|null}
 */
function pathFromTextureEntry(entry, variant = -1) {
	if (!entry) return null;
	const textures = entry.textures ?? entry.texture;
	if (typeof textures === "string") return textures;
	if (Array.isArray(textures)) {
		if (variant >= 0 && typeof textures[variant] === "string") return textures[variant];
		return textures.find(t => typeof t === "string") ?? null;
	}
	if (textures && typeof textures === "object") {
		// face map: prefer inventory/front/side/up/east
		for (const k of [
			"south", "north", "front", "side", "east", "west", "up", "down", "path", "default"
		]) {
			const v = textures[k];
			if (typeof v === "string") return v;
			if (Array.isArray(v) && typeof v[0] === "string") return v[0];
		}
		for (const v of Object.values(textures)) {
			if (typeof v === "string") return v;
			if (Array.isArray(v) && typeof v[0] === "string") return v[0];
		}
	}
	return null;
}

/**
 * Pull face/short texture keys from a blocks.json entry.
 * @param {any} blockDef
 * @returns {string[]}
 */
function textureKeysFromBlock(blockDef) {
	if (!blockDef || typeof blockDef !== "object") return [];
	/** @type {string[]} */
	const keys = [];
	const push = v => {
		if (typeof v === "string" && v && !keys.includes(v)) keys.push(v);
		else if (Array.isArray(v)) v.forEach(push);
		else if (v && typeof v === "object") Object.values(v).forEach(push);
	};
	// Prefer carried (inventory) then regular textures
	push(blockDef.carried_textures);
	push(blockDef.textures);
	return keys;
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
 * Heuristic alternate pack paths for common block items.
 * @param {string} bare
 * @returns {string[]}
 */
function heuristicBlockPaths(bare) {
	/** @type {string[]} */
	const out = [];
	const add = p => {
		if (p && !out.includes(p)) out.push(p);
	};

	// *_planks → planks_*
	const planks = bare.match(/^(.+)_planks$/);
	if (planks) {
		const wood = planks[1] === "dark_oak" ? "big_oak" : planks[1];
		add(`textures/blocks/planks_${wood}`);
		add(`textures/blocks/planks_${planks[1]}`);
	}
	if (bare === "planks") add("textures/blocks/planks_oak");

	// *_log / *_wood / stripped_*
	const log = bare.match(/^(?:stripped_)?(.+)_log$/);
	if (log) {
		add(`textures/blocks/log_${log[1]}`);
		add(`textures/blocks/${log[1]}_log`);
		add(`textures/blocks/log_${log[1]}_top`);
	}
	const wood = bare.match(/^(?:stripped_)?(.+)_wood$/);
	if (wood) {
		add(`textures/blocks/log_${wood[1]}`);
		add(`textures/blocks/${wood[1]}_log`);
	}
	if (bare === "log" || bare === "wood") add("textures/blocks/log_oak");

	// chest family
	if (bare === "chest" || bare === "trapped_chest" || bare === "ender_chest") {
		add("textures/blocks/chest_front");
		add("textures/blocks/chest_side");
		add("textures/blocks/ender_chest_front");
		add("textures/blocks/trapped_chest_front");
	}

	// Filled buckets: item ids are water_bucket / lava_bucket / …
	// Bedrock pack files are textures/items/bucket_water, bucket_lava, …
	// (item_texture.json keeps them as variants of the single "bucket" key).
	if (bare === "bucket") {
		add("textures/items/bucket_empty");
	}
	const filledBucket = bare.match(/^(.+)_bucket$/);
	if (filledBucket) {
		const content = filledBucket[1];
		// tropical_fish_bucket → bucket_tropical
		const legacy =
			content === "tropical_fish" ? "tropical"
			: content === "powder_snow" ? "powder_snow"
			: content;
		add(`textures/items/bucket_${legacy}`);
		add(`textures/items/bucket_${content}`);
		// last resort modern-style name (usually 404 on Bedrock packs)
		add(`textures/items/${bare}`);
	}

	// barrels, shulkers, etc.
	if (bare === "barrel") {
		add("textures/blocks/barrel_side");
		add("textures/blocks/barrel_top");
	}
	// Shulker boxes — Bedrock uses undyed_shulker_box; terrain keys map to shulker_top_*
	if (bare.includes("shulker")) {
		// Prefer real pack textures first (undyed_shulker_box.png does not exist)
		if (bare === "undyed_shulker_box" || bare === "shulker_box") {
			add("textures/blocks/shulker_top_undyed");
			add("textures/entity/shulker/shulker_undyed");
		}
		const color = bare
			.replace(/^undyed_/, "")
			.replace(/_shulker_box$/, "")
			.replace(/^shulker_box$/, "undyed");
		if (color && color !== bare) {
			const c = color === "light_gray" ? "silver" : color;
			add(`textures/blocks/shulker_top_${c}`);
			add(`textures/entity/shulker/shulker_${c === "silver" ? "silver" : c}`);
		}
		add("textures/blocks/shulker_top_undyed");
		add("textures/entity/shulker/shulker_undyed");
		add(`textures/blocks/${bare}`);
	}

	// Only add items/ bare as last resort for true items (not blocks)
	// Skip generic textures/blocks/${bare} — causes massive 404 spam for renamed assets
	if (!bare.includes("slab") && !bare.endsWith("_block") && !bare.includes("leaves")) {
		add(`textures/items/${bare}`);
	}

	return out;
}

/**
 * Bedrock item_texture.json "bucket" texture array indices
 * (textures/items/bucket_empty, milk, water, lava, …).
 * Modern item ids are water_bucket / lava_bucket / …; pack files are bucket_*.
 * @type {Record<string, number>}
 */
const BUCKET_TEXTURE_INDEX = {
	bucket: 0,
	milk_bucket: 1,
	water_bucket: 2,
	lava_bucket: 3,
	cod_bucket: 4,
	salmon_bucket: 5,
	tropical_fish_bucket: 6,
	pufferfish_bucket: 7,
	powder_snow_bucket: 8,
	axolotl_bucket: 9,
	tadpole_bucket: 10
};

/** Item-id → pack-relative texture paths (preferred first). */
const KNOWN_ITEM_PATHS = {
	written_book: ["textures/items/book_written"],
	writable_book: ["textures/items/book_writable"],
	enchanted_book: ["textures/items/book_enchanted"],
	book: ["textures/items/book_normal"],
	fire_charge: ["textures/items/fireball"],
	fireball: ["textures/items/fireball"],
	oak_sign: ["textures/items/sign"],
	sign: ["textures/items/sign"],
	spruce_sign: ["textures/items/sign_spruce"],
	birch_sign: ["textures/items/sign_birch"],
	jungle_sign: ["textures/items/sign_jungle"],
	acacia_sign: ["textures/items/sign_acacia"],
	dark_oak_sign: ["textures/items/sign_darkoak"],
	mangrove_sign: ["textures/items/mangrove_sign", "textures/items/sign_mangrove"],
	cherry_sign: ["textures/items/cherry_sign", "textures/items/sign_cherry"],
	bamboo_sign: ["textures/items/bamboo_sign", "textures/items/sign_bamboo"],
	crimson_sign: ["textures/items/crimson_sign_item"],
	warped_sign: ["textures/items/warped_sign_item"],
	pale_oak_sign: ["textures/items/pale_oak_sign"],
	banner: ["textures/items/banner_pattern"],
	white_banner: ["textures/items/banner_pattern"],
	// Boats — files are boat_oak.png; item_texture "boat" is a variant array
	oak_boat: ["textures/items/boat_oak"],
	spruce_boat: ["textures/items/boat_spruce"],
	birch_boat: ["textures/items/boat_birch"],
	jungle_boat: ["textures/items/boat_jungle"],
	acacia_boat: ["textures/items/boat_acacia"],
	dark_oak_boat: ["textures/items/boat_darkoak"],
	mangrove_boat: ["textures/items/mangrove_boat", "textures/items/boat_mangrove"],
	cherry_boat: ["textures/items/cherry_boat", "textures/items/boat_cherry"],
	bamboo_raft: ["textures/items/bamboo_raft", "textures/items/boat_bamboo"],
	pale_oak_boat: ["textures/items/pale_oak_boat"],
	oak_chest_boat: ["textures/items/oak_chest_boat"],
	spruce_chest_boat: ["textures/items/spruce_chest_boat"],
	birch_chest_boat: ["textures/items/birch_chest_boat"],
	jungle_chest_boat: ["textures/items/jungle_chest_boat"],
	acacia_chest_boat: ["textures/items/acacia_chest_boat"],
	dark_oak_chest_boat: ["textures/items/dark_oak_chest_boat"],
	// Blocks often shown as items
	cactus: ["textures/blocks/cactus_side", "textures/blocks/cactus_top"],
	scaffolding: [
		"textures/blocks/scaffolding_top",
		"textures/blocks/scaffolding_side",
		"textures/blocks/scaffolding_bottom"
	],
	grass_block: ["textures/blocks/grass_side_carried", "textures/blocks/grass_carried"],
	grass: ["textures/blocks/grass_carried", "textures/blocks/tallgrass"],
	fern: ["textures/blocks/fern", "textures/blocks/tallgrass"],
	tall_grass: ["textures/blocks/double_plant_grass_top", "textures/blocks/tallgrass"],
	// Slabs (legacy stone_block_slab* ids)
	stone_slab: ["textures/blocks/stone_slab_side", "textures/blocks/stone_slab_top"],
	stone_block_slab: ["textures/blocks/stone_slab_side", "textures/blocks/stone_slab_top"],
	normal_stone_slab: ["textures/blocks/stone_slab_side", "textures/blocks/stone_slab_top"],
	smooth_stone_slab: ["textures/blocks/stone_slab_side", "textures/blocks/stone_slab_top"],
	oak_leaves: ["textures/blocks/leaves_oak_opaque", "textures/blocks/leaves_oak"],
	spruce_leaves: ["textures/blocks/leaves_spruce_opaque", "textures/blocks/leaves_spruce"],
	birch_leaves: ["textures/blocks/leaves_birch_opaque", "textures/blocks/leaves_birch"],
	jungle_leaves: ["textures/blocks/leaves_jungle_opaque", "textures/blocks/leaves_jungle"],
	acacia_leaves: ["textures/blocks/leaves_acacia_opaque", "textures/blocks/leaves_acacia"],
	dark_oak_leaves: ["textures/blocks/leaves_big_oak_opaque", "textures/blocks/leaves_big_oak"]
};

/** Boat wood → index in item_texture "boat" array (1.26+) */
const BOAT_VARIANT = {
	oak: 0,
	spruce: 1,
	birch: 2,
	jungle: 3,
	acacia: 4,
	dark_oak: 5,
	darkoak: 5,
	mangrove: 6,
	bamboo: 7,
	cherry: 8,
	pale_oak: 9
};

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
 * @param {string} packPath
 * @returns {string[]} absolute CDN URLs
 */
/**
 * Absolute CDN URLs for a pack-relative texture path (.png then .tga, both tags).
 * @param {string} packPath
 * @returns {string[]}
 */
/** Session-wide failed absolute URLs — avoid re-requesting known 404s (console spam). */
const failedUrls = new Set();

/**
 * Absolute CDN URLs for a pack-relative texture path.
 * Prefer .png then .tga on the primary tag only; fallback tag only if primary fails later.
 * @param {string} packPath
 * @returns {string[]}
 */
function textureUrls(packPath) {
	let p = String(packPath).replace(/^\//, "").replace(/\\/g, "/");
	if (!p.startsWith("textures/")) {
		if (p.startsWith("items/") || p.startsWith("blocks/")) p = `textures/${p}`;
		// Prefer items for short names that look like items
		else if (/boat|book|sign|banner|egg|ingot|nugget|dye|bucket|potion|sword|axe|pick|hoe|shovel|helmet|chestplate|leggings|boots/i.test(p)) {
			p = `textures/items/${p}`;
		} else {
			p = `textures/blocks/${p}`;
		}
	}
	p = p.replace(/\.(png|tga)$/i, "");
	// Primary tag first (png then tga); only one fallback png (legacy)
	return [
		`${VANILLA_RP}${p}.png`,
		`${VANILLA_RP}${p}.tga`,
		`${VANILLA_RP_FALLBACK}${p}.png`
	];
}

/**
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
			for (const url of textureUrls(path)) {
				if (failedUrls.has(url)) continue;
				try {
					const res = await fetch(url, { mode: "cors" });
					if (!res.ok) {
						failedUrls.add(url);
						continue;
					}
					const blob = await res.blob();
					if (!blob || blob.size < 16) {
						failedUrls.add(url);
						continue;
					}
					// TGA needs decode — Image() cannot load raw TGA
					if (url.endsWith(".tga")) {
						const objectUrl = await tgaBlobToObjectUrl(blob);
						if (!objectUrl) {
							failedUrls.add(url);
							continue;
						}
						ownedObjectUrls.add(objectUrl);
						return objectUrl;
					}
					const objectUrl = URL.createObjectURL(blob);
					const ok = await new Promise(resolve => {
						const im = new Image();
						im.onload = () => resolve(true);
						im.onerror = () => resolve(false);
						im.src = objectUrl;
					});
					if (!ok) {
						URL.revokeObjectURL(objectUrl);
						failedUrls.add(url);
						continue;
					}
					ownedObjectUrls.add(objectUrl);
					return objectUrl;
				} catch {
					failedUrls.add(url);
				}
			}
		}

		console.debug("[basi] no icon for", bare, "tried", packPaths.slice(0, 8));
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
	failedUrls.clear();
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
		console.warn("[basi] hydrate init failed", e);
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
	console.info(`[basi] item icons: ${loaded}/${imgs.length} loaded`);
	return loaded;
}
