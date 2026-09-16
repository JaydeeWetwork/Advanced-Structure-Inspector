/**
 * Camera preset / zoom ids used by catalog, UI, and the preview controller.
 * Keep this out of viewer/systems so app/catalog do not import the renderer.
 */

export const CAMERA_PRESET_OPTIONS = [
	"iso-north", "iso-south", "iso-east", "iso-west",
	"north", "south", "east", "west",
	"top", "layer", "free", "fly", "iso"
];

export const CAMERA_ZOOM_MIN = 0.5;
export const CAMERA_ZOOM_MAX = 2;
export const CAMERA_ZOOM_DEFAULT = 1;

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

export const isIsoPreset = isIsoCameraPreset;

/**
 * @param {string|null|undefined} preset
 */
export function normalizeCameraPreset(preset) {
	if (!preset || typeof preset !== "string") return "iso-north";
	if (preset === "iso" || preset === "default") return "iso-north";
	if (CAMERA_PRESET_OPTIONS.includes(preset)) return preset;
	return "iso-north";
}

/**
 * @param {unknown} z
 * @returns {number}
 */
export function normalizeCameraZoom(z) {
	const n = Number(z);
	if (!Number.isFinite(n)) return CAMERA_ZOOM_DEFAULT;
	const clamped = Math.max(CAMERA_ZOOM_MIN, Math.min(CAMERA_ZOOM_MAX, n));
	return Math.round(clamped * 20) / 20;
}
