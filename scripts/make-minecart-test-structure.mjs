/**
 * Write tests/sampleStructures/minecarts.mcstructure — carts + rails for viewer QA.
 *
 * Layout (structure-local, Y up):
 *   y=0  stone platform, brick border
 *   y=1  rails (flat + slope lows)
 *   y=2  slope high rails
 *
 *   z=1  FLAT NS (rail_direction 0)  five subtypes facing south
 *   z=3  FLAT EW (rail_direction 1)  five subtypes facing east
 *   z=5  FLAT NS facing north + west  (yaw 180 / 90)
 *   z=7  SLOPES: S↑ N↑ E↑ W↑  (rail_direction 5/4/2/3)
 *   z=9  golden / detector / activator
 *
 * Usage (repo root):
 *   node scripts/make-minecart-test-structure.mjs
 *
 * Written through writeMcstructure so the root, layers and block states get
 * Bedrock tag types. Entity fields are typed explicitly below (Byte / Short /
 * Float / Long) because entity NBT has no schema in the writer.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Int8, Int16, Float32 } from "nbtify";
import { grid, writeSampleNbt } from "./lib/sampleGrid.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "tests", "sampleStructures", "minecarts.mcstructure");

const SX = 13;
const SY = 3;
const SZ = 11;
const VER = 18163713;

const STONE = 1;
const BRICK = 2;
const NS = 3;
const EW = 4;
const EUP = 5;
const WUP = 6;
const NUP = 7;
const SUP = 8;
const GOLD = 9;
const DET = 10;
const ACT = 11;

function seedPalette(g) {
	g.intern("stone_bricks");
	g.intern("rail", { rail_direction: 0 });
	g.intern("rail", { rail_direction: 1 });
	g.intern("rail", { rail_direction: 2 });
	g.intern("rail", { rail_direction: 3 });
	g.intern("rail", { rail_direction: 4 });
	g.intern("rail", { rail_direction: 5 });
	g.intern("golden_rail", { rail_data_bit: 1, rail_direction: 0 });
	g.intern("detector_rail", { rail_data_bit: 0, rail_direction: 1 });
	g.intern("activator_rail", { rail_data_bit: 0, rail_direction: 0 });
}

const KINDS = [
	"minecart",
	"chest_minecart",
	"hopper_minecart",
	"tnt_minecart",
	"command_block_minecart"
];

let nextUid = 9001n;

function item(slot, name, count) {
	return { Slot: new Int8(slot), Name: `minecraft:${name}`, Count: new Int8(count), Damage: new Int16(0) };
}

function cart(kind, x, y, z, yaw, label, extras = {}) {
	const id = kind.includes(":") ? kind : `minecraft:${kind}`;
	const bare = id.replace(/^minecraft:/, "");
	const ent = {
		identifier: id,
		UniqueID: nextUid++, // bigint → Long
		Pos: [x, y, z].map(n => new Float32(n)),
		Rotation: [yaw, 0].map(n => new Float32(n)),
		Motion: [0, 0, 0].map(n => new Float32(n)),
		OnGround: new Int8(1),
		Chested: new Int8(bare.includes("chest") ? 1 : 0),
		CustomName: label,
		definitions: [`+${id}`],
		...extras
	};
	return ent;
}

function layRails(g) {
	const set = (x, y, z, pi) => g.set(x, y, z, pi);

	for (let x = 0; x < SX; x++) {
		for (let z = 0; z < SZ; z++) {
			const border = x === 0 || z === 0 || x === SX - 1 || z === SZ - 1;
			set(x, 0, z, border ? BRICK : STONE);
		}
	}

	// z=1 FLAT NS
	for (const x of [1, 3, 5, 7, 9]) set(x, 1, 1, NS);
	// z=3 FLAT EW
	for (const x of [1, 3, 5, 7, 9]) set(x, 1, 3, EW);
	// z=5 FLAT NS (north-facing carts) + one EW
	for (const x of [1, 3, 5]) set(x, 1, 5, NS);
	set(7, 1, 5, EW);
	set(9, 1, 5, EW);

	// Slopes z=7 (low) / z=8 (high) — S and N
	set(1, 1, 7, SUP);
	set(1, 1, 8, STONE);
	set(1, 2, 8, NS);

	set(3, 1, 8, NUP);
	set(3, 1, 7, STONE);
	set(3, 2, 7, NS);

	// E and W slopes along x at z=7
	set(5, 1, 7, EUP);
	set(6, 1, 7, STONE);
	set(6, 2, 7, EW);

	set(9, 1, 7, WUP);
	set(8, 1, 7, STONE);
	set(8, 2, 7, EW);

	// z=9 special rails
	set(1, 1, 9, GOLD);
	set(3, 1, 9, DET);
	set(5, 1, 9, ACT);
	set(7, 1, 9, NS);
	set(9, 1, 9, EW);
}

export function buildMinecartGrid() {
	const g = grid(SX, SY, SZ, { version: VER, fillFloor: false });
	seedPalette(g);
	layRails(g);
	for (const entity of entities()) g.addEntity(entity);
	return g;
}

function invokedDirectly() {
	const self = fs.realpathSync(fileURLToPath(import.meta.url));
	const entry = process.argv[1] ? fs.realpathSync(process.argv[1]) : "";
	return self.toLowerCase() === entry.toLowerCase();
}

function entities() {
	const yFlat = 1.35;
	const ySlope = 1.55;
	const out = [];

	// NS south-facing
	KINDS.forEach((kind, i) => {
		const x = 1 + i * 2;
		out.push(cart(kind, x + 0.5, yFlat, 1.5, 0, `NS ${kind}`));
	});
	out[1].Items = [item(0, "apple", 4), item(1, "bread", 2), item(12, "diamond", 1)];
	out[2].Items = [item(0, "iron_ingot", 8), item(2, "rail", 16), item(4, "hopper", 1)];

	// EW east-facing
	KINDS.forEach((kind, i) => {
		const x = 1 + i * 2;
		out.push(cart(kind, x + 0.5, yFlat, 3.5, -90, `EW ${kind}`));
	});

	// North + west
	out.push(cart("minecart", 1.5, yFlat, 5.5, 180, "N empty"));
	out.push(cart("chest_minecart", 3.5, yFlat, 5.5, 180, "N chest"));
	out.push(cart("hopper_minecart", 5.5, yFlat, 5.5, 180, "N hopper"));
	out.push(cart("tnt_minecart", 7.5, yFlat, 5.5, 90, "W tnt"));
	out.push(cart("command_block_minecart", 9.5, yFlat, 5.5, 90, "W command"));

	// Slopes
	out.push(cart("minecart", 1.5, ySlope, 7.5, 0, "S↑ empty"));
	out.push(cart("chest_minecart", 3.5, ySlope, 8.5, 180, "N↑ chest"));
	out.push(cart("hopper_minecart", 5.5, ySlope, 7.5, -90, "E↑ hopper"));
	out.push(cart("tnt_minecart", 9.5, ySlope, 7.5, 90, "W↑ tnt"));
	out.push(cart("command_block_minecart", 6.5, 2.35, 7.5, -90, "E↑ top command"));

	// Special rails
	out.push(cart("minecart", 1.5, yFlat, 9.5, 0, "gold empty"));
	out.push(cart("chest_minecart", 3.5, yFlat, 9.5, -90, "detector chest"));
	out.push(cart("hopper_minecart", 5.5, yFlat, 9.5, 0, "activator hopper"));
	out.push(cart("tnt_minecart", 7.5, yFlat, 9.5, 0, "NS tnt"));
	out.push(cart("command_block_minecart", 9.5, yFlat, 9.5, -90, "EW command"));

	return out;
}

if (invokedDirectly()) {
	const g = buildMinecartGrid();
	const bytes = await writeSampleNbt(OUT, g);
	const kinds = {};
	for (const e of g.entities) {
		const k = e.identifier.replace(/^minecraft:/, "");
		kinds[k] = (kinds[k] || 0) + 1;
	}
	console.log(`size ${SX}×${SY}×${SZ}  entities ${g.entities.length}  ${bytes.byteLength} bytes`);
	console.log("kinds", kinds);
}
