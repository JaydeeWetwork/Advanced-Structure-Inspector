/**
 * Unit tests for Bedrock Layers (Node --test).
 * Pure logic + lightweight mocks — no browser / WebGL required.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../..");

// Minimal DOMException for Node if missing
if (typeof globalThis.DOMException === "undefined") {
	globalThis.DOMException = class DOMException extends Error {
		constructor(message, name = "Error") {
			super(message);
			this.name = name;
		}
	};
}

const { throwIfAborted, isAbortError } = await import("../../src/viewer/abortUtil.js");
const {
	cloneBlockIndices,
	normalizeVec3,
	mergeMultiplePalettesAndIndices,
	IGNORED_BLOCKS
} = await import("../../src/viewer/paletteCore.js");
const {
	getCachedDataFile,
	clearDataFileCache,
	getCachedFileBuild,
	clearAllPreviewCaches
} = await import("../../src/viewer/previewCache.js");
const { countStructureEntities } = await import("../../src/viewer/entityCount.js");
const StructureCatalog = (await import("../../src/viewer/catalog.js")).default;

// ---- abortUtil -----------------------------------------------------------

describe("partitionTemplateFaces", async () => {
	const { partitionTemplateFaces } = await import("../../src/viewer/systems/BlockGeoSystem.js");

	it("splits doubleSide cards from volumetric faces", () => {
		const faces = [
			{ normal: [0, 1, 0] },
			{ normal: [1, 0, 0], doubleSide: true },
			{ normal: [0, 0, 1], doubleSide: false }
		];
		const { volume, cards } = partitionTemplateFaces(faces);
		assert.equal(volume.length, 2);
		assert.equal(cards.length, 1);
		assert.equal(cards[0].normal[0], 1);
	});

	it("treats empty/missing templates as no geos", () => {
		assert.deepEqual(partitionTemplateFaces(null), { volume: [], cards: [] });
		assert.deepEqual(partitionTemplateFaces([]), { volume: [], cards: [] });
	});
});

describe("waterlog face inset", async () => {
	const { insetCellShellFaces, WATERLOG_FACE_INSET } = await import("../../src/viewer/systems/BlockGeoSystem.js");

	it("pulls cell-shell vertices in and leaves a source top at 14", () => {
		const faces = [{
			vertices: [
				{ pos: [0, 0, 0] },
				{ pos: [16, 14, 16] },
				{ pos: [8, 14, 8] }
			]
		}];
		const out = insetCellShellFaces(faces);
		assert.deepEqual(out[0].vertices[0].pos, [WATERLOG_FACE_INSET, WATERLOG_FACE_INSET, WATERLOG_FACE_INSET]);
		assert.deepEqual(out[0].vertices[1].pos, [16 - WATERLOG_FACE_INSET, 14, 16 - WATERLOG_FACE_INSET]);
		assert.deepEqual(out[0].vertices[2].pos, [8, 14, 8]);
		assert.deepEqual(faces[0].vertices[0].pos, [0, 0, 0]);
	});
});

describe("appearance fallback", async () => {
	const { resolveBlockShapeName } = await import("../../src/viewer/appearanceFallback.js");

	it("uses table hits and unit-cube fallback", () => {
		const individual = { chest: "chest" };
		const patterns = [[/_stairs$/, "stairs"], [/_planks$/, "block"]];
		assert.deepEqual(resolveBlockShapeName("chest", individual, patterns), {
			shape: "chest",
			fallback: false
		});
		assert.deepEqual(resolveBlockShapeName("oak_stairs", individual, patterns), {
			shape: "stairs",
			fallback: false
		});
		assert.deepEqual(resolveBlockShapeName("oak_planks", individual, patterns), {
			shape: "block",
			fallback: false
		});
		assert.deepEqual(resolveBlockShapeName("completely_unknown_mod_block", individual, patterns), {
			shape: "block",
			fallback: true
		});
	});

	it("maps oak_standing_sign / oak_wall_sign to the oak sign entity texture, not prefix oak_sign", async () => {
		const { stripJsonc } = await import("../../src/utils/conversions.js");
		const shapes = JSON.parse(stripJsonc(readFileSync(join(root, "src/data/blockShapes.json"), "utf8")));
		const individual = shapes.individual_blocks ?? {};
		const patterns = Object.entries(shapes.patterns ?? {}).map(([rule, shape]) => [
			new RegExp(rule),
			shape
		]);
		assert.deepEqual(resolveBlockShapeName("straw_bed", individual, patterns), {
			shape: "straw_bed",
			fallback: false
		});
		assert.deepEqual(resolveBlockShapeName("shelf_mushroom", individual, patterns), {
			shape: "shelf_mushroom",
			fallback: false
		});
		const defsText = readFileSync(join(root, "src/data/blockStateDefinitions.json"), "utf8");
		const strawSlice = defsText.slice(
			defsText.indexOf('"straw_bed"'),
			defsText.indexOf('"shelf_mushroom"')
		);
		assert.match(strawSlice, /"south": \[0, 0, 0\]/);
		assert.match(strawSlice, /"east": \[0, -90, 0\]/);
		assert.match(strawSlice, /"west": \[0, 90, 0\]/);
		assert.doesNotMatch(strawSlice, /"direction":/);
		assert.match(defsText, /"bed":\s*\{[\s\S]*?"0": \[0, 180, 0\]/);
		const standing = resolveBlockShapeName("oak_standing_sign", individual, patterns);
		const wall = resolveBlockShapeName("oak_wall_sign", individual, patterns);
		const legacyStanding = resolveBlockShapeName("standing_sign", individual, patterns);
		const legacyWall = resolveBlockShapeName("wall_sign", individual, patterns);
		assert.equal(standing.shape, "standing_sign<textures/entity/sign>");
		assert.equal(wall.shape, "wall_sign<textures/entity/sign>");
		assert.equal(standing.shape, legacyStanding.shape);
		assert.equal(wall.shape, legacyWall.shape);
		assert.deepEqual(resolveBlockShapeName("unknown", individual, patterns), {
			shape: "block",
			fallback: false
		});
		assert.equal(resolveBlockShapeName("completely_unknown_mod_block", individual, patterns).fallback, true);
		assert.notEqual(standing.shape, "standing_sign_prefix");
		assert.notEqual(wall.shape, "wall_sign_prefix");
	});

	it("names missing geos and checkerboard keys on one appearance line", async () => {
		const { formatAppearanceLog } = await import("../../src/viewer/appearanceFallback.js");
		assert.equal(
			formatAppearanceLog({ defaultCubeCount: 2, missingGeo: ["mod_block"], checkerboard: ["no_tex"] }),
			"[bLayers] appearance: 2 default cube(s); no geo: mod_block; checkerboard: no_tex"
		);
		assert.equal(formatAppearanceLog({ defaultCubeCount: 4 }), "[bLayers] appearance: 4 default cube(s)");
		const { formatVersionGapNote, countNewerBlocks } = await import("../../src/viewer/appearanceFallback.js");
		assert.equal(
			formatVersionGapNote({ placeholderCount: 2, newerCount: 3 }),
			"3 blocks are newer than the upgrade data, so their states were left as saved, and 2 of them are shown as placeholders."
		);
		assert.equal(
			formatVersionGapNote({ placeholderCount: 1, newerCount: 1 }),
			"1 block is newer than the upgrade data, so its states were left as saved, and it is shown as a placeholder."
		);
		assert.equal(
			formatVersionGapNote({ placeholderCount: 0, newerCount: 2 }),
			"2 blocks are newer than the upgrade data, so their states were left as saved."
		);
		assert.equal(formatVersionGapNote({ placeholderCount: 0, newerCount: 0 }), "");
		const counted = countNewerBlocks({
			palette: [
				{ name: "future_block", version: 18168866 },
				{ name: "oak_stairs", version: 18168866 },
				{ name: "stone", version: 18168865 }
			],
			indices: [new Int32Array([0, 0, 1, 2, -1])],
			unmappedNames: ["future_block"]
		});
		assert.deepEqual(counted, { newerCount: 3, placeholderCount: 2 });
	});

	it("coral floor fans are a four-blade cross; wall fans are sheets hinged on the south face", () => {
		const geos = readFileSync(join(root, "src/data/blockShapeGeos.json"), "utf8");
		const floor = geos.slice(geos.indexOf('"coral_fan":'), geos.indexOf('"coral_wall_fan":'));
		assert.match(floor, /"size": \[16, 0, 16\]/);
		assert.match(floor, /"pos": \[8, 0, 0\]/);
		assert.match(floor, /"pos": \[-8, 0, 0\]/);
		assert.match(floor, /"pos": \[0, 0, 8\]/);
		assert.match(floor, /"pos": \[0, 0, -8\]/);
		assert.match(floor, /"rot": \[0, 0, -22\.5\]/);
		assert.match(floor, /"rot": \[0, 0, 22\.5\]/);
		assert.match(floor, /"rot": \[22\.5, 0, 0\]/);
		assert.match(floor, /"rot": \[-22\.5, 0, 0\]/);
		assert.doesNotMatch(floor, /"size": \[16, 0, 8\]/);
		assert.doesNotMatch(floor, /"size": \[0, 16, 16\]/);
		const wall = geos.slice(geos.indexOf('"coral_wall_fan":'), geos.indexOf('"lightning_rod":'));
		assert.match(wall, /"size": \[16, 0, 17\.3183\]/);
		assert.match(wall, /"pivot": \[8, 8, 14\]/);
		assert.match(wall, /"rot": \[22\.5, 0, 0\]/);
		assert.match(wall, /"rot": \[-22\.5, 0, 0\]/);
		assert.doesNotMatch(wall, /"size": \[16, 8, 0\]/);
		assert.doesNotMatch(wall, /"pivot": \[8, 8, 0\]/);
	});
});

describe("fence neighbor connections", () => {
	const shapes = {
		individual_blocks: {
			stone: "block",
			glass: "block",
			oak_leaves: "block",
			structure_block: "block"
		},
		patterns: {
			"_fence$": "fence",
			"fence_gate$": "fence_gate",
			"glass_pane$": "glass_pane",
			"_wall$": "wall"
		}
	};

	function grid(sx, sy, sz, cells) {
		const layer0 = new Int32Array(sx * sy * sz).fill(-1);
		const palette = [];
		const idOf = new Map();
		const put = (x, y, z, block) => {
			const key = JSON.stringify(block);
			let pi = idOf.get(key);
			if (pi == null) {
				pi = palette.length;
				palette.push(block);
				idOf.set(key, pi);
			}
			layer0[(x * sy + y) * sz + z] = pi;
		};
		for (const cell of cells) put(cell.x, cell.y, cell.z, cell.block);
		return { size: [sx, sy, sz], palette, indices: [layer0, new Int32Array(layer0.length).fill(-1)] };
	}

	it("joins adjacent fences and a sturdy block, and skips glass and the outside", async () => {
		const { applyFenceConnections } = await import("../../src/viewer/fenceConnections.js");
		const { size, palette, indices } = grid(3, 1, 3, [
			{ x: 1, y: 0, z: 1, block: { name: "oak_fence" } },
			{ x: 2, y: 0, z: 1, block: { name: "oak_fence" } },
			{ x: 1, y: 0, z: 0, block: { name: "stone" } },
			{ x: 0, y: 0, z: 1, block: { name: "glass" } }
		]);
		const r = applyFenceConnections(size, palette, indices, shapes);
		const at = (x, z) => r.palette[r.indices[0][(x * 1 + 0) * 3 + z]];
		const mid = at(1, 1).states;
		const east = at(2, 1).states;
		assert.equal(mid["minecraft:connection_east"], 1);
		assert.equal(mid["minecraft:connection_north"], 1);
		assert.equal(mid["minecraft:connection_west"], 0);
		assert.equal(mid["minecraft:connection_south"], 0);
		assert.equal(east["minecraft:connection_west"], 1);
		assert.equal(east["minecraft:connection_east"], 0);
		assert.equal(r.linked, 2);
	});

	it("keeps connection flags that the file already stored", async () => {
		const { applyFenceConnections } = await import("../../src/viewer/fenceConnections.js");
		const block = {
			name: "poplar_fence",
			states: {
				"minecraft:connection_north": 1,
				"minecraft:connection_east": 0,
				"minecraft:connection_south": 0,
				"minecraft:connection_west": 0
			}
		};
		const { size, palette, indices } = grid(1, 1, 1, [
			{ x: 0, y: 0, z: 0, block }
		]);
		const r = applyFenceConnections(size, palette, indices, shapes);
		assert.equal(r.linked, 0);
		assert.equal(r.indices[0][0], 0);
		assert.equal(r.palette[0].states["minecraft:connection_north"], 1);
	});

	it("fills connections when every flag is 0", async () => {
		const { applyFenceConnections } = await import("../../src/viewer/fenceConnections.js");
		const zeros = {
			"minecraft:connection_north": 0,
			"minecraft:connection_east": 0,
			"minecraft:connection_south": 0,
			"minecraft:connection_west": 0
		};
		const { size, palette, indices } = grid(2, 1, 1, [
			{ x: 0, y: 0, z: 0, block: { name: "minecraft:oak_fence", states: { ...zeros } } },
			{ x: 1, y: 0, z: 0, block: { name: "minecraft:oak_fence", states: { ...zeros } } }
		]);
		const r = applyFenceConnections(size, palette, indices, shapes);
		const west = r.palette[r.indices[0][0]].states;
		const east = r.palette[r.indices[0][1]].states;
		assert.equal(r.linked, 2);
		assert.equal(west["minecraft:connection_east"], 1);
		assert.equal(west["minecraft:connection_west"], 0);
		assert.equal(east["minecraft:connection_west"], 1);
		assert.equal(east["minecraft:connection_east"], 0);
	});

	it("joins glass panes to panes and glass, and skips leaves and fences", async () => {
		const { applyPaneConnections } = await import("../../src/viewer/fenceConnections.js");
		const { size, palette, indices } = grid(3, 1, 3, [
			{ x: 1, y: 0, z: 1, block: { name: "glass_pane" } },
			{ x: 2, y: 0, z: 1, block: { name: "white_stained_glass_pane" } },
			{ x: 1, y: 0, z: 0, block: { name: "glass" } },
			{ x: 0, y: 0, z: 1, block: { name: "oak_leaves" } },
			{ x: 1, y: 0, z: 2, block: { name: "oak_fence" } }
		]);
		const r = applyPaneConnections(size, palette, indices, shapes);
		const at = (x, z) => r.palette[r.indices[0][(x * 1 + 0) * 3 + z]];
		const mid = at(1, 1).states;
		assert.equal(mid["minecraft:connection_east"], 1);
		assert.equal(mid["minecraft:connection_north"], 1);
		assert.equal(mid["minecraft:connection_west"], 0);
		assert.equal(mid["minecraft:connection_south"], 0);
		assert.equal(at(2, 1).states["minecraft:connection_west"], 1);
		assert.equal(r.linked, 2);
	});

	it("links fences and panes in one walk", async () => {
		const { applyNeighborConnections } = await import("../../src/viewer/fenceConnections.js");
		const { size, palette, indices } = grid(4, 1, 1, [
			{ x: 0, y: 0, z: 0, block: { name: "oak_fence" } },
			{ x: 1, y: 0, z: 0, block: { name: "oak_fence" } },
			{ x: 2, y: 0, z: 0, block: { name: "glass_pane" } },
			{ x: 3, y: 0, z: 0, block: { name: "white_stained_glass_pane" } }
		]);
		const r = applyNeighborConnections(size, palette, indices, shapes);
		const at = x => r.palette[r.indices[0][x]];
		assert.equal(at(0).states["minecraft:connection_east"], 1);
		assert.equal(at(0).states["minecraft:connection_west"], 0);
		assert.equal(at(1).states["minecraft:connection_west"], 1);
		assert.equal(at(1).states["minecraft:connection_east"], 0);
		assert.equal(at(2).states["minecraft:connection_west"], 0);
		assert.equal(at(2).states["minecraft:connection_east"], 1);
		assert.equal(at(3).states["minecraft:connection_west"], 1);
		assert.equal(at(3).states["minecraft:connection_east"], 0);
		assert.equal(r.linked, 4);
	});
});

describe("shape states from structure files", () => {
	async function loadJsonc(rel) {
		const stripJsonComments = (await import("strip-json-comments")).default;
		return JSON.parse(stripJsonComments(readFileSync(join(root, rel), "utf8")));
	}

	async function maker() {
		const BlockGeoMaker = (await import("../../src/viewer/engine/BlockGeoMaker.js")).default;
		return new BlockGeoMaker(
			{ SCALE: 1, IGNORED_BLOCKS: [] },
			{ entityModelToCubes: async () => [] },
			await loadJsonc("src/data/blockShapes.json"),
			await loadJsonc("src/data/blockShapeGeos.json"),
			await loadJsonc("src/data/blockStateDefinitions.json"),
			await loadJsonc("src/data/blockEigenvariants.json")
		);
	}

	function printFaces(faces) {
		const pts = [];
		for (const face of faces) {
			for (const v of face.vertices) {
				pts.push(v.pos.map(n => Math.round(n * 1000) / 1000).join(","));
			}
		}
		pts.sort();
		return pts.join(";");
	}

	function minAxis(faces, axis) {
		let min = Infinity;
		for (const face of faces) {
			for (const v of face.vertices) min = Math.min(min, v.pos[axis]);
		}
		return min;
	}

	function maxAxis(faces, axis) {
		let max = -Infinity;
		for (const face of faces) {
			for (const v of face.vertices) max = Math.max(max, v.pos[axis]);
		}
		return max;
	}

	it("maps door direction 0-3 onto the cardinal table", async () => {
		const geo = await maker();
		const pairs = [
			[0, "east"],
			[1, "south"],
			[2, "west"],
			[3, "north"]
		];
		const palette = pairs.flatMap(([direction, card]) => [
			{
				name: "oak_door",
				states: { direction, door_hinge_bit: 0, open_bit: 0, upper_block_bit: 0 }
			},
			{
				name: "oak_door",
				states: {
					"minecraft:cardinal_direction": card,
					door_hinge_bit: 0,
					open_bit: 0,
					upper_block_bit: 0
				}
			}
		]);
		const { templates } = await geo.makePolyMeshTemplates(palette);
		for (let i = 0; i < pairs.length; i++) {
			assert.equal(
				printFaces(templates[i * 2]),
				printFaces(templates[i * 2 + 1]),
				`direction ${pairs[i][0]} should match ${pairs[i][1]}`
			);
		}
		assert.notEqual(printFaces(templates[0]), printFaces(templates[2]));
	});

	it("draws fence arms only where connection flags are 1", async () => {
		const geo = await maker();
		const none = {
			"minecraft:connection_north": 0,
			"minecraft:connection_east": 0,
			"minecraft:connection_south": 0,
			"minecraft:connection_west": 0
		};
		const palette = [
			{ name: "oak_fence", states: {} },
			{ name: "oak_fence", states: none },
			{ name: "oak_fence", states: { ...none, "minecraft:connection_north": 1 } },
			{ name: "oak_fence", states: { ...none, "minecraft:connection_east": 1 } }
		];
		const { templates } = await geo.makePolyMeshTemplates(palette);
		assert.equal(printFaces(templates[0]), printFaces(templates[1]));
		assert.equal(minAxis(templates[0], 2), 6);
		assert.equal(minAxis(templates[2], 2), 0);
		assert.equal(minAxis(templates[3], 0), 0);
		assert.ok(templates[2].length > templates[0].length);
	});

	it("draws a glass pane post, and an arm only on a connection flag", async () => {
		const geo = await maker();
		const palette = [
			{ name: "glass_pane", states: {} },
			{ name: "white_stained_glass_pane", states: { "minecraft:connection_north": 1 } },
			{ name: "glass_pane", states: { "minecraft:connection_east": 1 } }
		];
		const { templates } = await geo.makePolyMeshTemplates(palette);
		assert.equal(minAxis(templates[0], 0), 7);
		assert.equal(maxAxis(templates[0], 0), 9);
		assert.equal(minAxis(templates[0], 2), 7);
		assert.equal(maxAxis(templates[0], 2), 9);
		assert.equal(minAxis(templates[1], 2), 0);
		assert.equal(maxAxis(templates[1], 0), 9);
		assert.equal(minAxis(templates[2], 0), 0);
		assert.equal(maxAxis(templates[1], 2), 9);
	});

	it("hanging sign applies one rotation state", async () => {
		const geo = await maker();
		const palette = [
			{
				name: "oak_hanging_sign",
				states: { attached_bit: 1, hanging: 1, facing_direction: 0, ground_sign_direction: 4 }
			},
			{
				name: "oak_hanging_sign",
				states: { attached_bit: 1, hanging: 1, facing_direction: 3, ground_sign_direction: 4 }
			},
			{
				name: "oak_hanging_sign",
				states: { attached_bit: 0, hanging: 1, facing_direction: 3, ground_sign_direction: 8 }
			},
			{
				name: "oak_hanging_sign",
				states: { attached_bit: 0, hanging: 1, facing_direction: 3, ground_sign_direction: 0 }
			}
		];
		const { templates } = await geo.makePolyMeshTemplates(palette);
		assert.equal(printFaces(templates[0]), printFaces(templates[1]));
		assert.equal(printFaces(templates[2]), printFaces(templates[3]));
		assert.notEqual(printFaces(templates[0]), printFaces(templates[2]));
	});

	it("coral fans rise toward the tips and wall fans open off the attachment face", async () => {
		const geo = await maker();
		const palette = [
			{ name: "tube_coral_fan", states: {} },
			{ name: "tube_coral_wall_fan", states: { coral_direction: 2 } },
			{ name: "tube_coral_wall_fan", states: { coral_direction: 0 } },
			{ name: "tube_coral_wall_fan", states: { coral_direction: 1 } },
			{ name: "tube_coral_wall_fan", states: { coral_direction: 3 } }
		];
		const { templates } = await geo.makePolyMeshTemplates(palette);
		const [floor, north, west, east, south] = templates;
		assert.equal(floor.length, 4);
		const floorPts = floor.flatMap(face => face.vertices.map(v => v.pos));
		const xs = floorPts.map(p => p[0]);
		const zs = floorPts.map(p => p[2]);
		assert.ok(Math.min(...xs) < -4, "west blade leaves the cell");
		assert.ok(Math.max(...xs) > 20, "east blade leaves the cell");
		assert.ok(Math.min(...zs) < -4, "north blade leaves the cell");
		assert.ok(Math.max(...zs) > 20, "south blade leaves the cell");
		for (const face of floor) {
			assert.equal(face.doubleSide, true);
			const verts = face.vertices.map(v => v.pos);
			const dist = (p) => Math.hypot(p[0] - 8, p[2] - 8);
			const outer = verts.reduce((a, b) => dist(b) > dist(a) ? b : a);
			const inner = verts.reduce((a, b) => dist(b) < dist(a) ? b : a);
			assert.ok(outer[1] > inner[1] + 4, `tip should rise, outer y ${outer[1]} inner y ${inner[1]}`);
			const innerEdge = face.vertices.filter(v => dist(v.pos) < dist(outer) - 4);
			assert.ok(innerEdge.length >= 2);
			assert.ok(innerEdge.every(v => (v.corner >> 1) === 1), "frond base faces the center");
		}

		function yOnHinge(face) {
			const edge = face.vertices.map(v => v.pos).filter(p => Math.abs(p[0] - 0) < 0.01 || Math.abs(p[0] - 16) < 0.01);
			const atX = (x) => edge.filter(p => Math.abs(p[0] - x) < 0.01).sort((a, b) => a[2] - b[2]);
			const sample = atX(0);
			assert.equal(sample.length, 2);
			const [a, b] = sample;
			const t = (14 - a[2]) / (b[2] - a[2]);
			return a[1] + t * (b[1] - a[1]);
		}
		assert.equal(north.length, 2);
		const northLow = [];
		for (const face of north) {
			assert.equal(face.doubleSide, true);
			const yHinge = yOnHinge(face);
			assert.ok(Math.abs(yHinge - 8) < 0.05, `hinge should stay at y=8, got ${yHinge}`);
			const verts = face.vertices.map(v => v.pos);
			northLow.push(verts.reduce((a, b) => a[2] < b[2] ? a : b)[1]);
			assert.ok(Math.min(...verts.map(p => p[2])) < 0, "sheet opens past the north side");
		}
		assert.ok(Math.max(...northLow) > 12 && Math.min(...northLow) < 4, "the two sheets split up and down");

		function extreme(faces, axis, pickMax) {
			const pts = faces.flatMap(face => face.vertices.map(v => v.pos));
			return pts.reduce((a, b) => (pickMax ? b[axis] > a[axis] : b[axis] < a[axis]) ? b : a);
		}
		assert.ok(extreme(west, 0, true)[0] > 16, "west fan opens toward +x");
		assert.ok(extreme(east, 0, false)[0] < 0, "east fan opens toward -x");
		assert.ok(extreme(south, 2, true)[2] > 16, "south fan opens toward +z");
		const westTips = west.map(face => extreme([face], 0, true)[1]);
		assert.ok(Math.max(...westTips) > 12 && Math.min(...westTips) < 4);
	});

	it("resolves prototype property names without throwing", async () => {
		const geo = await maker();
		const names = ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"];
		const { shapes } = await geo.makePolyMeshTemplates(names.map(name => ({ name, states: {} })));
		assert.equal(shapes.length, names.length);
		for (const shape of shapes) assert.equal(typeof shape, "string");
	});
});
