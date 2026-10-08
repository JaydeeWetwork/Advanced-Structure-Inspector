/**
 * One cube of every leaf block, with a gap so each texture can be checked.
 *
 *   tests/sampleStructures/leaves.mcstructure
 *
 * z = 1, x = 1 then every 2 blocks (persistent_bit 1, update_bit 0):
 *   oak, spruce, birch, jungle, acacia, dark_oak, mangrove, cherry,
 *   azalea, azalea_flowered, pale_oak, orange_poplar, red_poplar, yellow_poplar
 *
 * z = 3, same x step, legacy ids:
 *   leaves old_leaf_type oak, spruce, birch, jungle
 *   leaves2 new_leaf_type acacia, dark_oak
 *
 * Cherry is the 8th modern cube (x = 15). Its samples color file is
 * textures/blocks/cherry_leaves.tga (also published as .png).
 *
 * Usage (repo root):
 *   node scripts/make-leaf-samples.mjs
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { grid, writeSampleNbt } from "./lib/sampleGrid.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "tests", "sampleStructures", "leaves.mcstructure");

/** Current leaf blocks on bedrock-samples v1.26.50.4. */
const MODERN = [
	"oak_leaves",
	"spruce_leaves",
	"birch_leaves",
	"jungle_leaves",
	"acacia_leaves",
	"dark_oak_leaves",
	"mangrove_leaves",
	"cherry_leaves",
	"azalea_leaves",
	"azalea_leaves_flowered",
	"pale_oak_leaves",
	"orange_poplar_leaves",
	"red_poplar_leaves",
	"yellow_poplar_leaves"
];

const LEGACY = [
	["leaves", { old_leaf_type: "oak" }],
	["leaves", { old_leaf_type: "spruce" }],
	["leaves", { old_leaf_type: "birch" }],
	["leaves", { old_leaf_type: "jungle" }],
	["leaves2", { new_leaf_type: "acacia" }],
	["leaves2", { new_leaf_type: "dark_oak" }]
];

const PLACED = { persistent_bit: 1, update_bit: 0 };

function makeSample() {
	const count = Math.max(MODERN.length, LEGACY.length);
	const sx = 1 + count * 2;
	const sy = 2;
	const sz = 5;
	const g = grid(sx, sy, sz);
	MODERN.forEach((name, i) => {
		g.set(1 + i * 2, 1, 1, g.intern(name, PLACED));
	});
	LEGACY.forEach(([name, states], i) => {
		g.set(1 + i * 2, 1, 3, g.intern(name, { ...states, ...PLACED }));
	});
	return g;
}

await writeSampleNbt(OUT, makeSample());
console.log("cherry_leaves is the 8th cube on z=1 (x=15)");
