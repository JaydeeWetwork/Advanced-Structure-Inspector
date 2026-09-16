/**
 * Three-finger taps on the preview (iPad).
 * Top → layer up, bottom → layer down, middle → default camera.
 * One-finger orbit and two-finger pinch are left alone.
 */

export const LAYER_TAP_MIN_BAND = 96;
export const LAYER_TAP_FRAC = 0.22;
export const LAYER_TAP_MOVE_PX = 16;
export const LAYER_TAP_MAX_MS = 400;

/**
 * @param {number} height
 */
export function layerBandPx(height) {
	const h = Number(height) || 0;
	return Math.max(LAYER_TAP_MIN_BAND, h * LAYER_TAP_FRAC);
}

/**
 * @param {number} clientY
 * @param {{ top: number, bottom: number, height: number }|null|undefined} rect
 * @returns {"up"|"down"|"all"|null}
 */
export function classifyLayerTap(clientY, rect) {
	if (!rect || !(rect.height > 0)) return null;
	if (clientY < rect.top || clientY > rect.bottom) return null;
	const band = layerBandPx(rect.height);
	if (clientY <= rect.top + band) return "up";
	if (clientY >= rect.bottom - band) return "down";
	return "all";
}

/**
 * @param {{ x: number, y: number }[]} points
 * @returns {{ x: number, y: number }|null}
 */
export function centroidOf(points) {
	if (!points?.length) return null;
	let x = 0;
	let y = 0;
	for (const p of points) {
		x += p.x;
		y += p.y;
	}
	const n = points.length;
	return { x: x / n, y: y / n };
}

/**
 * @param {EventTarget|null} t
 * @returns {boolean}
 */
export function isLayerTapIgnoreTarget(t) {
	if (typeof Element === "undefined" || !(t instanceof Element)) return false;
	return !!t.closest(
		"input, textarea, select, button, a, .basi-inspect-panel, .basi-float-panel, .basi-cam-bar, .basi-header, .basi-footer"
	);
}

/**
 * @param {TouchList|Touch[]} touches
 * @returns {{ x: number, y: number }[]}
 */
function touchPoints(touches) {
	const out = [];
	const n = touches?.length ?? 0;
	for (let i = 0; i < n; i++) {
		const t = touches[i];
		out.push({ x: t.clientX, y: t.clientY });
	}
	return out;
}

/**
 * @param {HTMLElement|null} host
 * @param {{
 *   onUp: () => void,
 *   onDown: () => void,
 *   onAll: () => void,
 *   suppressOrbit?: () => void,
 *   releaseOrbit?: () => void
 * }} api
 * @returns {() => void}
 */
export function bindLayerTaps(host, api) {
	if (!host || !api) return () => {};

	let candidate = false;
	let cancelled = false;
	let startAt = 0;
	/** @type {{ x: number, y: number }|null} */
	let startCentroid = null;
	let sawThree = false;

	const reset = () => {
		candidate = false;
		cancelled = false;
		startAt = 0;
		startCentroid = null;
		sawThree = false;
	};

	const fire = kind => {
		if (kind === "up") api.onUp();
		else if (kind === "down") api.onDown();
		else if (kind === "all") api.onAll();
	};

	const onTouchStart = e => {
		const n = e.touches?.length ?? 0;
		if (n > 3) {
			cancelled = true;
			candidate = false;
			api.releaseOrbit?.();
			return;
		}
		if (n !== 3) return;
		if (isLayerTapIgnoreTarget(e.target)) {
			reset();
			return;
		}
		const c = centroidOf(touchPoints(e.touches));
		if (!c) return;
		candidate = true;
		cancelled = false;
		sawThree = true;
		startAt = performance.now();
		startCentroid = c;
		api.suppressOrbit?.();
		try {
			e.preventDefault();
		} catch {
			/* ignore */
		}
	};

	const onTouchMove = e => {
		if (!candidate || cancelled) return;
		const n = e.touches?.length ?? 0;
		if (n !== 3) return;
		const c = centroidOf(touchPoints(e.touches));
		if (!c || !startCentroid) return;
		if (Math.hypot(c.x - startCentroid.x, c.y - startCentroid.y) > LAYER_TAP_MOVE_PX) {
			cancelled = true;
			candidate = false;
			api.releaseOrbit?.();
			return;
		}
		try {
			e.preventDefault();
		} catch {
			/* ignore */
		}
	};

	const onTouchEnd = e => {
		const n = e.touches?.length ?? 0;
		if (n > 0) {
			if (n > 3) {
				cancelled = true;
				candidate = false;
			}
			return;
		}
		const canFire = sawThree && candidate && !cancelled;
		const dt = performance.now() - startAt;
		const start = startCentroid;
		reset();
		api.releaseOrbit?.();
		if (!canFire || dt > LAYER_TAP_MAX_MS || !start) return;
		const rect = host.getBoundingClientRect();
		const kind = classifyLayerTap(start.y, rect);
		if (kind) fire(kind);
	};

	host.addEventListener("touchstart", onTouchStart, { passive: false });
	host.addEventListener("touchmove", onTouchMove, { passive: false });
	host.addEventListener("touchend", onTouchEnd);
	host.addEventListener("touchcancel", onTouchEnd);

	return () => {
		host.removeEventListener("touchstart", onTouchStart);
		host.removeEventListener("touchmove", onTouchMove);
		host.removeEventListener("touchend", onTouchEnd);
		host.removeEventListener("touchcancel", onTouchEnd);
		reset();
	};
}
