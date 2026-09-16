import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatInspectLocation } from "../../src/viewer/inspectPos.js";
import { skipHologramScale } from "../../src/BlockGeoMaker.js";

describe("formatInspectLocation", () => {
	it("shows structure pos and bed half", () => {
		assert.equal(
			formatInspectLocation({
				kind: "block",
				structurePos: [7, 1, 2],
				block: {
					name: "straw_bed",
					states: { "minecraft:cardinal_direction": "north", head_piece_bit: 1 }
				}
			}),
			"7, 1, 2 · north · head"
		);
	});
});

describe("skipHologramScale", () => {
	it("skips straw_bed and double-chest shapes when SCALE !== 1", () => {
		assert.equal(skipHologramScale("straw_bed"), true);
		assert.equal(skipHologramScale("chest_large<textures/entity/chest/double_normal>"), true);
		assert.equal(skipHologramScale("chest_double_skip"), true);
		assert.equal(skipHologramScale("block"), false);
		assert.equal(skipHologramScale("shelf_mushroom"), false);
	});
});
