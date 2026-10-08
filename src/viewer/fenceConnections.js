/**
 * Classic fences share one palette row and omit connection states, so every
 * post was drawn bare. Glass panes were one full sheet with no arms. One walk
 * splits rows that sit against a neighbor that family connects to.
 *
 * A saved arm (any connection_* of 1) is left as written, including an arm
 * toward a block outside this structure. All-zero flags are not saved arms:
 * the 1.26.50 block upgrader writes those zeros onto older fences. A side
 * with no in-structure neighbor does not grow an arm.
 *
 * Fences link to fences, gates, and sturdy cubes, and skip glass, leaves,
 * and barriers. Panes link to panes, bars, and sturdy cubes, including glass,
 * and skip leaves and barriers. Iron bars are neighbors, not sources.
 */

import { resolveBlockShapeName } from "./appearanceFallback.js";
import { shapeFamily } from "./occupancySkip.js";

/** East is +x, west is -x, south is +z, north is -z. Matches the preview Z-flip. */
const DIRS = [
	["minecraft:connection_east", 1, 0],
	["minecraft:connection_west", -1, 0],
	["minecraft:connection_south", 0, 1],
	["minecraft:connection_north", 0, -1]
];

/**
 * @param {string} name
 */
export function isFenceBlockName(name) {
	const n = String(name || "").replace(/^minecraft:/, "");
	return /(?:^|_)fence$/.test(n);
}

/**
 * Byte 1, boolean true, or the string "1" / "true". Upgrade schemas store 0.
 * @param {unknown} value
 */
function connectionIsOn(value) {
	return value === 1 || value === true || value === "1" || value === "true";
}

/**
 * True when the file already recorded at least one arm. Missing keys and an
 * all-zero set (what the upgrader adds) are filled from neighbors.
 * @param {Record<string, unknown>|null|undefined} states
 */
function hasStoredConnections(states) {
	if (!states) return false;
	return DIRS.some(([key]) => connectionIsOn(states[key]));
}

/**
 * @param {string} name
 */
export function isGlassPaneName(name) {
	return /glass_pane$/.test(String(name || "").replace(/^minecraft:/, ""));
}

/** @type {{ label: string, isSource: (name: string) => boolean, connect: (name: string) => boolean, skip: RegExp }[]} */
const FAMILIES = [
	{
		label: "fence connections",
		isSource: isFenceBlockName,
		connect: n => isFenceBlockName(n) || /fence_gate$/.test(n),
		skip: /glass|leaves|barrier/
	},
	{
		label: "glass pane connections",
		isSource: isGlassPaneName,
		connect: n => isGlassPaneName(n) || /_bars$/.test(n),
		skip: /leaves|barrier/
	}
];

const FENCE_FAMILY = FAMILIES[0];
const PANE_FAMILY = FAMILIES[1];

/**
 * @param {string} name
 * @param {(name: string) => string} shapeOf family name
 * @param {{ connect: (name: string) => boolean, skip: RegExp }} family
 */
function links(name, shapeOf, family) {
	const n = String(name || "").replace(/^minecraft:/, "");
	if (!n || n === "air" || n === "cave_air" || n === "void_air") return false;
	if (family.connect(n)) return true;
	const shape = shapeOf(n);
	if (shape === "double_slab") return true;
	if (shape !== "block") return false;
	if (family.skip.test(n)) return false;
	return true;
}

/**
 * @param {{ individual_blocks?: Record<string, string>, patterns?: Record<string, string> }|null|undefined} blockShapes
 * @returns {(name: string) => string}
 */
function shapeOfFromTable(blockShapes) {
	const individual = blockShapes?.individual_blocks ?? {};
	const patterns = Object.entries(blockShapes?.patterns ?? {}).map(
		([rule, shape]) => /** @type {[RegExp, string]} */ ([new RegExp(rule), shape])
	);
	return name => shapeFamily(resolveBlockShapeName(
		String(name || "").replace(/^minecraft:/, ""),
		individual,
		patterns
	).shape);
}

/**
 * @param {[number, number, number]} size
 * @param {any[]} palette
 * @param {[Int32Array|number[], Int32Array|number[]]} indices
 * @param {{ individual_blocks?: Record<string, string>, patterns?: Record<string, string> }|null|undefined} blockShapes
 * @param {typeof FAMILIES} families
 * @returns {{ palette: any[], indices: [Int32Array, Int32Array], linked: number, variants: number }}
 */
function stampConnections(size, palette, indices, blockShapes, families) {
	const sx = Number(size?.[0] ?? 0);
	const sy = Number(size?.[1] ?? 0);
	const sz = Number(size?.[2] ?? 0);
	const layerSrc = indices?.[0];
	if (!layerSrc || !sx || !sy || !sz || !palette?.length) {
		return { palette, indices, linked: 0, variants: 0 };
	}

	const shapeOf = shapeOfFromTable(blockShapes);
	const src = layerSrc instanceof Int32Array ? new Int32Array(layerSrc) : Int32Array.from(layerSrc);
	const layer0 = new Int32Array(src);
	const layer1 = indices[1] instanceof Int32Array
		? new Int32Array(indices[1])
		: Int32Array.from(indices[1] || []);
	/** @type {any[]} */
	const nextPalette = palette.slice();
	const paletteCount = palette.length;
	const familyOf = new Int8Array(paletteCount);
	familyOf.fill(-1);
	const stored = new Uint8Array(paletteCount);
	const linkOf = families.map(() => new Uint8Array(paletteCount));
	for (let pi = 0; pi < paletteCount; pi++) {
		const block = palette[pi];
		if (!block) continue;
		const name = block.name;
		for (let fi = 0; fi < families.length; fi++) {
			if (links(name, shapeOf, families[fi])) linkOf[fi][pi] = 1;
			if (familyOf[pi] < 0 && families[fi].isSource(name)) {
				familyOf[pi] = fi;
				stored[pi] = hasStoredConnections(block.states) ? 1 : 0;
			}
		}
	}

	/** @type {Map<number, number>[]} */
	const caches = families.map(() => new Map());
	const variantCounts = families.map(() => 0);
	/** @type {Map<string, number>} */
	const linkedByLabel = new Map(families.map(family => [family.label, 0]));
	const strideX = sy * sz;
	// Neighbour indices come from the unmodified layer. New rows keep the same name.
	for (let x = 0; x < sx; x++) {
		for (let y = 0; y < sy; y++) {
			let i = (x * sy + y) * sz;
			for (let z = 0; z < sz; z++, i++) {
				const pi = src[i];
				if (!Number.isInteger(pi) || pi < 0 || pi >= paletteCount) continue;
				const fi = familyOf[pi];
				if (fi < 0 || stored[pi]) continue;
				const row = linkOf[fi];
				let mask = 0;
				if (x + 1 < sx) {
					const n = src[i + strideX];
					if (n >= 0 && n < paletteCount && row[n]) mask |= 1;
				}
				if (x > 0) {
					const n = src[i - strideX];
					if (n >= 0 && n < paletteCount && row[n]) mask |= 2;
				}
				if (z + 1 < sz) {
					const n = src[i + 1];
					if (n >= 0 && n < paletteCount && row[n]) mask |= 4;
				}
				if (z > 0) {
					const n = src[i - 1];
					if (n >= 0 && n < paletteCount && row[n]) mask |= 8;
				}
				if (!mask) continue;
				const cache = caches[fi];
				const key = pi * 16 + mask;
				let newPi = cache.get(key);
				if (newPi == null) {
					const block = palette[pi];
					const states = { ...(block.states || {}) };
					states["minecraft:connection_east"] = mask & 1 ? 1 : 0;
					states["minecraft:connection_west"] = mask & 2 ? 1 : 0;
					states["minecraft:connection_south"] = mask & 4 ? 1 : 0;
					states["minecraft:connection_north"] = mask & 8 ? 1 : 0;
					newPi = nextPalette.length;
					nextPalette.push({ ...block, states });
					cache.set(key, newPi);
					variantCounts[fi]++;
				}
				layer0[i] = newPi;
				linkedByLabel.set(families[fi].label, linkedByLabel.get(families[fi].label) + 1);
			}
		}
	}

	let linked = 0;
	let variantCount = 0;
	for (let fi = 0; fi < families.length; fi++) {
		const family = families[fi];
		const count = linkedByLabel.get(family.label);
		const variants = variantCounts[fi];
		linked += count;
		variantCount += variants;
		if (count) {
			console.info(`[bLayers] ${family.label}: ${count} → ${variants} shapes`);
		}
	}

	return {
		palette: nextPalette,
		indices: [layer0, layer1],
		linked,
		variants: variantCount
	};
}

/**
 * @param {[number, number, number]} size
 * @param {any[]} palette
 * @param {[Int32Array|number[], Int32Array|number[]]} indices
 * @param {{ individual_blocks?: Record<string, string>, patterns?: Record<string, string> }|null} [blockShapes]
 * @returns {{ palette: any[], indices: [Int32Array, Int32Array], linked: number, variants: number }}
 */
export function applyNeighborConnections(size, palette, indices, blockShapes) {
	return stampConnections(size, palette, indices, blockShapes, FAMILIES);
}

/**
 * @param {[number, number, number]} size
 * @param {any[]} palette
 * @param {[Int32Array|number[], Int32Array|number[]]} indices
 * @param {{ individual_blocks?: Record<string, string>, patterns?: Record<string, string> }|null} [blockShapes]
 * @returns {{ palette: any[], indices: [Int32Array, Int32Array], linked: number, variants: number }}
 */
export function applyFenceConnections(size, palette, indices, blockShapes) {
	return stampConnections(size, palette, indices, blockShapes, [FENCE_FAMILY]);
}

/**
 * @param {[number, number, number]} size
 * @param {any[]} palette
 * @param {[Int32Array|number[], Int32Array|number[]]} indices
 * @param {{ individual_blocks?: Record<string, string>, patterns?: Record<string, string> }|null} [blockShapes]
 * @returns {{ palette: any[], indices: [Int32Array, Int32Array], linked: number, variants: number }}
 */
export function applyPaneConnections(size, palette, indices, blockShapes) {
	return stampConnections(size, palette, indices, blockShapes, [PANE_FAMILY]);
}
