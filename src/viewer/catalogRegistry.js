/**
 * Named catalog registry (localStorage) + which IndexedDB is active.
 * Default catalog IndexedDB is `asi-db-viewer`; boot remaps the legacy name.
 */

import { DEFAULT_DB_NAME, LEGACY_DEFAULT_DB_NAME } from "./db.js";

export { DEFAULT_DB_NAME };
export const DEFAULT_CATALOG_ID = "default";
export const REGISTRY_KEY = "basi.catalogRegistry.v1";

/** @type {Storage|null} */
let registryStorage = typeof localStorage !== "undefined" ? localStorage : null;

/** Inject storage (unit tests). Pass null to use an in-memory map. */
export function setRegistryStorage(storage) {
	registryStorage = storage;
}

function store() {
	if (registryStorage) return registryStorage;
	if (typeof localStorage !== "undefined") return localStorage;
	return {
		_d: new Map(),
		getItem(k) {
			return this._d.has(k) ? this._d.get(k) : null;
		},
		setItem(k, v) {
			this._d.set(k, String(v));
		},
		removeItem(k) {
			this._d.delete(k);
		}
	};
}

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
		const raw = store().getItem(REGISTRY_KEY);
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
	store().setItem(REGISTRY_KEY, JSON.stringify(reg));
	return reg;
}

/** Point registry rows still using the old default IDB name at `asi-db-viewer`. */
export function remapLegacyDefaultDbNames() {
	const r = loadRegistry();
	let changed = false;
	for (const item of r.items) {
		if (item.dbName === LEGACY_DEFAULT_DB_NAME) {
			item.dbName = DEFAULT_DB_NAME;
			changed = true;
		}
	}
	if (changed) saveRegistry(r);
	return r;
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

/**
 * @param {string} name
 * @param {{ id?: string, dbName?: string }} [opts]
 */
export function addCatalogRecord(name, opts = {}) {
	const id = opts.id || newId();
	const r = loadRegistry();
	const item = {
		id,
		name: String(name || "").trim() || "Untitled",
		dbName: opts.dbName || `basi-catalog-${id}`,
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
