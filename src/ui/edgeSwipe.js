/**
 * iPad / touch edge swipes for viewer chrome.
 * Open: start in a stage edge band (not the Safari bezel).
 * Close: swipe the open panel away, or tap the canvas.
 *
 * Center-canvas one-finger drag stays orbit — we only capture edge-started swipes.
 */

export const EDGE_BAND = {
	left: 64,
	right: 88,
	bottom: 72
};

export const AXIS_LOCK_PX = 12;
export const SWIPE_MIN_PX = 40;
/** Finger tap slop — iPad taps often exceed AXIS_LOCK_PX. */
export const TAP_MAX_PX = 28;

/**
 * @param {number} x
 * @param {number} y
 * @param {{ left: number, top: number, right: number, bottom: number }} rect
 * @param {{ left?: number, right?: number, bottom?: number }} [bands]
 * @returns {"left"|"right"|"bottom"|null}
 */
export function edgeBandAt(x, y, rect, bands = {}) {
	if (!rect) return null;
	const leftBand = bands.left ?? EDGE_BAND.left;
	const rightBand = bands.right ?? EDGE_BAND.right;
	const bottomBand = bands.bottom ?? EDGE_BAND.bottom;
	if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;
	const fromLeft = x - rect.left;
	const fromRight = rect.right - x;
	const fromBottom = rect.bottom - y;
	const inLeft = fromLeft <= leftBand;
	const inRight = fromRight <= rightBand;
	const inBottom = fromBottom <= bottomBand;
	if (inLeft && inBottom) return fromLeft <= fromBottom ? "left" : "bottom";
	if (inRight && inBottom) return fromRight <= fromBottom ? "right" : "bottom";
	if (inLeft) return "left";
	if (inRight) return "right";
	if (inBottom) return "bottom";
	return null;
}

/**
 * @param {"left"|"right"|"bottom"} band
 * @param {number} dx
 * @param {number} dy positive is down (client coords)
 * @param {{ axisLock?: number, swipeMin?: number }} [opts]
 * @returns {"pending"|"catalog"|"detail"|"cam"|null} null = not a chrome swipe
 */
export function classifyOpenSwipe(band, dx, dy, opts = {}) {
	const axisLock = opts.axisLock ?? AXIS_LOCK_PX;
	const swipeMin = opts.swipeMin ?? SWIPE_MIN_PX;
	const absX = Math.abs(dx);
	const absY = Math.abs(dy);
	if (Math.hypot(dx, dy) < axisLock) return "pending";
	const horizontal = absX >= absY;
	if (band === "left") {
		if (!horizontal || dx < 0) return null;
		return dx >= swipeMin ? "catalog" : "pending";
	}
	if (band === "right") {
		if (!horizontal || dx > 0) return null;
		return -dx >= swipeMin ? "detail" : "pending";
	}
	if (band === "bottom") {
		if (horizontal || dy > 0) return null;
		return -dy >= swipeMin ? "cam" : "pending";
	}
	return null;
}

/**
 * @param {"catalog"|"detail"|"cam"} which
 * @param {number} dx
 * @param {number} dy
 * @param {{ axisLock?: number, swipeMin?: number }} [opts]
 * @returns {"pending"|"close"|null}
 */
export function classifyCloseSwipe(which, dx, dy, opts = {}) {
	const axisLock = opts.axisLock ?? AXIS_LOCK_PX;
	const swipeMin = opts.swipeMin ?? SWIPE_MIN_PX;
	const absX = Math.abs(dx);
	const absY = Math.abs(dy);
	if (Math.hypot(dx, dy) < axisLock) return "pending";
	const horizontal = absX >= absY;
	if (which === "catalog") {
		if (!horizontal || dx > 0) return null;
		return -dx >= swipeMin ? "close" : "pending";
	}
	if (which === "detail") {
		if (!horizontal || dx < 0) return null;
		return dx >= swipeMin ? "close" : "pending";
	}
	if (which === "cam") {
		if (horizontal || dy < 0) return null;
		return dy >= swipeMin ? "close" : "pending";
	}
	return null;
}

/**
 * @param {EventTarget|null} t
 * @returns {boolean}
 */
export function isSwipeIgnoreTarget(t) {
	if (typeof Element === "undefined" || !(t instanceof Element)) return false;
	return !!t.closest(
		"input, textarea, select, button, a, .basi-inspect-panel, .basi-header, .basi-footer"
	);
}

/**
 * @param {EventTarget|null} t
 * @param {boolean} camOpen
 * @returns {"catalog"|"detail"|"cam"|null}
 */
export function closeSwipeTarget(t, camOpen, docks = {}) {
	if (typeof Element === "undefined" || !(t instanceof Element)) return null;
	if (t.closest(".basi-cam-bar") || (camOpen && t.closest(".basi-cam-dock"))) return "cam";
	const catalogOpen = docks.catalogOpen === true;
	const detailOpen = docks.detailOpen === true;
	if (
		catalogOpen
		&& t.closest("#catalogFloat .basi-float-panel, .basi-float-left .basi-float-panel")
	) {
		return "catalog";
	}
	if (
		detailOpen
		&& t.closest("#detailFloat .basi-float-panel, .basi-float-right .basi-float-panel")
	) {
		return "detail";
	}
	return null;
}

/**
 * @param {HTMLElement|null} stage
 * @param {{
 *   openCatalog: () => void,
 *   closeCatalog: () => void,
 *   openDetail: () => void,
 *   closeDetail: () => void,
 *   openCam: () => void,
 *   closeCam: () => void,
 *   isCamOpen: () => boolean,
 *   isCatalogOpen?: () => boolean,
 *   isDetailOpen?: () => boolean,
 *   closeUnpinned: () => void,
 *   suppressOrbit?: () => void,
 *   releaseOrbit?: () => void
 * }} api
 * @returns {() => void}
 */
export function bindEdgeSwipe(stage, api) {
	if (!stage || !api) return () => {};

	/** @type {"idle"|"maybe-open"|"swipe-open"|"maybe-close"|"swipe-close"} */
	let state = "idle";
	/** @type {"left"|"right"|"bottom"|null} */
	let band = null;
	/** @type {"catalog"|"detail"|"cam"|null} */
	let closeWhich = null;
	let startX = 0;
	let startY = 0;
	/** @type {number|null} */
	let pointerId = null;
	let consumed = false;
	let opened = false;

	const reset = () => {
		state = "idle";
		band = null;
		closeWhich = null;
		pointerId = null;
		opened = false;
	};

	const fireOpen = action => {
		if (action === "catalog") api.openCatalog();
		else if (action === "detail") api.openDetail();
		else if (action === "cam") api.openCam();
		api.suppressOrbit?.();
		opened = true;
		consumed = true;
	};

	const fireClose = which => {
		if (which === "catalog") api.closeCatalog();
		else if (which === "detail") api.closeDetail();
		else if (which === "cam") api.closeCam();
		consumed = true;
	};

	const onPointerDown = e => {
		if (!(e instanceof PointerEvent)) return;
		if (e.pointerType !== "touch") return;
		if (e.isPrimary === false) {
			reset();
			return;
		}
		if (isSwipeIgnoreTarget(e.target)) return;

		consumed = false;
		startX = e.clientX;
		startY = e.clientY;
		pointerId = e.pointerId;

		const closing = closeSwipeTarget(e.target, !!api.isCamOpen?.(), {
			catalogOpen: !!api.isCatalogOpen?.(),
			detailOpen: !!api.isDetailOpen?.()
		});
		if (closing) {
			state = "maybe-close";
			closeWhich = closing;
			band = null;
			return;
		}

		const rect = stage.getBoundingClientRect();
		band = edgeBandAt(e.clientX, e.clientY, rect);
		if (!band) {
			state = "idle";
			pointerId = e.pointerId;
			return;
		}
		state = "maybe-open";
	};

	const onPointerMove = e => {
		if (!(e instanceof PointerEvent)) return;
		if (pointerId == null || e.pointerId !== pointerId) return;
		if (e.isPrimary === false) {
			reset();
			return;
		}
		const dx = e.clientX - startX;
		const dy = e.clientY - startY;

		if (state === "maybe-open") {
			if (!band) return;
			const result = classifyOpenSwipe(band, dx, dy);
			if (result === null) {
				state = "idle";
				return;
			}
			if (result === "pending") return;
			state = "swipe-open";
			fireOpen(result);
			try {
				e.preventDefault();
			} catch {
				/* ignore */
			}
			return;
		}

		if (state === "swipe-open") {
			try {
				e.preventDefault();
			} catch {
				/* ignore */
			}
			return;
		}

		if (state === "maybe-close") {
			if (!closeWhich) return;
			const result = classifyCloseSwipe(closeWhich, dx, dy);
			if (result === null) {
				state = "idle";
				return;
			}
			if (result === "pending") return;
			state = "swipe-close";
			fireClose(closeWhich);
			try {
				e.preventDefault();
			} catch {
				/* ignore */
			}
			return;
		}

		if (state === "swipe-close") {
			try {
				e.preventDefault();
			} catch {
				/* ignore */
			}
		}
	};

	const onPointerUp = e => {
		if (!(e instanceof PointerEvent)) return;
		if (pointerId == null || e.pointerId !== pointerId) return;
		const dx = e.clientX - startX;
		const dy = e.clientY - startY;
		const dist = Math.hypot(dx, dy);
		const target = e.target;

		if (!consumed && !opened && dist < TAP_MAX_PX && target instanceof Element) {
			if (state === "maybe-open" && band) {
				if (band === "left") {
					api.openCatalog();
					consumed = true;
				} else if (band === "right") {
					api.openDetail();
					consumed = true;
				} else if (band === "bottom") {
					api.openCam();
					consumed = true;
				}
			}
			const host = target.closest("#previewHost");
			const skipHide = host?.querySelector("canvas")?.dataset?.basiSuppressOrbit === "1";
			if (!consumed && host && !skipHide) {
				api.closeUnpinned?.();
			}
		}

		api.releaseOrbit?.();
		reset();
	};

	const onTouchMove = e => {
		if (state === "swipe-open" || state === "swipe-close") {
			e.preventDefault();
			return;
		}
		if (state !== "maybe-open" || !band || (e.touches?.length ?? 0) !== 1) return;
		const t = e.touches[0];
		const result = classifyOpenSwipe(band, t.clientX - startX, t.clientY - startY);
		if (result === "pending" || result === "catalog" || result === "detail" || result === "cam") {
			e.preventDefault();
		}
	};

	stage.addEventListener("pointerdown", onPointerDown);
	stage.addEventListener("pointermove", onPointerMove);
	stage.addEventListener("pointerup", onPointerUp);
	stage.addEventListener("pointercancel", onPointerUp);
	stage.addEventListener("touchmove", onTouchMove, { passive: false });

	return () => {
		stage.removeEventListener("pointerdown", onPointerDown);
		stage.removeEventListener("pointermove", onPointerMove);
		stage.removeEventListener("pointerup", onPointerUp);
		stage.removeEventListener("pointercancel", onPointerUp);
		stage.removeEventListener("touchmove", onTouchMove);
		reset();
	};
}
