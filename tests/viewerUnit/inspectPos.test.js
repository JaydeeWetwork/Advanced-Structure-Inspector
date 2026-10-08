import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	formatInspectLocation,
	inspectAnchorInPreview,
	shouldCloseInspectAfterFly
} from "../../src/viewer/inspectPos.js";
import { skipHologramScale, skipSeamScale } from "../../src/viewer/engine/BlockGeoMaker.js";

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

	it("anchors a block at the preview cell center", () => {
		assert.deepEqual(
			inspectAnchorInPreview({ kind: "block", structurePos: [0, 0, 0] }),
			{ x: -8, y: 8, z: -8 }
		);
		assert.deepEqual(
			inspectAnchorInPreview({ kind: "block", structurePos: [1, 2, 3] }),
			{ x: -24, y: 40, z: -56 }
		);
	});
});

describe("shouldCloseInspectAfterFly", () => {
	const anchor = { x: 0, y: 0, z: 0 };

	it("closes a near inventory once the camera passes 8 blocks", () => {
		assert.equal(shouldCloseInspectAfterFly({ x: 32, y: 0, z: 0 }, anchor, 32), false);
		assert.equal(shouldCloseInspectAfterFly({ x: 128, y: 0, z: 0 }, anchor, 32), false);
		assert.equal(shouldCloseInspectAfterFly({ x: 128.01, y: 0, z: 0 }, anchor, 32), true);
	});

	it("keeps a far-opened inventory until the camera flies 8 more blocks out", () => {
		const openDistance = 20 * 16;
		assert.equal(shouldCloseInspectAfterFly({ x: openDistance, y: 0, z: 0 }, anchor, openDistance), false);
		assert.equal(
			shouldCloseInspectAfterFly({ x: openDistance + 8 * 16, y: 0, z: 0 }, anchor, openDistance),
			false
		);
		assert.equal(
			shouldCloseInspectAfterFly({ x: openDistance + 8 * 16 + 0.1, y: 0, z: 0 }, anchor, openDistance),
			true
		);
		assert.equal(shouldCloseInspectAfterFly({ x: 16, y: 0, z: 0 }, anchor, openDistance), false);
	});
});

describe("skipSeamScale", () => {
	it("skips straw_bed and double-chest shapes when SCALE !== 1", () => {
		assert.equal(skipSeamScale, skipHologramScale);
		assert.equal(skipSeamScale("straw_bed"), true);
		assert.equal(skipSeamScale("chest_large<textures/entity/chest/double_normal>"), true);
		assert.equal(skipSeamScale("chest_double_skip"), true);
		assert.equal(skipSeamScale("block"), false);
		assert.equal(skipSeamScale("shelf_mushroom"), false);
	});
});
