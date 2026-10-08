/** Structure rows in the catalog database. */
import { crc32Hex } from "./crc32.js";
import {
	CATEGORIES_STORE,
	ENTRIES_STORE,
	existingStores,
	FEATURES_STORE,
	idbReq,
	idbTxDone,
	META_STORE,
	openDb,
	STORE
} from "./dbSession.js";
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
export async function serializeStructure(entry) {
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
		contentCrc32: entry.contentCrc32 || (buf.byteLength ? crc32Hex(buf) : ""),
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
			const buf = await bytesFromStoredBlob(row.blob);
			const file = fileFromBytes(buf, fileName);
			const { blob: _b, fileName: _f, ...meta } = row;
			const empty = file.size === 0;
			return {
				...meta,
				file,
				contentCrc32: row.contentCrc32 || (buf.byteLength ? crc32Hex(buf) : ""),
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
