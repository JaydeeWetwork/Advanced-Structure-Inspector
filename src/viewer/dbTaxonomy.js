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
 * Open one object store, run `fn`, and close the database.
 * A missing store calls `onMissing` when that function is passed.
 * Otherwise the transaction throws, which is what a put into a new catalog expects.
 * @template T
 * @param {string} dbName
 * @param {string} storeName
 * @param {"readonly"|"readwrite"} mode
 * @param {(store: IDBObjectStore) => T|Promise<T>} fn
 * @param {() => T} [onMissing]
 * @returns {Promise<T>}
 */
async function withStore(dbName, storeName, mode, fn, onMissing) {
	const db = await openDb(dbName);
	try {
		if (!db.objectStoreNames.contains(storeName)) {
			if (onMissing) return onMissing();
		}
		const tx = db.transaction(storeName, mode);
		const result = await fn(tx.objectStore(storeName));
		await idbTxDone(tx);
		return result;
	} finally {
		db.close();
	}
}

const missingList = () => [];
const missingOk = () => undefined;

/**
 * @param {{ sortOrder: number, name: string }} a
 * @param {{ sortOrder: number, name: string }} b
 */
function bySortName(a, b) {
	return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
}

/**
 * @param {StoredCategory} category
 * @returns {Promise<void>}
 */
export async function dbPutCategory(category, dbName) {
	await withStore(dbName, CATEGORIES_STORE, "readwrite", store =>
		idbReq(store.put(serializeCategory(category)))
	);
}
/**
 * @param {StoredCategory[]} categories
 * @returns {Promise<void>}
 */
export async function dbPutCategories(categories, dbName) {
	await withStore(dbName, CATEGORIES_STORE, "readwrite", store => {
		for (const category of categories) store.put(serializeCategory(category));
	});
}
/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function dbDeleteCategory(id, dbName) {
	await withStore(
		dbName,
		CATEGORIES_STORE,
		"readwrite",
		store => idbReq(store.delete(id)),
		missingOk
	);
}
/**
 * @returns {Promise<StoredCategory[]>}
 */
export async function dbLoadCategories(dbName) {
	return withStore(dbName, CATEGORIES_STORE, "readonly", async store => {
		const rows = await idbReq(store.getAll());
		return rows.map(row => serializeCategory(row)).sort(bySortName);
	}, missingList);
}
/**
 * @param {StoredCatalogEntry} entry
 * @returns {Promise<void>}
 */
export async function dbPutEntry(entry, dbName) {
	await withStore(dbName, ENTRIES_STORE, "readwrite", store =>
		idbReq(store.put(serializeCatalogEntry(entry)))
	);
}
/**
 * @param {StoredCatalogEntry[]} entries
 * @returns {Promise<void>}
 */
export async function dbPutEntries(entries, dbName) {
	await withStore(dbName, ENTRIES_STORE, "readwrite", store => {
		for (const entry of entries) store.put(serializeCatalogEntry(entry));
	});
}
/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function dbDeleteEntry(id, dbName) {
	await withStore(
		dbName,
		ENTRIES_STORE,
		"readwrite",
		store => idbReq(store.delete(id)),
		missingOk
	);
}
/**
 * @returns {Promise<StoredCatalogEntry[]>}
 */
export async function dbLoadEntries(dbName) {
	return withStore(dbName, ENTRIES_STORE, "readonly", async store => {
		const rows = await idbReq(store.getAll());
		return rows.map(row => serializeCatalogEntry(row)).sort(bySortName);
	}, missingList);
}
/**
 * @param {StoredFeature} feature
 * @returns {Promise<void>}
 */
export async function dbPutFeature(feature, dbName) {
	await withStore(dbName, FEATURES_STORE, "readwrite", store =>
		idbReq(store.put(serializeFeature(feature)))
	);
}
/**
 * @param {StoredFeature[]} features
 * @returns {Promise<void>}
 */
export async function dbPutFeatures(features, dbName) {
	await withStore(dbName, FEATURES_STORE, "readwrite", store => {
		for (const feature of features) store.put(serializeFeature(feature));
	});
}
/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function dbDeleteFeature(id, dbName) {
	await withStore(
		dbName,
		FEATURES_STORE,
		"readwrite",
		store => idbReq(store.delete(id)),
		missingOk
	);
}
/**
 * @returns {Promise<StoredFeature[]>}
 */
export async function dbLoadFeatures(dbName) {
	return withStore(dbName, FEATURES_STORE, "readonly", async store => {
		const rows = await idbReq(store.getAll());
		return rows.map(row => serializeFeature(row)).sort(bySortName);
	}, missingList);
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
	return withStore(dbName, META_STORE, "readonly", async store => {
		const row = await idbReq(store.get("seed"));
		return row ?? null;
	}, () => null);
}
/**
 * @param {{ version?: number, applied?: string[] }} record
 * @param {string} [dbName]
 */
export async function dbPutMeta(record, dbName) {
	await withStore(dbName, META_STORE, "readwrite", store => idbReq(store.put({
		id: "seed",
		version: record.version ?? 0,
		applied: Array.isArray(record.applied) ? record.applied : []
	})), missingOk);
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
