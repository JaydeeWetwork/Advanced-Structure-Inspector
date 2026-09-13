/**
 * Camera facing compass — world north is -Z (Minecraft / "from north" preset).
 * Yaw 0 = looking north, 90 = east, 180 = south, 270 = west.
 */

const CARDINALS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/**
 * @param {number} x
 * @param {number} y
 * @param {number} z
 * @returns {{ yaw: number, cardinal: string, lookingDown: boolean }}
 */
export function facingFromLookDir(x, y, z) {
	const hx = Number(x) || 0;
	const hy = Number(y) || 0;
	const hz = Number(z) || 0;
	const horiz = Math.hypot(hx, hz);
	if (horiz < 0.12) {
		return { yaw: 0, cardinal: hy < 0 ? "Top" : "Up", lookingDown: hy < 0 };
	}
	let yaw = Math.atan2(hx, -hz) * (180 / Math.PI);
	if (yaw < 0) yaw += 360;
	const i = Math.round(yaw / 45) % 8;
	return { yaw, cardinal: CARDINALS[i], lookingDown: false };
}

let raf = 0;
/** @type {{ x: number, y: number, z: number }|null} */
let pending = null;

/**
 * @param {{ x: number, y: number, z: number }|null|undefined} dir
 */
export function updateCameraCompass(dir) {
	if (!dir) return;
	pending = dir;
	if (raf) return;
	raf = requestAnimationFrame(flushCompass);
}

function flushCompass() {
	raf = 0;
	const dir = pending;
	pending = null;
	if (!dir) return;
	const el = document.getElementById("camCompass");
	const needle = document.getElementById("camCompassNeedle");
	const label = document.getElementById("camCompassLabel");
	if (!el) return;
	const { yaw, cardinal, lookingDown } = facingFromLookDir(dir.x, dir.y, dir.z);
	el.classList.toggle("is-top", lookingDown);
	el.setAttribute("aria-label", lookingDown ? "Camera facing down" : `Camera facing ${cardinal}`);
	if (needle) needle.style.transform = `rotate(${yaw.toFixed(1)}deg)`;
	if (label) label.textContent = lookingDown ? "Top" : cardinal;
}

/**
 * Listen for look-dir events from the preview.
 */
export function initCameraCompass() {
	document.addEventListener("basi-camera-facing", e => {
		const d = /** @type {CustomEvent} */ (e).detail;
		if (d && Number.isFinite(d.x)) updateCameraCompass(d);
	});
}
