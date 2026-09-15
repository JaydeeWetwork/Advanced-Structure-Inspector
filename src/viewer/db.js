/**
 * IndexedDB persistence for structure catalog
 * (metadata + file blobs + categories + entries + features).
 */

export const DEFAULT_DB_NAME = "asi-db-viewer";
export const LEGACY_DEFAULT_DB_NAME = "structure-db-viewer";
const DB_VERSION = 4;
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

const STORE = "structures";
const CATEGORIES_STORE = "categories";
const ENTRIES_STORE = "entries";
const FEATURES_STORE = "features";
const META_STORE = "meta";

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
function openDb(name) {
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
function idbReq(req) {
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
function idbTxDone(tx) {
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
function existingStores(db, names) {
	return names.filter(n => db.objectStoreNames.contains(n));
}

function serializeCategory(category) {
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

function serializeCatalogEntry(entry) {
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

function serializeFeature(feature) {
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

/**
 * @param {Omit<StoredStructure, "blob"|"fileName"> & { file: File, parseError?: string, hopperStats?: import("./hopperStats.js").HopperStats|null, entryId?: string|null, featureIds?: string[] }} entry
 * @returns {Promise<void>}
 */
/**
 * Copy picker/File/Blob bytes into a standalone ArrayBuffer.
 * Safari (esp. iPad) stores File in IndexedDB as a reference that is empty
 * after reload; GitHub Pages + reopen then fails NBT parse.
 * @param {Blob|ArrayBuffer|ArrayBufferView|null|undefined} blob
 * @returns {Promise<ArrayBuffer>}
 */
export async function bytesFromStoredBlob(blob) {
	if (!blob) return new ArrayBuffer(0);
	if (blob instanceof ArrayBuffer) return blob.slice(0);
	if (ArrayBuffer.isView(blob)) {
		return blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength);
	}
	if (typeof blob.arrayBuffer === "function") {
		try {
			return await blob.arrayBuffer();
		} catch {
			return new ArrayBuffer(0);
		}
	}
	return new ArrayBuffer(0);
}

/**
 * @param {ArrayBuffer|ArrayBufferView} buffer
 * @param {string} [fileName]
 * @returns {File}
 */
export function fileFromBytes(buffer, fileName) {
	const name = fileName || "structure.mcstructure";
	return new File([buffer ?? new ArrayBuffer(0)], name, {
		type: "application/mcstructure"
	});
}

/**
 * @param {Blob|ArrayBuffer|ArrayBufferView|null|undefined} blob
 * @param {string} [fileName]
 * @returns {Promise<File>}
 */
export async function fileFromStoredBlob(blob, fileName) {
	const buf = await bytesFromStoredBlob(blob);
	return fileFromBytes(buf, fileName);
}

const EMPTY_STORED_FILE =
	"Stored copy is empty. Re-import this .mcstructure — the original file-picker file is not kept after reload.";

async function serializeStructure(entry) {
	const fileName = entry.file?.name || `${entry.name}.mcstructure`;
	const buf = await bytesFromStoredBlob(entry.file);
	return {
		id: entry.id,
		name: entry.name,
		sourceName: entry.sourceName,
		sourceKind: entry.sourceKind,
		size: entry.size,
		worldOrigin: entry.worldOrigin,
		paletteSize: entry.paletteSize,
		blockCount: entry.blockCount,
		blockNames: entry.blockNames,
		entityCount: entry.entityCount ?? 0,
		materials: entry.materials ?? [],
		hopperStats: entry.hopperStats ?? null,
		entryId: entry.entryId ?? null,
		featureIds: Array.isArray(entry.featureIds) ? entry.featureIds : [],
		acquiredMaterials: Array.isArray(entry.acquiredMaterials) ? entry.acquiredMaterials : [],
		defaultCameraPreset: entry.defaultCameraPreset || "iso-north",
		defaultCameraZoom: Number.isFinite(entry.defaultCameraZoom) ? entry.defaultCameraZoom : 1,
		userDetails: Array.isArray(entry.userDetails) ? entry.userDetails : [],
		creator: typeof entry.creator === "string" ? entry.creator : "",
		credits: typeof entry.credits === "string" ? entry.credits : "",
		sourceLink: typeof entry.sourceLink === "string" ? entry.sourceLink : "",
		addedAt: entry.addedAt,
		blob: buf,
		fileName,
		parseError: entry.parseError || (buf.byteLength === 0 ? EMPTY_STORED_FILE : undefined)
	};
}

export async function dbPutStructure(entry, dbName) {
	const db = await openDb(dbName);
	try {
		const row = await serializeStructure(entry);
		const tx = db.transaction(STORE, "readwrite");
		await idbReq(tx.objectStore(STORE).put(row));
		await idbTxDone(tx);
		if (row.blob?.byteLength > 0 && entry.file) {
			entry.file = fileFromBytes(row.blob, row.fileName);
		}
	} finally {
		db.close();
	}
}

/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function dbDeleteStructure(id, dbName) {
	const db = await openDb(dbName);
	try {
		const tx = db.transaction(STORE, "readwrite");
		await idbReq(tx.objectStore(STORE).delete(id));
		await idbTxDone(tx);
	} finally {
		db.close();
	}
}

/**
 * @param {string} [dbName]
 * @returns {Promise<void>}
 */
export async function dbClearAll(dbName) {
	const db = await openDb(dbName);
	try {
		const names = existingStores(db, [STORE, CATEGORIES_STORE, ENTRIES_STORE, FEATURES_STORE, META_STORE]);
		if (!names.length) return;
		const tx = db.transaction(names, "readwrite");
		for (const name of names) {
			await idbReq(tx.objectStore(name).clear());
		}
		await idbTxDone(tx);
	} finally {
		db.close();
	}
}

/** Clear structure blobs/metadata only (keep taxonomy). */
export async function dbClearStructures(dbName) {
	const db = await openDb(dbName);
	try {
		if (!db.objectStoreNames.contains(STORE)) return;
		const tx = db.transaction(STORE, "readwrite");
		await idbReq(tx.objectStore(STORE).clear());
		await idbTxDone(tx);
	} finally {
		db.close();
	}
}

/**
 * @returns {Promise<Array<Omit<StoredStructure, "blob"|"fileName"> & { file: File }>>}
 */
export async function dbLoadAll(dbName) {
	const db = await openDb(dbName);
	try {
		const tx = db.transaction(STORE, "readonly");
		/** @type {StoredStructure[]} */
		const rows = await idbReq(tx.objectStore(STORE).getAll());
		await idbTxDone(tx);
		return Promise.all(rows.map(async row => {
			const fileName = row.fileName || `${row.name}.mcstructure`;
			const file = await fileFromStoredBlob(row.blob, fileName);
			const { blob: _b, fileName: _f, ...meta } = row;
			const empty = file.size === 0;
			return {
				...meta,
				file,
				entityCount: row.entityCount ?? 0,
				hopperStats: row.hopperStats ?? null,
				materials: row.materials ?? [],
				entryId: row.entryId ?? null,
				featureIds: Array.isArray(row.featureIds) ? row.featureIds : [],
				acquiredMaterials: Array.isArray(row.acquiredMaterials)
					? row.acquiredMaterials
					: [],
				defaultCameraPreset: row.defaultCameraPreset || "iso-north",
				defaultCameraZoom: Number.isFinite(row.defaultCameraZoom) ? row.defaultCameraZoom : 1,
				userDetails: Array.isArray(row.userDetails) ? row.userDetails : [],
				creator: typeof row.creator === "string" ? row.creator : "",
				credits: typeof row.credits === "string" ? row.credits : "",
				sourceLink: typeof row.sourceLink === "string" ? row.sourceLink : "",
				parseError: row.parseError || (empty ? EMPTY_STORED_FILE : undefined)
			};
		}));
	} finally {
		db.close();
	}
}

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

/** Drop legacy localStorage metadata index from the scaffold era. */
export function clearLegacyLocalStorageIndex() {
	try {
		localStorage.removeItem("structure-db-viewer.catalog-index.v1");
	} catch {
		/* ignore */
	}
}
