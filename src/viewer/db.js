/**
 * IndexedDB persistence for structure catalog (metadata + file blobs + categories).
 */

// Keep legacy DB name so existing IndexedDB catalogs still open after the Bedrock ASI rebrand
const DB_NAME = "structure-db-viewer";
const DB_VERSION = 2;
const STORE = "structures";
const CATEGORIES_STORE = "categories";

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
 * @property {string|null} [categoryId]
 * @property {string[]} [acquiredMaterials]
 * @property {string} [defaultCameraPreset]
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
 * @property {string} name
 * @property {number} sortOrder
 * @property {boolean} collapsed
 */

/**
 * @returns {Promise<IDBDatabase>}
 */
function openDb() {
	return new Promise((resolve, reject) => {
		if (typeof indexedDB === "undefined") {
			reject(new Error("indexedDB is not available"));
			return;
		}
		const req = indexedDB.open(DB_NAME, DB_VERSION);
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
		// Without onabort, aborted requests hang the Promise forever
		req.onabort = () => reject(req.error ?? new Error("IDB request aborted"));
	});
}

/**
 * Wait for a transaction to finish (complete / error / abort).
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
 * @param {Omit<StoredStructure, "blob"|"fileName"> & { file: File, parseError?: string, hopperStats?: import("./hopperStats.js").HopperStats|null, categoryId?: string|null }} entry
 * @returns {Promise<void>}
 */
export async function dbPutStructure(entry) {
	const db = await openDb();
	try {
		const record = {
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
			categoryId: entry.categoryId ?? null,
			acquiredMaterials: Array.isArray(entry.acquiredMaterials) ? entry.acquiredMaterials : [],
			defaultCameraPreset: entry.defaultCameraPreset || "iso-north",
			userDetails: Array.isArray(entry.userDetails) ? entry.userDetails : [],
			creator: typeof entry.creator === "string" ? entry.creator : "",
			credits: typeof entry.credits === "string" ? entry.credits : "",
			sourceLink: typeof entry.sourceLink === "string" ? entry.sourceLink : "",
			addedAt: entry.addedAt,
			blob: entry.file,
			fileName: entry.file.name || `${entry.name}.mcstructure`,
			parseError: entry.parseError
		};
		const tx = db.transaction(STORE, "readwrite");
		await idbReq(tx.objectStore(STORE).put(record));
		await idbTxDone(tx);
	} finally {
		db.close();
	}
}

/**
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function dbDeleteStructure(id) {
	const db = await openDb();
	try {
		const tx = db.transaction(STORE, "readwrite");
		await idbReq(tx.objectStore(STORE).delete(id));
		await idbTxDone(tx);
	} finally {
		db.close();
	}
}

/** @returns {Promise<void>} */
export async function dbClearAll() {
	const db = await openDb();
	try {
		const tx = db.transaction([STORE, CATEGORIES_STORE], "readwrite");
		await idbReq(tx.objectStore(STORE).clear());
		await idbReq(tx.objectStore(CATEGORIES_STORE).clear());
		await idbTxDone(tx);
	} finally {
		db.close();
	}
}

/**
 * @returns {Promise<Array<Omit<StoredStructure, "blob"|"fileName"> & { file: File }>>}
 */
export async function dbLoadAll() {
	const db = await openDb();
	try {
		const tx = db.transaction(STORE, "readonly");
		/** @type {StoredStructure[]} */
		const rows = await idbReq(tx.objectStore(STORE).getAll());
		await idbTxDone(tx);
		return rows.map(row => {
			const file = new File([row.blob], row.fileName || `${row.name}.mcstructure`, {
				type: "application/mcstructure"
			});
			const { blob: _b, fileName: _f, ...meta } = row;
			return {
				...meta,
				file,
				entityCount: row.entityCount ?? 0,
				hopperStats: row.hopperStats ?? null,
				materials: row.materials ?? [],
				categoryId: row.categoryId ?? null,
				acquiredMaterials: Array.isArray(row.acquiredMaterials)
					? row.acquiredMaterials
					: [],
				defaultCameraPreset: row.defaultCameraPreset || "iso-north",
				userDetails: Array.isArray(row.userDetails) ? row.userDetails : [],
				creator: typeof row.creator === "string" ? row.creator : "",
				credits: typeof row.credits === "string" ? row.credits : "",
				sourceLink: typeof row.sourceLink === "string" ? row.sourceLink : ""
			};
		});
	} finally {
		db.close();
	}
}

/**
 * @param {StoredCategory} category
 * @returns {Promise<void>}
 */
export async function dbPutCategory(category) {
	const db = await openDb();
	try {
		const tx = db.transaction(CATEGORIES_STORE, "readwrite");
		await idbReq(tx.objectStore(CATEGORIES_STORE).put({
			id: category.id,
			name: category.name,
			sortOrder: category.sortOrder ?? 0,
			collapsed: !!category.collapsed
		}));
		await idbTxDone(tx);
	} finally {
		db.close();
	}
}

/**
 * @param {StoredCategory[]} categories
 * @returns {Promise<void>}
 */
export async function dbPutCategories(categories) {
	const db = await openDb();
	try {
		const tx = db.transaction(CATEGORIES_STORE, "readwrite");
		const store = tx.objectStore(CATEGORIES_STORE);
		for (const category of categories) {
			store.put({
				id: category.id,
				name: category.name,
				sortOrder: category.sortOrder ?? 0,
				collapsed: !!category.collapsed
			});
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
export async function dbDeleteCategory(id) {
	const db = await openDb();
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
export async function dbLoadCategories() {
	const db = await openDb();
	try {
		// Older DBs may not have the store until upgrade completes
		if (!db.objectStoreNames.contains(CATEGORIES_STORE)) {
			return [];
		}
		const tx = db.transaction(CATEGORIES_STORE, "readonly");
		/** @type {StoredCategory[]} */
		const rows = await idbReq(tx.objectStore(CATEGORIES_STORE).getAll());
		await idbTxDone(tx);
		return rows
			.map(r => ({
				id: r.id,
				name: r.name || "Category",
				sortOrder: Number.isFinite(r.sortOrder) ? r.sortOrder : 0,
				collapsed: !!r.collapsed
			}))
			.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
	} finally {
		db.close();
	}
}

/** Drop legacy localStorage metadata index from the scaffold era. */
export function clearLegacyLocalStorageIndex() {
	try {
		// Legacy key from pre-rename builds
		localStorage.removeItem("structure-db-viewer.catalog-index.v1");
	} catch {
		/* ignore */
	}
}
