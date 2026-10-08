import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../..");

describe("entityExtract", async () => {
	const {
		extractPreviewEntities,
		extractRenderableEntities,
		entityMeshKind,
		normalizeEntityId
	} = await import("../../src/viewer/entityExtract.js");

	it("normalizes identifiers and mesh kinds", () => {
		assert.equal(normalizeEntityId("minecraft:hopper_minecart"), "hopper_minecart");
		assert.equal(entityMeshKind("minecraft:minecart"), "minecart");
		assert.equal(entityMeshKind("hopper_minecart"), "hopper_minecart");
		assert.equal(entityMeshKind("chest_minecart"), "chest_minecart");
		assert.equal(entityMeshKind("minecraft:cushion"), "cushion");
		assert.equal(entityMeshKind("tropicalfish"), null);
	});

	it("keeps cushions and reads Variant without snapping them to rails", async () => {
		const { cushionVariantIndex, CUSHION_VARIANT_TEXTURES } = await import(
			"../../src/viewer/entityModels.js"
		);
		const { entityGroupPose, minecartWorldY } = await import(
			"../../src/viewer/entityMeshes.js"
		);
		assert.equal(cushionVariantIndex(0), 0);
		assert.equal(cushionVariantIndex(15), 15);
		assert.equal(cushionVariantIndex(undefined), 15);
		assert.equal(cushionVariantIndex(16), 15);
		assert.equal(CUSHION_VARIANT_TEXTURES[0].endsWith("black_cushion"), true);
		assert.equal(CUSHION_VARIANT_TEXTURES[15].endsWith("white_cushion"), true);

		const data = {
			structure_world_origin: [0, 0, 0],
			structure: {
				entities: [
					{
						identifier: "minecraft:cushion",
						Pos: [1.5, 1.2, 2.5],
						Rotation: [90, 0],
						Variant: 4
					},
					{
						identifier: "minecraft:cushion",
						Pos: [3.5, 1, 2.5],
						Rotation: [0, 0]
					}
				]
			}
		};
		const ents = extractRenderableEntities(data);
		assert.equal(ents.length, 2);
		assert.equal(ents[0].variant, 4);
		assert.equal(ents[1].variant, null);
		const onRail = entityGroupPose(ents[0], "floor", 5);
		assert.equal(onRail.pitchDeg, 0);
		assert.equal(onRail.y, 16 * 1.2);
		assert.notEqual(onRail.y, minecartWorldY(1.2, 0));
		const cart = entityGroupPose(ents[0], "rail", 5);
		assert.notEqual(cart.pitchDeg, 0);
	});

	it("reads Items from hopper_minecart entities", () => {
		const data = {
			structure_world_origin: [0, 0, 0],
			structure: {
				entities: [
					{
						identifier: "minecraft:hopper_minecart",
						Pos: [1.5, 0.35, 2.5],
						Rotation: [0, 0],
						Items: [
							{ Slot: 0, Name: "minecraft:gold_ingot", Count: 5 },
							{ Slot: 4, Name: "minecraft:undyed_shulker_box", Count: 1 }
						]
					}
				]
			}
		};
		const ents = extractPreviewEntities(data);
		assert.equal(ents.length, 1);
		assert.equal(ents[0].items.length, 2);
		assert.equal(ents[0].items[0].name, "gold_ingot");
		assert.equal(ents[0].items[1].name, "undyed_shulker_box");
	});

	it("converts world Pos to structure-local using origin", () => {
		const data = {
			structure_world_origin: new Int32Array([-74, -60, -108]),
			structure: {
				entities: [
					{
						identifier: "minecraft:minecart",
						Pos: { 0: -67.5, 1: -59.65, 2: -102.5 },
						Rotation: { 0: 90, 1: 0 }
					},
					{
						identifier: "minecraft:item",
						Pos: { 0: 0, 1: 0, 2: 0 },
						Rotation: { 0: 0, 1: 0 }
					}
				]
			}
		};
		const all = extractPreviewEntities(data);
		assert.equal(all.length, 2);
		const cart = all[0];
		assert.equal(cart.identifier, "minecart");
		assert.ok(Math.abs(cart.pos[0] - 6.5) < 0.01);
		assert.ok(Math.abs(cart.pos[1] - 0.35) < 0.01);
		assert.ok(Math.abs(cart.pos[2] - 5.5) < 0.01);
		assert.equal(cart.yawDeg, 90);

		const renderable = extractRenderableEntities(data);
		assert.equal(renderable.length, 1);
		assert.equal(renderable[0].identifier, "minecart");
	});

	it("skips world-position carts that fall outside a zero-origin structure", () => {
		const data = {
			size: [64, 384, 64],
			structure_world_origin: [0, 0, 0],
			structure: {
				entities: [
					{
						identifier: "minecraft:minecart",
						Pos: [-58.21, -6.65, -54.5],
						Rotation: [0, 0]
					},
					{
						identifier: "minecraft:minecart",
						Pos: [4.79, 75.35, 5.5],
						Rotation: [0, 0]
					}
				]
			}
		};
		const all = extractPreviewEntities(data);
		assert.equal(all.length, 2);
		const drawn = extractRenderableEntities(data);
		assert.equal(drawn.length, 1);
		assert.ok(Math.abs(drawn[0].pos[0] - 4.79) < 0.01);
		assert.ok(Math.abs(drawn[0].pos[1] - 75.35) < 0.01);
	});

	it("reads Float32Array Pos from nbtify-style entities", () => {
		const data = {
			structure_world_origin: new Int32Array([0, 0, 0]),
			structure: {
				entities: [
					{
						identifier: "minecraft:hopper_minecart",
						Pos: new Float32Array([1.5, 0.5, 2.5]),
						Rotation: new Float32Array([45, 0])
					}
				]
			}
		};
		const [ent] = extractRenderableEntities(data);
		assert.ok(ent);
		assert.equal(ent.identifier, "hopper_minecart");
		assert.deepEqual(ent.pos.map(n => +n.toFixed(2)), [1.5, 0.5, 2.5]);
		assert.equal(ent.yawDeg, 45);
	});

	it("finds all subtypes on NSEW + sloped rails in minecarts.mcstructure", async (t) => {
		let NBT;
		try {
			NBT = await import("nbtify-readonly-typeless");
		} catch {
			t.skip("nbtify not available");
			return;
		}
		const p = join(root, "tests/sampleStructures/minecarts.mcstructure");
		if (!existsSync(p)) {
			t.skip("minecarts.mcstructure not generated");
			return;
		}
		const buf = readFileSync(p);
		const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
		const data = (await NBT.read(ab, { endian: "little", strict: false })).data;
		const carts = extractRenderableEntities(data);
		const byKind = {};
		for (const c of carts) {
			byKind[c.identifier] = (byKind[c.identifier] || 0) + 1;
		}
		for (const kind of [
			"minecart",
			"chest_minecart",
			"hopper_minecart",
			"tnt_minecart",
			"command_block_minecart"
		]) {
			assert.ok((byKind[kind] || 0) >= 2, `need ≥2 ${kind}, got ${byKind[kind] || 0}`);
		}
		const yaws = new Set(carts.map(c => ((c.yawDeg % 360) + 360) % 360));
		assert.ok(yaws.has(0), "south yaw 0");
		assert.ok(yaws.has(90), "west yaw 90");
		assert.ok(yaws.has(180), "north yaw 180");
		assert.ok(yaws.has(270), "east yaw -90 → 270");

		const pal = data.structure.palette.default.block_palette;
		const dirs = new Set();
		for (const b of pal) {
			const n = String(b.name || "").replace(/^minecraft:/, "");
			if (!n.includes("rail")) continue;
			const d = b.states?.rail_direction;
			if (d != null) dirs.add(Number(d));
		}
		for (let d = 0; d <= 5; d++) {
			assert.ok(dirs.has(d), `missing rail_direction ${d}`);
		}

		const hopper = carts.find(c => c.identifier === "hopper_minecart" && (c.items?.length || 0) > 0);
		assert.ok(hopper, "hopper minecart should carry items for inspect");
	});

	it("finds minecarts in rails.mcstructure sample", async (t) => {
		let NBT;
		try {
			NBT = await import("nbtify-readonly-typeless");
		} catch {
			t.skip("nbtify not available");
			return;
		}
		const buf = readFileSync(join(root, "tests/sampleStructures/rails.mcstructure"));
		const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
		const data = (await NBT.read(ab, { endian: "little", strict: false })).data;
		const carts = extractRenderableEntities(data);
		assert.ok(carts.length >= 1, "expected minecarts in rails sample");
		assert.ok(carts.every(c => c.identifier === "minecart"));
		const size = [...data.size];
		for (const c of carts) {
			assert.ok(c.pos[0] > -1 && c.pos[0] < size[0] + 1);
			assert.ok(c.pos[2] > -1 && c.pos[2] < size[2] + 1);
		}
	});
});
