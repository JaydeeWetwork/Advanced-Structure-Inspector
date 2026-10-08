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

describe("countStructureEntities", () => {
	it("counts array entities", () => {
		assert.equal(countStructureEntities({ structure: { entities: [{}, {}, {}] } }), 3);
		assert.equal(countStructureEntities({ structure: { entities: [] } }), 0);
		assert.equal(countStructureEntities({}), 0);
	});

	it("counts NBT list wrapper { value: [...] }", () => {
		assert.equal(
			countStructureEntities({ structure: { entities: { value: [{ id: "minecart" }] } } }),
			1
		);
	});
});

// ---- catalog (in-memory, persist off) ------------------------------------

describe("scanStructureBlocks", async () => {
	const { scanStructureBlocks } = await import("../../src/viewer/systems/BlockGeoSystem.js");
	const { csrCount, csrTriples, csrTotal } = await import("../../src/viewer/cellCsr.js");

	it("collects positions and skips lights when collectLights is false", () => {
		const size = [2, 1, 1];
		const indices = [new Int32Array([0, 0]), new Int32Array([-1, -1])];
		const palette = [{ name: "stone" }, { name: "air" }];
		const templates = [[{}], null];
		const { blockPositions, pointLights } = scanStructureBlocks({
			structureSize: size,
			blockIndices: indices,
			blockFaceTemplates: templates,
			blockPalette: palette,
			collectLights: false,
			pointLightDefs: { torch: 0xffaa00 }
		});
		assert.equal(csrCount(blockPositions, 0), 2);
		assert.equal(pointLights.length, 0);
	});

	it("collects point lights when enabled", () => {
		const size = [1, 1, 1];
		const indices = [new Int32Array([0]), new Int32Array([-1])];
		const palette = [{ name: "torch" }];
		const templates = [[{}]];
		const { pointLights } = scanStructureBlocks({
			structureSize: size,
			blockIndices: indices,
			blockFaceTemplates: templates,
			blockPalette: palette,
			collectLights: true,
			pointLightDefs: { torch: 0xffaa00 },
			defaultLightIntensity: 50
		});
		assert.equal(pointLights.length, 1);
		assert.equal(pointLights[0].intensity, 50);
		assert.equal(pointLights[0].col, 0xffaa00);
	});

	it("keeps layer-1 water off the solid mesh list", () => {
		const size = [1, 1, 1];
		const indices = [new Int32Array([0]), new Int32Array([1])];
		const palette = [
			{ name: "oak_stairs", bLayers_block_shape: "stairs" },
			{ name: "water", bLayers_block_shape: "liquid" }
		];
		const templates = [[{}], [{}]];
		const { blockPositions, waterlogPositions } = scanStructureBlocks({
			structureSize: size,
			blockIndices: indices,
			blockFaceTemplates: templates,
			blockPalette: palette
		});
		assert.deepEqual(csrTriples(blockPositions, 0), [[0, 0, 0]]);
		assert.equal(csrCount(blockPositions, 1), 0);
		assert.deepEqual(csrTriples(waterlogPositions, 1), [[0, 0, 0]]);
	});

	it("fills one palette in y-major order", () => {
		const size = [1, 2, 1];
		const indices = [new Int32Array([0, 0]), new Int32Array([-1, -1])];
		const { blockPositions } = scanStructureBlocks({
			structureSize: size,
			blockIndices: indices,
			blockFaceTemplates: [[{}]],
			blockPalette: [{ name: "stone" }]
		});
		assert.deepEqual(csrTriples(blockPositions, 0), [[0, 0, 0], [0, 1, 0]]);
	});

	it("matches a per-index cell count on a waterlog sample", async () => {
		const { readMcstructure } = await import("../../src/viewer/core/nbt/mcstructureCodec.js");
		const buf = readFileSync(join(root, "tests/sampleStructures/format_v2_two_layer_water_plants.mcstructure"));
		const { nbt } = await readMcstructure(buf);
		const pal = nbt.structure.palette.default.block_palette;
		const indices = nbt.structure.block_indices;
		const { blockPositions, waterlogPositions } = scanStructureBlocks({
			structureSize: [...nbt.size],
			blockIndices: indices,
			blockFaceTemplates: pal.map(() => [{}]),
			blockPalette: pal
		});
		let cells = 0;
		for (const layer of indices) {
			if (!layer) continue;
			for (let i = 0; i < layer.length; i++) {
				const paletteI = layer[i];
				if (paletteI >= 0 && paletteI < pal.length) cells++;
			}
		}
		assert.equal(csrTotal(blockPositions) + csrTotal(waterlogPositions), cells);
		assert.ok(csrTotal(waterlogPositions) > 0);
	});
});

describe("materialList grouping", async () => {
	const {
		blockToMaterial,
		buildMaterialListFromNbt,
		formatMaterialLabel,
		getStackSize,
		partitionCount,
		formatPartition
	} = await import("../../src/viewer/materialList.js");

	it("groups powered/unpowered repeater and comparator", () => {
		assert.equal(blockToMaterial("unpowered_repeater")?.material, "repeater");
		assert.equal(blockToMaterial("powered_repeater")?.material, "repeater");
		assert.equal(blockToMaterial("unpowered_comparator")?.material, "comparator");
		assert.equal(blockToMaterial("powered_comparator")?.material, "comparator");
	});

	it("groups lit/unlit redstone torch", () => {
		assert.equal(blockToMaterial("unlit_redstone_torch")?.material, "redstone_torch");
		assert.equal(blockToMaterial("lit_redstone_torch")?.material, "redstone_torch");
		assert.equal(blockToMaterial("redstone_torch")?.material, "redstone_torch");
	});

	it("groups lit furnaces and redstone ore", () => {
		assert.equal(blockToMaterial("lit_furnace")?.material, "furnace");
		assert.equal(blockToMaterial("lit_redstone_ore")?.material, "redstone_ore");
	});

	it("uses the pack mapping table for ignores, doors, slabs, and tall plants", () => {
		assert.equal(blockToMaterial("air"), null);
		assert.equal(blockToMaterial("piston_arm_collision"), null);
		assert.equal(blockToMaterial("light_block_15"), null);
		assert.equal(blockToMaterial("daylight_detector_inverted")?.material, "daylight_detector");
		assert.equal(blockToMaterial("oak_door")?.mult, 0.5);
		assert.equal(blockToMaterial("oak_door")?.material, "oak_door");
		assert.deepEqual(blockToMaterial("double_oak_slab"), { material: "oak_slab", mult: 2 });
		assert.equal(blockToMaterial("peony")?.mult, 0.5);
		assert.equal(blockToMaterial("rose_bush")?.mult, 0.5);
		assert.equal(blockToMaterial("sunflower")?.mult, 0.5);
		assert.equal(blockToMaterial("bed")?.mult, 0.5);
		assert.equal(blockToMaterial("bed", { name: "bed", block_entity_data: { color: 14 } })?.material, "bed+14");
		assert.equal(blockToMaterial("bed", { name: "bed", block_entity_data: { color: 14 } })?.mult, 0.5);
		assert.equal(blockToMaterial("spruce_wall_sign")?.material, "spruce_sign");
	});

	it("counts only source water, not flowing or waterlogged layer", async () => {
		const { isCountableLiquid, blockToMaterial, buildMaterialListFromNbt } =
			await import("../../src/viewer/materialList.js");
		assert.equal(isCountableLiquid("flowing_water", { name: "flowing_water" }, 0), false);
		assert.equal(isCountableLiquid("water", { states: { liquid_depth: 0 } }, 0), true);
		assert.equal(isCountableLiquid("water", { states: { liquid_depth: 7 } }, 0), false);
		assert.equal(isCountableLiquid("water", { states: { liquid_depth: 0 } }, 1), false);
		assert.equal(blockToMaterial("water", { states: { liquid_depth: 3 } }, 0), null);
		assert.equal(blockToMaterial("water", { states: { liquid_depth: 0 } }, 0)?.material, "water_bucket");

		const data = {
			structure: {
				palette: {
					default: {
						block_palette: [
							{ name: "minecraft:water", states: { liquid_depth: 0 } },
							{ name: "minecraft:water", states: { liquid_depth: 5 } },
							{ name: "minecraft:flowing_water", states: {} },
							{ name: "minecraft:stone", states: {} }
						]
					}
				},
				block_indices: [
					// layer0: source, flowing-level, flowing id, stone
					new Int32Array([0, 1, 2, 3]),
					// layer1 waterlog-style source — must NOT count
					new Int32Array([0, -1, -1, -1])
				]
			}
		};
		const list = buildMaterialListFromNbt(data);
		const water = list.find(r => r.id === "water_bucket");
		const stone = list.find(r => r.id === "stone");
		assert.equal(water?.count, 1, "only one source water");
		assert.equal(stone?.count, 1);
	});

	it("uses correct max stack sizes", () => {
		assert.equal(getStackSize("stone"), 64);
		assert.equal(getStackSize("ender_pearl"), 16);
		assert.equal(getStackSize("oak_sign"), 16);
		assert.equal(getStackSize("diamond_sword"), 1);
		assert.equal(getStackSize("water_bucket"), 1);
		assert.equal(getStackSize("bucket"), 16);
		assert.equal(getStackSize("minecart"), 1);
		assert.equal(getStackSize("white_bed"), 1);
		assert.equal(getStackSize("bed+14"), 1);
	});

	it("partitions 64-stack into shulkers + stacks + loose", () => {
		// 1728 = 1 full shulker of 64s
		assert.deepEqual(partitionCount(1728, 64), {
			stackSize: 64, shulkers: 1, stacks: 0, loose: 0, total: 1728
		});
		// 100 = 1 stack + 36
		assert.deepEqual(partitionCount(100, 64), {
			stackSize: 64, shulkers: 0, stacks: 1, loose: 36, total: 100
		});
		// 27*64 + 5 = 1 shulker + 5 loose
		assert.deepEqual(partitionCount(27 * 64 + 5, 64), {
			stackSize: 64, shulkers: 1, stacks: 0, loose: 5, total: 27 * 64 + 5
		});
		// 28*64 = 1 shulker + 1 stack
		assert.deepEqual(partitionCount(28 * 64, 64), {
			stackSize: 64, shulkers: 1, stacks: 1, loose: 0, total: 28 * 64
		});
	});

	it("partitions 16-stack and unstackable for shulkers", () => {
		// 27 * 16 = 1 shulker of ender pearls
		assert.deepEqual(partitionCount(27 * 16, 16), {
			stackSize: 16, shulkers: 1, stacks: 0, loose: 0, total: 432
		});
		// 30 pearls = 1 stack + 14
		assert.deepEqual(partitionCount(30, 16), {
			stackSize: 16, shulkers: 0, stacks: 1, loose: 14, total: 30
		});
		// 30 swords = 1 shulker + 3 loose (stack size 1)
		assert.deepEqual(partitionCount(30, 1), {
			stackSize: 1, shulkers: 1, stacks: 0, loose: 3, total: 30
		});
	});

	it("formats partitions", () => {
		assert.equal(formatPartition(partitionCount(36, 64)), "36");
		assert.equal(formatPartition(partitionCount(100, 64)), "1 stack + 36");
		assert.equal(formatPartition(partitionCount(1728, 64)), "1 shulker");
		assert.equal(formatPartition(partitionCount(28 * 64 + 3, 64)), "1 shulker + 1 stack + 3");
	});

	it("builds descending counts from fake NBT with partitions", () => {
		const data = {
			structure: {
				palette: {
					default: {
						block_palette: [
							{ name: "minecraft:stone" },
							{ name: "minecraft:powered_repeater" },
							{ name: "minecraft:unpowered_repeater" },
							{ name: "minecraft:air" }
						]
					}
				},
				block_indices: [
					// stone x1, powered x2, unpowered x3  → stone:1, repeater:5
					new Int32Array([0, 1, 1, 2, 2, 2, -1])
				]
			}
		};
		const list = buildMaterialListFromNbt(data);
		assert.deepEqual(
			list.map(r => [r.id, r.count]),
			[
				["repeater", 5],
				["stone", 1]
			]
		);
		assert.ok(list[0].count >= list[1].count);
		assert.equal(list[0].stackSize, 64);
		assert.equal(list[0].partition, "5");
		assert.equal(formatMaterialLabel("redstone_torch"), "Redstone Torch");
	});
});

describe("block upgrade apply (flatten + forgot-to-bump)", async () => {
	const {
		applyBlockUpdateSchema,
		applyFlattenedProperty,
		packedSchemaVersion,
		schemaCdnPath,
		schemaSkeletonsToApply
	} = await import("../../src/viewer/blockUpgradeApply.js");

	it("flattens concrete color into a new id", () => {
		const schema = {
			maxVersionMajor: 1,
			maxVersionMinor: 20,
			maxVersionPatch: 0,
			maxVersionRevision: 33,
			flattenedProperties: {
				"minecraft:concrete": {
					prefix: "minecraft:",
					flattenedProperty: "color",
					suffix: "_concrete"
				}
			}
		};
		const block = {
			name: "minecraft:concrete",
			states: { color: "black" },
			version: 1
		};
		assert.equal(applyBlockUpdateSchema(schema, block), true);
		assert.equal(block.name, "minecraft:black_concrete");
		assert.equal(block.states.color, undefined);
		assert.equal(block.version, packedSchemaVersion(schema));
	});

	it("applyFlattenedProperty is a no-op without the state", () => {
		const block = { name: "minecraft:concrete", states: {} };
		assert.equal(
			applyFlattenedProperty(
				{ prefix: "minecraft:", flattenedProperty: "color", suffix: "_concrete" },
				block
			),
			false
		);
		assert.equal(block.name, "minecraft:concrete");
	});

	it("applies every schema when several share the same packed version", () => {
		const packed = packedSchemaVersion({
			maxVersionMajor: 1,
			maxVersionMinor: 21,
			maxVersionPatch: 60,
			maxVersionRevision: 33
		});
		assert.equal(packed, 18168865);
		const both = schemaSkeletonsToApply(
			{ [packed]: [{ filename: "0321.json" }, { filename: "0331.json" }] },
			packed
		);
		assert.deepEqual(both.map(skeleton => skeleton.filename), ["0321.json", "0331.json"]);
		const single = schemaSkeletonsToApply(
			{ [packed]: [{ filename: "only.json" }] },
			packed
		);
		assert.deepEqual(single, []);
	});

	it("leaves a constructor block name unchanged", () => {
		const block = { name: "constructor", states: {}, version: 1 };
		applyBlockUpdateSchema({ renamedIds: {}, flattenedProperties: {} }, block);
		assert.equal(block.name, "constructor");
	});

	it("runs the 1.26.30 and 1.26.50 schemas in the 1.21.60.33 bucket", () => {
		const list = JSON.parse(readFileSync(join(root, "src/data/blockUpgradeSchemaList.json"), "utf8"));
		const packed = 18168865;
		const bucket = list.filter(schema => packedSchemaVersion(schema) === packed);
		const names = bucket.map(schema => schema.filename);
		assert.ok(names.includes("0341_1.26.20_to_1.26.30.json"));
		assert.ok(names.includes("0351_1.26.40_to_1.26.50.json"));
		const selected = schemaSkeletonsToApply({ [packed]: bucket }, packed);
		assert.ok(selected.some(skeleton => skeleton.filename === "0341_1.26.20_to_1.26.30.json"));
		assert.ok(selected.some(skeleton => skeleton.filename === "0351_1.26.40_to_1.26.50.json"));
		const rootSchema = selected.find(schema => schema.filename.startsWith("0351_"));
		assert.equal(schemaCdnPath(rootSchema), "0351_1.26.40_to_1.26.50.json");
		assert.equal(
			schemaCdnPath({ filename: "0341_1.26.20_to_1.26.30.json" }),
			"nbt_upgrade_schema/0341_1.26.20_to_1.26.30.json"
		);
	});
});

describe("item upgrade schemas", async () => {
	const { applyItemUpgradeSchemas, upgradeItemStack } = await import(
		"../../src/viewer/itemUpgrade.js"
	);

	it("renames ids then remaps meta", () => {
		const schemas = [
			{ renamedIds: { "minecraft:nametag": "minecraft:name_tag" } },
			{
				remappedMetas: {
					"minecraft:dye": { "15": "minecraft:bone_meal" }
				}
			}
		];
		assert.equal(applyItemUpgradeSchemas("nametag", null, schemas).name, "name_tag");
		assert.equal(applyItemUpgradeSchemas("minecraft:dye", 15, schemas).name, "bone_meal");
		const stack = upgradeItemStack({ name: "dye", count: 8, slot: 0, damage: 15, raw: {} }, schemas);
		assert.equal(stack.name, "bone_meal");
		assert.equal(stack.count, 8);
	});
});
