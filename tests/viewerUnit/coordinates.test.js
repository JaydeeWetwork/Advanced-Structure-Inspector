import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	getCoordinatesFromStructureIndex,
	getStructureIndexFromCoordinates
} from "../../src/utils/coordinates.js";

describe("structure index", () => {
	it("round-trips (x * sy + y) * sz + z", () => {
		const size = [4, 3, 5];
		for (let x = 0; x < size[0]; x++) {
			for (let y = 0; y < size[1]; y++) {
				for (let z = 0; z < size[2]; z++) {
					const i = getStructureIndexFromCoordinates([x, y, z], size);
					assert.deepEqual(getCoordinatesFromStructureIndex(i, size), [x, y, z]);
				}
			}
		}
	});

	it("does not use the x + z*sx + y*sx*sz order", () => {
		const size = [4, 3, 5];
		const i = getStructureIndexFromCoordinates([1, 2, 3], size);
		assert.equal(i, 28);
		assert.deepEqual(getCoordinatesFromStructureIndex(i, size), [1, 2, 3]);
		const sx = size[0];
		const sz = size[2];
		const wrongY = Math.floor(i / (sx * sz));
		const rem = i % (sx * sz);
		const wrong = [rem % sx, wrongY, Math.floor(rem / sx)];
		assert.deepEqual(wrong, [0, 1, 2]);
	});
});
