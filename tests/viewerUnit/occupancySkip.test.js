import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	filterBuriedUnitCubes,
	occludesAsUnitCube,
	shapeFamily
} from "../../src/viewer/occupancySkip.js";

describe("occupancySkip", () => {
	it("shapeFamily strips texture suffix", () => {
		assert.equal(shapeFamily("block"), "block");
		assert.equal(shapeFamily("chest<textures/entity/chest/normal>"), "chest");
	});

	it("occludes only opaque unit cubes", () => {
		assert.equal(occludesAsUnitCube("block", true), true);
		assert.equal(occludesAsUnitCube("block", false), false);
		assert.equal(occludesAsUnitCube("stairs", true), false);
		assert.equal(occludesAsUnitCube("mob_spawner", true), false);
	});

	it("drops the center of a 3×3×3 stone cube and keeps the shell", () => {
		const size = [3, 3, 3];
		const n = 27;
		const layer0 = new Int32Array(n);
		/** @type {[number, number, number][]} */
		const stone = [];
		for (let x = 0; x < 3; x++) {
			for (let y = 0; y < 3; y++) {
				for (let z = 0; z < 3; z++) {
					layer0[(x * 3 + y) * 3 + z] = 0;
					stone.push([x, y, z]);
				}
			}
		}
		const out = filterBuriedUnitCubes(size, layer0, [true], [stone]);
		assert.equal(out.length, 1);
		assert.equal(out[0].length, 26);
		assert.equal(out[0].some(([x, y, z]) => x === 1 && y === 1 && z === 1), false);
	});

	it("returns a dense palette array (empty lists stay [])", () => {
		const size = [1, 1, 1];
		const layer0 = new Int32Array([0]);
		const out = filterBuriedUnitCubes(size, layer0, [true, false], [[[0, 0, 0]], []]);
		assert.equal(out.length, 2);
		assert.deepEqual(out[1], []);
	});

	it("keeps a glass center (non-occluding palette)", () => {
		const size = [3, 3, 3];
		const layer0 = new Int32Array(27);
		const glass = [];
		for (let x = 0; x < 3; x++) {
			for (let y = 0; y < 3; y++) {
				for (let z = 0; z < 3; z++) {
					layer0[(x * 3 + y) * 3 + z] = 0;
					glass.push([x, y, z]);
				}
			}
		}
		const out = filterBuriedUnitCubes(size, layer0, [false], [glass]);
		assert.equal(out[0].length, 27);
	});

	it("drops layer-1 water at a buried stone cell", () => {
		const size = [3, 3, 3];
		const layer0 = new Int32Array(27);
		const stone = [];
		for (let x = 0; x < 3; x++) {
			for (let y = 0; y < 3; y++) {
				for (let z = 0; z < 3; z++) {
					layer0[(x * 3 + y) * 3 + z] = 0;
					stone.push([x, y, z]);
				}
			}
		}
		const water = [[1, 1, 1]];
		const out = filterBuriedUnitCubes(size, layer0, [true, false], [stone, water]);
		assert.equal(out[0].some(([x, y, z]) => x === 1 && y === 1 && z === 1), false);
		assert.equal(out[1]?.length ?? 0, 0);
	});
});
