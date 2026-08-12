/**
 * In-session caches for preview build inputs (data JSON + per-File geometry).
 */

/** @type {Map<string, Promise<any>>} */
const dataFileCache = new Map();

/** @type {WeakMap<File, { key: string, value: Promise<any> }>} */
const fileBuildCache = new WeakMap();

/**
 * @template T
 * @param {string} name e.g. "blockShapes"
 * @param {() => Promise<T>} loader
 * @returns {Promise<T>}
 */
export function getCachedDataFile(name, loader) {
	if (!dataFileCache.has(name)) {
		dataFileCache.set(name, loader().catch(err => {
			dataFileCache.delete(name);
			throw err;
		}));
	}
	return /** @type {Promise<T>} */ (dataFileCache.get(name));
}

/**
 * Cache a built preview payload for a File for the lifetime of the page.
 * @template T
 * @param {File} file
 * @param {string} cacheKey extra salt (e.g. config hash)
 * @param {() => Promise<T>} builder
 * @returns {Promise<T>}
 */
export function getCachedFileBuild(file, cacheKey, builder) {
	const existing = fileBuildCache.get(file);
	if (existing && existing.key === cacheKey) {
		return existing.value;
	}
	const value = builder().catch(err => {
		const cur = fileBuildCache.get(file);
		if (cur?.value === value) fileBuildCache.delete(file);
		throw err;
	});
	fileBuildCache.set(file, { key: cacheKey, value });
	return value;
}

/** Clear data JSON cache (tests / hot reload). */
export function clearDataFileCache() {
	dataFileCache.clear();
}

/** @param {File} file */
export function clearFileBuildCache(file) {
	fileBuildCache.delete(file);
}

/**
 * Clear data JSON cache. File builds use WeakMap keyed by File and are dropped when
 * the catalog releases File refs, or via clearFileBuildCache(file).
 */
export function clearAllPreviewCaches() {
	dataFileCache.clear();
}
