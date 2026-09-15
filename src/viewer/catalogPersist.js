/**
 * IndexedDB hydrate / structure put / seed-meta for StructureCatalog.
 */

import {
	dbPutStructure,
	dbLoadAll,
	dbLoadCategories,
	dbLoadEntries,
	dbLoadFeatures,
	dbGetMeta,
	dbPutMeta,
	clearLegacyLocalStorageIndex,
	DEFAULT_DB_NAME
} from "./db.js";
import { TAXONOMY_SEED_STATE_KEY, TAXONOMY_SEED_VERSION } from "../data/taxonomy.js";
import { fillHydratedMaps } from "./catalogQuery.js";

/**
 * @param {boolean} persistEnabled
 * @param {string} dbName
 * @param {import("./catalog.js").StructureCatalogEntry} entry
 * @param {(err: Error|null) => void} onDone
 */
export async function persistStructureEntry(persistEnabled, dbName, entry, onDone) {
	if (!persistEnabled) return;
	try {
		await dbPutStructure(entry, dbName);
		onDone(null);
	} catch (e) {
		onDone(/** @type {Error} */ (e));
		console.warn("[basi] IndexedDB put failed:", e);
	}
}

/**
 * @param {boolean} persistEnabled
 * @param {() => Promise<void>} fn
 * @param {string} label
 * @param {(err: Error|null) => void} onDone
 */
export async function tryPersist(persistEnabled, fn, label, onDone) {
	if (!persistEnabled) return;
	try {
		await fn();
		onDone(null);
	} catch (e) {
		onDone(/** @type {Error} */ (e));
		console.warn(`[basi] ${label} failed:`, e);
	}
}

/**
 * @param {boolean} persistEnabled
 * @param {string} dbName
 * @returns {Promise<Set<string>>}
 */
export async function loadAppliedSeedKeys(persistEnabled, dbName) {
	if (!persistEnabled) return new Set();
	try {
		const meta = await dbGetMeta(dbName);
		if (Array.isArray(meta?.applied)) return new Set(meta.applied);
		if (typeof localStorage === "undefined") return new Set();
		let raw = localStorage.getItem(`${TAXONOMY_SEED_STATE_KEY}::${dbName}`);
		if (!raw && dbName === DEFAULT_DB_NAME) {
			raw = localStorage.getItem(TAXONOMY_SEED_STATE_KEY);
		}
		if (!raw) return new Set();
		const o = JSON.parse(raw);
		return new Set(Array.isArray(o?.applied) ? o.applied : []);
	} catch {
		return new Set();
	}
}

/**
 * @param {boolean} persistEnabled
 * @param {string} dbName
 * @param {Set<string>} applied
 */
export async function saveAppliedSeedKeys(persistEnabled, dbName, applied) {
	if (!persistEnabled) return;
	await dbPutMeta({ version: TAXONOMY_SEED_VERSION, applied: [...applied] }, dbName);
}

/**
 * @param {object} ctx
 * @param {string} ctx.dbName
 * @param {Map} ctx.entries
 * @param {Map} ctx.categories
 * @param {Map} ctx.catalogEntries
 * @param {Map} ctx.features
 * @returns {Promise<number>}
 */
export async function hydrateCatalogStores(ctx) {
	clearLegacyLocalStorageIndex();
	const [rows, cats, ents, feats] = await Promise.all([
		dbLoadAll(ctx.dbName),
		dbLoadCategories(ctx.dbName),
		dbLoadEntries(ctx.dbName),
		dbLoadFeatures(ctx.dbName)
	]);
	fillHydratedMaps({
		rows,
		cats,
		ents,
		feats,
		entries: ctx.entries,
		categories: ctx.categories,
		catalogEntries: ctx.catalogEntries,
		features: ctx.features
	});
	return rows.length;
}
