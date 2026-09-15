/**
 * True isometric showcase: 45° yaw, atan(1/√2) ≈ 35.264° elevation,
 * cube-diagonal offsets. Pure math — no THREE.
 */

/** Elevation from horizontal for (±1, 1, ±1). */
export const ISO_ELEVATION_RAD = Math.atan(1 / Math.SQRT2);
export const ISO_ELEVATION_DEG = (ISO_ELEVATION_RAD * 180) / Math.PI;

/** Camera offset from target before normalize. Minecraft north = −Z. */
export const ISO_OFFSETS = {
	"iso-north": [1, 1, -1],
	"iso-south": [-1, 1, 1],
	"iso-east": [1, 1, 1],
	"iso-west": [-1, 1, -1]
};

/**
 * @param {string|null|undefined} preset
 */
export function isIsoCameraPreset(preset) {
	return (
		preset === "iso"
		|| preset === "default"
		|| preset === "iso-north"
		|| preset === "iso-south"
		|| preset === "iso-east"
		|| preset === "iso-west"
	);
}

/**
 * @param {string|null|undefined} preset
 * @returns {"iso-north"|"iso-south"|"iso-east"|"iso-west"}
 */
export function normalizeIsoPreset(preset) {
	if (preset === "iso-south" || preset === "iso-east" || preset === "iso-west") {
		return preset;
	}
	return "iso-north";
}

/**
 * @param {string|null|undefined} preset
 * @returns {[number, number, number]}
 */
export function isoOffset(preset) {
	return ISO_OFFSETS[normalizeIsoPreset(preset)];
}

/**
 * @param {string|null|undefined} preset
 */
export function isoDirectionInfo(preset) {
	const [x, y, z] = isoOffset(preset);
	const len = Math.hypot(x, y, z);
	const nx = x / len;
	const ny = y / len;
	const nz = z / len;
	const xz = Math.hypot(nx, nz);
	const elevationDeg = (Math.atan2(ny, xz) * 180) / Math.PI;
	const azimuthDeg = (Math.atan2(nx, -nz) * 180) / Math.PI;
	return { x: nx, y: ny, z: nz, elevationDeg, azimuthDeg };
}

/**
 * Ortho half-height so the AABB projections fit, then apply user zoom
 * (2 = twice as close → half the frustum).
 * @param {number} maxRight
 * @param {number} maxUp
 * @param {number} aspect
 * @param {number} [padding]
 * @param {number} [userZoom]
 */
export function orthoHalfExtents(maxRight, maxUp, aspect, padding = 1.04, userZoom = 1) {
	const a = Math.max(Number(aspect) || 1, 0.01);
	const z = Math.max(0.5, Math.min(2, Number(userZoom) || 1));
	const pad = Number.isFinite(padding) ? padding : 1.04;
	const halfHeight = Math.max(maxUp, maxRight / a, 8) * pad / z;
	return { halfHeight, halfWidth: halfHeight * a };
}

/**
 * @param {{ left: number, right: number, top: number, bottom: number, updateProjectionMatrix?: Function }} camera
 * @param {number} halfHeight
 * @param {number} aspect
 */
export function applyOrthoFrustum(camera, halfHeight, aspect) {
	const a = Math.max(Number(aspect) || 1, 0.01);
	const hh = Math.max(Number(halfHeight) || 1, 1);
	camera.left = -hh * a;
	camera.right = hh * a;
	camera.top = hh;
	camera.bottom = -hh;
	camera.updateProjectionMatrix?.();
}
