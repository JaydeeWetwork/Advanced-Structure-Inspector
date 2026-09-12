/**
 * Seed taxonomy (categories → entries) and circuit features.
 * IDs are deterministic from slugs so seeds stay stable across reloads.
 */

export const TAXONOMY_SEED_VERSION = 1;
export const TAXONOMY_SEED_STATE_KEY = "basi.taxonomySeed.v1";

export function categoryIdForSlug(slug) {
	return `cat:${slug}`;
}

export function entryIdForSlug(categorySlug, entrySlug) {
	return `ent:${categorySlug}/${entrySlug}`;
}

export function featureIdForSlug(slug) {
	return `feat:${slug}`;
}

/**
 * @param {string} slug
 * @returns {string}
 */
export function titleCaseSlug(slug) {
	return String(slug || "")
		.split("-")
		.filter(Boolean)
		.map(part => part.charAt(0).toUpperCase() + part.slice(1))
		.join(" ");
}

/** @type {{ slug: string, name: string, color: string, entries: string[] }[]} */
export const SEED_CATEGORY_LAYOUT = [
	{
		slug: "circuitry",
		name: "Circuitry",
		color: "#3b82f6",
		entries: [
			"transmission",
			"logic",
			"pulse-extenders",
			"monostables",
			"clocks",
			"memory",
			"piston",
			"miscellaneous"
		]
	},
	{
		slug: "filters",
		name: "Filters",
		color: "#f59e0b",
		entries: [
			"stackables-filters",
			"non-stackables-separators",
			"full-non-stackables-sorters",
			"multi-item-sorters",
			"copper-golem",
			"allay",
			"others"
		]
	},
	{
		slug: "halls",
		name: "Halls",
		color: "#8b5cf6",
		entries: ["chest", "barrel", "bulk", "hybrid", "mixed", "others"]
	},
	{
		slug: "box-processing",
		name: "Box Processing",
		color: "#06b6d4",
		entries: [
			"box-loaders",
			"box-unloaders",
			"parallelizers",
			"mergers-splitters",
			"box-sorters",
			"checkers",
			"temps",
			"others"
		]
	},
	{
		slug: "peripherals",
		name: "Peripherals",
		color: "#10b981",
		entries: [
			"box-displays",
			"crafters",
			"restock-stations",
			"inputs-uis",
			"furnace-arrays",
			"potion-brewers",
			"others"
		]
	},
	{
		slug: "misc",
		name: "Misc",
		color: "#64748b",
		entries: ["item-transportation", "item-stackers", "item-layouts"]
	},
	{
		slug: "mob-farming",
		name: "Mob Farming",
		color: "#ef4444",
		entries: [
			"overworld-hostile-mob",
			"overworld-passive-mob",
			"overworld-aquatic-mob",
			"nether-mob-farm",
			"end-mob-farm",
			"trident-killer",
			"wither-related",
			"witch-farm",
			"other-mob-farming"
		]
	},
	{
		slug: "villager-farming",
		name: "Villager Farming",
		color: "#ec4899",
		entries: [
			"iron-farm",
			"raid-farm",
			"crop-farm",
			"villager-breeder",
			"trading-hall",
			"other-villagers"
		]
	},
	{
		slug: "block-item-farming",
		name: "Block/Item Farming",
		color: "#84cc16",
		entries: [
			"tree",
			"bonemeal",
			"forced-growth",
			"natural-growth",
			"cobblestone-basalt",
			"concrete-converter",
			"ice-snow",
			"obsidian",
			"wool",
			"honey-bottle-comb",
			"illegal-blocks",
			"gravity-block-duper",
			"sculk",
			"resin",
			"other-block-farming"
		]
	},
	{
		slug: "transportation",
		name: "Transportation",
		color: "#0ea5e9",
		entries: ["translocator", "piston-bolt", "enderpearl", "breeze", "sulfur-cube", "other"]
	},
	{
		slug: "slimestone",
		name: "Slimestone",
		color: "#a3a3a3",
		entries: [
			"world-eater",
			"quarry",
			"tunnel-bore",
			"water-lava-clearer",
			"engine",
			"other-slimestone"
		]
	},
	{
		slug: "miscellaneous",
		name: "Miscellaneous",
		color: "#78716c",
		entries: ["random-contraptions", "other-contraptions", "other-farms"]
	}
];

/** @type {{ slug: string, name: string, color: string, description: string }[]} */
export const SEED_FEATURES = [
	{
		slug: "1-high",
		name: "1-high",
		color: "#38bdf8",
		description:
			'A circuit is 1-high (aka "1-tall") if its vertical dimension is one block high (meaning it can\'t have any redstone components that require support blocks under them, like redstone dust, repeaters, etc). Also see flat.'
	},
	{
		slug: "1-wide",
		name: "1-wide",
		color: "#818cf8",
		description:
			"A circuit is 1-wide if at least 1 of its horizontal dimensions is exactly 1 block wide."
	},
	{
		slug: "flat",
		name: "Flat",
		color: "#34d399",
		description:
			"A circuit is flat if it generally can be laid out on the ground with no components above another (support blocks under components are okay). Flat structures are usually easier for beginners to understand and build, and fit nicely under floors or on top of roofs. Also see 1-high."
	},
	{
		slug: "flush",
		name: "Flush",
		color: "#fbbf24",
		description:
			"A circuit is flush if it doesn't extend beyond a flat wall, floor, or ceiling and can still provide utility to the other side, though redstone mechanisms can be visible in the wall. Flush is a design goal for piston-extenders, piston doors, etc. Also see hipster and seamless."
	},
	{
		slug: "hipster",
		name: "Hipster",
		color: "#f472b6",
		description:
			"A circuit is hipster if it is initially hidden behind a flat wall, floor, or ceiling and can still provide utility to the other side. See also flush and seamless."
	},
	{
		slug: "instant",
		name: "Instant",
		color: "#fb7185",
		description:
			"A circuit is instant if its output responds immediately to the input (no delay)."
	},
	{
		slug: "seamless",
		name: "Seamless",
		color: "#a78bfa",
		description:
			"A circuit is seamless if no redstone components are visible both before and after it completes its task (but it's okay if some are visible during operation). Seamless is a desirable design goal for piston-extenders, piston doors, etc. See also flush and hipster."
	},
	{
		slug: "silent",
		name: "Silent",
		color: "#94a3b8",
		description:
			"A circuit is silent if it doesn't make noise (such as from piston movement, dispenser/dropper activating when empty, etc.). Silent structures are desirable for traps or peaceful homes."
	},
	{
		slug: "stackable",
		name: "Stackable",
		color: "#22d3ee",
		description:
			"A circuit is stackable if it can be placed directly on top of other copies of itself, and they all can be controlled as a single unit. Also see tileable."
	},
	{
		slug: "expandable",
		name: "Expandable",
		color: "#4ade80",
		description:
			"A circuit is expandable if it can be placed directly next to other copies of itself, and they all can be controlled as a single unit. Also see tileable."
	},
	{
		slug: "tileable",
		name: "Tileable",
		color: "#c084fc",
		description:
			'A circuit is tileable if it can be placed directly next to or on top of other copies of itself, and each copy can still be controlled independently. Also see stackable. Circuits might be described as "2-wide tileable" (tileable every two spaces in one dimension), or "2×4 tileable" (tileable in two directions), etc. Some structures might be described as "alternating tileable", meaning they can be placed next to each other if every other one is flipped or a slightly different design.'
	}
];

/**
 * @returns {{
 *   categories: import("../viewer/catalog.js").StructureCategory[],
 *   entries: import("../viewer/catalog.js").CatalogEntry[],
 *   features: import("../viewer/catalog.js").CatalogFeature[]
 * }}
 */
export function buildSeedTaxonomy() {
	const circuitryId = categoryIdForSlug("circuitry");
	/** @type {import("../viewer/catalog.js").StructureCategory[]} */
	const categories = SEED_CATEGORY_LAYOUT.map((c, i) => ({
		id: categoryIdForSlug(c.slug),
		slug: c.slug,
		name: c.name,
		description: "",
		color: c.color,
		sortOrder: i,
		collapsed: true,
		isDefault: true
	}));
	/** @type {import("../viewer/catalog.js").CatalogEntry[]} */
	const entries = [];
	for (const c of SEED_CATEGORY_LAYOUT) {
		c.entries.forEach((entrySlug, j) => {
			entries.push({
				id: entryIdForSlug(c.slug, entrySlug),
				slug: entrySlug,
				categoryId: categoryIdForSlug(c.slug),
				name: titleCaseSlug(entrySlug),
				description: "",
				sortOrder: j,
				collapsed: true,
				isDefault: true
			});
		});
	}
	/** @type {import("../viewer/catalog.js").CatalogFeature[]} */
	const features = SEED_FEATURES.map((f, i) => ({
		id: featureIdForSlug(f.slug),
		slug: f.slug,
		name: f.name,
		description: f.description,
		useCases: "",
		color: f.color,
		categoryIds: [circuitryId],
		sortOrder: i,
		isDefault: true
	}));
	return { categories, entries, features };
}
