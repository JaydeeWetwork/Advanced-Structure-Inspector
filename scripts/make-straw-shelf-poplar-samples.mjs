/**
 * Straw bed, shelf mushroom, and poplar wood/leaves samples.
 *
 *   tests/sampleStructures/straw_beds.mcstructure
 *   tests/sampleStructures/shelf_mushrooms.mcstructure
 *   tests/sampleStructures/poplar_wood.mcstructure
 *
 * Usage (repo root):
 *   node scripts/make-straw-shelf-poplar-samples.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { grid, writeSampleNbt } from "./lib/sampleGrid.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "tests", "sampleStructures");
const CARDINALS = ["north", "south", "east", "west"];
const AXIS = ["y", "x", "z"];
/** direction 0 south, 1 west, 2 north, 3 east — same as wool bed. */
const BED_DIRS = [
	{ direction: 0, cardinal: "south", head: { dx: 0, dz: 1 } },
	{ direction: 1, cardinal: "west", head: { dx: -1, dz: 0 } },
	{ direction: 2, cardinal: "north", head: { dx: 0, dz: -1 } },
	{ direction: 3, cardinal: "east", head: { dx: 1, dz: 0 } }
];



/**
 * @param {{ cells: { dx?: number, dy?: number, dz?: number, name: string, states?: object }[] }[]} kits
 * @param {{ cell?: number, sy?: number, cols?: number }} [opts]
 */
function packKits(kits, opts = {}) {
	const cell = opts.cell ?? 3;
	const cols = opts.cols ?? 12;
	const rows = Math.max(1, Math.ceil(kits.length / cols));
	const sx = cols * cell + 2;
	const sz = rows * cell + 2;
	const sy = opts.sy ?? 4;
	const g = grid(sx, sy, sz);
	kits.forEach((kit, i) => {
		const ox = 1 + (i % cols) * cell;
		const oz = 1 + Math.floor(i / cols) * cell;
		const oy = 1;
		for (const c of kit.cells) {
			g.set(ox + (c.dx ?? 0), oy + (c.dy ?? 0), oz + (c.dz ?? 0), g.intern(c.name, c.states ?? {}));
		}
	});
	return g;
}

async function writeNbt(file, g) {
	await writeSampleNbt(path.join(OUT_DIR, file), g);
}

function cell(name, states = {}, pos = {}) {
	return { name, states, dx: pos.dx ?? 0, dy: pos.dy ?? 0, dz: pos.dz ?? 0 };
}

function kit(...cells) {
	return { cells };
}

/** Four complete NSEW pairs, 2-block gaps, no occupied/half beds. */
function makeStrawBeds() {
	const g = grid(16, 3, 8);
	const place = (fx, fz, d) => {
		const st = (head) => ({
			"minecraft:cardinal_direction": d.cardinal,
			head_piece_bit: head
		});
		g.set(fx, 1, fz, g.intern("straw_bed", st(0)));
		g.set(fx + d.head.dx, 1, fz + d.head.dz, g.intern("straw_bed", st(1)));
	};
	const byCard = Object.fromEntries(BED_DIRS.map(d => [d.cardinal, d]));
	place(2, 2, byCard.south);
	place(7, 2, byCard.north);
	place(2, 6, byCard.west);
	place(7, 6, byCard.east);
	return g;
}

/** growth 0/1 × 4 cardinals. */
function makeShelfMushrooms() {
	const kits = [];
	for (const growth of [0, 1]) {
		for (const dir of CARDINALS) {
			kits.push(
				kit(cell("shelf_mushroom", { growth, "minecraft:cardinal_direction": dir }))
			);
		}
	}
	return packKits(kits, { cell: 2, cols: 4, sy: 3 });
}

function makePoplar() {
	const kits = [];
	for (const name of [
		"poplar_log",
		"poplar_wood",
		"stripped_poplar_log",
		"stripped_poplar_wood"
	]) {
		for (const a of AXIS) kits.push(kit(cell(name, { pillar_axis: a })));
	}
	kits.push(kit(cell("poplar_planks")));
	for (const half of ["bottom", "top"]) {
		kits.push(kit(cell("poplar_slab", { "minecraft:vertical_half": half })));
	}
	kits.push(kit(cell("poplar_double_slab", { "minecraft:vertical_half": "bottom" })));
	for (const dir of [0, 1, 2, 3]) {
		for (const up of [0, 1]) {
			kits.push(kit(cell("poplar_stairs", { weirdo_direction: dir, upside_down_bit: up })));
		}
	}
	const f = "poplar_fence";
	const conn = (n, e, s, w) => ({
		"minecraft:connection_north": n,
		"minecraft:connection_east": e,
		"minecraft:connection_south": s,
		"minecraft:connection_west": w
	});
	kits.push(kit(cell(f, conn(0, 0, 0, 0))));
	kits.push(kit(cell(f, conn(1, 0, 1, 0))));
	kits.push(kit(cell(f, conn(1, 1, 0, 0))));
	kits.push(kit(cell(f, conn(1, 1, 1, 0))));
	kits.push(kit(cell(f, conn(1, 1, 1, 1))));
	for (const facing of CARDINALS) {
		for (const open of [0, 1]) {
			for (const wall of [0, 1]) {
				kits.push(
					kit(
						cell("poplar_fence_gate", {
							"minecraft:cardinal_direction": facing,
							open_bit: open,
							in_wall_bit: wall
						})
					)
				);
			}
		}
	}
	for (const facing of CARDINALS) {
		for (const open of [0, 1]) {
			for (const hinge of [0, 1]) {
				kits.push(
					kit(
						cell("poplar_door", {
							"minecraft:cardinal_direction": facing,
							open_bit: open,
							door_hinge_bit: hinge,
							upper_block_bit: 0
						}),
						cell(
							"poplar_door",
							{
								"minecraft:cardinal_direction": facing,
								open_bit: open,
								door_hinge_bit: hinge,
								upper_block_bit: 1
							},
							{ dy: 1 }
						)
					)
				);
			}
		}
	}
	for (const dir of [0, 1, 2, 3]) {
		for (const open of [0, 1]) {
			for (const up of [0, 1]) {
				kits.push(
					kit(cell("poplar_trapdoor", { direction: dir, open_bit: open, upside_down_bit: up }))
				);
			}
		}
	}
	for (const face of [0, 1, 2, 3, 4, 5]) {
		for (const pressed of [0, 1]) {
			kits.push(
				kit(cell("poplar_button", { facing_direction: face, button_pressed_bit: pressed }))
			);
		}
	}
	kits.push(kit(cell("poplar_pressure_plate", { redstone_signal: 0 })));
	kits.push(kit(cell("poplar_pressure_plate", { redstone_signal: 15 })));
	for (const gsd of Array.from({ length: 16 }, (_, i) => i)) {
		kits.push(kit(cell("poplar_standing_sign", { ground_sign_direction: gsd })));
	}
	for (const fd of [2, 3, 4, 5]) {
		kits.push(kit(cell("poplar_wall_sign", { facing_direction: fd })));
	}
	for (const hanging of [0, 1]) {
		for (const attached of [0, 1]) {
			for (const fd of [2, 3, 4, 5]) {
				kits.push(
					kit(
						cell("poplar_hanging_sign", {
							hanging,
							attached_bit: attached,
							facing_direction: fd,
							ground_sign_direction: 0
						})
					)
				);
			}
		}
	}
	for (const facing of CARDINALS) {
		for (const powered of [0, 1]) {
			for (const typ of [0, 1, 2]) {
				kits.push(
					kit(
						cell("poplar_shelf", {
							"minecraft:cardinal_direction": facing,
							powered_bit: powered,
							powered_shelf_type: typ
						})
					)
				);
			}
		}
	}
	for (const age of [0, 1]) kits.push(kit(cell("poplar_sapling", { age_bit: age })));
	for (const color of ["orange", "red", "yellow"]) {
		for (const persistent of [0, 1]) {
			for (const update of [0, 1]) {
				kits.push(
					kit(
						cell(`${color}_poplar_leaves`, {
							persistent_bit: persistent,
							update_bit: update
						})
					)
				);
			}
		}
	}
	return packKits(kits, { cell: 3, cols: 12, sy: 4 });
}

fs.mkdirSync(OUT_DIR, { recursive: true });
await writeNbt("straw_beds.mcstructure", makeStrawBeds());
await writeNbt("shelf_mushrooms.mcstructure", makeShelfMushrooms());
await writeNbt("poplar_wood.mcstructure", makePoplar());
