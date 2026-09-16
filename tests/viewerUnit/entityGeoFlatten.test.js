import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	GEO_SPACE_BLOCK,
	GEO_SPACE_ENTITY,
	geoCubeToEngineCube
} from "../../src/geoToEngineCubes.js";

const strawFootBase = {
	origin: [-8, 0, -8],
	size: [16, 4, 16],
	uv: {
		north: { uv: [4, 10.25], uv_size: [4, 1] },
		east: { uv: [0, 10.25], uv_size: [4, 1] },
		west: { uv: [8, 10.25], uv_size: [4, 1] },
		up: { uv: [4, 6.25], uv_size: [4, 4] },
		down: { uv: [8, 10.25], uv_size: [4, -4] }
	}
};

describe("geoCubeToEngineCube", () => {
	it("block space: bakes [8,0,8] into pos, per-face UV, no translate", () => {
		const cube = geoCubeToEngineCube(
			strawFootBase,
			"textures/blocks/straw_bed",
			16,
			16,
			GEO_SPACE_BLOCK
		);
		assert.equal("translate" in cube, false);
		assert.deepEqual(cube.pos, [0, 0, 0]);
		assert.deepEqual(cube.size, [16, 4, 16]);
		assert.equal("box_uv" in cube, false);
		assert.deepEqual(cube.uv.up, [4, 6.25]);
		assert.deepEqual(cube.uv_sizes.up, [4, 4]);
		assert.deepEqual(cube.uv_sizes.down, [4, -4]);
		assert.equal(cube.textures.south, "none");
		assert.equal(cube.textures["*"], "textures/blocks/straw_bed");
	});

	it("block space: shifts cube pivot with origin", () => {
		const cube = geoCubeToEngineCube(
			{
				origin: [-8, 0, -8],
				size: [16, 4, 8],
				pivot: [0, 0, 0],
				rotation: [0, 45, 0],
				uv: { up: { uv: [0, 0], uv_size: [16, 8] } }
			},
			"textures/blocks/straw_bed",
			16,
			16,
			GEO_SPACE_BLOCK
		);
		assert.deepEqual(cube.pos, [0, 0, 0]);
		assert.deepEqual(cube.pivot, [8, 0, 8]);
		assert.deepEqual(cube.rot, [0, 45, 0]);
	});

	it("snaps near-zero geo size to 0 so paper-thin faces double-side", () => {
		const cube = geoCubeToEngineCube(
			{
				origin: [-10, 0.06, 0],
				size: [2, 6.938893903907228e-18, 8],
				uv: {
					up: { uv: [0, 0], uv_size: [2, 8] },
					down: { uv: [0, 0], uv_size: [2, 8] }
				}
			},
			"textures/blocks/straw_bed",
			16,
			16,
			GEO_SPACE_BLOCK
		);
		assert.equal(cube.size[1], 0);
	});

	it("entity space: boxed UV and translate [8,0,8]", () => {
		const cube = geoCubeToEngineCube(
			{ origin: [-8, 0, -8], size: [16, 16, 16], uv: [0, 0] },
			"textures/entity/copper_golem/copper_golem",
			64,
			64,
			GEO_SPACE_ENTITY
		);
		assert.deepEqual(cube.translate, [8, 0, 8]);
		assert.deepEqual(cube.pos, [-8, 0, -8]);
		assert.deepEqual(cube.box_uv, [0, 0]);
		assert.equal(cube.box_uv_flip_east_west, true);
		assert.equal("uv" in cube, false);
	});
});
