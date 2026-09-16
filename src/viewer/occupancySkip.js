/**
 * Skip InstancedMesh cells buried in opaque unit cubes (full preview only).
 */

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
 * @param {[number, number, number][][]} blockPositions sparse per palette
 * @returns {[number, number, number][][]}
 */
export function filterBuriedUnitCubes(structureSize, layer0Indices, occludesByPalette, blockPositions) {
	const [sx, sy, sz] = structureSize;
	if (!sx || !sy || !sz || !layer0Indices) return blockPositions;
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

	const n = blockPositions.length;
	/** @type {[number, number, number][][]} dense, same length as blockPositions */
	const out = [];
	for (let pal = 0; pal < n; pal++) {
		const list = blockPositions[pal];
		out[pal] = list?.length
			? list.filter(([x, y, z]) => !buried(x, y, z))
			: [];
	}
	return out;
}
