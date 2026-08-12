/**
 * Match a crafter 3×3 grid to a crafting result.
 * Loads vanilla Bedrock shaped/shapeless recipes from bedrock-samples (CDN)
 * plus a built-in common set for instant offline-ish matches.
 */

// Match preview pack tag (fetchers.js)
const VANILLA_TAG = "v1.26.40.26-preview";
const RECIPES_BASE =
	`https://cdn.jsdelivr.net/gh/Mojang/bedrock-samples@${VANILLA_TAG}/behavior_pack/recipes/`;

/** Tag expansions used by many Bedrock recipes */
const TAGS = {
	"minecraft:planks": [
		"oak_planks", "spruce_planks", "birch_planks", "jungle_planks",
		"acacia_planks", "dark_oak_planks", "mangrove_planks", "cherry_planks",
		"bamboo_planks", "crimson_planks", "warped_planks", "pale_oak_planks", "planks"
	],
	"minecraft:logs": [
		"oak_log", "spruce_log", "birch_log", "jungle_log", "acacia_log",
		"dark_oak_log", "mangrove_log", "cherry_log", "pale_oak_log",
		"crimson_stem", "warped_stem", "log"
	],
	"minecraft:logs_that_burn": [
		"oak_log", "spruce_log", "birch_log", "jungle_log", "acacia_log",
		"dark_oak_log", "mangrove_log", "cherry_log", "pale_oak_log", "log"
	],
	"minecraft:wooden_slabs": [
		"oak_slab", "spruce_slab", "birch_slab", "jungle_slab", "acacia_slab",
		"dark_oak_slab", "mangrove_slab", "cherry_slab", "bamboo_slab",
		"crimson_slab", "warped_slab", "pale_oak_slab"
	],
	"minecraft:coals": ["coal", "charcoal"],
	"minecraft:stone_crafting_materials": [
		"cobblestone", "blackstone", "cobbled_deepslate"
	],
	"minecraft:stone_tool_materials": [
		"cobblestone", "blackstone", "cobbled_deepslate"
	]
};

/**
 * Built-in shaped recipes (pattern uses single-char keys).
 * Keys may be item id, array of ids, or { tag: "minecraft:planks" }.
 */
const BUILTIN = [
	// sticks from planks
	{
		pattern: ["#", "#"],
		key: { "#": { tag: "minecraft:planks" } },
		result: { item: "stick", count: 4 }
	},
	// crafting table
	{
		pattern: ["##", "##"],
		key: { "#": { tag: "minecraft:planks" } },
		result: { item: "crafting_table", count: 1 }
	},
	// chest
	{
		pattern: ["###", "# #", "###"],
		key: { "#": { tag: "minecraft:planks" } },
		result: { item: "chest", count: 1 }
	},
	// furnace
	{
		pattern: ["###", "# #", "###"],
		key: { "#": "cobblestone" },
		result: { item: "furnace", count: 1 }
	},
	// torch
	{
		pattern: ["C", "S"],
		key: { C: { tag: "minecraft:coals" }, S: "stick" },
		result: { item: "torch", count: 4 }
	},
	// ladder
	{
		pattern: ["S S", "SSS", "S S"],
		key: { S: "stick" },
		result: { item: "ladder", count: 3 }
	},
	// bowl
	{
		pattern: ["# #", " # "],
		key: { "#": { tag: "minecraft:planks" } },
		result: { item: "bowl", count: 4 }
	},
	// wooden pickaxe
	{
		pattern: ["###", " S ", " S "],
		key: { "#": { tag: "minecraft:planks" }, S: "stick" },
		result: { item: "wooden_pickaxe", count: 1 }
	},
	// wooden axe
	{
		pattern: ["##", "#S", " S"],
		key: { "#": { tag: "minecraft:planks" }, S: "stick" },
		result: { item: "wooden_axe", count: 1 }
	},
	// wooden shovel
	{
		pattern: ["#", "S", "S"],
		key: { "#": { tag: "minecraft:planks" }, S: "stick" },
		result: { item: "wooden_shovel", count: 1 }
	},
	// wooden hoe
	{
		pattern: ["##", " S", " S"],
		key: { "#": { tag: "minecraft:planks" }, S: "stick" },
		result: { item: "wooden_hoe", count: 1 }
	},
	// wooden sword
	{
		pattern: ["#", "#", "S"],
		key: { "#": { tag: "minecraft:planks" }, S: "stick" },
		result: { item: "wooden_sword", count: 1 }
	},
	// stone tools
	{
		pattern: ["###", " S ", " S "],
		key: { "#": { tag: "minecraft:stone_tool_materials" }, S: "stick" },
		result: { item: "stone_pickaxe", count: 1 }
	},
	// iron block → 9 ingots (shapeless-like via 1-cell)
	// oak planks from log (shapeless 1 log)
	// handled as shapeless below
	// bookshelves
	{
		pattern: ["###", "BBB", "###"],
		key: { "#": { tag: "minecraft:planks" }, B: "book" },
		result: { item: "bookshelf", count: 1 }
	},
	// trapdoor
	{
		pattern: ["###", "###"],
		key: { "#": { tag: "minecraft:planks" } },
		result: { item: "oak_trapdoor", count: 2 }
	},
	// door
	{
		pattern: ["##", "##", "##"],
		key: { "#": { tag: "minecraft:planks" } },
		result: { item: "oak_door", count: 3 }
	},
	// fence (2 planks + 1 stick pattern simplified - actual is ##S##S)
	{
		pattern: ["#S#", "#S#"],
		key: { "#": { tag: "minecraft:planks" }, S: "stick" },
		result: { item: "oak_fence", count: 3 }
	},
	// fence gate
	{
		pattern: ["S#S", "S#S"],
		key: { "#": { tag: "minecraft:planks" }, S: "stick" },
		result: { item: "oak_fence_gate", count: 1 }
	},
	// pressure plate
	{
		pattern: ["##"],
		key: { "#": { tag: "minecraft:planks" } },
		result: { item: "oak_pressure_plate", count: 1 }
	},
	// button (shapeless single plank)
	// slab
	{
		pattern: ["###"],
		key: { "#": { tag: "minecraft:planks" } },
		result: { item: "oak_slab", count: 6 }
	},
	// stairs
	{
		pattern: ["#  ", "## ", "###"],
		key: { "#": { tag: "minecraft:planks" } },
		result: { item: "oak_stairs", count: 4 }
	},
	// sign
	{
		pattern: ["###", "###", " S "],
		key: { "#": { tag: "minecraft:planks" }, S: "stick" },
		result: { item: "oak_sign", count: 3 }
	},
	// boat
	{
		pattern: ["# #", "###"],
		key: { "#": { tag: "minecraft:planks" } },
		result: { item: "oak_boat", count: 1 }
	},
	// barrel
	{
		pattern: ["#S#", "# #", "#S#"],
		key: { "#": { tag: "minecraft:planks" }, S: { tag: "minecraft:wooden_slabs" } },
		result: { item: "barrel", count: 1 }
	},
	// hopper
	{
		pattern: ["I I", "ICI", " I "],
		key: { I: "iron_ingot", C: "chest" },
		result: { item: "hopper", count: 1 }
	},
	// dropper
	{
		pattern: ["###", "# #", "#R#"],
		key: { "#": "cobblestone", R: "redstone" },
		result: { item: "dropper", count: 1 }
	},
	// dispenser
	{
		pattern: ["###", "#B#", "#R#"],
		key: { "#": "cobblestone", B: "bow", R: "redstone" },
		result: { item: "dispenser", count: 1 }
	},
	// piston
	{
		pattern: ["PPP", "CIC", "CRC"],
		key: { P: { tag: "minecraft:planks" }, C: "cobblestone", I: "iron_ingot", R: "redstone" },
		result: { item: "piston", count: 1 }
	},
	// sticky piston
	{
		pattern: ["S", "P"],
		key: { S: "slime_ball", P: "piston" },
		result: { item: "sticky_piston", count: 1 }
	},
	// iron ingot from block
	{
		pattern: ["#"],
		key: { "#": "iron_block" },
		result: { item: "iron_ingot", count: 9 }
	},
	// gold, diamond, copper, emerald, netherite blocks
	{
		pattern: ["#"],
		key: { "#": "gold_block" },
		result: { item: "gold_ingot", count: 9 }
	},
	{
		pattern: ["#"],
		key: { "#": "diamond_block" },
		result: { item: "diamond", count: 9 }
	},
	{
		pattern: ["#"],
		key: { "#": "copper_block" },
		result: { item: "copper_ingot", count: 9 }
	},
	// 9 iron → block
	{
		pattern: ["###", "###", "###"],
		key: { "#": "iron_ingot" },
		result: { item: "iron_block", count: 1 }
	},
	{
		pattern: ["###", "###", "###"],
		key: { "#": "gold_ingot" },
		result: { item: "gold_block", count: 1 }
	},
	{
		pattern: ["###", "###", "###"],
		key: { "#": "diamond" },
		result: { item: "diamond_block", count: 1 }
	},
	// bread
	{
		pattern: ["WWW"],
		key: { W: "wheat" },
		result: { item: "bread", count: 1 }
	},
	// paper
	{
		pattern: ["SSS"],
		key: { S: "sugar_cane" },
		result: { item: "paper", count: 3 }
	},
	// book
	{
		pattern: ["P", "P", "P"],
		key: { P: "paper" },
		// actual needs leather - simplified shapeless below
		result: { item: "paper", count: 1 },
		_skip: true
	},
	// shears
	{
		pattern: [" I", "I "],
		key: { I: "iron_ingot" },
		result: { item: "shears", count: 1 }
	},
	// bucket
	{
		pattern: ["I I", " I "],
		key: { I: "iron_ingot" },
		result: { item: "bucket", count: 1 }
	},
	// compass
	{
		pattern: [" I ", "IRI", " I "],
		key: { I: "iron_ingot", R: "redstone" },
		result: { item: "compass", count: 1 }
	},
	// clock
	{
		pattern: [" G ", "GRG", " G "],
		key: { G: "gold_ingot", R: "redstone" },
		result: { item: "clock", count: 1 }
	},
	// minecart
	{
		pattern: ["I I", "III"],
		key: { I: "iron_ingot" },
		result: { item: "minecart", count: 1 }
	},
	// chest minecart
	{
		pattern: ["A", "B"],
		key: { A: "chest", B: "minecart" },
		result: { item: "chest_minecart", count: 1 }
	},
	// hopper minecart
	{
		pattern: ["A", "B"],
		key: { A: "hopper", B: "minecart" },
		result: { item: "hopper_minecart", count: 1 }
	},
	// rail
	{
		pattern: ["I I", "ISI", "I I"],
		key: { I: "iron_ingot", S: "stick" },
		result: { item: "rail", count: 16 }
	},
	// powered rail
	{
		pattern: ["G G", "GSG", "GRG"],
		key: { G: "gold_ingot", S: "stick", R: "redstone" },
		result: { item: "golden_rail", count: 6 }
	},
	// detector rail
	{
		pattern: ["I I", "IPI", "IRI"],
		key: { I: "iron_ingot", P: "stone_pressure_plate", R: "redstone" },
		result: { item: "detector_rail", count: 6 }
	},
	// activator rail
	{
		pattern: ["ISI", "IRI", "ISI"],
		key: { I: "iron_ingot", S: "stick", R: "redstone_torch" },
		result: { item: "activator_rail", count: 6 }
	},
	// crafter itself
	{
		pattern: ["III", "ICI", "RTR"],
		key: { I: "iron_ingot", C: "crafting_table", R: "redstone", T: "dropper" },
		result: { item: "crafter", count: 1 }
	},
	// planks from logs (any log → 4 oak_planks-style; we map wood type when possible)
	{
		pattern: ["#"],
		key: { "#": { tag: "minecraft:logs" } },
		result: { item: "oak_planks", count: 4 },
		_logToPlanks: true
	}
].filter(r => !r._skip);

/** Shapeless: list of ingredient counts (item or tag) → result */
const BUILTIN_SHAPELESS = [
	{
		ingredients: [{ item: "paper", count: 3 }, { item: "leather", count: 1 }],
		result: { item: "book", count: 1 }
	},
	{
		ingredients: [{ item: "book", count: 1 }, { item: "ink_sac", count: 1 }, { item: "feather", count: 1 }],
		result: { item: "writable_book", count: 1 }
	},
	{
		ingredients: [{ tag: "minecraft:planks", count: 1 }],
		result: { item: "oak_button", count: 1 }
	}
];

/**
 * @typedef {{ item: string, count: number }} CraftResult
 */

/** @type {any[]|null} */
let cdnRecipes = null;
/** @type {Promise<any[]>|null} */
let cdnLoadPromise = null;

/**
 * @param {string|undefined|null} id
 */
function bare(id) {
	if (!id || typeof id !== "string") return "";
	return id.replace(/^minecraft:/i, "").trim();
}

/**
 * Expand a key definition to a set of acceptable item ids.
 * @param {string|string[]|{tag?: string, item?: string}} def
 * @returns {Set<string>}
 */
function expandKey(def) {
	/** @type {Set<string>} */
	const set = new Set();
	if (!def) return set;
	if (typeof def === "string") {
		set.add(bare(def));
		return set;
	}
	if (Array.isArray(def)) {
		def.forEach(d => expandKey(d).forEach(x => set.add(x)));
		return set;
	}
	if (typeof def === "object") {
		if (def.item) set.add(bare(def.item));
		if (def.tag) {
			const tag = def.tag.startsWith("minecraft:") ? def.tag : `minecraft:${def.tag}`;
			const list = TAGS[tag] || TAGS[def.tag] || [];
			list.forEach(x => set.add(bare(x)));
			// also accept tag name itself
			set.add(bare(def.tag));
		}
	}
	return set;
}

/**
 * Build 3×3 grid of item names ("" for empty/disabled).
 * @param {{ name: string, count: number, slot: number|null }|null}[] slots length 9
 * @param {Set<number>} disabled
 * @returns {string[]}
 */
export function gridFromSlots(slots, disabled = new Set()) {
	/** @type {string[]} */
	const g = Array(9).fill("");
	for (let i = 0; i < 9; i++) {
		if (disabled.has(i)) {
			g[i] = "";
			continue;
		}
		const s = slots[i];
		g[i] = s?.name ? bare(s.name) : "";
	}
	return g;
}

/**
 * Compact a 3×3 grid by trimming empty rows/cols (recipe patterns are trimmed).
 * Returns { cells: string[][], w, h, offR, offC } of the content window.
 * @param {string[]} grid9
 */
function contentWindow(grid9) {
	const rows = [
		[grid9[0], grid9[1], grid9[2]],
		[grid9[3], grid9[4], grid9[5]],
		[grid9[6], grid9[7], grid9[8]]
	];
	let r0 = 0;
	let r1 = 2;
	let c0 = 0;
	let c1 = 2;
	while (r0 <= r1 && rows[r0].every(c => !c)) r0++;
	while (r1 >= r0 && rows[r1].every(c => !c)) r1--;
	if (r0 > r1) return { cells: [], w: 0, h: 0 };
	const slice = rows.slice(r0, r1 + 1);
	while (c0 <= c1 && slice.every(row => !row[c0])) c0++;
	while (c1 >= c0 && slice.every(row => !row[c1])) c1--;
	const cells = slice.map(row => row.slice(c0, c1 + 1));
	return { cells, w: c1 - c0 + 1, h: r1 - r0 + 1 };
}

/**
 * @param {string[]} pattern recipe pattern rows
 * @returns {string[][]}
 */
function patternMatrix(pattern) {
	const h = pattern.length;
	const w = Math.max(...pattern.map(r => r.length), 0);
	return pattern.map(row => {
		const cells = [];
		for (let c = 0; c < w; c++) {
			const ch = row[c] ?? " ";
			cells.push(ch === " " ? "" : ch);
		}
		return cells;
	});
}

/**
 * @param {string[][]} grid
 * @param {string[][]} pat
 * @param {Record<string, any>} key
 * @returns {boolean}
 */
function matchShaped(grid, pat, key) {
	if (grid.length !== pat.length) return false;
	if (grid[0]?.length !== pat[0]?.length) return false;
	/** @type {Map<string, string>} */
	const assigned = new Map(); // pattern char → actual item (for consistency)
	for (let r = 0; r < pat.length; r++) {
		for (let c = 0; c < pat[r].length; c++) {
			const ch = pat[r][c];
			const cell = grid[r][c] || "";
			if (!ch) {
				if (cell) return false;
				continue;
			}
			const allowed = expandKey(key[ch]);
			if (!allowed.size) return false;
			if (!cell || !allowed.has(cell)) return false;
			if (assigned.has(ch) && assigned.get(ch) !== cell) {
				// Same key letter can be different items only if tag allows both — both must be in allowed
				// already checked allowed.has(cell); for tag keys different items OK
				const def = key[ch];
				const isTag = def && typeof def === "object" && def.tag;
				if (!isTag && assigned.get(ch) !== cell) return false;
			} else {
				assigned.set(ch, cell);
			}
		}
	}
	return true;
}

/**
 * Log → matching planks id
 * @param {string} logId
 */
function planksFromLog(logId) {
	const id = bare(logId);
	const m = id.match(/^(?:stripped_)?(.+?)_(?:log|stem|wood|hyphae)$/);
	if (m) {
		const wood = m[1];
		if (wood === "crimson" || wood === "warped") return `${wood}_planks`;
		return `${wood}_planks`;
	}
	if (id === "log") return "oak_planks";
	return "oak_planks";
}

/**
 * Try builtin + CDN recipes.
 * @param {string[]} grid9
 * @returns {CraftResult|null}
 */
export function matchCraftingGrid(grid9) {
	const win = contentWindow(grid9);
	if (!win.w || !win.h) return null;

	// Builtin shaped
	for (const recipe of BUILTIN) {
		const pat = patternMatrix(recipe.pattern);
		if (matchShaped(win.cells, pat, recipe.key)) {
			if (recipe._logToPlanks) {
				// single log cell
				const logCell = win.cells.flat().find(Boolean);
				return { item: planksFromLog(logCell || "oak_log"), count: 4 };
			}
			return { item: bare(recipe.result.item), count: recipe.result.count || 1 };
		}
	}

	// Builtin shapeless
	const counts = new Map();
	for (const id of grid9) {
		if (!id) continue;
		counts.set(id, (counts.get(id) || 0) + 1);
	}
	for (const recipe of BUILTIN_SHAPELESS) {
		if (matchShapeless(counts, recipe.ingredients)) {
			return { item: bare(recipe.result.item), count: recipe.result.count || 1 };
		}
	}

	// CDN-loaded recipes
	if (cdnRecipes?.length) {
		for (const recipe of cdnRecipes) {
			const r = tryCdnRecipe(recipe, win, counts);
			if (r) return r;
		}
	}

	return null;
}

/**
 * @param {Map<string, number>} counts
 * @param {{ item?: string, tag?: string, count?: number }[]} ingredients
 */
function matchShapeless(counts, ingredients) {
	const used = new Map(counts);
	for (const ing of ingredients) {
		const need = ing.count || 1;
		const allowed = expandKey(ing.item ? { item: ing.item } : { tag: ing.tag });
		let left = need;
		for (const [id, n] of [...used.entries()]) {
			if (!allowed.has(id) || n <= 0) continue;
			const take = Math.min(left, n);
			used.set(id, n - take);
			left -= take;
			if (left <= 0) break;
		}
		if (left > 0) return false;
	}
	// no extra items
	for (const n of used.values()) {
		if (n > 0) return false;
	}
	return true;
}

/**
 * @param {any} recipe raw bedrock recipe json
 * @param {{ cells: string[][], w: number, h: number }} win
 * @param {Map<string, number>} counts
 * @returns {CraftResult|null}
 */
function tryCdnRecipe(recipe, win, counts) {
	if (recipe["minecraft:recipe_shaped"]) {
		const r = recipe["minecraft:recipe_shaped"];
		const tags = r.tags || [];
		if (tags.length && !tags.includes("crafting_table") && !tags.includes("crafter")) {
			// still allow crafting_table recipes for crafter
			if (!tags.some(t => t === "crafting_table" || t === "crafter")) {
				/* many only have crafting_table */
			}
		}
		const pattern = r.pattern;
		const key = r.key || {};
		if (!pattern || !r.result) return null;
		const pat = patternMatrix(pattern);
		// Normalize key values
		/** @type {Record<string, any>} */
		const normKey = {};
		for (const [ch, def] of Object.entries(key)) {
			normKey[ch] = def;
		}
		if (!matchShaped(win.cells, pat, normKey)) return null;
		const res = r.result;
		const item = bare(Array.isArray(res) ? res[0]?.item : res.item);
		const count = Array.isArray(res) ? (res[0]?.count || 1) : (res.count || 1);
		if (!item) return null;
		return { item, count };
	}
	if (recipe["minecraft:recipe_shapeless"]) {
		const r = recipe["minecraft:recipe_shapeless"];
		const ingredients = (r.ingredients || []).map(ing => {
			if (typeof ing === "string") return { item: bare(ing), count: 1 };
			if (ing.item) return { item: bare(ing.item), count: ing.count || 1 };
			if (ing.tag) return { tag: ing.tag, count: ing.count || 1 };
			return null;
		}).filter(Boolean);
		if (!matchShapeless(counts, ingredients)) return null;
		const res = r.result;
		const item = bare(Array.isArray(res) ? res[0]?.item : res.item);
		const count = Array.isArray(res) ? (res[0]?.count || 1) : (res.count || 1);
		if (!item) return null;
		return { item, count };
	}
	return null;
}

/** Common recipe file names to pull from bedrock-samples (covers most table crafts). */
const CDN_RECIPE_FILES = [
	"stick", "chest", "crafting_table", "furnace", "torch", "ladder", "bowl",
	"wooden_pickaxe", "wooden_axe", "wooden_shovel", "wooden_hoe", "wooden_sword",
	"stone_pickaxe", "stone_axe", "stone_shovel", "stone_hoe", "stone_sword",
	"iron_pickaxe", "iron_axe", "iron_shovel", "iron_hoe", "iron_sword",
	"diamond_pickaxe", "diamond_axe", "diamond_shovel", "diamond_hoe", "diamond_sword",
	"bookshelf", "sign", "oak_sign", "boat", "oak_boat", "rail", "golden_rail",
	"detector_rail", "activator_rail", "minecart", "hopper", "dropper", "dispenser",
	"piston", "sticky_piston", "bucket", "shears", "compass", "clock", "bread", "paper",
	"book", "iron_block", "gold_block", "diamond_block", "iron_ingot_from_iron_block",
	"gold_ingot_from_gold_block", "diamond_from_diamond_block", "chest_minecart",
	"hopper_minecart", "tnt_minecart", "crafter", "barrel", "smoker", "blast_furnace",
	"oak_planks", "spruce_planks", "birch_planks", "jungle_planks", "acacia_planks",
	"dark_oak_planks", "mangrove_planks", "cherry_planks", "bamboo_planks",
	"oak_stairs", "oak_slab", "oak_fence", "oak_fence_gate", "oak_door", "oak_trapdoor",
	"oak_pressure_plate", "oak_button", "crafting_table_from_crimson", "planks"
];

/**
 * Lazy-load extra recipes from CDN (best-effort).
 * @returns {Promise<void>}
 */
export async function ensureCdnRecipes() {
	if (cdnRecipes) return;
	if (cdnLoadPromise) return cdnLoadPromise;
	cdnLoadPromise = (async () => {
		const loaded = [];
		// Batch fetch (limit concurrency)
		const batch = 12;
		for (let i = 0; i < CDN_RECIPE_FILES.length; i += batch) {
			const slice = CDN_RECIPE_FILES.slice(i, i + batch);
			const parts = await Promise.all(
				slice.map(async name => {
					try {
						const res = await fetch(`${RECIPES_BASE}${name}.json`, { mode: "cors" });
						if (!res.ok) return null;
						return await res.json();
					} catch {
						return null;
					}
				})
			);
			for (const p of parts) if (p) loaded.push(p);
		}
		cdnRecipes = loaded;
		console.info(`[sdb] crafting recipes: ${loaded.length} CDN + ${BUILTIN.length} builtin`);
	})().catch(e => {
		cdnLoadPromise = null;
		cdnRecipes = [];
		console.warn("[sdb] CDN recipes failed", e);
	});
	return cdnLoadPromise;
}

/**
 * Match crafter slots → result (sync, builtin first; call ensureCdnRecipes for more).
 * @param {{ name: string, count: number, slot: number|null }|null}[] slots
 * @param {Set<number>} [disabled]
 * @returns {CraftResult|null}
 */
export function matchCrafterOutput(slots, disabled = new Set()) {
	const grid = gridFromSlots(slots, disabled);
	return matchCraftingGrid(grid);
}
