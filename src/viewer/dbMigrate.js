/**
 * One-time catalog database rename into the live names.
 * Call from catalog boot only — not from hydrate/reload.
 *
 * Each old name is decided on its own. Clone only into an empty destination
 * whose source has rows, and delete that source only after the clone succeeds.
 * Point the registry at the new name when the clone ran, or when the source
 * has no rows. A source that still has rows, and was not cloned, keeps its name.
 *
 * The two old default databases share one destination. The previous default
 * is decided first, so a clone from it fills the destination and a later
 * structure-db-viewer that still has rows is left alone.
 */

import {
	canonicalCatalogDbName,
	DEFAULT_DB_NAME,
	LEGACY_DEFAULT_DB_NAME,
	PREVIOUS_DEFAULT_DB_NAME,
	dbCatalogRowCount,
	dbCloneCatalog,
	dbDeleteCatalog
} from "./db.js";
import { loadRegistry, saveRegistry } from "./catalogRegistry.js";

/** Older default first, then the oldest. Order is the shared-destination priority. */
export const DEFAULT_RENAME_SOURCES = [PREVIOUS_DEFAULT_DB_NAME, LEGACY_DEFAULT_DB_NAME];

/**
 * @param {{ destCount?: number, sourceCount?: number }} [input]
 * @returns {{ clone: boolean, retarget: boolean }}
 */
export function planDbRename(input = {}) {
	const destEmpty = (Number(input.destCount) || 0) === 0;
	const sourceHasData = (Number(input.sourceCount) || 0) > 0;
	const clone = destEmpty && sourceHasData;
	return { clone, retarget: clone || !sourceHasData };
}

/**
 * @param {number} destCount
 * @param {{ name: string, count: number }[]} sources
 * @returns {{ name: string, clone: boolean, retarget: boolean }[]}
 */
export function planRenameSequence(destCount, sources) {
	let dest = Number(destCount) || 0;
	return sources.map(source => {
		const plan = planDbRename({ destCount: dest, sourceCount: source.count });
		if (plan.clone) dest = 1;
		return { name: source.name, clone: plan.clone, retarget: plan.retarget };
	});
}

/**
 * @param {string} name
 * @returns {Promise<boolean|null>}
 */
async function databaseExists(name) {
	if (typeof indexedDB === "undefined") return false;
	if (typeof indexedDB.databases !== "function") return null;
	try {
		const list = await indexedDB.databases();
		return (list || []).some(d => d && d.name === name);
	} catch {
		return null;
	}
}

/**
 * @param {string} name
 */
async function rowCount(name) {
	const known = await databaseExists(name);
	if (known === false) return 0;
	return Number(await dbCatalogRowCount(name)) || 0;
}

/**
 * @param {string} from
 * @param {string} to
 * @returns {Promise<{ cloned: boolean, deleted: boolean }>}
 */
async function cloneAndDelete(from, to) {
	await dbCloneCatalog(from, to);
	try {
		await dbDeleteCatalog(from);
		return { cloned: true, deleted: true };
	} catch (e) {
		console.warn("[bLayers] legacy IndexedDB delete failed:", e);
		return { cloned: true, deleted: false };
	}
}

/**
 * @returns {Promise<{ cloned: boolean, deleted: boolean, skipped?: boolean }>}
 */
export async function ensureDefaultCatalogMigrated() {
	if (typeof indexedDB === "undefined") {
		return { cloned: false, deleted: false, skipped: true };
	}

	const reg = loadRegistry();
	const destCount = await rowCount(DEFAULT_DB_NAME);
	const defaultSources = [];
	for (const name of DEFAULT_RENAME_SOURCES) {
		defaultSources.push({ name, count: await rowCount(name) });
	}
	const plans = planRenameSequence(destCount, defaultSources).map(plan => ({
		...plan,
		to: DEFAULT_DB_NAME
	}));

	const seen = new Set(DEFAULT_RENAME_SOURCES);
	for (const item of reg.items) {
		const from = item.dbName;
		if (!from || seen.has(from)) continue;
		const to = canonicalCatalogDbName(from);
		if (to === from) continue;
		seen.add(from);
		plans.push({
			name: from,
			to,
			...planDbRename({
				destCount: await rowCount(to),
				sourceCount: await rowCount(from)
			})
		});
	}

	let cloned = false;
	let deleted = false;
	/** @type {Map<string, string>} */
	const retarget = new Map();
	for (const plan of plans) {
		const to = plan.to;
		if (plan.clone) {
			const result = await cloneAndDelete(plan.name, to);
			cloned = cloned || result.cloned;
			deleted = deleted || result.deleted;
		}
		if (plan.retarget) retarget.set(plan.name, to);
	}

	let changed = false;
	for (const item of reg.items) {
		const to = retarget.get(item.dbName);
		if (!to || to === item.dbName) continue;
		item.dbName = to;
		changed = true;
	}
	if (changed) saveRegistry(reg);
	return { cloned, deleted };
}
