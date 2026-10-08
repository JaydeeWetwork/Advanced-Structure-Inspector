
/**
 * Gets the index of a block position in the structure data from its coordinates.
 * @param {Vec3} coords
 * @param {I32Vec3} structureSize
 * @returns {number}
 */
export function getStructureIndexFromCoordinates([x, y, z], structureSize) {
	return (x * structureSize[1] + y) * structureSize[2] + z;
}
/**
 * Inverse of {@link getStructureIndexFromCoordinates}.
 * `structureSize[0]` is not used; the index is `(x * sizeY + y) * sizeZ + z`.
 * @param {number} index
 * @param {I32Vec3} structureSize
 * @returns {Vec3}
 */
export function getCoordinatesFromStructureIndex(index, structureSize) {
	const sy = structureSize[1];
	const sz = structureSize[2];
	const z = index % sz;
	const t = Math.floor(index / sz);
	const y = t % sy;
	const x = Math.floor(t / sy);
	return [x, y, z];
}
/**
 * Transforms structure coordinates to Minecraft geometry coordinates.
 * @param {Vec3} coords
 * @returns {Vec3}
 */
export function getGeoSpaceBlockPos([x, y, z]) {
	return [-16 * x - 8, 16 * y, 16 * z - 8]; // I got these values from trial and error with blockbench (which makes the x negative I think. it's weird.)
}

/** @import { Vec3, I32Vec3 } from "../types.js" */