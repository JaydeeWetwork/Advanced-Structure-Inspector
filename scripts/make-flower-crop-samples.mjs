/**
 * Two-block flowers on grass + farmland crops (correct ground).
 *
 *   tests/sampleStructures/two_block_flowers_and_crops.mcstructure
 *
 * Usage (repo root):
 *   node scripts/make-flower-crop-samples.mjs
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { grid, writeSampleNbt } from "./lib/sampleGrid.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "tests", "sampleStructures");

/** Double-plant flowers / foliage — both halves, on grass. */
const DOUBLE_PLANTS = [
	"sunflower",
	"lilac",
	"rose_bush",
	"peony",
	"pitcher_plant",
	"tall_grass",
	"large_fern"
];

/** Farmland row crops (growth 0–7). */
const ROW_CROPS = ["wheat", "carrots", "potatoes", "beetroot"];

function makeSample() {
	const sx = 10;
	const sy = 3;
	const sz = 14;
	const g = grid(sx, sy, sz, { floor: "dirt" });
	const dirt = g.intern("dirt");
	const grass = g.intern("grass_block");
	const farm = g.intern("farmland", { moisturized_amount: 7 });

	for (let x = 0; x < sx; x++) {
		for (let z = 0; z < sz; z++) g.set(x, 0, z, dirt);
	}

	const plantDouble = (x, z, name) => {
		g.set(x, 0, z, grass);
		g.set(x, 1, z, g.intern(name, { upper_block_bit: 0 }));
		g.set(x, 2, z, g.intern(name, { upper_block_bit: 1 }));
	};
	const plantCrop = (x, z, name, growth) => {
		g.set(x, 0, z, farm);
		g.set(x, 1, z, g.intern(name, { growth }));
	};

	// z=1  two-block flowers / foliage on grass
	DOUBLE_PLANTS.forEach((name, i) => plantDouble(1 + i, 1, name));

	// z=3  pitcher crop (2-block at growth 3–4) on farmland
	for (let growth = 0; growth <= 4; growth++) {
		const x = 1 + growth;
		g.set(x, 0, 3, farm);
		g.set(x, 1, 3, g.intern("pitcher_crop", { growth, upper_block_bit: 0 }));
		if (growth >= 3) {
			g.set(x, 2, 3, g.intern("pitcher_crop", { growth, upper_block_bit: 1 }));
		}
	}

	// z=5..8  wheat / carrots / potatoes / beetroot  growth 0–7
	ROW_CROPS.forEach((name, zi) => {
		for (let growth = 0; growth <= 7; growth++) {
			plantCrop(1 + growth, 5 + zi, name, growth);
		}
	});

	// z=9  torchflower crop 0–2 + mature torchflower
	for (let growth = 0; growth <= 2; growth++) {
		plantCrop(1 + growth, 9, "torchflower_crop", growth);
	}
	g.set(4, 0, 9, farm);
	g.set(4, 1, 9, g.intern("torchflower"));

	// z=10–11  pumpkin / melon stems
	for (let growth = 0; growth <= 7; growth++) {
		plantCrop(1 + growth, 10, "pumpkin_stem", growth);
		plantCrop(1 + growth, 11, "melon_stem", growth);
	}

	// z=12  sweet berry bush on grass
	for (let growth = 0; growth <= 3; growth++) {
		g.set(1 + growth, 0, 12, grass);
		g.set(1 + growth, 1, 12, g.intern("sweet_berry_bush", { growth }));
	}

	return g;
}

const g = makeSample();
await writeSampleNbt(path.join(OUT_DIR, "two_block_flowers_and_crops.mcstructure"), g);
