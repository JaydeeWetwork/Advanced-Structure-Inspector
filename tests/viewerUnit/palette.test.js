/**
 * Unit tests for Bedrock Layers (Node --test).
 * Pure logic + lightweight mocks — no browser / WebGL required.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../..");

// Minimal DOMException for Node if missing
if (typeof globalThis.DOMException === "undefined") {
	globalThis.DOMException = class DOMException extends Error {
		constructor(message, name = "Error") {
			super(message);
			this.name = name;
		}
	};
}

const { throwIfAborted, isAbortError } = await import("../../src/viewer/abortUtil.js");
const {
	cloneBlockIndices,
	normalizeVec3,
	mergeMultiplePalettesAndIndices,
	IGNORED_BLOCKS
} = await import("../../src/viewer/paletteCore.js");
const {
	getCachedDataFile,
	clearDataFileCache,
	getCachedFileBuild,
	clearAllPreviewCaches
} = await import("../../src/viewer/previewCache.js");
const { countStructureEntities } = await import("../../src/viewer/entityCount.js");
const StructureCatalog = (await import("../../src/viewer/catalog.js")).default;

// ---- abortUtil -----------------------------------------------------------

describe("palette.cloneBlockIndices", () => {
	it("returns independent copies of both layers", () => {
		const layer0 = new Int32Array([1, 2, 3]);
		const layer1 = new Int32Array([-1, -1, 0]);
		const [a, b] = cloneBlockIndices([layer0, layer1]);
		assert.deepEqual([...a], [1, 2, 3]);
		assert.deepEqual([...b], [-1, -1, 0]);
		a[0] = 99;
		assert.equal(layer0[0], 1, "original layer0 must not mutate");
	});

	it("handles missing indices", () => {
		const [a, b] = cloneBlockIndices(null);
		assert.equal(a.length, 0);
		assert.equal(b.length, 0);
	});

	it("fills a missing waterlog layer with -1", () => {
		const [a, b] = cloneBlockIndices([new Int32Array([0, 3])]);
		assert.deepEqual([...a], [0, 3]);
		assert.deepEqual([...b], [-1, -1]);
		assert.equal(a.length, b.length);
	});
});

describe("palette.normalizeVec3", () => {
	it("normalizes Int32Array and arrays", () => {
		assert.deepEqual(normalizeVec3(new Int32Array([4, 1, 12])), [4, 1, 12]);
		assert.deepEqual(normalizeVec3([2, 3, 4]), [2, 3, 4]);
		assert.deepEqual(normalizeVec3(null), [0, 0, 0]);
	});
});

describe("palette.mergeMultiplePalettesAndIndices", () => {
	it("merges palettes and remaps indices without sharing arrays", () => {
		const p1 = {
			palette: [{ name: "stone" }, { name: "dirt" }],
			indices: [new Int32Array([0, 1, 0]), new Int32Array([-1, -1, -1])]
		};
		const p2 = {
			palette: [{ name: "dirt" }, { name: "glass" }],
			indices: [new Int32Array([0, 1]), new Int32Array([-1, -1])]
		};
		const { palette, indices } = mergeMultiplePalettesAndIndices([p1, p2]);
		assert.equal(palette.length, 3);
		const names = palette.map(b => b.name).sort();
		assert.deepEqual(names, ["dirt", "glass", "stone"]);
		// dirt in p2 should map to same merged index as dirt in p1
		const dirtI = palette.findIndex(b => b.name === "dirt");
		assert.equal(indices[0][0][1], dirtI);
		assert.equal(indices[1][0][0], dirtI);
		// mutation isolation
		indices[0][0][0] = 999;
		assert.equal(p1.indices[0][0], 0);
	});
});

describe("palette.clone used by tweak path guarantees isolation", () => {
	it("cloneBlockIndices is used so callers can mutate safely", () => {
		// Contract: tweakBlockPalette must call cloneBlockIndices (source inspection)
		const src = readFileSync(join(root, "src/viewer/palette.js"), "utf8");
		assert.match(src, /cloneBlockIndices\s*\(/);
		assert.match(src, /structuredClone/);
		assert.ok(IGNORED_BLOCKS.includes("air"));
	});
});

describe("tweakBlockPalette malformed rows", async () => {
	const { tweakBlockPalette } = await import("../../src/viewer/palette.js");

	it("drops nameless rows, strips bLayers_ and basi_ keys, and ignores a primitive cell", async () => {
		const structure = {
			block_indices: [new Int32Array([0]), new Int32Array([-1])],
			palette: {
				default: {
					block_palette: [
						{ name: "stone", bLayers_block_shape: "x<", basi_block_shape: "old" },
						{ version: 1 },
						{ name: 5, version: 1 }
					],
					block_position_data: {
						"0": "str",
						"nope": { block_entity_data: { id: "Sign" } }
					}
				}
			}
		};
		const { palette } = await tweakBlockPalette(structure);
		assert.equal(palette[0].name, "stone");
		assert.equal(Object.hasOwn(palette[0], "bLayers_block_shape"), false);
		assert.equal(Object.hasOwn(palette[0], "basi_block_shape"), false);
		assert.equal(palette[1], undefined);
		assert.equal(palette[2], undefined);
	});

	it("deletes a block-entity source row only when no cell still uses it", async () => {
		const chest = { name: "chest" };
		const shared = {
			block_indices: [new Int32Array([0, 0]), new Int32Array([-1, -1])],
			palette: {
				default: {
					block_palette: [structuredClone(chest)],
					block_position_data: {
						"0": { block_entity_data: { id: "Chest", x: 0, y: 0, z: 0 } }
					}
				}
			}
		};
		const kept = await tweakBlockPalette(shared);
		assert.equal(kept.indices[0][1], 0);
		assert.equal(kept.palette[0].name, "chest");
		assert.equal(Object.hasOwn(kept.palette[0], "block_entity_data"), false);
		assert.equal(kept.indices[0][0] !== 0, true);
		assert.equal(kept.palette[kept.indices[0][0]].block_entity_data.id, "Chest");

		const only = {
			block_indices: [new Int32Array([0]), new Int32Array([-1])],
			palette: {
				default: {
					block_palette: [structuredClone(chest)],
					block_position_data: {
						"0": { block_entity_data: { id: "Chest", x: 1, y: 0, z: 0 } }
					}
				}
			}
		};
		const dropped = await tweakBlockPalette(only);
		assert.equal(dropped.palette[0], undefined);
		assert.equal(dropped.palette[dropped.indices[0][0]].block_entity_data.id, "Chest");
	});

	it("keeps version on a row newer than the schema constant", async () => {
		const structure = {
			block_indices: [new Int32Array([0, 1]), new Int32Array([-1, -1])],
			palette: {
				default: {
					block_palette: [
						{ name: "minecraft:future_block", states: { a: 1 }, version: 18168866 },
						{ name: "minecraft:stone", states: {}, version: 18168865 }
					],
					block_position_data: {}
				}
			}
		};
		const tweaked = await tweakBlockPalette(structure);
		assert.equal(tweaked.palette[0].newerThanSchemas, undefined);
		assert.equal(tweaked.palette[0].version, 18168866);
		assert.equal(tweaked.palette[1].version, undefined);
		assert.equal(tweaked.palette[0].name, "future_block");
		const merged = mergeMultiplePalettesAndIndices([
			tweaked,
			{
				palette: [
					{ name: "future_block", states: { a: 1 }, version: 18168866 },
					{ name: "future_block", states: { a: 1 } }
				],
				indices: [new Int32Array([0, 1]), new Int32Array([-1, -1])]
			}
		]);
		assert.equal(merged.palette.length, 3);
		assert.equal(merged.palette.some(block => block && Object.hasOwn(block, "bLayers_newer")), false);
		assert.equal(merged.palette.filter(block => block && block.version === 18168866).length, 1);
		assert.equal(merged.palette.filter(block => block && block.name === "future_block" && block.version == null).length, 1);

		const { applyNeighborConnections } = await import("../../src/viewer/fenceConnections.js");
		const linked = applyNeighborConnections(
			[1, 1, 2],
			[{ name: "oak_fence", states: {}, version: 18168866 }],
			[new Int32Array([0, 0]), new Int32Array([-1, -1])],
			null
		);
		assert.ok(linked.linked > 0);
		assert.equal(linked.palette[linked.indices[0][0]].version, 18168866);
		assert.equal(linked.palette[linked.indices[0][0]].bLayers_newer, undefined);
	});

	it("does not flatten a coral fan", async () => {
		const structure = {
			block_indices: [new Int32Array([0]), new Int32Array([-1])],
			palette: {
				default: {
					block_palette: [{
						name: "minecraft:tube_coral_fan",
						states: { coral_fan_direction: 0, direction: 1, vertical_half: "top" },
						version: 18168865
					}],
					block_position_data: {}
				}
			}
		};
		const tweaked = await tweakBlockPalette(structure);
		const fan = tweaked.palette[0];
		assert.equal(fan.name, "tube_coral_fan");
		assert.equal(fan.states.vertical_half, "top");
		assert.equal(fan.states["minecraft:vertical_half"], undefined);
		assert.equal(fan.states.direction, 1);
		assert.equal(fan.version, undefined);
	});
});

// ---- previewCache --------------------------------------------------------
