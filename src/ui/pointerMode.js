/**
 * Fine-pointer hover (mouse/trackpad). iPad Safari "desktop site" is often
 * pointer:fine — CSS uses (hover:hover) and (pointer:fine), not a body class.
 */

/**
 * @returns {boolean}
 */
export function prefersFineHover() {
	if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
		return true;
	}
	return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}
