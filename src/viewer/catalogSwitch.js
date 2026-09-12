/**
 * Named-catalog lifecycle. Clone/register only after IDB succeeds.
 */

import {
	DEFAULT_DB_NAME,
	dbClearAll,
	dbCloneCatalog,
	dbDeleteCatalog
} from "./db.js";
import {
	addCatalogRecord,
	getActiveCatalog,
	listCatalogs,
	removeCatalogRecord,
	renameCatalog,
	setActiveCatalogId
} from "./catalogRegistry.js";

function newCatalogId() {
	if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
	return `db-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * @param {import("./catalog.js").default} catalog
 * @param {string} id
 */
export async function activateCatalog(catalog, id) {
	const items = listCatalogs();
	const item = items.find(i => i.id === id) ?? getActiveCatalog();
	if (!item) throw new Error("No catalog to activate");
	setActiveCatalogId(item.id);
	await catalog.reloadFromDb(item.dbName);
	return item;
}

/**
 * @param {import("./catalog.js").default} catalog
 * @param {string} name
 */
export async function saveCatalogAs(catalog, name) {
	const from = catalog.getDbName();
	const id = newCatalogId();
	const dbName = `basi-catalog-${id}`;
	await dbCloneCatalog(from, dbName);
	const rec = addCatalogRecord(name, { id, dbName });
	return activateCatalog(catalog, rec.id);
}

/**
 * @param {import("./catalog.js").default} catalog
 * @param {string} name
 */
export async function createEmptyCatalog(catalog, name) {
	const id = newCatalogId();
	const dbName = `basi-catalog-${id}`;
	const rec = addCatalogRecord(name, { id, dbName });
	setActiveCatalogId(rec.id);
	await catalog.reloadFromDb(dbName);
	return rec;
}

/**
 * @param {import("./catalog.js").default} catalog
 */
export async function deleteActiveCatalog(catalog) {
	const active = getActiveCatalog();
	const others = listCatalogs().filter(i => i.id !== active.id);
	if (!others.length) throw new Error("Cannot delete the last catalog");
	const next = others[0];
	if (active.dbName === DEFAULT_DB_NAME) {
		await dbClearAll(active.dbName);
	} else {
		await dbDeleteCatalog(active.dbName);
	}
	removeCatalogRecord(active.id);
	return activateCatalog(catalog, next.id);
}

/**
 * @param {string} name
 */
export function renameActiveCatalog(name) {
	const active = getActiveCatalog();
	return renameCatalog(active.id, name);
}
