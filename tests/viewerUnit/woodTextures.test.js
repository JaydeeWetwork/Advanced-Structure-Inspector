/**
 * Oak (and other woods) door / trapdoor / fence_gate texture aliases.
 * Vanilla blocks.json still uses wooden_door, trapdoor, fence_gate for oak.
 * Modern ids (oak_door, …) must patch or they render the missing-tile checker.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stripJsonc } from "../../src/utils/conversions.js";
import { applyBlocksJsonPatch } from "../../src/viewer/blocksJsonPatch.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

function loadJsonc(rel) {
	return JSON.parse(stripJsonc(readFileSync(join(root, rel), "utf8")));
}

/** Woods that have door + trapdoor + fence + fence_gate in current vanilla. */
export const WOODS = [
	"oak",
	"spruce",
	"birch",
	"jungle",
	"acacia",
	"dark_oak",
	"mangrove",
	"cherry",
	"pale_oak",
	"bamboo",
	"crimson",
	"warped"
];

/** Vanilla blocks.json keys that oak still uses (not oak_*). */
export const OAK_LEGACY = {
	door: "wooden_door",
	trapdoor: "trapdoor",
	fence: "oak_fence",
	fence_gate: "fence_gate"
};

describe("wood door/fence/trapdoor texture aliases", () => {
	const mappings = loadJsonc("src/data/textureAtlasMappings.json");
	const patches = mappings.blocks_dot_json_patches;
	const eigen = loadJsonc("src/data/blockEigenvariants.json");

	it("exports applyBlocksJsonPatch for atlas + coverage tests", () => {
		assert.equal(applyBlocksJsonPatch("spruce_door", patches).name, "spruce_door");
		assert.equal(applyBlocksJsonPatch("oak_door", patches).name, "wooden_door");
	});

	it("maps modern oak_door / oak_trapdoor / oak_fence_gate to vanilla blocks.json keys", () => {
		const door = applyBlocksJsonPatch("oak_door", patches);
		assert.equal(door.name, OAK_LEGACY.door);
		assert.equal(door.variant, 0);
		assert.equal(applyBlocksJsonPatch("oak_trapdoor", patches).name, OAK_LEGACY.trapdoor);
		assert.equal(applyBlocksJsonPatch("oak_fence_gate", patches).name, OAK_LEGACY.fence_gate);
		const btn = applyBlocksJsonPatch("oak_button", patches);
		assert.equal(btn.name, "wooden_button");
		assert.equal(btn.variant, 0);
	});

	it("does not require a patch for oak_fence (vanilla already has oak_fence)", () => {
		assert.equal("oak_fence" in patches, false);
		assert.equal(applyBlocksJsonPatch("oak_fence", patches).name, "oak_fence");
	});

	it("gives oak_door the same eigenvariant as wooden_door (shared door_upper sheet)", () => {
		assert.equal(eigen.oak_door, eigen.wooden_door);
		assert.equal(eigen.oak_door, 0);
	});

	it("keeps shared-sheet door eigenvariants for every pre-mangrove wood + iron", () => {
		assert.equal(eigen.wooden_door, 0);
		assert.equal(eigen.spruce_door, 1);
		assert.equal(eigen.birch_door, 2);
		assert.equal(eigen.jungle_door, 3);
		assert.equal(eigen.acacia_door, 4);
		assert.equal(eigen.dark_oak_door, 5);
		assert.equal(eigen.iron_door, 6);
	});

	it("lists every wood variant so missing oak-style aliases stay obvious", () => {
		const kinds = ["door", "trapdoor", "fence", "fence_gate"];
		for (const wood of WOODS) {
			for (const kind of kinds) {
				const modern = `${wood}_${kind}`;
				if (wood === "oak" && kind !== "fence") {
					const { name } = applyBlocksJsonPatch(modern, patches);
					assert.equal(
						name,
						OAK_LEGACY[kind],
						`${modern} must alias ${OAK_LEGACY[kind]}`
					);
				} else {
					assert.equal(
						applyBlocksJsonPatch(modern, patches).name,
						modern,
						`${modern} should use its own blocks.json entry (not an oak-style alias)`
					);
				}
			}
		}
	});
});
