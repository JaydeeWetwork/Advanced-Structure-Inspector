/**
 * Named catalog registry (localStorage) + which IndexedDB is active.
 * The original `structure-db-viewer` DB is the default catalog so existing data stays.
 */

import { TAXONOMY_SEED_STATE_KEY } from "../data/taxonomy.js";

export const DEFAULT_CATALOG_ID = "default";
export const DEFAULT_DB_NAME = "structure-db-viewer";
export const REGISTRY_KEY = "basi.catalogRegistry.v1";

function newId() {
	if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
	return `db-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function fallbackRegistry() {
	return {
		activeId: DEFAULT_CATALOG_ID,
		items: [
			{
				id: DEFAULT_CATALOG_ID,
				name: "Database",
				dbName: DEFAULT_DB_NAME,
				updatedAt: Date.now()
			}
		]
	};
}

/**
 * @returns {{ activeId: string, items: { id: string, name: string, dbName: string, updatedAt: number }[] }}
 */
export function loadRegistry() {
	try {
		const raw = localStorage.getItem(REGISTRY_KEY);
		if (!raw) return fallbackRegistry();
		const o = JSON.parse(raw);
		if (!o || !Array.isArray(o.items) || !o.items.length) return fallbackRegistry();
		const items = o.items
			.filter(i => i && i.id && i.dbName)
			.map(i => ({
				id: String(i.id),
				name: String(i.name || "Untitled").trim() || "Untitled",
				dbName: String(i.dbName),
				updatedAt: Number(i.updatedAt) || Date.now()
			}));
		if (!items.length) return fallbackRegistry();
		const activeId = items.some(i => i.id === o.activeId) ? o.activeId : items[0].id;
		return { activeId, items };
	} catch {
		return fallbackRegistry();
	}
}

export function saveRegistry(reg) {
	localStorage.setItem(REGISTRY_KEY, JSON.stringify(reg));
	return reg;
}

export function getActiveCatalog() {
	const r = loadRegistry();
	return r.items.find(i => i.id === r.activeId) ?? r.items[0];
}

export function listCatalogs() {
	return loadRegistry().items.slice().sort((a, b) => a.name.localeCompare(b.name));
}

export function renameCatalog(id, name) {
	const r = loadRegistry();
	const item = r.items.find(i => i.id === id);
	if (!item) return null;
	const trimmed = String(name || "").trim();
	if (!trimmed) return item;
	item.name = trimmed;
	item.updatedAt = Date.now();
	saveRegistry(r);
	return item;
}

export function touchCatalog(id) {
	const r = loadRegistry();
	const item = r.items.find(i => i.id === id);
	if (!item) return;
	item.updatedAt = Date.now();
	saveRegistry(r);
}

export function setActiveCatalogId(id) {
	const r = loadRegistry();
	if (!r.items.some(i => i.id === id)) return r;
	r.activeId = id;
	return saveRegistry(r);
}

export function addCatalogRecord(name) {
	const id = newId();
	const r = loadRegistry();
	const item = {
		id,
		name: String(name || "").trim() || "Untitled",
		dbName: `basi-catalog-${id}`,
		updatedAt: Date.now()
	};
	r.items.push(item);
	saveRegistry(r);
	return item;
}

export function createCatalogRecord(name) {
	const item = addCatalogRecord(name);
	setActiveCatalogId(item.id);
	return item;
}

export function copySeedState(fromDbName, toDbName) {
	if (!fromDbName || !toDbName || fromDbName === toDbName) return;
	try {
		let raw = localStorage.getItem(`${TAXONOMY_SEED_STATE_KEY}::${fromDbName}`);
		if (!raw && fromDbName === DEFAULT_DB_NAME) {
			raw = localStorage.getItem(TAXONOMY_SEED_STATE_KEY);
		}
		if (raw) localStorage.setItem(`${TAXONOMY_SEED_STATE_KEY}::${toDbName}`, raw);
	} catch {
		/* ignore */
	}
}

export function removeCatalogRecord(id) {
	const r = loadRegistry();
	if (r.items.length <= 1) return null;
	const item = r.items.find(i => i.id === id);
	if (!item) return null;
	r.items = r.items.filter(i => i.id !== id);
	if (r.activeId === id) r.activeId = r.items[0].id;
	saveRegistry(r);
	return { removed: item, next: r.items.find(i => i.id === r.activeId) };
}
