import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../..");

describe("entityMeshes coordinates", async () => {
	const { structurePosToThree } = await import("../../src/viewer/entityMeshes.js");

	it("maps integer cell corners like block placement", () => {
		// Block at (4,0,5) corner translation in PreviewRenderer
		assert.deepEqual(structurePosToThree(4, 0, 5), [-16 * 4 - 16, 0, -16 * 5]);
		// Wait Z: with flip formula three_z = -16*lz, at integer 5 → -80
		// Block corner is (-80, 0, -96) for (4,0,5)... 
		// At exact integer corner, fractional uz=0, Z flip: -16*fz-16+16*(1-0) = -16*fz
		// = -16*5 = -80, NOT -96.
		// So integer corners for entities at exact integers don't match block corners due to Z flip!
		// Entity at center of block (4.5, 0, 5.5):
		const c = structurePosToThree(4.5, 0, 5.5);
		// x: -16*4 - 16 + 16*0.5 = -80 + 8 = -72  (block center X)
		// z: -16*5.5 = -88  (block center Z with flip)
		assert.equal(c[0], -72);
		assert.equal(c[1], 0);
		assert.equal(c[2], -88);
	});

	it("places fractional rail minecart near block center", () => {
		// cart local ~ (4.791, 0.35, 5.5) from rails sample
		const p = structurePosToThree(4.7914581298828125, 0.34999847412109375, 5.5);
		// Should be near (-72-ish adjusted, ~5.6, -88)
		assert.ok(Math.abs(p[0] - (-67.34)) < 0.5, `x=${p[0]}`);
		assert.ok(Math.abs(p[1] - 5.6) < 0.1, `y=${p[1]}`);
		assert.ok(Math.abs(p[2] - (-88)) < 0.1, `z=${p[2]}`);
	});

	it("sits flat carts on the rail plane, not NBT Y=0.35", async () => {
		const { minecartWorldY, RAIL_PLANE_Y, HULL_FLOOR_BOTTOM, HULL_SIT_LIFT } =
			await import("../../src/viewer/entityMeshes.js");
		const cellY = 1;
		const want = 16 * cellY + RAIL_PLANE_Y - HULL_FLOOR_BOTTOM + HULL_SIT_LIFT;
		assert.equal(minecartWorldY(1.35, 0), want);
		assert.equal(minecartWorldY(1.35, 1), want);
		assert.equal(want, 16 + 1);
		const nbtY = 16 * 1.35;
		assert.ok(want < nbtY - 4, `should drop ~5 units off NBT (${nbtY} → ${want})`);
	});

	it("keeps slope NBT Y so pitched carts follow the climb", async () => {
		const { minecartWorldY, HULL_FLOOR_BOTTOM, HULL_SIT_LIFT } = await import(
			"../../src/viewer/entityMeshes.js"
		);
		const ly = 1.55;
		assert.equal(
			minecartWorldY(ly, 5),
			16 * ly - HULL_FLOOR_BOTTOM + HULL_SIT_LIFT
		);
	});

	it("pick volume covers the hull tub including cargo", async () => {
		const { MINECART_PICK_SIZE, MINECART_PICK_CENTER } = await import(
			"../../src/viewer/entityMeshes.js"
		);
		assert.deepEqual(MINECART_PICK_SIZE, [20, 15, 16]);
		const y0 = MINECART_PICK_CENTER[1] - MINECART_PICK_SIZE[1] / 2;
		const y1 = MINECART_PICK_CENTER[1] + MINECART_PICK_SIZE[1] / 2;
		assert.ok(y0 <= 0.5, `pick bottom ${y0} should include floor`);
		assert.ok(y1 >= 14, `pick top ${y1} should include cargo`);
	});
});

describe("cushion seating", async () => {
	const { extractRenderableEntities } = await import("../../src/viewer/entityExtract.js");

	it("seats all 16 cushion colors on snow layers and partial blocks", async (t) => {
		let NBT;
		try {
			NBT = await import("nbtify-readonly-typeless");
		} catch {
			t.skip("nbtify not available");
			return;
		}
		const p = join(root, "tests/sampleStructures/cushions.mcstructure");
		if (!existsSync(p)) {
			t.skip("cushions.mcstructure not generated");
			return;
		}
		const colors = [
			"black", "red", "green", "brown",
			"blue", "purple", "cyan", "light_gray",
			"gray", "pink", "lime", "yellow",
			"light_blue", "magenta", "orange", "white"
		];
		const buf = readFileSync(p);
		const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
		const data = (await NBT.read(ab, { endian: "little", strict: false })).data;
		const cushions = extractRenderableEntities(data);
		assert.equal(cushions.length, 215);
		const sy = Number(data.size[1]);
		const sz = Number(data.size[2]);
		const layer = data.structure.block_indices[0];
		const pal = data.structure.palette.default.block_palette;
		const blockAt = (x, y, z) => pal[layer[(x * sy + y) * sz + z]];
		const byKind = new Map();
		for (const e of cushions) {
			assert.equal(e.identifier, "cushion");
			assert.ok(e.variant >= 0 && e.variant <= 15);
			assert.ok(Math.abs((e.pos[0] % 1) - 0.5) < 1e-4);
			assert.ok(Math.abs((e.pos[2] % 1) - 0.5) < 1e-4);
			const [color, kind, yText] = e.customName.split("|");
			assert.equal(color, colors[e.variant]);
			assert.ok(Math.abs(e.pos[1] - Number(yText)) < 1e-4, kind);
			const support = blockAt(Math.floor(e.pos[0]), 1, Math.floor(e.pos[2]));
			const list = byKind.get(kind) ?? [];
			list.push({ e, support });
			byKind.set(kind, list);
		}
		const variants = rows => rows.map(r => r.e.variant).sort((a, b) => a - b);
		for (let h = 0; h <= 7; h++) {
			const rows = byKind.get(`snow-h${h}`);
			assert.equal(rows.length, 16, `snow-h${h}`);
			assert.deepEqual(variants(rows), [...Array(16).keys()]);
			for (const r of rows) {
				assert.equal(r.support.name, "minecraft:snow_layer");
				assert.equal(Number(r.support.states.height), h);
				assert.equal(Number(r.support.states.covered_bit), 0);
				assert.ok(Math.abs(r.e.pos[1] - (1 + (h + 1) * 2 / 16)) < 1e-4);
			}
		}
		for (const b of pal) {
			if (String(b.name).endsWith(":snow_layer")) {
				const h = Number(b.states.height);
				assert.ok(h >= 0 && h <= 7, `snow height ${h}`);
			}
		}
		const snowBlock = byKind.get("snow-block");
		assert.equal(snowBlock.length, 16);
		assert.deepEqual(variants(snowBlock), [...Array(16).keys()]);
		for (const r of snowBlock) {
			assert.equal(r.support.name, "minecraft:snow");
			assert.ok(Math.abs(r.e.pos[1] - 2) < 1e-4);
		}
		const carpet = byKind.get("carpet");
		assert.equal(carpet.length, 16);
		assert.deepEqual(variants(carpet), [...Array(16).keys()]);
		for (const r of carpet) {
			assert.equal(r.support.name, `minecraft:${colors[r.e.variant]}_carpet`);
			assert.ok(Math.abs(r.e.pos[1] - (1 + 1 / 16)) < 1e-4);
		}
		const one = kind => {
			const rows = byKind.get(kind);
			assert.equal(rows?.length, 1, kind);
			return rows[0];
		};
		const eq = (block, key, expected) => {
			const v = block.states[key];
			const label = `${block.name} ${key}`;
			if (typeof expected === "string") assert.equal(v, expected, label);
			else if (typeof expected === "boolean") assert.equal(Number(v), expected ? 1 : 0, label);
			else assert.equal(Number(v), expected, label);
		};
		const feet = (row, pixels) => assert.ok(Math.abs(row.e.pos[1] - (1 + pixels / 16)) < 1e-4, row.e.customName);

		const slabBottom = one("slab-bottom");
		eq(slabBottom.support, "minecraft:vertical_half", "bottom");
		feet(slabBottom, 8);
		const slabTop = one("slab-top");
		eq(slabTop.support, "minecraft:vertical_half", "top");
		feet(slabTop, 16);
		const low = one("stair-low-0");
		eq(low.support, "minecraft:corner", "none");
		eq(low.support, "weirdo_direction", 0);
		eq(low.support, "upside_down_bit", false);
		feet(low, 8);
		const high = one("stair-high-3");
		eq(high.support, "weirdo_direction", 3);
		eq(high.support, "upside_down_bit", false);
		feet(high, 16);
		const up = one("stair-up-1");
		eq(up.support, "weirdo_direction", 1);
		eq(up.support, "upside_down_bit", true);
		feet(up, 16);
		const door = one("trapdoor-bottom-2");
		assert.equal(door.support.name, "minecraft:trapdoor");
		eq(door.support, "direction", 2);
		eq(door.support, "open_bit", false);
		eq(door.support, "upside_down_bit", false);
		feet(door, 3);
		const doorTop = one("trapdoor-top");
		eq(doorTop.support, "upside_down_bit", true);
		eq(doorTop.support, "open_bit", false);
		feet(doorTop, 16);
		const west = one("repeater-west");
		eq(west.support, "minecraft:cardinal_direction", "west");
		eq(west.support, "repeater_delay", 1);
		feet(west, 2);
		const sub = one("comparator-subtract");
		eq(sub.support, "minecraft:cardinal_direction", "east");
		eq(sub.support, "output_subtract_bit", true);
		eq(sub.support, "output_lit_bit", false);
		feet(sub, 2);
		const plate = one("plate-down");
		eq(plate.support, "redstone_signal", 15);
		feet(plate, 0.5);
		const fence = one("fence");
		eq(fence.support, "minecraft:connection_north", false);
		eq(fence.support, "minecraft:connection_east", false);
		feet(fence, 24);
		const wall = one("wall");
		eq(wall.support, "wall_post_bit", true);
		eq(wall.support, "wall_connection_type_north", "none");
		eq(wall.support, "wall_connection_type_east", "none");
		feet(wall, 24);
		const foot = one("bed-foot");
		const head = one("bed-head");
		eq(foot.support, "direction", 0);
		eq(foot.support, "head_piece_bit", false);
		eq(foot.support, "occupied_bit", false);
		eq(head.support, "head_piece_bit", true);
		eq(head.support, "direction", 0);
		feet(foot, 9);
		feet(head, 9);
		assert.equal(Math.floor(head.e.pos[2]), Math.floor(foot.e.pos[2]) + 1);
		const eye = one("portal-eye");
		eq(eye.support, "end_portal_eye_bit", true);
		feet(eye, 16);
		const empty = one("portal-empty");
		eq(empty.support, "end_portal_eye_bit", false);
		feet(empty, 13);
		feet(one("enchanting"), 12);
		feet(one("stonecutter"), 9);
		feet(one("chest"), 14);
		feet(one("campfire"), 7);
		eq(one("campfire").support, "extinguished", true);
		feet(one("daylight"), 6);
		feet(one("candle"), 6);
		feet(one("cake"), 8);
		feet(one("farmland-wet"), 15);
		eq(one("farmland-wet").support, "moisturized_amount", 7);
		feet(one("grass-path"), 15);
		assert.equal(one("grass-path").support.name, "minecraft:grass_path");
		feet(one("double-slab"), 16);
		eq(one("double-slab").support, "minecraft:vertical_half", "bottom");
		feet(one("glass-pane"), 16);
		eq(one("glass-pane").support, "minecraft:connection_south", false);
		feet(one("cauldron"), 16);
		eq(one("cauldron").support, "fill_level", 0);
		eq(one("hopper").support, "facing_direction", 0);
		feet(one("hopper"), 16);
	});
});

describe("vanilla entity models", async () => {
	const {
		VANILLA_ENTITY_MODELS,
		vanillaModelDefFor,
		pickGeometry,
		flattenEntityCubes,
		boxUvLayout,
		cubeRotationPivot,
		transformEntityPoint
	} = await import("../../src/viewer/entityModels.js");

	const SAMPLE_GEO = {
		"minecraft:geometry": [
			{
				description: { identifier: "geometry.minecart.v1.8", texture_width: 64, texture_height: 32 },
				bones: [
					{
						name: "bottom",
						pivot: [0, 6, 0],
						cubes: [{ origin: [-10, -6.5, -1], size: [20, 16, 2], rotation: [90, 0, 0], uv: [0, 10] }]
					},
					{
						name: "left",
						parent: "bottom",
						pivot: [0, 0, 0],
						cubes: [{ origin: [-8, 2.5, 6], size: [16, 8, 2], uv: [0, 0] }]
					}
				]
			}
		]
	};

	it("maps all minecart kinds to Mojang resource_pack paths", () => {
		for (const kind of [
			"minecart",
			"hopper_minecart",
			"chest_minecart",
			"tnt_minecart",
			"command_block_minecart"
		]) {
			const d = VANILLA_ENTITY_MODELS[kind];
			assert.ok(d, kind);
			assert.match(d.entityFile, /^entity\/.*minecart/);
			assert.equal(d.geoFile, "models/entity/minecart.geo.json");
			assert.equal(d.texture, "textures/entity/minecart");
		}
		assert.equal(vanillaModelDefFor("minecraft:hopper_minecart")?.cargo, "hopper");
		assert.equal(vanillaModelDefFor("armor_stand"), null);
	});

	it("picks geometry.minecart.v1.8 when client asks for geometry.minecart", () => {
		const g = pickGeometry(SAMPLE_GEO, ["geometry.minecart", "geometry.minecart.v1.8"]);
		assert.equal(g.description.identifier, "geometry.minecart.v1.8");
	});

	it("flattens bones to cubes using box center when cube has no pivot", () => {
		const g = pickGeometry(SAMPLE_GEO, "geometry.minecart.v1.8");
		const cubes = flattenEntityCubes(g);
		assert.equal(cubes.length, 2);
		assert.deepEqual(cubes[0].size, [20, 16, 2]);
		// origin [-10,-6.5,-1] + size/2 → [0, 1.5, 0]  (NOT bone pivot [0,6,0])
		assert.deepEqual(cubes[0].pivot, [0, 1.5, 0]);
		assert.deepEqual(cubes[0].rotation, [90, 0, 0]);
		assert.deepEqual(cubes[1].uv, [0, 0]);
		assert.deepEqual(cubeRotationPivot([-10, -6.5, -1], [20, 16, 2], null), [0, 1.5, 0]);
		assert.deepEqual(cubeRotationPivot([0, 0, 0], [2, 2, 2], [1, 0, 0]), [1, 0, 0]);
	});

	it("rotates minecart floor 90° X around box center into a 20×16 tub bottom", () => {
		const g = pickGeometry(SAMPLE_GEO, "geometry.minecart.v1.8");
		const floor = flattenEntityCubes(g)[0];
		const [x, y, z] = floor.origin;
		const [w, h, d] = floor.size;
		const corners = [
			[x, y, z],
			[x + w, y, z],
			[x, y + h, z],
			[x + w, y + h, z],
			[x, y, z + d],
			[x + w, y, z + d],
			[x, y + h, z + d],
			[x + w, y + h, z + d]
		].map(p => transformEntityPoint(p, floor));
		const xs = corners.map(p => p[0]);
		const ys = corners.map(p => p[1]);
		const zs = corners.map(p => p[2]);
		assert.ok(Math.min(...xs) > -10.01 && Math.max(...xs) < 10.01, `x ${Math.min(...xs)}..${Math.max(...xs)}`);
		assert.ok(Math.min(...ys) > 0.49 && Math.max(...ys) < 2.51, `y ${Math.min(...ys)}..${Math.max(...ys)}`);
		assert.ok(Math.min(...zs) > -8.01 && Math.max(...zs) < 8.01, `z ${Math.min(...zs)}..${Math.max(...zs)}`);
	});

	it("rotates minecart back wall 270° Y around box center onto x=-10..-8", () => {
		const origin = [-17, 2.5, -1];
		const size = [16, 8, 2];
		const cube = {
			origin,
			size,
			rotation: [0, 270, 0],
			pivot: cubeRotationPivot(origin, size, null),
			boneChain: []
		};
		const [x, y, z] = origin;
		const [w, h, d] = size;
		const corners = [
			[x, y, z], [x + w, y, z], [x, y + h, z], [x + w, y + h, z],
			[x, y, z + d], [x + w, y, z + d], [x, y + h, z + d], [x + w, y + h, z + d]
		].map(p => transformEntityPoint(p, cube));
		const xs = corners.map(p => p[0]);
		const ys = corners.map(p => p[1]);
		const zs = corners.map(p => p[2]);
		assert.ok(Math.min(...xs) > -10.01 && Math.max(...xs) < -7.99, `x ${Math.min(...xs)}..${Math.max(...xs)}`);
		assert.ok(Math.min(...ys) > 2.49 && Math.max(...ys) < 10.51, `y ${Math.min(...ys)}..${Math.max(...ys)}`);
		assert.ok(Math.min(...zs) > -8.01 && Math.max(...zs) < 8.01, `z ${Math.min(...zs)}..${Math.max(...zs)}`);
	});

	it("box UV layout has six faces in texture pixels", () => {
		const uv = boxUvLayout([20, 8, 2], true);
		assert.deepEqual(uv.north.uv_size, [20, 8]);
		assert.deepEqual(uv.up.uv_size, [20, 2]);
		assert.ok(uv.west.uv[0] > 0);
	});
});

describe("minecart cargo blocks", async () => {
	const {
		CARGO_BLOCKS,
		CARGO_SCALE,
		CARGO_FLOOR_Y,
		cargoKindsNeeded,
		cargoPaletteEntries,
		placeCargoMesh,
		polyMeshTemplateToGeometry
	} = await import("../../src/viewer/entityCargo.js");

	it("maps subtypes to official palette blocks", () => {
		assert.equal(CARGO_BLOCKS.chest.name, "chest");
		assert.equal(CARGO_BLOCKS.hopper.name, "hopper");
		assert.equal(CARGO_BLOCKS.hopper.states.facing_direction, 0);
		assert.equal(CARGO_BLOCKS.tnt.name, "tnt");
		assert.equal(CARGO_BLOCKS.command.name, "command_block");
		assert.equal(CARGO_SCALE, 0.75);
		for (const b of Object.values(CARGO_BLOCKS)) {
			assert.equal(b.name.includes(":"), false, `${b.name} must be un-namespaced for blocks.json`);
		}
	});

	it("collects cargo kinds from entity identifiers", () => {
		const kinds = cargoKindsNeeded([
			{ identifier: "minecart" },
			{ identifier: "minecraft:hopper_minecart" },
			{ identifier: "chest_minecart" },
			{ identifier: "armor_stand" }
		]);
		assert.deepEqual([...kinds].sort(), ["chest", "hopper"]);
		const entries = cargoPaletteEntries([{ identifier: "tnt_minecart" }]);
		assert.equal(entries.length, 1);
		assert.equal(entries[0].kind, "tnt");
		assert.equal(entries[0].block.name, "tnt");
	});

	it("sits cargo on the hull floor at 0.75 scale", () => {
		const mesh = {
			scale: { setScalar(s) { this._s = s; } },
			position: { set(x, y, z) { this._p = [x, y, z]; } },
			frustumCulled: true
		};
		placeCargoMesh(mesh);
		assert.equal(mesh.scale._s, CARGO_SCALE);
		assert.equal(mesh.position._p[1], CARGO_FLOOR_Y);
		assert.equal(mesh.position._p[0], -8 * CARGO_SCALE);
		assert.equal(mesh.frustumCulled, false);
	});

	it("polyMeshTemplateToGeometry returns null without faces", () => {
		assert.equal(polyMeshTemplateToGeometry({}, []), null);
		assert.equal(polyMeshTemplateToGeometry({}, null), null);
	});
});

describe("itemFrameItems", async () => {
	const {
		extractItemFramePlacements,
		frameOutwardNormal,
		frameFacingEulerDeg
	} = await import("../../src/viewer/itemFrameItems.js");

	it("extracts Item from ItemFrame / GlowItemFrame block entities", () => {
		const blocks = new Map();
		blocks.set("1,0,2", {
			x: 1, y: 0, z: 2,
			name: "frame",
			states: { facing_direction: 3 },
			blockEntityId: "ItemFrame",
			itemRotation: 90,
			items: [{ name: "diamond", count: 1, slot: null, damage: 0 }]
		});
		blocks.set("0,1,0", {
			x: 0, y: 1, z: 0,
			name: "glow_frame",
			states: { facing_direction: 2 },
			blockEntityId: "GlowItemFrame",
			itemRotation: 0,
			items: [{ name: "apple", count: 1, slot: null, damage: 0 }]
		});
		blocks.set("2,0,0", {
			x: 2, y: 0, z: 0,
			name: "frame",
			states: { facing_direction: 2 },
			blockEntityId: "ItemFrame",
			itemRotation: 0,
			items: []
		});
		const pl = extractItemFramePlacements({ blocks, entities: [] });
		assert.equal(pl.length, 2);
		const d = pl.find(p => p.itemName === "diamond");
		assert.ok(d);
		assert.equal(d.facing, 3);
		assert.equal(d.itemRotationDeg, 90);
		assert.equal(d.glow, false);
		const a = pl.find(p => p.itemName === "apple");
		assert.ok(a);
		assert.equal(a.glow, true);
	});

	it("maps facing_direction to frame eulers and outward normals", () => {
		assert.deepEqual(frameFacingEulerDeg(2), [0, 0, 0]);
		assert.deepEqual(frameFacingEulerDeg(3), [0, 180, 0]);
		// Default north: local +Z stays +Z (BlockGeoMaker identity)
		const n2 = frameOutwardNormal(2);
		assert.ok(Math.abs(n2[2] - 1) < 1e-6, `north normal z=${n2[2]}`);
		// South: local +Z rotated 180 Y → -Z
		const n3 = frameOutwardNormal(3);
		assert.ok(Math.abs(n3[2] + 1) < 1e-6, `south normal z=${n3[2]}`);
		// Up: BlockGeoMaker [-90,0,0] → plate local +Z goes to -Y (geo)
		const n1 = frameOutwardNormal(1);
		assert.ok(Math.abs(n1[1] + 1) < 1e-6, `up normal y=${n1[1]}`);
		// Down: [90,0,0] → +Y
		const n0 = frameOutwardNormal(0);
		assert.ok(Math.abs(n0[1] - 1) < 1e-6, `down normal y=${n0[1]}`);
	});

	it("maps plate through structurePosToThree (Z-flip) so icon is not ~1 block out", async () => {
		const { structurePosToThree } = await import("../../src/viewer/entityMeshes.js");
		// Default north frame: plate at high geo Z, then mesh z' = 16 - geoZ ≈ 0.65
		const bx = 1, by = 0, bz = 2;
		const geoZ = 15.5 - 0.15;
		const [, , tz] = structurePosToThree(bx + 0.5, by + 0.5, bz + geoZ / 16);
		const cornerZ = -16 * bz - 16;
		const meshLocalZ = tz - cornerZ;
		assert.ok(meshLocalZ > 0 && meshLocalZ < 2,
			`north plate mesh-local Z should be near 0 after flip, got ${meshLocalZ}`);
		// Without Z-flip we'd land near mesh-local Z ≈ 15.35 (one block off)
		assert.ok(Math.abs(meshLocalZ - (16 - geoZ)) < 1e-6);
	});

	it("places up-facing plate near block floor (not ceiling / 1 block high)", async () => {
		const { framePlateLocalGeo } = await import("../../src/viewer/itemFrameItems.js");
		const [ux, uy, uz] = framePlateLocalGeo(1);
		// BlockGeoMaker up: plate at low Y (~0.65), not high Y (~15.35)
		assert.ok(uy < 2, `up plate geo Y should be near floor, got ${uy}`);
		assert.ok(uy > 0, `up plate geo Y should be positive, got ${uy}`);
		assert.ok(Math.abs(ux - 8) < 0.01 && Math.abs(uz - 8) < 0.01);
		const [, dy] = framePlateLocalGeo(0);
		assert.ok(dy > 14, `down plate geo Y should be near ceiling, got ${dy}`);
	});
});

describe("containerUi composter + brewing", async () => {
	const {
		resolveContainerKind,
		layoutForKind,
		readComposterFillLevel
	} = await import("../../src/viewer/containerUi.js");

	it("resolves composter and brewing kinds", () => {
		assert.equal(resolveContainerKind({ name: "composter" }), "composter");
		assert.equal(resolveContainerKind({ name: "minecraft:composter" }), "composter");
		assert.equal(resolveContainerKind({ name: "brewing_stand" }), "brewing");
		assert.equal(resolveContainerKind({ blockEntityId: "BrewingStand" }), "brewing");
		assert.equal(layoutForKind("composter").layout, "composter");
		assert.equal(layoutForKind("brewing").slotCount, 5);
	});

	it("reads Bedrock composter_fill_level 0–8", () => {
		assert.equal(readComposterFillLevel({ composter_fill_level: 0 }), 0);
		assert.equal(readComposterFillLevel({ composter_fill_level: 5 }), 5);
		assert.equal(readComposterFillLevel({ composter_fill_level: 8 }), 8);
		assert.equal(readComposterFillLevel({ level: 3 }), 3);
		assert.equal(readComposterFillLevel({}), null);
		assert.equal(readComposterFillLevel({ composter_fill_level: 99 }), 8);
	});

	it("uses a 2×3 grid for a chiseled bookshelf", async () => {
		assert.equal(resolveContainerKind({ name: "chiseled_bookshelf" }), "chiseled_bookshelf");
		assert.equal(resolveContainerKind({ name: "minecraft:chiseled_bookshelf" }), "chiseled_bookshelf");
		assert.equal(resolveContainerKind({ blockEntityId: "ChiseledBookshelf" }), "chiseled_bookshelf");
		assert.equal(resolveContainerKind({ name: "bookshelf" }), "generic");
		const lay = layoutForKind("chiseled_bookshelf");
		assert.equal(lay.title, "Chiseled Bookshelf");
		assert.equal(lay.slotCount, 6);
		assert.equal(lay.rows, 2);
		assert.equal(lay.cols, 3);
		assert.equal(lay.layout, "grid");
		const { fillSlots } = await import("../../src/viewer/containerUi.js");
		const slots = fillSlots(
			[
				{ name: "book", count: 1, slot: 0 },
				{ name: "enchanted_book", count: 1, slot: 5 }
			],
			lay.slotCount
		);
		assert.equal(slots.length, 6);
		assert.equal(slots[0]?.name, "book");
		assert.equal(slots[1], null);
		assert.equal(slots[5]?.name, "enchanted_book");
	});

	it("resolves sign, lectern, redstone_wire kinds", () => {
		assert.equal(resolveContainerKind({ name: "oak_sign", blockEntityId: "Sign" }), "sign");
		assert.equal(resolveContainerKind({ name: "lectern", blockEntityId: "Lectern" }), "lectern");
		assert.equal(resolveContainerKind({ name: "redstone_wire" }), "redstone_wire");
		assert.equal(layoutForKind("sign").layout, "sign");
		assert.equal(layoutForKind("lectern").layout, "lectern");
		assert.equal(layoutForKind("redstone_wire").layout, "redstone");
	});

	it("uses 54-slot large chest layout when the pick is a paired half", async () => {
		assert.equal(
			resolveContainerKind({ name: "chest", doubleChest: { half: "left", partnerKey: "1,0,0" } }),
			"double_chest"
		);
		const lay = layoutForKind("double_chest");
		assert.equal(lay.slotCount, 54);
		assert.equal(lay.rows, 6);
		assert.equal(lay.cols, 9);
		assert.equal(lay.layout, "double_chest");
		const { fillSlots } = await import("../../src/viewer/containerUi.js");
		const slots = fillSlots(
			[
				{ name: "dirt", count: 1, slot: 0 },
				{ name: "diamond", count: 2, slot: 27 }
			],
			54
		);
		assert.equal(slots.length, 54);
		assert.equal(slots[0]?.name, "dirt");
		assert.equal(slots[27]?.name, "diamond");
		assert.equal(slots[1], null);
	});
});

describe("doubleChest", async () => {
	const {
		classifyChestPair,
		chestFacing,
		isChestBlockName
	} = await import("../../src/viewer/doubleChest.js");

	it("identifies chest block names", () => {
		assert.equal(isChestBlockName("minecraft:chest"), true);
		assert.equal(isChestBlockName("trapped_chest"), true);
		assert.equal(isChestBlockName("ender_chest"), false);
	});

	it("classifies pair offset vs facing", () => {
		const c = classifyChestPair("north", 1, 0); // pair east of north-facing → this is left
		assert.ok(c);
		assert.equal(c.half, "left");
		assert.equal(classifyChestPair("north", -1, 0).half, "right");
		assert.equal(classifyChestPair("south", -1, 0).half, "left");
		assert.equal(classifyChestPair("east", 0, 1).half, "left");
		assert.equal(classifyChestPair("west", 0, -1).half, "left");
		assert.equal(chestFacing({ "minecraft:cardinal_direction": "west" }), "west");
	});

	it("N/S double chests need preview instance X-mirror; E/W need Z-mirror", async () => {
		const {
			doubleChestNeedsPreviewXMirror,
			doubleChestNeedsPreviewZMirror
		} = await import("../../src/viewer/doubleChest.js");
		const ns = {
			bLayers_block_shape: "chest_large<textures/entity/chest/double_normal>",
			states: { "minecraft:cardinal_direction": "north" }
		};
		const ew = {
			bLayers_block_shape: "chest_large<textures/entity/chest/double_normal>",
			states: { "minecraft:cardinal_direction": "east" }
		};
		const west = {
			bLayers_block_shape: "chest_large<textures/entity/chest/double_normal>",
			states: { "minecraft:cardinal_direction": "west" }
		};
		assert.equal(doubleChestNeedsPreviewXMirror(ns), true);
		assert.equal(doubleChestNeedsPreviewZMirror(ns), false);
		assert.equal(doubleChestNeedsPreviewXMirror(ew), false);
		assert.equal(doubleChestNeedsPreviewZMirror(ew), true);
		assert.equal(doubleChestNeedsPreviewZMirror(west), true);
		assert.equal(doubleChestNeedsPreviewXMirror(west), false);
	});

	it("nbtNumber unwraps typed values", async () => {
		const { nbtNumber } = await import("../../src/viewer/doubleChest.js");
		assert.equal(nbtNumber(11), 11);
		assert.equal(nbtNumber({ value: 11 }), 11);
		assert.ok(Number.isNaN(nbtNumber(null)));
	});

	it("palette lead uses chest_large; partner is skipped", () => {
		const js = readFileSync(join(root, "src/viewer/doubleChest.js"), "utf8");
		const geo = readFileSync(join(root, "src/data/blockShapeGeos.json"), "utf8");
		assert.match(js, /chest_large</);
		assert.match(js, /chest_double_skip/);
		assert.match(js, /double_normal/);
		assert.match(geo, /"chest_large"/);
		assert.match(geo, /"box_uv"/);
		assert.match(geo, /128, 64/);
		assert.match(geo, /"size": \[30, 10, 14\]/);
		assert.doesNotMatch(geo, /sdb_chest_latch/);
		assert.doesNotMatch(js, /basi_pair_yaw/);
	});

	it("merges half inventories into 54 slots (left 0–26, right 27–53)", async () => {
		const { mergeDoubleChestInventories, largeChestTitle } = await import(
			"../../src/viewer/doubleChest.js"
		);
		const merged = mergeDoubleChestInventories(
			[{ name: "dirt", count: 1, slot: 0 }],
			[{ name: "diamond", count: 2, slot: 0 }]
		);
		assert.equal(merged.length, 2);
		assert.equal(merged.find(i => i.name === "dirt")?.slot, 0);
		assert.equal(merged.find(i => i.name === "diamond")?.slot, 27);
		const already = mergeDoubleChestInventories(
			[{ name: "stone", count: 1, slot: 40 }],
			[]
		);
		assert.equal(already[0].slot, 40);
		assert.equal(largeChestTitle("trapped_chest"), "Large Trapped Chest");
		assert.equal(largeChestTitle("minecraft:chest"), "Large Chest");
		assert.equal(largeChestTitle("oxidized_copper_chest"), "Large Oxidized Copper Chest");
	});

	it("applyDoubleChestPalette remaps pairx/pairz to left/right geos", async () => {
		const { applyDoubleChestPalette } = await import("../../src/viewer/doubleChest.js");
		const nbt = {
			size: [2, 1, 1],
			structure_world_origin: [0, 0, 0],
			structure: {
				palette: {
					default: {
						block_position_data: {
							0: { block_entity_data: { id: "Chest", x: 0, y: 0, z: 0, pairx: 1, pairz: 0 } },
							1: { block_entity_data: { id: "Chest", x: 1, y: 0, z: 0, pairx: 0, pairz: 0 } }
						}
					}
				}
			}
		};
		const palette = [{
			name: "minecraft:chest",
			states: { "minecraft:cardinal_direction": "north" },
			version: 18168866
		}];
		const indices = [new Int32Array([0, 0]), new Int32Array([-1, -1])];
		const r = applyDoubleChestPalette(nbt, palette, indices);
		assert.equal(r.pairedCount, 2);
		assert.equal(r.palette[r.indices[0][0]].newerThanSchemas, undefined);
		assert.equal(r.palette[r.indices[0][0]].version, 18168866);
		assert.equal(r.palette[r.indices[0][1]].version, 18168866);
		assert.equal(r.palette[r.indices[0][0]].states.bLayers_chest_half, "left");
		assert.equal(r.palette[r.indices[0][1]].states.bLayers_chest_half, "right");
		assert.match(r.palette[r.indices[0][0]].bLayers_block_shape, /chest_large</);

		// Two north pairs. The later pair is a newer source row. Its left half
		// must not share the older left row, or the count would miss that cell.
		const mixedNbt = {
			size: [2, 1, 2],
			structure_world_origin: [0, 0, 0],
			structure: {
				palette: {
					default: {
						block_position_data: {
							0: { block_entity_data: { id: "Chest", x: 0, y: 0, z: 0, pairx: 1, pairz: 0 } },
							1: { block_entity_data: { id: "Chest", x: 0, y: 0, z: 1, pairx: 1, pairz: 1 } },
							2: { block_entity_data: { id: "Chest", x: 1, y: 0, z: 0, pairx: 0, pairz: 0 } },
							3: { block_entity_data: { id: "Chest", x: 1, y: 0, z: 1, pairx: 0, pairz: 1 } }
						}
					}
				}
			}
		};
		const mixedPal = [
			{ name: "minecraft:chest", states: { "minecraft:cardinal_direction": "north" } },
			{ name: "minecraft:chest", states: { "minecraft:cardinal_direction": "north" }, version: 18168866 }
		];
		const mixedIdx = [new Int32Array([0, 1, 0, 1]), new Int32Array([-1, -1, -1, -1])];
		const mixed = applyDoubleChestPalette(mixedNbt, mixedPal, mixedIdx);
		assert.equal(mixed.pairedCount, 4);
		assert.notEqual(mixed.indices[0][0], mixed.indices[0][1]);
		assert.equal(mixed.palette[mixed.indices[0][0]].version, undefined);
		assert.equal(mixed.palette[mixed.indices[0][1]].version, 18168866);
		assert.equal(mixed.palette[mixed.indices[0][0]].states.bLayers_chest_half, "left");
		assert.equal(mixed.palette[mixed.indices[0][1]].states.bLayers_chest_half, "left");

		// East-facing pair along Z: player-left is the northern cell; mesh Z-mirror
		// (not swapping halves) is what covers the southern partner.
		const eastNbt = {
			size: [1, 1, 2],
			structure_world_origin: [0, 0, 0],
			structure: {
				palette: {
					default: {
						block_position_data: {
							0: { block_entity_data: { id: "Chest", x: 0, y: 0, z: 0, pairx: 0, pairz: 1 } },
							1: { block_entity_data: { id: "Chest", x: 0, y: 0, z: 1, pairx: 0, pairz: 0 } }
						}
					}
				}
			}
		};
		const eastPal = [{ name: "minecraft:chest", states: { "minecraft:cardinal_direction": "east" } }];
		const eastIdx = [new Int32Array([0, 0]), new Int32Array([-1, -1])];
		const er = applyDoubleChestPalette(eastNbt, eastPal, eastIdx);
		assert.equal(er.pairedCount, 2);
		assert.equal(er.palette[er.indices[0][0]].states.bLayers_chest_half, "left");
		assert.equal(er.palette[er.indices[0][1]].states.bLayers_chest_half, "right");
		assert.match(er.palette[er.indices[0][0]].bLayers_block_shape, /chest_large</);
		const mesh = readFileSync(join(root, "src/viewer/systems/BlockGeoSystem.js"), "utf8");
		assert.match(mesh, /mirrorZ/);
		const layers = readFileSync(join(root, "src/viewer/systems/LayerMeshSystem.js"), "utf8");
		assert.match(layers, /doubleChestNeedsPreviewZMirror/);
		assert.equal(r.palette[r.indices[0][1]].bLayers_block_shape, "chest_double_skip");
	});

	it("maps partner direction to left/right from the front", () => {
		assert.equal(classifyChestPair("north", 1, 0)?.half, "left");
		assert.equal(classifyChestPair("north", -1, 0)?.half, "right");
		assert.equal(classifyChestPair("south", -1, 0)?.half, "left");
		assert.equal(classifyChestPair("south", 1, 0)?.half, "right");
		assert.equal(classifyChestPair("east", 0, 1)?.half, "left");
		assert.equal(classifyChestPair("east", 0, -1)?.half, "right");
		assert.equal(classifyChestPair("west", 0, -1)?.half, "left");
		assert.equal(classifyChestPair("west", 0, 1)?.half, "right");
		assert.equal(classifyChestPair("north", 0, 0), null);
		assert.equal(classifyChestPair("north", 1, 1), null);
	});
});

describe("minecart pitch", async () => {
	const { pitchFromRailDirection, structurePosToThree } = await import(
		"../../src/viewer/entityMeshes.js"
	);

	it("maps structure pos", () => {
		const c = structurePosToThree(4.5, 0, 5.5);
		assert.equal(c[0], -72);
		assert.equal(c[2], -88);
	});

	it("pitches on ascending rails", () => {
		assert.notEqual(pitchFromRailDirection(2, 0), 0);
		assert.equal(pitchFromRailDirection(0, 0), 0);
	});
});
