/**
 * Pack-relative texture paths for one item id.
 * The icon loader owns the fetched JSON and the URL cache.
 */

/**
 * @param {string|undefined|null} id
 */
export function stripItemNs(id) {
	if (!id || typeof id !== "string") return "";
	return id.replace(/^minecraft:/i, "").trim();
}


/**
 * @param {any} entry
 * @param {number} [variant]
 * @returns {string|null}
 */
export function pathFromTextureEntry(entry, variant = -1) {
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
export function textureKeysFromBlock(blockDef) {
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
 * Heuristic alternate pack paths for common block items.
 * @param {string} bare
 * @returns {string[]}
 */
export function heuristicBlockPaths(bare) {
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
export const BUCKET_TEXTURE_INDEX = {
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
export const KNOWN_ITEM_PATHS = {
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
export const BOAT_VARIANT = {
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


