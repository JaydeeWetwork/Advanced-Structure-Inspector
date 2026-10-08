import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { applyUnrevisedBlockStates } from "../../src/viewer/blockUpgradeApply.js";
import {
	cardinalFromLegacy,
	rotationLookup
} from "../../src/viewer/legacyStateAlias.js";

describe("legacy state alias", () => {
	it("maps the commented compass values", () => {
		assert.equal(cardinalFromLegacy("weirdo_direction", 0), "east");
		assert.equal(cardinalFromLegacy("weirdo_direction", 3), "north");
		assert.equal(cardinalFromLegacy("direction", 0), "south");
		assert.equal(cardinalFromLegacy("direction", 3), "east");
		assert.equal(cardinalFromLegacy("direction", 9), undefined);
	});

	it("uses cardinal only when this shape asks for it and the old key is not already specific", () => {
		const repeaterBlock = { name: "unpowered_repeater", states: { direction: 0 } };
		const repeater = rotationLookup(
			repeaterBlock,
			{ "minecraft:cardinal_direction": { south: [0, 0, 0] } },
			"direction",
			0
		);
		assert.equal(repeater.name, "minecraft:cardinal_direction");
		assert.equal(repeater.value, "south");
		assert.equal(repeaterBlock.states.direction, 0);

		const doorBlock = { name: "oak_door", states: { direction: 0 } };
		const door = rotationLookup(
			doorBlock,
			{ direction: { 0: [0, 180, 0] }, "minecraft:cardinal_direction": { east: [0, 180, 0] } },
			"direction",
			0
		);
		assert.equal(door.name, "direction");
		assert.equal(door.value, 0);

		const stairsBlock = { name: "oak_stairs", states: { weirdo_direction: 1 } };
		const stairs = rotationLookup(stairsBlock, {}, "weirdo_direction", 1);
		assert.equal(stairs.name, "weirdo_direction");
		assert.equal(stairs.value, 1);
	});

	it("does not translate a coral fan, and flattens a stone slab the schema left behind", () => {
		const fan = {
			name: "tube_coral_fan",
			states: { coral_fan_direction: 0, direction: 1 }
		};
		const fanLook = rotationLookup(
			fan,
			{ "minecraft:cardinal_direction": { south: [0, 0, 0] } },
			"direction",
			1
		);
		assert.equal(fanLook.name, "direction");
		assert.equal(fan.states.direction, 1);
		assert.equal(fan.states.coral_fan_direction, 0);

		const slab = {
			name: "minecraft:stone_slab",
			states: { stone_slab_type: "cobblestone", top_slot_bit: 1 }
		};
		assert.equal(applyUnrevisedBlockStates(slab), true);
		assert.equal(slab.name, "cobblestone_slab");
		assert.equal(slab.states.stone_slab_type, undefined);
		assert.equal(slab.states["minecraft:vertical_half"], "top");

		const already = {
			name: "oak_slab",
			states: { "minecraft:vertical_half": "bottom", "minecraft:cardinal_direction": "north" }
		};
		assert.equal(applyUnrevisedBlockStates(already), false);
		assert.equal(already.states["minecraft:cardinal_direction"], "north");
	});
});
