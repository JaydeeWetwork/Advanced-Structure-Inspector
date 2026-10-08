/**
 * Skip InstancedMesh cells buried in opaque unit cubes (full preview only).
 * The cull writes a second CSR. It does not allocate a coordinate array per cell.
 */

import { prefixOffsets } from "./cellCsr.js";

/**
 * @param {string} shape
 */
export function shapeFamily(shape) {
	const s = String(shape ?? "");
	const i = s.indexOf("<");
	return i === -1 ? s : s.slice(0, i);
}

/**
 * Occluder = `"block"` family and fully opaque atlas (no cutout / blend).
 * @param {string|undefined} shape
 * @param {boolean} fullyOpaque
 */
export function occludesAsUnitCube(shape, fullyOpaque) {
	return !!fullyOpaque && shapeFamily(shape) === "block";
}

/**
 * Layer-0 occupancy: drop every instance (all palettes, both layers) at a
 * cell whose six neighbors are opaque unit cubes.
 * @param {[number, number, number]} structureSize
 * @param {Int32Array|number[]} layer0Indices
 * @param {boolean[]} occludesByPalette
 * @param {{ off: Int32Array, xyz: Int32Array }} blockPositions palette CSR
 * @returns {{ off: Int32Array, xyz: Int32Array }}
 */
export function filterBuriedUnitCubes(structureSize, layer0Indices, occludesByPalette, blockPositions) {
	const [sx, sy, sz] = structureSize;
	if (!sx || !sy || !sz || !layer0Indices || !blockPositions?.off || !blockPositions?.xyz) {
		return blockPositions;
	}
	const occ = new Uint8Array(sx * sy * sz);
	const at = (x, y, z) => (x * sy + y) * sz + z;
	for (let x = 0; x < sx; x++) {
		for (let y = 0; y < sy; y++) {
			for (let z = 0; z < sz; z++) {
				const pal = layer0Indices[at(x, y, z)];
				if (pal >= 0 && occludesByPalette[pal]) occ[at(x, y, z)] = 1;
			}
		}
	}
	const buried = (x, y, z) =>
		x > 0 && x < sx - 1 && y > 0 && y < sy - 1 && z > 0 && z < sz - 1
		&& occ[at(x - 1, y, z)] && occ[at(x + 1, y, z)]
		&& occ[at(x, y - 1, z)] && occ[at(x, y + 1, z)]
		&& occ[at(x, y, z - 1)] && occ[at(x, y, z + 1)];

	const xyz = blockPositions.xyz;
	const slotCount = blockPositions.off.length - 1;
	const counts = new Int32Array(slotCount);
	for (let pal = 0; pal < slotCount; pal++) {
		let n = 0;
		for (let i = blockPositions.off[pal]; i < blockPositions.off[pal + 1]; i++) {
			const o = i * 3;
			if (!buried(xyz[o], xyz[o + 1], xyz[o + 2])) n++;
		}
		counts[pal] = n;
	}
	const { off, cursor, total } = prefixOffsets(counts);
	const out = new Int32Array(total * 3);
	for (let pal = 0; pal < slotCount; pal++) {
		for (let i = blockPositions.off[pal]; i < blockPositions.off[pal + 1]; i++) {
			const o = i * 3;
			const x = xyz[o];
			const y = xyz[o + 1];
			const z = xyz[o + 2];
			if (buried(x, y, z)) continue;
			const w = cursor[pal]++ * 3;
			out[w] = x;
			out[w + 1] = y;
			out[w + 2] = z;
		}
	}
	return { off, xyz: out };
}
