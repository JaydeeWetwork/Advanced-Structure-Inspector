import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	GEO_SPACE_BLOCK,
	GEO_SPACE_ENTITY,
	geoCubeToEngineCube
} from "../../src/viewer/engine/geoToEngineCubes.js";
import { flattenEntityCubes } from "../../src/viewer/entityModels.js";
import { pixelUvQuad } from "../../src/viewer/entityGeoThree.js";

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

describe("entity face UVs", () => {
	it("insets a cushion side so nearest sampling stays off the empty padding", () => {
		// geometry.cushion side: box UV north is [16, 16] size [16, 4] on a 64×64 sheet.
		const quad = pixelUvQuad(16, 16, 16, 4, 64, 64);
		const us = quad.map(p => p[0]);
		const texY = quad.map(p => (1 - p[1]) * 64);
		assert.ok(Math.min(...us) > 16 / 64);
		assert.ok(Math.max(...us) < 32 / 64);
		assert.ok(Math.min(...texY) > 16);
		assert.ok(Math.max(...texY) < 20);
	});

	it("insets a flipped uv_size toward the same texel rect", () => {
		const quad = pixelUvQuad(8, 10, 4, -4, 16, 16);
		const us = quad.map(p => p[0] * 16);
		const texY = quad.map(p => (1 - p[1]) * 16);
		assert.ok(Math.min(...us) > 8);
		assert.ok(Math.max(...us) < 12);
		assert.ok(Math.min(...texY) > 6);
		assert.ok(Math.max(...texY) < 10);
	});
});

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

describe("flattenEntityCubes", () => {
	it("keeps a cushion centered when the bone pivot is unused", () => {
		const [cube] = flattenEntityCubes({
			bones: [{
				name: "cushion_bone",
				pivot: [23, 0, -7],
				cubes: [{
					origin: [-8, -0.125, -8],
					size: [16, 4, 16],
					inflate: -0.01,
					uv: [0, 0]
				}]
			}]
		});
		const cx = cube.origin[0] + cube.size[0] / 2;
		const cz = cube.origin[2] + cube.size[2] / 2;
		assert.ok(Math.abs(cx) < 1e-6, `center x ${cx}`);
		assert.ok(Math.abs(cz) < 1e-6, `center z ${cz}`);
		assert.ok(cube.size[1] > 3.9 && cube.size[1] < 4);
	});
});
