/**
 * Never-fail block appearance: unknown ids still resolve to the unit cube.
 */

import BlockUpdater from "./engine/BlockUpdater.js";

/**
 * @param {string} blockName un-namespaced
 * @param {Record<string, string>} individualBlocks
 * @param {[RegExp, string][]} patterns
 * @returns {{ shape: string, fallback: boolean }}
 */
export function resolveBlockShapeName(blockName, individualBlocks, patterns) {
	const key = typeof blockName === "string" ? blockName : "";
	const individual = individualBlocks != null && Object.hasOwn(individualBlocks, key)
		? individualBlocks[key]
		: undefined;
	if (typeof individual === "string" && individual) return { shape: individual, fallback: false };
	const matching = patterns.find(([pattern]) => pattern.test(blockName))?.[1];
	if (matching) return { shape: matching, fallback: false };
	return { shape: "block", fallback: true };
}

/**
 * One load line. Default cubes stay a count. Misses are named.
 * @param {{ defaultCubeCount?: number, missingGeo?: Iterable<string>, checkerboard?: Iterable<string> }} report
 */
export function formatAppearanceLog(report) {
	const cubes = report.defaultCubeCount ?? 0;
	const geo = [...(report.missingGeo ?? [])].sort();
	const tex = [...(report.checkerboard ?? [])].sort();
	let line = `[bLayers] appearance: ${cubes} default cube(s)`;
	if (geo.length) line += `; no geo: ${geo.join(", ")}`;
	if (tex.length) line += `; checkerboard: ${tex.join(", ")}`;
	return line;
}

/**
 * One preview sentence. Placeholders are the subset of newer blocks with no shape.
 * @param {{ placeholderCount?: number, newerCount?: number }} report
 */
export function formatVersionGapNote(report) {
	const placeholders = report.placeholderCount ?? 0;
	const newer = report.newerCount ?? 0;
	if (newer <= 0) return "";
	const states = newer === 1
		? "1 block is newer than the upgrade data, so its states were left as saved"
		: `${newer} blocks are newer than the upgrade data, so their states were left as saved`;
	if (placeholders <= 0) return `${states}.`;
	if (newer === 1 && placeholders === 1) return `${states}, and it is shown as a placeholder.`;
	if (placeholders === 1) return `${states}, and 1 of them is shown as a placeholder.`;
	return `${states}, and ${placeholders} of them are shown as placeholders.`;
}

const SKIP_NEWER_NAMES = new Set(["air", "cave_air", "void_air"]);

/**
 * Placed cells whose palette row is newer than every schema bucket.
 * @param {{ palette?: unknown[], indices?: ArrayLike<number>[], unmappedNames?: Iterable<string> }} report
 */
export function countNewerBlocks(report) {
	let newerCount = 0;
	let placeholderCount = 0;
	const layer = report.indices?.[0];
	const palette = report.palette ?? [];
	if (!layer) return { newerCount, placeholderCount };
	const unmapped = report.unmappedNames instanceof Set
		? report.unmappedNames
		: new Set(report.unmappedNames ?? []);
	for (let i = 0; i < layer.length; i++) {
		const pi = layer[i];
		if (!Number.isInteger(pi) || pi < 0) continue;
		const block = palette[pi];
		if (!block || typeof block !== "object") continue;
		if (!(Number(block["version"]) > BlockUpdater.LATEST_VERSION)) continue;
		const name = String(block.name ?? "").replace(/^minecraft:/, "");
		if (!name || SKIP_NEWER_NAMES.has(name)) continue;
		newerCount++;
		if (unmapped.has(name) || unmapped.has(block.name)) placeholderCount++;
	}
	return { newerCount, placeholderCount };
}
