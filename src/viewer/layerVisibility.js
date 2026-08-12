/**
 * Single source of truth for layer-mode visibility.
 * Active slice Y, plus solid floor Y-1 when selected > 0.
 */

/**
 * @param {number} y block / entity layer index
 * @param {number|null|undefined} selected null = whole structure
 * @returns {boolean}
 */
export function isOnActiveLayer(y, selected) {
	if (selected == null || !Number.isFinite(selected)) return true;
	const s = Math.floor(selected);
	const yy = Math.floor(y);
	return yy === s || (s > 0 && yy === s - 1);
}

/**
 * @param {number|null|undefined} selected
 * @returns {Set<number>|null} null = all layers
 */
export function allowedLayerYs(selected) {
	if (selected == null || !Number.isFinite(selected)) return null;
	const s = Math.floor(selected);
	const set = new Set([s]);
	if (s > 0) set.add(s - 1);
	return set;
}
