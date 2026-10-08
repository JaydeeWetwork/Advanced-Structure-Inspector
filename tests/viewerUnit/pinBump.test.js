import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { schemaCdnPath } from "../../src/viewer/blockUpgradeApply.js";
import {
	formatBlockSchemaList,
	formatItemSchemaList,
	numberedSchemaPaths,
	replaceLatestVersion,
	setPackPin
} from "../../scripts/bump-pins.mjs";
import { findPackPin } from "../../scripts/pinScriptUtil.mjs";
import {
	classifyCarriedTextures,
	fancyOpaqueBlockNames,
	mergeFancyEigenvariants,
	replaceCarriedList
} from "../../scripts/index-fancy-opaque.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

describe("fancy versus opaque pin", () => {
	const terrain = {
		oak_leaves: { textures: ["textures/blocks/leaves_oak", "textures/blocks/leaves_oak_opaque"] },
		orange_poplar_leaves: { textures: ["textures/blocks/orange_poplar_leaves", "textures/blocks/orange_poplar_leaves_opaque"] },
		cherry_leaves: { textures: ["textures/blocks/cherry_leaves", "textures/blocks/cherry_leaves_opaque"] },
		opaque_first: { textures: ["textures/blocks/leaf_opaque", "textures/blocks/leaf"] },
		oak_leaves_carried: { textures: ["textures/blocks/leaves_oak_carried", "textures/blocks/leaves_oak_carried"] },
		bush_carried: { textures: "textures/items/bush" },
		bamboo_carried: { textures: "textures/items/bamboo" },
		candle_carried: { textures: "textures/items/candles/candle" },
		jungle_leaves_carried: { textures: "textures/blocks/leaves_jungle_carried" },
		tallgrass_carried: { textures: ["textures/blocks/tallgrass_carried", "textures/blocks/fern_carried"] }
	};
	const blocks = {
		oak_leaves: { textures: "oak_leaves", carried_textures: "oak_leaves_carried" },
		orange_poplar_leaves: { textures: "orange_poplar_leaves" },
		cherry_leaves: { textures: "cherry_leaves" },
		opaque_first: { textures: "opaque_first" },
		bush: { textures: "bush", carried_textures: "bush_carried" },
		bamboo_sapling: { textures: "bamboo_sapling", carried_textures: "bamboo_carried" },
		candle: { textures: "candle", carried_textures: "candle_carried" },
		jungle_leaves: { textures: "jungle_leaves", carried_textures: "jungle_leaves_carried" },
		tallgrass: { textures: "tallgrass", carried_textures: "tallgrass_carried" },
		rose_bush: { textures: { up: "rose_top", down: "rose_bottom" }, carried_textures: "rose_bush_carried" }
	};
	const shapes = {
		bush: "cross_texture",
		bamboo_sapling: "cross_texture",
		candle: "candles",
		oak_leaves: "block",
		tallgrass: "block",
		jungle_leaves: "block"
	};

	it("pins fancy index 0 and leaves opaque-first sheets alone", () => {
		assert.deepEqual(fancyOpaqueBlockNames(blocks, terrain), [
			"cherry_leaves",
			"oak_leaves",
			"orange_poplar_leaves"
		]);
		assert.equal(fancyOpaqueBlockNames(blocks, terrain).includes("opaque_first"), false);
	});

	it("keeps carried cutouts and skips tints, face maps, and shared item icons", () => {
		const { names, tintSkipped } = classifyCarriedTextures(
			blocks,
			terrain,
			["jungle_leaves"],
			name => shapes[name] ?? "block"
		);
		assert.deepEqual(names, ["bush", "oak_leaves", "tallgrass"]);
		assert.deepEqual(tintSkipped, ["jungle_leaves"]);
		assert.equal(names.includes("cherry_leaves"), false);
		assert.equal(names.includes("candle"), false);
		assert.equal(names.includes("bamboo_sapling"), false);
	});

	it("adds missing fancy eigenvariants and keeps a non-zero hand value", () => {
		const source = [
			"{",
			'\t"oak_door": 0,',
			'\t"oak_leaves": 0,',
			'\t"pumpkin": 2,',
			'\t"$schema": "schemas/blockEigenvariants.schema.json"',
			"}",
			""
		].join("\n");
		const merged = mergeFancyEigenvariants(source, ["oak_leaves", "orange_poplar_leaves", "pumpkin"]);
		assert.deepEqual(merged.keptHand, ["pumpkin"]);
		assert.equal(merged.text.includes('\t"oak_door": 0,'), true);
		assert.equal(merged.text.includes('\t"pumpkin": 2,'), true);
		assert.equal(merged.text.split('"oak_leaves"').length, 2);
		assert.match(merged.text, /BEGIN pin fancy\/opaque[\s\S]*"orange_poplar_leaves": 0/);
		const again = mergeFancyEigenvariants(merged.text, ["oak_leaves", "orange_poplar_leaves", "pumpkin"]);
		assert.equal(again.text, merged.text);
	});

	it("replaces only the carried array", () => {
		const source = '{\r\n\t"blocks_to_use_carried_textures": ["oak_leaves"],\r\n\t"transparent_blocks": {}\r\n}\r\n';
		const next = replaceCarriedList(source, ["oak_leaves", "tallgrass"]);
		assert.match(next, /\["oak_leaves", "tallgrass"\]/);
		assert.match(next, /transparent_blocks/);
	});
});

describe("pin bump writers", () => {
	it("keeps schema pins in the second pin file and re-exports them", async () => {
		const pins = await import("../../src/data/packPins.js");
		const schema = await import("../../src/data/schemaPins.js");
		assert.equal(pins.VANILLA_SAMPLES_TAG, "v1.26.50.4");
		assert.equal(pins.BLOCK_UPGRADE_TAG, schema.BLOCK_UPGRADE_TAG);
		assert.equal(pins.ITEM_UPGRADE_TAG, schema.ITEM_UPGRADE_TAG);
		assert.equal(schema.BLOCK_UPGRADE_TAG, "5.3.0");
		assert.equal(schema.ITEM_UPGRADE_TAG, "1.18.0");
		const render = readFileSync(join(root, "src/data/packPins.js"), "utf8");
		const schemaText = readFileSync(join(root, "src/data/schemaPins.js"), "utf8");
		assert.doesNotMatch(render, /export const BLOCK_UPGRADE_TAG/);
		assert.doesNotMatch(render, /export const ITEM_UPGRADE_TAG/);
		assert.match(schemaText, /export const BLOCK_UPGRADE_TAG = "5\.3\.0"/);
		assert.match(render, /from "\.\/schemaPins\.js"/);
	});

	it("finds one pin definition and rejects a second copy", () => {
		const files = [
			{ rel: "src/data/packPins.js", text: 'export const VANILLA_SAMPLES_TAG = "v1.2.3";\n' },
			{ rel: "src/data/schemaPins.js", text: 'export const BLOCK_UPGRADE_TAG = "5.3.0";\n' }
		];
		assert.deepEqual(findPackPin("BLOCK_UPGRADE_TAG", files), {
			rel: "src/data/schemaPins.js",
			value: "5.3.0"
		});
		assert.throws(
			() => findPackPin("VANILLA_SAMPLES_TAG", [
				...files,
				{ rel: "src/data/schemaPins.js", text: 'export const VANILLA_SAMPLES_TAG = "v9";\n' }
			]),
			/defined in/
		);
		assert.throws(
			() => findPackPin("BLOCK_UPGRADE_TAG", [
				{ rel: "src/data/schemaPins.js", text: 'export const BLOCK_UPGRADE_TAG = "1";\nexport const BLOCK_UPGRADE_TAG = "2";\n' }
			]),
			/more than once/
		);
	});

	it("writes every pin file even when the first one changes", () => {
		const src = readFileSync(join(root, "scripts/bump-pins.mjs"), "utf8");
		const body = src.slice(src.indexOf("export async function bumpPins"));
		assert.equal(body.includes("|| writeIfChanged"), false);
		assert.match(body, /for \(const file of files\)/);
	});

	it("sets a pack pin without touching the other constants", () => {
		const source = 'export const VANILLA_SAMPLES_TAG = "v1.0.0";\r\nexport const BLOCK_UPGRADE_TAG = "1.0.0";\r\n';
		const next = setPackPin(source, "VANILLA_SAMPLES_TAG", "v1.2.3");
		assert.match(next, /VANILLA_SAMPLES_TAG = "v1.2.3"/);
		assert.match(next, /BLOCK_UPGRADE_TAG = "1.0.0"/);
	});

	it("keeps a root schema path and omits the folder prefix", () => {
		const paths = numberedSchemaPaths([
			{ type: "blob", path: "nbt_upgrade_schema/0001_a.json" },
			{ type: "blob", path: "0351_b.json" },
			{ type: "blob", path: "nbt_upgrade_schema/0351_b.json" },
			{ type: "blob", path: "docs/0002_c.json" },
			{ type: "blob", path: "nbt_upgrade_schema_schema.json" }
		], "nbt_upgrade_schema");
		assert.deepEqual(paths, ["nbt_upgrade_schema/0001_a.json", "nbt_upgrade_schema/0351_b.json"]);
		const text = formatBlockSchemaList([
			{
				filename: "0351_b.json",
				path: "0351_b.json",
				maxVersionMajor: 1,
				maxVersionMinor: 21,
				maxVersionPatch: 60,
				maxVersionRevision: 33
			}
		]);
		assert.match(text, /"path":"0351_b.json"/);
		assert.equal(text.includes("nbt_upgrade_schema/0351"), false);
	});

	it("leaves LATEST_VERSION when the packed field is unchanged", () => {
		const source = readFileSync(join(root, "src/viewer/engine/BlockUpdater.js"), "utf8");
		const same = replaceLatestVersion(source, 18168865);
		assert.equal(same.changed, false);
		assert.equal(same.text, source);
		const bumped = replaceLatestVersion(source, 18168866);
		assert.equal(bumped.changed, true);
		assert.match(bumped.text, /static LATEST_VERSION = 18168866;/);
		assert.equal(bumped.text.includes("static LATEST_VERSION = 18168865;"), false);
	});

	it("writes item schemas as filename rows and keeps a root path", () => {
		const text = formatItemSchemaList([
			{ filename: "0001_a.json" },
			{ filename: "0002_b.json", path: "0002_b.json" }
		], "\n");
		assert.match(text, /\{"filename":"0001_a.json"\}/);
		assert.match(text, /\{"filename":"0002_b.json","path":"0002_b.json"\}/);
		assert.equal(text.includes("id_meta_upgrade_schema/"), false);
		assert.equal(
			schemaCdnPath({ filename: "0001_a.json" }, "id_meta_upgrade_schema"),
			"id_meta_upgrade_schema/0001_a.json"
		);
		assert.equal(
			schemaCdnPath({ filename: "0002_b.json", path: "0002_b.json" }, "id_meta_upgrade_schema"),
			"0002_b.json"
		);
	});

	it("plans every pin fetch before writing", () => {
		const src = readFileSync(join(root, "scripts/bump-pins.mjs"), "utf8");
		const body = src.slice(src.indexOf("export async function bumpPins"));
		const gather = body.indexOf("Promise.all");
		const write = body.indexOf("writeIfChanged");
		const coverage = body.indexOf("checkBlockShapeCoverage");
		assert.ok(gather > 0 && write > gather);
		assert.ok(coverage > write);
		assert.equal(body.includes("writeFileSync"), false);
		assert.equal(body.includes("writeVanillaTgaList"), false);
		assert.equal(body.includes("writeFancyOpaqueFromPin"), false);
	});
});
