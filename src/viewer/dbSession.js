/**
 * IndexedDB persistence for structure catalog
 * (metadata + file blobs + categories + entries + features).
 */
import { crc32Hex } from "./crc32.js";
export const DEFAULT_DB_NAME = "bedrockLayers-db-viewer";
export const LEGACY_DEFAULT_DB_NAME = "structure-db-viewer";
/** Previous default. IndexedDB cannot rename a database, so boot still clones this one. */
export const PREVIOUS_DEFAULT_DB_NAME = "asi-db-viewer";
/** Retired per-catalog prefix. Boot clones these into `CATALOG_DB_PREFIX`. */
export const LEGACY_CATALOG_PREFIX = "basi-catalog-";
export const CATALOG_DB_PREFIX = "bLayers-catalog-";
export const DB_VERSION = 4;
/** @type {string} */
let activeDbName = DEFAULT_DB_NAME;
export function getActiveDbName() {
	return activeDbName;
}
export function setActiveDbName(name) {
	activeDbName = String(name || DEFAULT_DB_NAME);
}
export function isProtectedDefaultDbName(name) {
	return name === DEFAULT_DB_NAME;
}

/**
 * Live catalog database name. Old defaults and the retired catalog prefix
 * map onto the current names. Other names pass through.
 * @param {string} name
 */
export function canonicalCatalogDbName(name) {
	if (!name || name === LEGACY_DEFAULT_DB_NAME || name === PREVIOUS_DEFAULT_DB_NAME) {
		return DEFAULT_DB_NAME;
	}
	if (name.startsWith(LEGACY_CATALOG_PREFIX)) {
		return CATALOG_DB_PREFIX + name.slice(LEGACY_CATALOG_PREFIX.length);
	}
	return name;
}
export const STORE = "structures";
export const CATEGORIES_STORE = "categories";
export const ENTRIES_STORE = "entries";
export const FEATURES_STORE = "features";
export const META_STORE = "meta";
/**
 * @typedef {object} StoredStructure
 * @property {string} id
 * @property {string} name
 * @property {string} sourceName
 * @property {string} sourceKind
 * @property {[number, number, number]} size
 * @property {[number, number, number]|null} worldOrigin
 * @property {number} paletteSize
 * @property {number} blockCount
 * @property {string[]} blockNames
 * @property {number} entityCount
 * @property {{ id: string, label: string, count: number }[]} [materials]
 * @property {import("./hopperStats.js").HopperStats|null} [hopperStats]
 * @property {string|null} [entryId]
 * @property {string[]} [featureIds]
 * @property {string[]} [acquiredMaterials]
 * @property {string} [defaultCameraPreset]
 * @property {number} [defaultCameraZoom]
 * @property {{ id: string, text: string, addedAt?: number }[]} [userDetails]
 * @property {string} [creator]
 * @property {string} [credits]
 * @property {string} [sourceLink]
 * @property {number} addedAt
 * @property {Blob} blob
 * @property {string} fileName
 * @property {string} [parseError]
 */
/**
 * @typedef {object} StoredCategory
 * @property {string} id
 * @property {string} [slug]
 * @property {string} name
 * @property {string} [description]
 * @property {string} [color]
 * @property {number} sortOrder
 * @property {boolean} collapsed
 * @property {boolean} [isDefault]
 */
/**
 * @typedef {object} StoredCatalogEntry
 * @property {string} id
 * @property {string} slug
 * @property {string} categoryId
 * @property {string} name
 * @property {string} [description]
 * @property {number} sortOrder
 * @property {boolean} collapsed
 * @property {boolean} [isDefault]
 */
/**
 * @typedef {object} StoredFeature
 * @property {string} id
 * @property {string} slug
 * @property {string} name
 * @property {string} [description]
 * @property {string} [useCases]
 * @property {string} color
 * @property {string[]} categoryIds
 * @property {number} sortOrder
 * @property {boolean} [isDefault]
 */
/**
 * @param {string} [name]
 * @returns {Promise<IDBDatabase>}
 */
export function openDb(name) {
	const dbName = name || activeDbName;
	return new Promise((resolve, reject) => {
		if (typeof indexedDB === "undefined") {
			reject(new Error("indexedDB is not available"));
			return;
		}
		const req = indexedDB.open(dbName, DB_VERSION);
		req.onerror = () => reject(req.error ?? new Error("IDB open failed"));
		req.onsuccess = () => resolve(req.result);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(STORE)) {
				db.createObjectStore(STORE, { keyPath: "id" });
			}
			if (!db.objectStoreNames.contains(CATEGORIES_STORE)) {
				db.createObjectStore(CATEGORIES_STORE, { keyPath: "id" });
			}
			if (!db.objectStoreNames.contains(ENTRIES_STORE)) {
				db.createObjectStore(ENTRIES_STORE, { keyPath: "id" });
			}
			if (!db.objectStoreNames.contains(FEATURES_STORE)) {
				db.createObjectStore(FEATURES_STORE, { keyPath: "id" });
			}
			if (!db.objectStoreNames.contains(META_STORE)) {
				db.createObjectStore(META_STORE, { keyPath: "id" });
			}
		};
	});
}
/**
 * @template T
 * @param {IDBRequest<T>} req
 * @returns {Promise<T>}
 */
export function idbReq(req) {
	return new Promise((resolve, reject) => {
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error ?? new Error("IDB request failed"));
		req.onabort = () => reject(req.error ?? new Error("IDB request aborted"));
	});
}
/**
 * @param {IDBTransaction} tx
 * @returns {Promise<void>}
 */
export function idbTxDone(tx) {
	return new Promise((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error ?? new Error("IDB transaction failed"));
		tx.onabort = () => reject(tx.error ?? new Error("IDB transaction aborted"));
	});
}
/**
 * @param {IDBDatabase} db
 * @param {string[]} names
 * @returns {string[]}
 */
export function existingStores(db, names) {
	return names.filter(n => db.objectStoreNames.contains(n));
}
export function serializeCategory(category) {
	return {
		id: category.id,
		slug: typeof category.slug === "string" ? category.slug : "",
		name: category.name,
		description: typeof category.description === "string" ? category.description : "",
		color: typeof category.color === "string" && category.color ? category.color : "#64748b",
		sortOrder: category.sortOrder ?? 0,
		collapsed: !!category.collapsed,
		isDefault: !!category.isDefault
	};
}
export function serializeCatalogEntry(entry) {
	return {
		id: entry.id,
		slug: typeof entry.slug === "string" ? entry.slug : "",
		categoryId: entry.categoryId,
		name: entry.name,
		description: typeof entry.description === "string" ? entry.description : "",
		sortOrder: entry.sortOrder ?? 0,
		collapsed: !!entry.collapsed,
		isDefault: !!entry.isDefault
	};
}
export function serializeFeature(feature) {
	return {
		id: feature.id,
		slug: typeof feature.slug === "string" ? feature.slug : "",
		name: feature.name,
		description: typeof feature.description === "string" ? feature.description : "",
		useCases: typeof feature.useCases === "string" ? feature.useCases : "",
		color: typeof feature.color === "string" && feature.color ? feature.color : "#64748b",
		categoryIds: Array.isArray(feature.categoryIds) ? feature.categoryIds.map(String) : [],
		sortOrder: feature.sortOrder ?? 0,
		isDefault: !!feature.isDefault
	};
}
