/**
 * Coarse-pointer flag for iPad / touch: body.basi-touch disables hover-open chrome.
 * Trackpad iPads (pointer: fine) keep hover; finger gestures still use pointerType.
 */

const COARSE_QUERY = "(pointer: coarse)";

/**
 * @returns {boolean}
 */
export function isTouchUi() {
	return typeof document !== "undefined"
		&& document.body.classList.contains("basi-touch");
}

/**
 * @returns {() => void} unbind
 */
export function initPointerMode() {
	if (typeof window === "undefined" || typeof document === "undefined") return () => {};
	const mq = window.matchMedia(COARSE_QUERY);
	const apply = () => {
		document.body.classList.toggle("basi-touch", !!mq.matches);
	};
	apply();
	if (typeof mq.addEventListener === "function") {
		mq.addEventListener("change", apply);
		return () => mq.removeEventListener("change", apply);
	}
	mq.addListener?.(apply);
	return () => mq.removeListener?.(apply);
}
