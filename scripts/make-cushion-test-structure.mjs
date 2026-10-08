/**
 * Write tests/sampleStructures/cushions.mcstructure.
 *
 * Cushions are entities (minecraft:cushion). Variant 0–15 follows
 * controller.render.cushion (black through white). XZ is the block center.
 * Y is the upward face that was clicked, in blocks, the same value a structure
 * script would pass to spawnEntity after a ray hits that face.
 *
 * Bedrock snow_layer height is 0–7 only (2px, 4px, …, 16px). There is no
 * height 8. The row after those eight layers is the full minecraft:snow block.
 * Each of those nine rows has all 16 colors.
 *
 * The rows after that are other floors a cushion can sit on, with the states
 * vanilla uses (bedrock-samples v1.26.50.4). Fence and wall collision is
 * 1.5 blocks, so those pillows sit above the 16px post this viewer draws.
 *
 * Usage (repo root):
 *   node scripts/make-cushion-test-structure.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Int8, Int32, Float32 } from "nbtify";
import { grid, writeSampleNbt } from "./lib/sampleGrid.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "tests", "sampleStructures", "cushions.mcstructure");

const VER = 18168865;
const COLORS = [
	"black", "red", "green", "brown",
	"blue", "purple", "cyan", "light_gray",
	"gray", "pink", "lime", "yellow",
	"light_blue", "magenta", "orange", "white"
];

const SX = 33;
const SY = 3;

function snowPixels(height) {
	return (height + 1) * 2;
}

function connections(on) {
	return {
		"minecraft:connection_north": on,
		"minecraft:connection_east": on,
		"minecraft:connection_south": on,
		"minecraft:connection_west": on
	};
}

function wallNone() {
	return {
		wall_connection_type_north: "none",
		wall_connection_type_east: "none",
		wall_connection_type_south: "none",
		wall_connection_type_west: "none",
		wall_post_bit: true
	};
}

function stair(dir, up) {
	return {
		"minecraft:corner": "none",
		upside_down_bit: !!up,
		weirdo_direction: dir
	};
}

function trapdoor(dir, up) {
	return { direction: dir, open_bit: false, upside_down_bit: !!up };
}

/** @type {{ seats: object[] }[]} */
const ROWS = [];

for (let height = 0; height <= 7; height++) {
	ROWS.push({
		seats: COLORS.map((color, i) => ({
			name: "snow_layer",
			states: { covered_bit: false, height },
			kind: `snow-h${height}`,
			pixels: snowPixels(height),
			color: i
		}))
	});
}

ROWS.push({
	seats: COLORS.map((color, i) => ({
		name: "snow",
		states: {},
		kind: "snow-block",
		pixels: 16,
		color: i
	}))
});

ROWS.push({
	seats: COLORS.map((color, i) => ({
		name: `${color}_carpet`,
		states: {},
		kind: "carpet",
		pixels: 1,
		color: i
	}))
});

ROWS.push({
	seats: [
		{ name: "moss_carpet", states: {}, kind: "moss-carpet", pixels: 1 },
		{ name: "wooden_pressure_plate", states: { redstone_signal: 0 }, kind: "plate-up", pixels: 1 },
		{ name: "wooden_pressure_plate", states: { redstone_signal: 15 }, kind: "plate-down", pixels: 0.5 },
		{ name: "unpowered_repeater", states: { "minecraft:cardinal_direction": "south", repeater_delay: 0 }, kind: "repeater-south", pixels: 2 },
		{ name: "unpowered_repeater", states: { "minecraft:cardinal_direction": "west", repeater_delay: 1 }, kind: "repeater-west", pixels: 2 },
		{ name: "unpowered_comparator", states: { "minecraft:cardinal_direction": "south", output_lit_bit: false, output_subtract_bit: false }, kind: "comparator-compare", pixels: 2 },
		{ name: "unpowered_comparator", states: { "minecraft:cardinal_direction": "east", output_lit_bit: false, output_subtract_bit: true }, kind: "comparator-subtract", pixels: 2 },
		{ name: "trapdoor", states: trapdoor(0, false), kind: "trapdoor-bottom-0", pixels: 3 },
		{ name: "trapdoor", states: trapdoor(1, false), kind: "trapdoor-bottom-1", pixels: 3 },
		{ name: "trapdoor", states: trapdoor(2, false), kind: "trapdoor-bottom-2", pixels: 3 },
		{ name: "trapdoor", states: trapdoor(3, false), kind: "trapdoor-bottom-3", pixels: 3 },
		{ name: "trapdoor", states: trapdoor(0, true), kind: "trapdoor-top", pixels: 16 },
		{ name: "daylight_detector", states: { redstone_signal: 0 }, kind: "daylight", pixels: 6 },
		{ name: "daylight_detector_inverted", states: { redstone_signal: 0 }, kind: "daylight-inverted", pixels: 6 },
		{ name: "oak_slab", states: { "minecraft:vertical_half": "bottom" }, kind: "slab-bottom", pixels: 8 },
		{ name: "oak_slab", states: { "minecraft:vertical_half": "top" }, kind: "slab-top", pixels: 16 }
	]
});

const stairSeats = [];
for (let dir = 0; dir <= 3; dir++) {
	stairSeats.push({ name: "oak_stairs", states: stair(dir, false), kind: `stair-low-${dir}`, pixels: 8 });
}
for (let dir = 0; dir <= 3; dir++) {
	stairSeats.push({ name: "oak_stairs", states: stair(dir, false), kind: `stair-high-${dir}`, pixels: 16 });
}
for (let dir = 0; dir <= 3; dir++) {
	stairSeats.push({ name: "oak_stairs", states: stair(dir, true), kind: `stair-up-${dir}`, pixels: 16 });
}
stairSeats.push(
	{ name: "farmland", states: { moisturized_amount: 0 }, kind: "farmland-dry", pixels: 15 },
	{ name: "farmland", states: { moisturized_amount: 7 }, kind: "farmland-wet", pixels: 15 },
	{ name: "grass_path", states: {}, kind: "grass-path", pixels: 15 },
	{ name: "enchanting_table", states: {}, kind: "enchanting", pixels: 12 }
);
ROWS.push({ seats: stairSeats });

ROWS.push({
	seats: [
		{ name: "stonecutter_block", states: { "minecraft:cardinal_direction": "south" }, kind: "stonecutter", pixels: 9 },
		{ name: "end_portal_frame", states: { end_portal_eye_bit: false, "minecraft:cardinal_direction": "south" }, kind: "portal-empty", pixels: 13 },
		{ name: "end_portal_frame", states: { end_portal_eye_bit: true, "minecraft:cardinal_direction": "south" }, kind: "portal-eye", pixels: 16 },
		{ name: "cake", states: { bite_counter: 0 }, kind: "cake", pixels: 8 },
		{ name: "candle", states: { candles: 0, lit: false }, kind: "candle", pixels: 6 },
		{ name: "flower_pot", states: { update_bit: false }, kind: "flower-pot", pixels: 6 },
		{ name: "chest", states: { "minecraft:cardinal_direction": "south" }, kind: "chest", pixels: 14 },
		{
			name: "bed",
			states: { direction: 0, head_piece_bit: false, occupied_bit: false },
			kind: "bed-foot",
			pixels: 9,
			extra: {
				dz: 1,
				states: { direction: 0, head_piece_bit: true, occupied_bit: false },
				kind: "bed-head",
				pixels: 9
			}
		},
		{ name: "campfire", states: { extinguished: true, "minecraft:cardinal_direction": "south" }, kind: "campfire", pixels: 7 },
		{ name: "sculk_sensor", states: { sculk_sensor_phase: 0 }, kind: "sculk-sensor", pixels: 8 },
		{ name: "anvil", states: { "minecraft:cardinal_direction": "south" }, kind: "anvil", pixels: 16 },
		{ name: "hopper", states: { facing_direction: 0, toggle_bit: false }, kind: "hopper", pixels: 16 },
		{ name: "oak_fence", states: connections(false), kind: "fence", pixels: 24 },
		{ name: "cobblestone_wall", states: wallNone(), kind: "wall", pixels: 24 },
		{ name: "cauldron", states: { cauldron_liquid: "water", fill_level: 0 }, kind: "cauldron", pixels: 16 },
		{ name: "composter", states: { composter_fill_level: 0 }, kind: "composter", pixels: 16 }
	]
});

ROWS.push({
	seats: [
		{ name: "glass_pane", states: connections(false), kind: "glass-pane", pixels: 16 },
		{ name: "iron_bars", states: connections(false), kind: "iron-bars", pixels: 16 },
		{ name: "oak_double_slab", states: { "minecraft:vertical_half": "bottom" }, kind: "double-slab", pixels: 16 },
		{ name: "heavy_weighted_pressure_plate", states: { redstone_signal: 0 }, kind: "plate-heavy", pixels: 1 },
		{ name: "light_weighted_pressure_plate", states: { redstone_signal: 0 }, kind: "plate-light", pixels: 1 },
		{ name: "stone_pressure_plate", states: { redstone_signal: 0 }, kind: "plate-stone", pixels: 1 }
	]
});

for (const row of ROWS) {
	if (row.seats.length > 16) throw new Error(`row has ${row.seats.length} seats`);
	row.seats.forEach((seat, i) => {
		if (seat.color == null) seat.color = i;
	});
}

const SZ = 1 + (ROWS.length - 1) * 2 + 2;

export function buildCushionGrid() {
	const g = grid(SX, SY, SZ, { version: VER, fillFloor: false });
	const brick = g.intern("stone_bricks");
	for (let x = 0; x < SX; x++) {
		for (let z = 0; z < SZ; z++) {
			const border = x === 0 || z === 0 || x === SX - 1 || z === SZ - 1;
			g.set(x, 0, z, border ? brick : 1);
		}
	}

	let nextUid = 9101n;
	const used = new Set();

function cushion(colorIndex, kind, x, pixels, z) {
	const feet = 1 + pixels / 16;
	const yaw = (colorIndex % 4) * 90;
	const color = COLORS[colorIndex];
	return {
		identifier: "minecraft:cushion",
		UniqueID: nextUid++,
		Pos: [x + 0.5, feet, z + 0.5].map(n => new Float32(n)),
		Rotation: [yaw, 0].map(n => new Float32(n)),
		Motion: [0, 0, 0].map(n => new Float32(n)),
		OnGround: new Int8(1),
		Variant: new Int32(colorIndex),
		CustomName: `${color}|${kind}|${feet.toFixed(5)}`,
		definitions: ["+minecraft:cushion"]
	};
}

	function occupy(x, y, z, pi) {
		const key = `${x},${y},${z}`;
		if (used.has(key)) throw new Error(`two supports at ${key}`);
		if (x <= 0 || z <= 0 || x >= SX - 1 || z >= SZ - 1 || y < 0 || y >= SY) {
			throw new Error(`support out of bounds ${key}`);
		}
		used.add(key);
		g.set(x, y, z, pi);
	}

	ROWS.forEach((row, rowIndex) => {
		const z = 1 + rowIndex * 2;
		row.seats.forEach((seat, i) => {
			const x = 1 + i * 2;
			occupy(x, 1, z, g.intern(seat.name, seat.states));
			g.addEntity(cushion(seat.color, seat.kind, x, seat.pixels, z));
			if (seat.extra) {
				const hx = x + (seat.extra.dx || 0);
				const hz = z + (seat.extra.dz || 0);
				occupy(hx, 1, hz, g.intern(seat.name, seat.extra.states));
				g.addEntity(cushion(seat.color, seat.extra.kind, hx, seat.extra.pixels, hz));
			}
		});
	});

	return g;
}

function invokedDirectly() {
	const self = fs.realpathSync(fileURLToPath(import.meta.url));
	const entry = process.argv[1] ? fs.realpathSync(process.argv[1]) : "";
	return self.toLowerCase() === entry.toLowerCase();
}

if (invokedDirectly()) {
	const g = buildCushionGrid();
	const bytes = await writeSampleNbt(OUT, g);
	const kinds = {};
	for (const e of g.entities) {
		const kind = e.CustomName.split("|")[1];
		kinds[kind] = (kinds[kind] || 0) + 1;
	}
	console.log(`size ${SX}x${SY}x${SZ}  entities ${g.entities.length}  palette ${g.palette.length}  ${bytes.byteLength} bytes`);
	console.log(kinds);
}
