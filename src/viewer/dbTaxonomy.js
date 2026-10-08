/** Categories, entries, features, and catalog copy. */
import { serializeStructure } from "./dbStructures.js";
import {
	CATEGORIES_STORE,
	ENTRIES_STORE,
	existingStores,
	FEATURES_STORE,
	idbReq,
	idbTxDone,
	META_STORE,
	openDb,
	serializeCatalogEntry,
	serializeCategory,
	serializeFeature,
	STORE
} from "./dbSession.js";
/**
 * @param {StoredCategory} category
 * @returns {Promise<void>}
 */
export async function dbPutCategory(category, dbName) {
	const db = await openDb(dbName);
	try {
		const tx = db.transaction(CATEGORIES_STORE, "readwrite");
		await idbReq(tx.objectStore(CATEGORIES_STORE).put(serializeCategory(category)));
		await idbTxDone(tx);
	} finally {
		db.close();
	}
}
/**
 * @param {StoredCategory[]} categories
 * @returns {Promise<void>}
 */
export async function dbPutCategories(categories, dbName) {
	const db = await openDb(dbName);
	try {
		const tx = db.transaction(CATEGORIES_STORE, "readwrite");
		const store = tx.objectStore(CATEGORIES_STORE);
		for (const category of categories) {
			store.put(serializeCategory(category));
		}
		await idbTxDone(tx);
	} finally {
		db.close();
	}
}
/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function dbDeleteCategory(id, dbName) {
	const db = await openDb(dbName);
	try {
		const tx = db.transaction(CATEGORIES_STORE, "readwrite");
		await idbReq(tx.objectStore(CATEGORIES_STORE).delete(id));
		await idbTxDone(tx);
	} finally {
		db.close();
	}
}
/**
 * @returns {Promise<StoredCategory[]>}
 */
export async function dbLoadCategories(dbName) {
	const db = await openDb(dbName);
	try {
		if (!db.objectStoreNames.contains(CATEGORIES_STORE)) return [];
		const tx = db.transaction(CATEGORIES_STORE, "readonly");
		/** @type {StoredCategory[]} */
		const rows = await idbReq(tx.objectStore(CATEGORIES_STORE).getAll());
		await idbTxDone(tx);
		return rows
			.map(r => serializeCategory(r))
			.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
	} finally {
		db.close();
	}
}
/**
 * @param {StoredCatalogEntry} entry
 * @returns {Promise<void>}
 */
export async function dbPutEntry(entry, dbName) {
	const db = await openDb(dbName);
	try {
		const tx = db.transaction(ENTRIES_STORE, "readwrite");
		await idbReq(tx.objectStore(ENTRIES_STORE).put(serializeCatalogEntry(entry)));
		await idbTxDone(tx);
	} finally {
		db.close();
	}
}
/**
 * @param {StoredCatalogEntry[]} entries
 * @returns {Promise<void>}
 */
export async function dbPutEntries(entries, dbName) {
	const db = await openDb(dbName);
	try {
		const tx = db.transaction(ENTRIES_STORE, "readwrite");
		const store = tx.objectStore(ENTRIES_STORE);
		for (const entry of entries) {
			store.put(serializeCatalogEntry(entry));
		}
		await idbTxDone(tx);
	} finally {
		db.close();
	}
}
/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function dbDeleteEntry(id, dbName) {
	const db = await openDb(dbName);
	try {
		if (!db.objectStoreNames.contains(ENTRIES_STORE)) return;
		const tx = db.transaction(ENTRIES_STORE, "readwrite");
		await idbReq(tx.objectStore(ENTRIES_STORE).delete(id));
		await idbTxDone(tx);
	} finally {
		db.close();
	}
}
/**
 * @returns {Promise<StoredCatalogEntry[]>}
 */
export async function dbLoadEntries(dbName) {
	const db = await openDb(dbName);
	try {
		if (!db.objectStoreNames.contains(ENTRIES_STORE)) return [];
		const tx = db.transaction(ENTRIES_STORE, "readonly");
		/** @type {StoredCatalogEntry[]} */
		const rows = await idbReq(tx.objectStore(ENTRIES_STORE).getAll());
		await idbTxDone(tx);
		return rows
			.map(r => serializeCatalogEntry(r))
			.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
	} finally {
		db.close();
	}
}
/**
 * @param {StoredFeature} feature
 * @returns {Promise<void>}
 */
export async function dbPutFeature(feature, dbName) {
	const db = await openDb(dbName);
	try {
		const tx = db.transaction(FEATURES_STORE, "readwrite");
		await idbReq(tx.objectStore(FEATURES_STORE).put(serializeFeature(feature)));
		await idbTxDone(tx);
	} finally {
		db.close();
	}
}
/**
 * @param {StoredFeature[]} features
 * @returns {Promise<void>}
 */
export async function dbPutFeatures(features, dbName) {
	const db = await openDb(dbName);
	try {
		const tx = db.transaction(FEATURES_STORE, "readwrite");
		const store = tx.objectStore(FEATURES_STORE);
		for (const feature of features) {
			store.put(serializeFeature(feature));
		}
		await idbTxDone(tx);
	} finally {
		db.close();
	}
}
/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function dbDeleteFeature(id, dbName) {
	const db = await openDb(dbName);
	try {
		if (!db.objectStoreNames.contains(FEATURES_STORE)) return;
		const tx = db.transaction(FEATURES_STORE, "readwrite");
		await idbReq(tx.objectStore(FEATURES_STORE).delete(id));
		await idbTxDone(tx);
	} finally {
		db.close();
	}
}
/**
 * @returns {Promise<StoredFeature[]>}
 */
export async function dbLoadFeatures(dbName) {
	const db = await openDb(dbName);
	try {
		if (!db.objectStoreNames.contains(FEATURES_STORE)) return [];
		const tx = db.transaction(FEATURES_STORE, "readonly");
		/** @type {StoredFeature[]} */
		const rows = await idbReq(tx.objectStore(FEATURES_STORE).getAll());
		await idbTxDone(tx);
		return rows
			.map(r => serializeFeature(r))
			.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
	} finally {
		db.close();
	}
}
const ALL_STORES = [STORE, CATEGORIES_STORE, ENTRIES_STORE, FEATURES_STORE, META_STORE];
/**
 * Row count across catalog stores. Opening a missing DB may create it.
 * @param {string} dbName
 * @returns {Promise<number>}
 */
export async function dbCatalogRowCount(dbName) {
	const db = await openDb(dbName);
	try {
		const names = existingStores(db, ALL_STORES);
		if (!names.length) return 0;
		const tx = db.transaction(names, "readonly");
		let n = 0;
		for (const name of names) {
			n += await idbReq(tx.objectStore(name).count());
		}
		await idbTxDone(tx);
		return n;
	} finally {
		db.close();
	}
}
/**
 * @param {string} [dbName]
 * @returns {Promise<{ id: string, version?: number, applied?: string[] }|null>}
 */
export async function dbGetMeta(dbName) {
	const db = await openDb(dbName);
	try {
		if (!db.objectStoreNames.contains(META_STORE)) return null;
		const tx = db.transaction(META_STORE, "readonly");
		const row = await idbReq(tx.objectStore(META_STORE).get("seed"));
		await idbTxDone(tx);
		return row ?? null;
	} finally {
		db.close();
	}
}
/**
 * @param {{ version?: number, applied?: string[] }} record
 * @param {string} [dbName]
 */
export async function dbPutMeta(record, dbName) {
	const db = await openDb(dbName);
	try {
		if (!db.objectStoreNames.contains(META_STORE)) return;
		const tx = db.transaction(META_STORE, "readwrite");
		await idbReq(
			tx.objectStore(META_STORE).put({
				id: "seed",
				version: record.version ?? 0,
				applied: Array.isArray(record.applied) ? record.applied : []
			})
		);
		await idbTxDone(tx);
	} finally {
		db.close();
	}
}
/**
 * Copy every catalog store from one IndexedDB into another (creates dest if needed).
 * @param {string} fromName
 * @param {string} toName
 */
export async function dbCloneCatalog(fromName, toName) {
	if (!fromName || !toName || fromName === toName) return;
	const src = await openDb(fromName);
	const dst = await openDb(toName);
	try {
		const names = existingStores(src, ALL_STORES);
		/** @type {Record<string, object[]>} */
		const data = {};
		if (names.length) {
			const tx = src.transaction(names, "readonly");
			for (const name of names) {
				data[name] = await idbReq(tx.objectStore(name).getAll());
			}
			await idbTxDone(tx);
		}
		const destNames = existingStores(dst, ALL_STORES);
		const txw = dst.transaction(destNames, "readwrite");
		for (const name of destNames) {
			const store = txw.objectStore(name);
			await idbReq(store.clear());
			for (const rec of data[name] || []) store.put(rec);
		}
		await idbTxDone(txw);
	} finally {
		src.close();
		dst.close();
	}
}
/**
 * @param {string} name
 */
export async function dbDeleteCatalog(name) {
	if (!name) return;
	return new Promise((resolve, reject) => {
		const req = indexedDB.deleteDatabase(name);
		const timer = setTimeout(() => {
			reject(new Error("IndexedDB delete blocked — close other tabs using this catalog"));
		}, 8000);
		req.onsuccess = () => {
			clearTimeout(timer);
			resolve();
		};
		req.onerror = () => {
			clearTimeout(timer);
			reject(req.error ?? new Error("IDB delete failed"));
		};
		req.onblocked = () => {
			/* wait for connections to close; timeout rejects */
		};
	});
}
/**
 * @param {string} dbName
 * @param {{ categoryId: string, childEntryIds: string[], movedStructures: object[], taggedFeatures: object[] }} spec
 */
export async function dbRemoveCategoryCascade(dbName, spec) {
	const db = await openDb(dbName);
	try {
		const names = existingStores(db, [CATEGORIES_STORE, ENTRIES_STORE, STORE, FEATURES_STORE]);
		const tx = db.transaction(names, "readwrite");
		if (names.includes(CATEGORIES_STORE)) tx.objectStore(CATEGORIES_STORE).delete(spec.categoryId);
		if (names.includes(ENTRIES_STORE)) {
			for (const id of spec.childEntryIds || []) tx.objectStore(ENTRIES_STORE).delete(id);
		}
		if (names.includes(STORE)) {
			for (const entry of spec.movedStructures || []) {
				tx.objectStore(STORE).put(serializeStructure(entry));
			}
		}
		if (names.includes(FEATURES_STORE)) {
			for (const feat of spec.taggedFeatures || []) {
				tx.objectStore(FEATURES_STORE).put(serializeFeature(feat));
			}
		}
		await idbTxDone(tx);
	} finally {
		db.close();
	}
}
/**
 * @param {string} dbName
 * @param {{ entryId: string, movedStructures: object[] }} spec
 */
export async function dbRemoveEntryCascade(dbName, spec) {
	const db = await openDb(dbName);
	try {
		const names = existingStores(db, [ENTRIES_STORE, STORE]);
		const tx = db.transaction(names, "readwrite");
		if (names.includes(ENTRIES_STORE)) tx.objectStore(ENTRIES_STORE).delete(spec.entryId);
		if (names.includes(STORE)) {
			for (const entry of spec.movedStructures || []) {
				tx.objectStore(STORE).put(serializeStructure(entry));
			}
		}
		await idbTxDone(tx);
	} finally {
		db.close();
	}
}
/**
 * @param {string} dbName
 * @param {{ featureId: string, touchedStructures: object[] }} spec
 */
export async function dbRemoveFeatureCascade(dbName, spec) {
	const db = await openDb(dbName);
	try {
		const names = existingStores(db, [FEATURES_STORE, STORE]);
		const tx = db.transaction(names, "readwrite");
		if (names.includes(FEATURES_STORE)) tx.objectStore(FEATURES_STORE).delete(spec.featureId);
		if (names.includes(STORE)) {
			for (const entry of spec.touchedStructures || []) {
				tx.objectStore(STORE).put(serializeStructure(entry));
			}
		}
		await idbTxDone(tx);
	} finally {
		db.close();
	}
}
