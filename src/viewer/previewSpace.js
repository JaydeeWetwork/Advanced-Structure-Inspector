/**
 * Shared structure → Three.js space.
 * Used by blocks, item frames, minecarts, and sign overlays.
 */

/**
 * Structure-local continuous coords → PreviewRenderer three.js space.
 * @param {number} lx
 * @param {number} ly
 * @param {number} lz
 * @returns {[number, number, number]}
 */
export function structurePosToThree(lx, ly, lz) {
	const fx = Math.floor(lx);
	const ux = lx - fx;
	const x = -16 * fx - 16 + 16 * ux;
	const y = 16 * ly;
	const z = -16 * lz;
	return [x, y, z];
}

/**
 * Block-local 0–16 geo point → three.js position.
 * @param {number} bx
 * @param {number} by
 * @param {number} bz
 * @param {number} gx
 * @param {number} gy
 * @param {number} gz
 * @returns {[number, number, number]}
 */
export function geoPointToThree(bx, by, bz, gx, gy, gz) {
	return structurePosToThree(bx + gx / 16, by + gy / 16, bz + gz / 16);
}

/**
 * Block-local 0–16 vertex → three.js, matching LayerMeshSystem instances
 * (`[-16x-16, 16y, -16z-16]` + local vertex). Use this for overlays that must
 * sit on baked block geo. Do not use geoPointToThree for that — it flips Z.
 *
 * @param {number} bx
 * @param {number} by
 * @param {number} bz
 * @param {number} gx
 * @param {number} gy
 * @param {number} gz
 * @returns {[number, number, number]}
 */
export function blockVertexToThree(bx, by, bz, gx, gy, gz) {
	return [-16 * bx - 16 + gx, 16 * by + gy, -16 * bz - 16 + gz];
}

/**
 * Rotate a point around block center with BlockGeoMaker.#applyEulerRotation
 * (X-Y-Z order, each axis using the *negated* blockStateDefs angle).
 *
 * @param {[number, number, number]} pos
 * @param {[number, number, number]} rotationDeg [rx, ry, rz] from blockStateDefs
 * @param {[number, number, number]} [pivot=[8,8,8]]
 * @returns {[number, number, number]}
 */
export function applyBlockGeoEuler(pos, rotationDeg, pivot = [8, 8, 8]) {
	const deg = Math.PI / 180;
	let x = pos[0] - pivot[0];
	let y = pos[1] - pivot[1];
	let z = pos[2] - pivot[2];
	const [rx, ry, rz] = rotationDeg;
	{
		const a = -rx * deg;
		const c = Math.cos(a), s = Math.sin(a);
		const ny = y * c - z * s;
		const nz = y * s + z * c;
		y = ny;
		z = nz;
	}
	{
		const a = -ry * deg;
		const c = Math.cos(a), s = Math.sin(a);
		const nx = x * c - z * s;
		const nz = x * s + z * c;
		x = nx;
		z = nz;
	}
	{
		const a = -rz * deg;
		const c = Math.cos(a), s = Math.sin(a);
		const nx = x * c - y * s;
		const ny = x * s + y * c;
		x = nx;
		y = ny;
	}
	return [x + pivot[0], y + pivot[1], z + pivot[2]];
}

/**
 * Convert blockStateDefs euler into a Three.js Euler matching BlockGeoMaker.
 * @param {number} rx
 * @param {number} ry
 * @param {number} rz
 * @param {typeof import("three")} THREE
 * @returns {import("three").Euler}
 */
export function blockGeoEulerToThree(rx, ry, rz, THREE) {
	// BlockGeoMaker X: rotate(y,z) by -rx  ≡  Three.js Rx(-rx)
	// BlockGeoMaker Y: rotate(x,z) by -ry  ≡  Three.js Ry(+ry)
	// BlockGeoMaker Z: rotate(x,y) by -rz  ≡  Three.js Rz(-rz)
	return new THREE.Euler(
		-rx * (Math.PI / 180),
		ry * (Math.PI / 180),
		-rz * (Math.PI / 180),
		"XYZ"
	);
}
