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
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { write, NBTData } from "nbtify";

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

function pal(name, states = {}) {
	return {
		name: name.includes(":") ? name : `minecraft:${name}`,
		states,
		version: VER
	};
}

const PALETTE = [
	pal("air"),
	pal("smooth_stone"),
	pal("stone_bricks"),
	pal("rail", { rail_direction: 0 }),
	pal("rail", { rail_direction: 1 }),
	pal("rail", { rail_direction: 2 }),
	pal("rail", { rail_direction: 3 }),
	pal("rail", { rail_direction: 4 }),
	pal("rail", { rail_direction: 5 }),
	pal("golden_rail", { rail_data_bit: 1, rail_direction: 0 }),
	pal("detector_rail", { rail_data_bit: 0, rail_direction: 1 }),
	pal("activator_rail", { rail_data_bit: 0, rail_direction: 0 })
];

function idx(x, y, z) {
	return (x * SY + y) * SZ + z;
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
	return { Slot: slot, Name: `minecraft:${name}`, Count: count, Damage: 0 };
}

function cart(kind, x, y, z, yaw, label, extras = {}) {
	const id = kind.includes(":") ? kind : `minecraft:${kind}`;
	const bare = id.replace(/^minecraft:/, "");
	const ent = {
		identifier: id,
		UniqueID: nextUid++,
		Pos: new Float32Array([x, y, z]),
		Rotation: new Float32Array([yaw, 0]),
		Motion: new Float32Array([0, 0, 0]),
		OnGround: 1,
		Chested: bare.includes("chest") ? 1 : 0,
		CustomName: label,
		definitions: [`+${id}`],
		...extras
	};
	return ent;
}

function mainPalette() {
	const n = SX * SY * SZ;
	const layer0 = new Int32Array(n);
	const layer1 = new Int32Array(n);
	layer0.fill(-1);
	layer1.fill(-1);

	const set = (x, y, z, pi) => {
		if (x < 0 || y < 0 || z < 0 || x >= SX || y >= SY || z >= SZ) return;
		layer0[idx(x, y, z)] = pi;
	};

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

	return [layer0, layer1];
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

const [layer0, layer1] = mainPalette();
const ents = entities();

const data = {
	format_version: 1,
	size: new Int32Array([SX, SY, SZ]),
	structure_world_origin: new Int32Array([0, 0, 0]),
	structure: {
		block_indices: [layer0, layer1],
		palette: {
			default: {
				block_palette: PALETTE,
				block_position_data: {}
			}
		},
		entities: ents
	}
};

const nbt = new NBTData(data, {
	endian: "little",
	compression: null,
	bedrockLevel: false,
	rootName: ""
});

const bytes = await write(nbt);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, Buffer.from(bytes));

const kinds = {};
for (const e of ents) {
	const k = e.identifier.replace(/^minecraft:/, "");
	kinds[k] = (kinds[k] || 0) + 1;
}
console.log(`wrote ${path.relative(ROOT, OUT)}  ${bytes.byteLength} bytes`);
console.log(`size ${SX}×${SY}×${SZ}  entities ${ents.length}`);
console.log("kinds", kinds);
