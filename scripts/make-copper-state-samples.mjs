/**
 * Copper chest / bulb / golem statue samples — every ASI-visible block state.
 *
 *   tests/sampleStructures/copper_chests.mcstructure
 *   tests/sampleStructures/copper_bulbs.mcstructure
 *   tests/sampleStructures/copper_golems.mcstructure
 *
 * Usage (repo root):
 *   node scripts/make-copper-state-samples.mjs
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { grid, writeSampleNbt } from "./lib/sampleGrid.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "tests", "sampleStructures");
const CARDINALS = ["north", "south", "east", "west"];
const OXIDES = ["", "exposed_", "weathered_", "oxidized_"];
const WAX = ["", "waxed_"];

function copperNames(suffix) {
	const out = [];
	for (const w of WAX) {
		for (const o of OXIDES) out.push(`${w}${o}${suffix}`);
	}
	return out;
}

async function writeNbt(file, g) {
	await writeSampleNbt(path.join(OUT_DIR, file), g);
}

/** 8 oxidation/wax × 4 lit/powered. */
function makeBulbs() {
	const names = copperNames("copper_bulb");
	const combos = [
		{ lit: 0, powered_bit: 0 },
		{ lit: 1, powered_bit: 0 },
		{ lit: 0, powered_bit: 1 },
		{ lit: 1, powered_bit: 1 }
	];
	const g = grid(6, 2, 10);
	names.forEach((name, zi) => {
		combos.forEach((st, xi) => {
			g.set(1 + xi, 1, 1 + zi, g.intern(name, st));
		});
	});
	return g;
}

/**
 * 8 names × 4 cardinal singles + one east-facing double pair each.
 * Pair along +Z (east: player-left is north).
 */
function makeChests() {
	const names = copperNames("copper_chest");
	const g = grid(10, 2, 18);
	names.forEach((name, i) => {
		const z0 = 1 + i * 2;
		CARDINALS.forEach((dir, xi) => {
			g.set(1 + xi, 1, z0, g.intern(name, { "minecraft:cardinal_direction": dir }));
		});
		const x = 7;
		const zL = z0;
		const zR = z0 + 1;
		const st = { "minecraft:cardinal_direction": "east" };
		g.set(x, 1, zL, g.intern(name, st));
		g.set(x, 1, zR, g.intern(name, st));
		g.putBe(x, 1, zL, { id: "Chest", pairlead: 1, pairx: x, pairz: zR });
		g.putBe(x, 1, zR, { id: "Chest", pairlead: 0, pairx: x, pairz: zL });
	});
	return g;
}

/** 8 names × 4 poses × 4 facings. Pose on block entity. */
function makeGolems() {
	const names = copperNames("copper_golem_statue");
	const g = grid(34, 2, 18);
	let i = 0;
	for (const name of names) {
		for (const pose of [0, 1, 2, 3]) {
			for (const facing of CARDINALS) {
				const x = 1 + (i % 16) * 2;
				const z = 1 + Math.floor(i / 16) * 2;
				g.set(x, 1, z, g.intern(name, { "minecraft:cardinal_direction": facing }));
				g.putBe(x, 1, z, { id: "CopperGolemStatue", Pose: pose });
				i++;
			}
		}
	}
	if (i !== 128) throw new Error(`expected 128 golems, got ${i}`);
	return g;
}

await writeNbt("copper_bulbs.mcstructure", makeBulbs());
await writeNbt("copper_chests.mcstructure", makeChests());
await writeNbt("copper_golems.mcstructure", makeGolems());
