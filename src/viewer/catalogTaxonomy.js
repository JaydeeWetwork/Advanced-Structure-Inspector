/**
 * Category, function-entry, and feature edits.
 * StructureCatalog owns the maps and passes them in.
 */

import {
	dbPutCategories,
	dbPutCategory,
	dbPutEntries,
	dbPutEntry,
	dbPutFeature,
	dbPutFeatures,
	dbRemoveCategoryCascade,
	dbRemoveEntryCascade,
	dbRemoveFeatureCascade
} from "./db.js";
import { moveCategoryInList } from "./catalogSeed.js";
import { newCatalogId, slugFromName, uniqueSlug } from "./catalogQuery.js";

/**
 * Maps and hooks StructureCatalog owns. The catalog builds this once.
 * @typedef {object} CatalogTaxonomyStore
 * @property {Map<string, StructureCategory>} categories
 * @property {Map<string, CatalogEntry>} catalogEntries
 * @property {Map<string, CatalogFeature>} features
 * @property {Map<string, StructureCatalogEntry>} entries
 * @property {() => string} dbName
 * @property {() => boolean} persistEnabled
 * @property {() => void} notify
 * @property {(fn: () => Promise<void>, label: string) => Promise<void>} tryPersist
 * @property {(keys: string[]) => Promise<void>} markSeedApplied
 * @property {(msg: string|null) => void} setLastPersistError
 */

// ---- Categories ----

/**
 * @param {CatalogTaxonomyStore} store
 * @returns {StructureCategory[]}
 */
export function listCategories(store) {
	return [...store.categories.values()].sort(
		(a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
	);
}

/**
 * @param {CatalogTaxonomyStore} store
 * @param {string} id
 * @returns {StructureCategory|undefined}
 */
export function getCategory(store, id) {
	return store.categories.get(id);
}

/**
 * @param {CatalogTaxonomyStore} store
 * @param {string} structureId
 * @returns {StructureCategory|undefined}
 */
export function getCategoryForStructure(store, structureId) {
	const s = store.entries.get(structureId);
	if (!s?.entryId) return undefined;
	const fn = store.catalogEntries.get(s.entryId);
	if (!fn) return undefined;
	return store.categories.get(fn.categoryId);
}

/**
 * @param {string|null|undefined} color
 * @returns {string}
 */
function nextColor(color) {
	if (typeof color === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color.trim())) {
		return color.trim();
	}
	return "#64748b";
}

/**
 * @param {CatalogTaxonomyStore} store
 * @param {string|object} nameOrPartial
 * @returns {Promise<StructureCategory>}
 */
export async function addCategory(store, nameOrPartial) {
	const partial =
		typeof nameOrPartial === "string" ? { name: nameOrPartial } : nameOrPartial || {};
	const name = String(partial.name || "").trim() || "New category";
	const taken = new Set([...store.categories.values()].map(c => c.slug));
	const slug = uniqueSlug(partial.slug || slugFromName(name), taken);
	const maxOrder = listCategories(store).reduce((m, c) => Math.max(m, c.sortOrder), -1);
	/** @type {StructureCategory} */
	const cat = {
		id: partial.id || newCatalogId("cat"),
		slug,
		name,
		description: typeof partial.description === "string" ? partial.description : "",
		color: nextColor(partial.color),
		sortOrder: Number.isFinite(partial.sortOrder) ? partial.sortOrder : maxOrder + 1,
		collapsed: partial.collapsed != null ? !!partial.collapsed : false,
		isDefault: !!partial.isDefault
	};
	store.categories.set(cat.id, cat);
	store.notify();
	const dbName = store.dbName();
	await store.tryPersist(() => dbPutCategory(cat, dbName), "category put");
	return cat;
}

/**
 * @param {CatalogTaxonomyStore} store
 * @param {string} id
 * @param {Partial<Pick<StructureCategory, "name"|"description"|"color"|"collapsed"|"sortOrder">>} partial
 */
export async function patchCategory(store, id, partial) {
	const cat = store.categories.get(id);
	if (!cat) return null;
	if (partial.name != null) {
		const trimmed = String(partial.name).trim();
		if (trimmed) cat.name = trimmed;
	}
	if ("description" in partial) cat.description = String(partial.description ?? "");
	if ("color" in partial) cat.color = nextColor(partial.color);
	if ("collapsed" in partial) cat.collapsed = !!partial.collapsed;
	if (Number.isFinite(partial.sortOrder)) cat.sortOrder = /** @type {number} */ (partial.sortOrder);
	store.notify();
	const dbName = store.dbName();
	await store.tryPersist(() => dbPutCategory(cat, dbName), "category patch");
	return cat;
}

/**
 * @param {CatalogTaxonomyStore} store
 * @param {string} id
 * @param {string} name
 */
export async function renameCategory(store, id, name) {
	return patchCategory(store, id, { name });
}

/**
 * Delete category and its function-entries; structures become Uncategorized.
 * @param {CatalogTaxonomyStore} store
 * @param {string} id
 */
export async function removeCategory(store, id) {
	const cat = store.categories.get(id);
	if (!cat) return false;
	const childEntries = [...store.catalogEntries.values()].filter(e => e.categoryId === id);
	const seedKeys = [`cat:${cat.slug}`, ...childEntries.map(e => `ent:${cat.slug}/${e.slug}`)];
	store.categories.delete(id);
	for (const ent of childEntries) {
		store.catalogEntries.delete(ent.id);
	}
	const moved = [];
	const childIds = new Set(childEntries.map(e => e.id));
	for (const entry of store.entries.values()) {
		if (entry.entryId && childIds.has(entry.entryId)) {
			entry.entryId = null;
			moved.push(entry);
		}
	}
	const tagged = [];
	for (const feat of store.features.values()) {
		if (feat.categoryIds.includes(id)) {
			feat.categoryIds = feat.categoryIds.filter(cid => cid !== id);
			tagged.push(feat);
		}
	}
	store.notify();
	if (store.persistEnabled()) {
		try {
			await dbRemoveCategoryCascade(store.dbName(), {
				categoryId: id,
				childEntryIds: childEntries.map(e => e.id),
				movedStructures: moved,
				taggedFeatures: tagged
			});
			store.setLastPersistError(null);
		} catch (e) {
			const msg = e?.message ?? String(e);
			store.setLastPersistError(msg);
			console.warn("[bLayers] category delete failed:", e);
			throw e;
		}
	}
	await store.markSeedApplied(seedKeys);
	return true;
}

/**
 * @param {CatalogTaxonomyStore} store
 * @param {string} id
 * @param {boolean} collapsed
 */
export async function setCategoryCollapsed(store, id, collapsed) {
	return patchCategory(store, id, { collapsed: !!collapsed });
}

/**
 * @param {CatalogTaxonomyStore} store
 * @param {string} id
 * @param {-1|1} direction
 */
export async function reorderCategory(store, id, direction) {
	const ordered = listCategories(store);
	const i = ordered.findIndex(c => c.id === id);
	if (i < 0) return false;
	const j = i + direction;
	if (j < 0 || j >= ordered.length) return false;
	const tmp = ordered[i].sortOrder;
	ordered[i].sortOrder = ordered[j].sortOrder;
	ordered[j].sortOrder = tmp;
	if (ordered[i].sortOrder === ordered[j].sortOrder) {
		ordered.forEach((c, idx) => {
			c.sortOrder = idx;
		});
	}
	store.notify();
	await store.tryPersist(() => dbPutCategories(listCategories(store), store.dbName()), "category reorder");
	return true;
}

/**
 * Place `id` before or after `targetId` in category sort order.
 * @param {CatalogTaxonomyStore} store
 * @param {string} id
 * @param {string} targetId
 * @param {"before"|"after"} place
 */
export async function moveCategoryTo(store, id, targetId, place) {
	const ordered = listCategories(store);
	if (!moveCategoryInList(ordered, id, targetId, place)) return false;
	store.notify();
	await store.tryPersist(() => dbPutCategories(listCategories(store), store.dbName()), "category move");
	return true;
}

// ---- Catalog function-entries ----

/**
 * @param {CatalogTaxonomyStore} store
 * @param {string} [categoryId]
 * @returns {CatalogEntry[]}
 */
export function listCatalogEntries(store, categoryId) {
	let rows = [...store.catalogEntries.values()];
	if (categoryId) rows = rows.filter(e => e.categoryId === categoryId);
	return rows.sort(
		(a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
	);
}

/**
 * @param {CatalogTaxonomyStore} store
 * @param {string} id
 * @returns {CatalogEntry|undefined}
 */
export function getCatalogEntry(store, id) {
	return store.catalogEntries.get(id);
}

/**
 * @param {CatalogTaxonomyStore} store
 * @param {{ categoryId: string, name?: string, description?: string, slug?: string, id?: string, collapsed?: boolean, isDefault?: boolean, sortOrder?: number }} partial
 * @returns {Promise<CatalogEntry>}
 */
export async function addCatalogEntry(store, partial) {
	const categoryId = partial.categoryId;
	if (!categoryId || !store.categories.has(categoryId)) {
		throw new Error("Catalog entry requires a valid category");
	}
	const name = String(partial.name || "").trim() || "New entry";
	const taken = new Set(
		listCatalogEntries(store, categoryId).map(e => e.slug)
	);
	const slug = uniqueSlug(partial.slug || slugFromName(name), taken);
	const maxOrder = listCatalogEntries(store, categoryId).reduce(
		(m, e) => Math.max(m, e.sortOrder),
		-1
	);
	/** @type {CatalogEntry} */
	const ent = {
		id: partial.id || newCatalogId("ent"),
		slug,
		categoryId,
		name,
		description: typeof partial.description === "string" ? partial.description : "",
		sortOrder: Number.isFinite(partial.sortOrder) ? partial.sortOrder : maxOrder + 1,
		collapsed: partial.collapsed != null ? !!partial.collapsed : false,
		isDefault: !!partial.isDefault
	};
	store.catalogEntries.set(ent.id, ent);
	store.notify();
	await store.tryPersist(() => dbPutEntry(ent, store.dbName()), "entry put");
	return ent;
}

/**
 * @param {CatalogTaxonomyStore} store
 * @param {string} id
 * @param {Partial<Pick<CatalogEntry, "name"|"description"|"collapsed"|"sortOrder"|"categoryId">>} partial
 */
export async function patchCatalogEntry(store, id, partial) {
	const ent = store.catalogEntries.get(id);
	if (!ent) return null;
	if (partial.name != null) {
		const trimmed = String(partial.name).trim();
		if (trimmed) ent.name = trimmed;
	}
	if ("description" in partial) ent.description = String(partial.description ?? "");
	if ("collapsed" in partial) ent.collapsed = !!partial.collapsed;
	if (Number.isFinite(partial.sortOrder)) ent.sortOrder = /** @type {number} */ (partial.sortOrder);
	if ("categoryId" in partial && partial.categoryId && store.categories.has(partial.categoryId)) {
		ent.categoryId = partial.categoryId;
	}
	store.notify();
	await store.tryPersist(() => dbPutEntry(ent, store.dbName()), "entry patch");
	return ent;
}

/**
 * @param {CatalogTaxonomyStore} store
 * @param {string} id
 */
export async function removeCatalogEntry(store, id) {
	const ent = store.catalogEntries.get(id);
	if (!ent) return false;
	store.catalogEntries.delete(id);
	const moved = [];
	for (const entry of store.entries.values()) {
		if (entry.entryId === id) {
			entry.entryId = null;
			moved.push(entry);
		}
	}
	store.notify();
	if (store.persistEnabled()) {
		try {
			await dbRemoveEntryCascade(store.dbName(), {
				entryId: id,
				movedStructures: moved
			});
			store.setLastPersistError(null);
		} catch (e) {
			const msg = e?.message ?? String(e);
			store.setLastPersistError(msg);
			console.warn("[bLayers] entry delete failed:", e);
			throw e;
		}
	}
	const parent = store.categories.get(ent.categoryId);
	await store.markSeedApplied([parent ? `ent:${parent.slug}/${ent.slug}` : `ent:${ent.slug}`]);
	return true;
}

/**
 * @param {CatalogTaxonomyStore} store
 * @param {string} id
 * @param {boolean} collapsed
 */
export async function setCatalogEntryCollapsed(store, id, collapsed) {
	return patchCatalogEntry(store, id, { collapsed: !!collapsed });
}

/**
 * @param {CatalogTaxonomyStore} store
 * @param {string} id
 * @param {-1|1} direction
 */
export async function reorderCatalogEntry(store, id, direction) {
	const ent = store.catalogEntries.get(id);
	if (!ent) return false;
	const ordered = listCatalogEntries(store, ent.categoryId);
	const i = ordered.findIndex(e => e.id === id);
	if (i < 0) return false;
	const j = i + direction;
	if (j < 0 || j >= ordered.length) return false;
	const tmp = ordered[i].sortOrder;
	ordered[i].sortOrder = ordered[j].sortOrder;
	ordered[j].sortOrder = tmp;
	if (ordered[i].sortOrder === ordered[j].sortOrder) {
		ordered.forEach((e, idx) => {
			e.sortOrder = idx;
		});
	}
	store.notify();
	await store.tryPersist(
		() => dbPutEntries(listCatalogEntries(store, ent.categoryId), store.dbName()),
		"entry reorder"
	);
	return true;
}

// ---- Features ----

/**
 * @param {CatalogTaxonomyStore} store
 * @returns {CatalogFeature[]}
 */
export function listFeatures(store) {
	return [...store.features.values()].sort(
		(a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
	);
}

/**
 * @param {CatalogTaxonomyStore} store
 * @param {string} id
 * @returns {CatalogFeature|undefined}
 */
export function getFeature(store, id) {
	return store.features.get(id);
}

/**
 * @param {CatalogTaxonomyStore} store
 * @param {string} structureId
 * @returns {CatalogFeature[]}
 */
export function listFeaturesForStructure(store, structureId) {
	const entry = store.entries.get(structureId);
	if (!entry) return [];
	return (entry.featureIds || [])
		.map(id => store.features.get(id))
		.filter(Boolean);
}

/**
 * @param {CatalogTaxonomyStore} store
 * @param {{ name?: string, description?: string, useCases?: string, color?: string, categoryIds?: string[], slug?: string, id?: string, isDefault?: boolean, sortOrder?: number }} partial
 */
export async function addFeature(store, partial = {}) {
	const name = String(partial.name || "").trim() || "New feature";
	const taken = new Set([...store.features.values()].map(f => f.slug));
	const slug = uniqueSlug(partial.slug || slugFromName(name), taken);
	const maxOrder = listFeatures(store).reduce((m, f) => Math.max(m, f.sortOrder), -1);
	const categoryIds = Array.isArray(partial.categoryIds)
		? [...new Set(partial.categoryIds.filter(id => store.categories.has(id)))]
		: [];
	/** @type {CatalogFeature} */
	const feat = {
		id: partial.id || newCatalogId("feat"),
		slug,
		name,
		description: typeof partial.description === "string" ? partial.description : "",
		useCases: typeof partial.useCases === "string" ? partial.useCases : "",
		color: nextColor(partial.color),
		categoryIds,
		sortOrder: Number.isFinite(partial.sortOrder) ? partial.sortOrder : maxOrder + 1,
		isDefault: !!partial.isDefault
	};
	store.features.set(feat.id, feat);
	store.notify();
	await store.tryPersist(() => dbPutFeature(feat, store.dbName()), "feature put");
	return feat;
}

/**
 * @param {CatalogTaxonomyStore} store
 * @param {string} id
 * @param {Partial<Pick<CatalogFeature, "name"|"description"|"useCases"|"color"|"categoryIds"|"sortOrder">>} partial
 */
export async function patchFeature(store, id, partial) {
	const feat = store.features.get(id);
	if (!feat) return null;
	if (partial.name != null) {
		const trimmed = String(partial.name).trim();
		if (trimmed) feat.name = trimmed;
	}
	if ("description" in partial) feat.description = String(partial.description ?? "");
	if ("useCases" in partial) feat.useCases = String(partial.useCases ?? "");
	if ("color" in partial) feat.color = nextColor(partial.color);
	if ("categoryIds" in partial) {
		feat.categoryIds = Array.isArray(partial.categoryIds)
			? [...new Set(partial.categoryIds.filter(cid => store.categories.has(cid)))]
			: [];
	}
	if (Number.isFinite(partial.sortOrder)) feat.sortOrder = /** @type {number} */ (partial.sortOrder);
	store.notify();
	await store.tryPersist(() => dbPutFeature(feat, store.dbName()), "feature patch");
	return feat;
}

/**
 * @param {CatalogTaxonomyStore} store
 * @param {string} id
 */
export async function removeFeature(store, id) {
	const feat = store.features.get(id);
	if (!feat) return false;
	store.features.delete(id);
	const touched = [];
	for (const entry of store.entries.values()) {
		if ((entry.featureIds || []).includes(id)) {
			entry.featureIds = (entry.featureIds || []).filter(fid => fid !== id);
			touched.push(entry);
		}
	}
	store.notify();
	if (store.persistEnabled()) {
		try {
			await dbRemoveFeatureCascade(store.dbName(), {
				featureId: id,
				touchedStructures: touched
			});
			store.setLastPersistError(null);
		} catch (e) {
			const msg = e?.message ?? String(e);
			store.setLastPersistError(msg);
			console.warn("[bLayers] feature delete failed:", e);
			throw e;
		}
	}
	await store.markSeedApplied([`feat:${feat.slug}`]);
	return true;
}

/**
 * @param {CatalogTaxonomyStore} store
 * @param {string} id
 * @param {-1|1} direction
 */
export async function reorderFeature(store, id, direction) {
	const ordered = listFeatures(store);
	const i = ordered.findIndex(f => f.id === id);
	if (i < 0) return false;
	const j = i + direction;
	if (j < 0 || j >= ordered.length) return false;
	const tmp = ordered[i].sortOrder;
	ordered[i].sortOrder = ordered[j].sortOrder;
	ordered[j].sortOrder = tmp;
	if (ordered[i].sortOrder === ordered[j].sortOrder) {
		ordered.forEach((f, idx) => {
			f.sortOrder = idx;
		});
	}
	store.notify();
	await store.tryPersist(() => dbPutFeatures(listFeatures(store), store.dbName()), "feature reorder");
	return true;
}
