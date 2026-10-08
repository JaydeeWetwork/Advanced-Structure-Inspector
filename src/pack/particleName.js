/**
 * Pack particle ids and zip entry names derived from block ids.
 */

const registry = new Map();
const used = new Set();

export function resetParticleNames() {
	registry.clear();
	used.clear();
}

/**
 * `validate_` plus a filename-safe block id. Collisions gain `_2`, `_3`, …
 * @param {string} blockName
 * @returns {string}
 */
export function particleNameFor(blockName) {
	const key = String(blockName ?? "");
	const hit = registry.get(key);
	if (hit) return hit;
	let name = "validate_" + key.replace(/[^a-z0-9_.-]/gi, "_");
	if (used.has(name)) {
		let n = 2;
		while (used.has(`${name}_${n}`)) n++;
		name = `${name}_${n}`;
	}
	used.add(name);
	registry.set(key, name);
	return name;
}

/**
 * Reject zip entry names that leave the pack root.
 * @param {string} fileName
 */
export function assertSafePackEntryName(fileName) {
	const name = String(fileName);
	if (name.startsWith("/") || name.includes("\\") || name.split("/").includes("..")) {
		throw new Error(`Unsafe pack entry name: ${name}`);
	}
}
