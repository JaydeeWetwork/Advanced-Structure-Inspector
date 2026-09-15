/**
 * Structure catalog with IndexedDB persistence
 * (structure files + category → entry tree + features).
 */

import {
	dbPutStructure,
	dbDeleteStructure,
	dbClearStructures,
	dbLoadAll,
	dbPutCategory,
	dbPutCategories,
	dbLoadCategories,
	dbPutEntry,
	dbPutEntries,
	dbLoadEntries,
	dbPutFeature,
	dbPutFeatures,
	dbLoadFeatures,
	dbRemoveCategoryCascade,
	dbRemoveEntryCascade,
	dbRemoveFeatureCascade,
	clearLegacyLocalStorageIndex,
	dbGetMeta,
	dbPutMeta,
	DEFAULT_DB_NAME,
	setActiveDbName
} from "./db.js";
import { ensureDefaultCatalogMigrated } from "./dbMigrate.js";
import { TAXONOMY_SEED_STATE_KEY, TAXONOMY_SEED_VERSION } from "../data/taxonomy.js";
import { applySeedTaxonomy, moveCategoryInList } from "./catalogSeed.js";
import { buildCatalogTree, contrastText, fillHydratedMaps, filterFeatureIds } from "./catalogQuery.js";

export { contrastText };
import {
	activateCatalog,
	createEmptyCatalog,
	deleteActiveCatalog,
	renameActiveCatalog,
	saveCatalogAs
} from "./catalogSwitch.js";
import { getActiveCatalog } from "./catalogRegistry.js";

/** 1 = default fit; clamp to the details-dock zoom slider range. */
function clampDefaultZoom(z) {
	const n = Number(z);
	if (!Number.isFinite(n)) return 1;
	return Math.max(0.5, Math.min(2, Math.round(n * 20) / 20));
}

/**
 * @typedef {object} StructureCatalogEntry
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
 * @property {string|null} [entryId] catalog function-entry; null = Uncategorized
 * @property {string[]} [featureIds]
 * @property {string[]} [acquiredMaterials]
 * @property {string} [defaultCameraPreset]
 * @property {number} [defaultCameraZoom]
 * @property {{ id: string, text: string, addedAt?: number }[]} [userDetails]
 * @property {string} [creator]
 * @property {string} [credits]
 * @property {string} [sourceLink]
 * @property {number} addedAt
 * @property {File} file
 * @property {string} [parseError]
 * @property {string} [persistError]
 */

/**
 * @typedef {object} StructureCategory
 * @property {string} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} color
 * @property {number} sortOrder
 * @property {boolean} collapsed
 * @property {boolean} isDefault
 */

/**
 * Function group under a category (clocks, piston-bolt, …).
 * @typedef {object} CatalogEntry
 * @property {string} id
 * @property {string} slug
 * @property {string} categoryId
 * @property {string} name
 * @property {string} description
 * @property {number} sortOrder
 * @property {boolean} collapsed
 * @property {boolean} isDefault
 */

/**
 * @typedef {object} CatalogFeature
 * @property {string} id
 * @property {string} slug
 * @property {string} name
 * @property {string} description
 * @property {string} useCases
 * @property {string} color
 * @property {string[]} categoryIds
 * @property {number} sortOrder
 * @property {boolean} isDefault
 */

/** Sentinel for the virtual Uncategorized group (not stored in IDB). */
export const UNCATEGORIZED_ID = null;

function newId(prefix = "basi") {
	if (typeof crypto !== "undefined" && crypto.randomUUID) {
		return crypto.randomUUID();
	}
	return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function slugFromName(name) {
	const slug = String(name || "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return slug || "item";
}

function uniqueSlug(base, taken) {
	if (!taken.has(base)) return base;
	for (let i = 2; i < 1000; i++) {
		const next = `${base}-${i}`;
		if (!taken.has(next)) return next;
	}
	return `${base}-${newId("s")}`;
}

export default class StructureCatalog {
	/** @type {Map<string, StructureCatalogEntry>} */
	#entries = new Map();
	/** @type {Map<string, StructureCategory>} */
	#categories = new Map();
	/** @type {Map<string, CatalogEntry>} */
	#catalogEntries = new Map();
	/** @type {Map<string, CatalogFeature>} */
	#features = new Map();
	/** @type {Set<() => void>} */
	#listeners = new Set();
	#persistEnabled = true;
	#dbName = DEFAULT_DB_NAME;
	#hydrateGen = 0;
	/**
	 * @type {string|null}
	 */
	lastPersistError = null;

	getDbName() {
		return this.#dbName;
	}

	async bootFromRegistry() {
		try {
			await ensureDefaultCatalogMigrated();
		} catch (e) {
			console.warn("[basi] default IndexedDB migrate failed:", e);
		}
		await activateCatalog(this, getActiveCatalog().id);
		return this.list().length;
	}

	async activate(id) {
		return activateCatalog(this, id);
	}

	async saveAs(name) {
		return saveCatalogAs(this, name);
	}

	async createEmpty(name) {
		return createEmptyCatalog(this, name);
	}

	async deleteActive() {
		return deleteActiveCatalog(this);
	}

	renameActive(name) {
		return renameActiveCatalog(name);
	}

	/**
	 * @param {Omit<StructureCatalogEntry, "id"|"addedAt"|"entityCount"|"entryId"|"featureIds"> & { id?: string, addedAt?: number, entityCount?: number, entryId?: string|null, featureIds?: string[], parseError?: string }} partial
	 * @returns {Promise<StructureCatalogEntry>}
	 */
	async add(partial) {
		const id = partial.id ?? newId("basi");
		const entryId =
			partial.entryId != null && this.#catalogEntries.has(partial.entryId)
				? partial.entryId
				: null;
		const featureIds = filterFeatureIds(partial.featureIds, this.#features);
		/** @type {StructureCatalogEntry} */
		const entry = {
			id,
			name: partial.name,
			sourceName: partial.sourceName,
			sourceKind: partial.sourceKind,
			size: partial.size,
			worldOrigin: partial.worldOrigin ?? null,
			paletteSize: partial.paletteSize,
			blockCount: partial.blockCount,
			blockNames: partial.blockNames ?? [],
			entityCount: partial.entityCount ?? 0,
			materials: partial.materials ?? [],
			hopperStats: partial.hopperStats ?? null,
			entryId,
			featureIds,
			acquiredMaterials: Array.isArray(partial.acquiredMaterials)
				? [...partial.acquiredMaterials]
				: [],
			defaultCameraPreset: partial.defaultCameraPreset || "iso-north",
			defaultCameraZoom: clampDefaultZoom(partial.defaultCameraZoom),
			userDetails: Array.isArray(partial.userDetails)
				? partial.userDetails.map(d => ({ ...d }))
				: [],
			creator: typeof partial.creator === "string" ? partial.creator : "",
			credits: typeof partial.credits === "string" ? partial.credits : "",
			sourceLink: typeof partial.sourceLink === "string" ? partial.sourceLink : "",
			addedAt: partial.addedAt ?? Date.now(),
			file: partial.file
		};
		if (partial.parseError) entry.parseError = partial.parseError;
		this.#entries.set(id, entry);
		this.#notify();
		await this.#persistStructure(entry, this.#dbName);
		return entry;
	}

	/**
	 * @param {string} id
	 * @param {Partial<Pick<StructureCatalogEntry, "materials"|"hopperStats"|"name"|"entityCount"|"blockCount"|"blockNames"|"parseError"|"entryId"|"featureIds"|"acquiredMaterials"|"defaultCameraPreset"|"defaultCameraZoom"|"userDetails"|"creator"|"credits"|"sourceLink">>} partial
	 * @returns {Promise<StructureCatalogEntry|null>}
	 */
	async patch(id, partial) {
		const entry = this.#entries.get(id);
		if (!entry) return null;
		if ("materials" in partial) entry.materials = partial.materials ?? [];
		if ("hopperStats" in partial) entry.hopperStats = partial.hopperStats ?? null;
		if ("acquiredMaterials" in partial) {
			entry.acquiredMaterials = Array.isArray(partial.acquiredMaterials)
				? [...partial.acquiredMaterials]
				: [];
		}
		if ("defaultCameraPreset" in partial) {
			entry.defaultCameraPreset = partial.defaultCameraPreset || "iso-north";
		}
		if ("defaultCameraZoom" in partial) {
			entry.defaultCameraZoom = clampDefaultZoom(partial.defaultCameraZoom);
		}
		if ("userDetails" in partial) {
			entry.userDetails = Array.isArray(partial.userDetails)
				? partial.userDetails.map(d => ({ ...d }))
				: [];
		}
		if ("creator" in partial) entry.creator = String(partial.creator ?? "");
		if ("credits" in partial) entry.credits = String(partial.credits ?? "");
		if ("sourceLink" in partial) entry.sourceLink = String(partial.sourceLink ?? "");
		if (partial.name != null) entry.name = partial.name;
		if (partial.entityCount != null) entry.entityCount = partial.entityCount;
		if (partial.blockCount != null) entry.blockCount = partial.blockCount;
		if (partial.blockNames != null) entry.blockNames = partial.blockNames;
		if ("entryId" in partial) {
			const eid = partial.entryId ?? null;
			entry.entryId = eid && this.#catalogEntries.has(eid) ? eid : null;
		}
		if ("featureIds" in partial) {
			entry.featureIds = filterFeatureIds(partial.featureIds, this.#features);
		}
		if (partial.parseError !== undefined) {
			if (partial.parseError) entry.parseError = partial.parseError;
			else delete entry.parseError;
		}
		this.#notify();
		await this.#persistStructure(entry, this.#dbName);
		return entry;
	}

	/**
	 * @param {string} structureId
	 * @param {string|null} entryId
	 */
	async setStructureEntry(structureId, entryId) {
		return this.patch(structureId, { entryId: entryId ?? null });
	}

	/**
	 * Default (or first) function-entry in a category.
	 * @param {string} categoryId
	 * @returns {CatalogEntry|undefined}
	 */
	defaultEntryForCategory(categoryId) {
		const entries = this.listCatalogEntries(categoryId);
		return entries.find(e => e.isDefault) || entries[0];
	}

	/**
	 * Assign a structure to a category (its default/first entry) or Uncategorized.
	 * @param {string} structureId
	 * @param {string|null} categoryId
	 */
	async assignStructureToCategory(structureId, categoryId) {
		if (!categoryId || categoryId === "uncategorized") {
			return this.setStructureEntry(structureId, null);
		}
		if (!this.#categories.has(categoryId)) return this.get(structureId) ?? null;
		const pick = this.defaultEntryForCategory(categoryId);
		if (!pick) {
			throw new Error("Category has no entries");
		}
		return this.setStructureEntry(structureId, pick.id);
	}

	/**
	 * @param {string} structureId
	 * @param {string[]} featureIds
	 */
	async setStructureFeatures(structureId, featureIds) {
		return this.patch(structureId, { featureIds });
	}

	/**
	 * @param {string} structureId
	 * @param {string} featureId
	 */
	async toggleStructureFeature(structureId, featureId) {
		const entry = this.#entries.get(structureId);
		if (!entry || !this.#features.has(featureId)) return null;
		const set = new Set(entry.featureIds || []);
		if (set.has(featureId)) set.delete(featureId);
		else set.add(featureId);
		return this.patch(structureId, { featureIds: [...set] });
	}

	/**
	 * @param {string} id
	 * @returns {Promise<boolean>}
	 */
	async remove(id) {
		if (!this.#entries.has(id)) return false;
		const dbName = this.#dbName;
		if (this.#persistEnabled) {
			try {
				await dbDeleteStructure(id, dbName);
				this.lastPersistError = null;
			} catch (e) {
				const msg = e?.message ?? String(e);
				this.lastPersistError = msg;
				console.warn("[basi] IndexedDB delete failed:", e);
				throw e;
			}
		}
		this.#entries.delete(id);
		this.#notify();
		return true;
	}

	/** Clear imported structures only; taxonomy stays. */
	async clear() {
		const dbName = this.#dbName;
		if (this.#persistEnabled) {
			try {
				await dbClearStructures(dbName);
				this.lastPersistError = null;
			} catch (e) {
				const msg = e?.message ?? String(e);
				this.lastPersistError = msg;
				console.warn("[basi] IndexedDB clear failed:", e);
				throw e;
			}
		}
		this.#entries.clear();
		this.#notify();
	}

	/**
	 * @param {string} id
	 * @returns {StructureCatalogEntry|undefined}
	 */
	get(id) {
		return this.#entries.get(id);
	}

	/**
	 * @returns {StructureCatalogEntry[]}
	 */
	list() {
		return [...this.#entries.values()].sort((a, b) => b.addedAt - a.addedAt);
	}

	/**
	 * @param {{ query?: string }} [opts]
	 * @returns {StructureCatalogEntry[]}
	 */
	search({ query = "" } = {}) {
		const q = query.trim().toLowerCase();
		const all = this.list();
		if (!q) return all;
		return all.filter(entry => this.#structureHaystack(entry).includes(q));
	}

	/**
	 * @param {StructureCatalogEntry} entry
	 * @returns {string}
	 */
	#structureHaystack(entry) {
		const fn = entry.entryId ? this.#catalogEntries.get(entry.entryId) : null;
		const cat = fn ? this.#categories.get(fn.categoryId) : null;
		const featureNames = (entry.featureIds || [])
			.map(id => this.#features.get(id)?.name ?? "")
			.join(" ");
		return [
			entry.name,
			entry.sourceName,
			entry.sourceKind,
			fn?.name ?? "",
			cat?.name ?? "uncategorized",
			entry.creator ?? "",
			entry.credits ?? "",
			featureNames,
			entry.size.join("x"),
			String(entry.entityCount ?? 0),
			...entry.blockNames
		]
			.join(" ")
			.toLowerCase();
	}

	// ---- Categories ----

	/**
	 * @returns {StructureCategory[]}
	 */
	listCategories() {
		return [...this.#categories.values()].sort(
			(a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
		);
	}

	/**
	 * @param {string} id
	 * @returns {StructureCategory|undefined}
	 */
	getCategory(id) {
		return this.#categories.get(id);
	}

	/**
	 * @param {string} structureId
	 * @returns {StructureCategory|undefined}
	 */
	getCategoryForStructure(structureId) {
		const s = this.#entries.get(structureId);
		if (!s?.entryId) return undefined;
		const fn = this.#catalogEntries.get(s.entryId);
		if (!fn) return undefined;
		return this.#categories.get(fn.categoryId);
	}

	/**
	 * @param {string|null|undefined} color
	 * @returns {string}
	 */
	#nextColor(color) {
		if (typeof color === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color.trim())) {
			return color.trim();
		}
		return "#64748b";
	}

	/**
	 * @param {string|object} nameOrPartial
	 * @returns {Promise<StructureCategory>}
	 */
	async addCategory(nameOrPartial) {
		const partial =
			typeof nameOrPartial === "string" ? { name: nameOrPartial } : nameOrPartial || {};
		const name = String(partial.name || "").trim() || "New category";
		const taken = new Set([...this.#categories.values()].map(c => c.slug));
		const slug = uniqueSlug(partial.slug || slugFromName(name), taken);
		const maxOrder = this.listCategories().reduce((m, c) => Math.max(m, c.sortOrder), -1);
		/** @type {StructureCategory} */
		const cat = {
			id: partial.id || newId("cat"),
			slug,
			name,
			description: typeof partial.description === "string" ? partial.description : "",
			color: this.#nextColor(partial.color),
			sortOrder: Number.isFinite(partial.sortOrder) ? partial.sortOrder : maxOrder + 1,
			collapsed: partial.collapsed != null ? !!partial.collapsed : false,
			isDefault: !!partial.isDefault
		};
		this.#categories.set(cat.id, cat);
		this.#notify();
		const dbName = this.#dbName;
		await this.#tryPersist(() => dbPutCategory(cat, dbName), "category put");
		return cat;
	}

	/**
	 * @param {string} id
	 * @param {Partial<Pick<StructureCategory, "name"|"description"|"color"|"collapsed"|"sortOrder">>} partial
	 */
	async patchCategory(id, partial) {
		const cat = this.#categories.get(id);
		if (!cat) return null;
		if (partial.name != null) {
			const trimmed = String(partial.name).trim();
			if (trimmed) cat.name = trimmed;
		}
		if ("description" in partial) cat.description = String(partial.description ?? "");
		if ("color" in partial) cat.color = this.#nextColor(partial.color);
		if ("collapsed" in partial) cat.collapsed = !!partial.collapsed;
		if (Number.isFinite(partial.sortOrder)) cat.sortOrder = /** @type {number} */ (partial.sortOrder);
		this.#notify();
		const dbName = this.#dbName;
		await this.#tryPersist(() => dbPutCategory(cat, dbName), "category patch");
		return cat;
	}

	/**
	 * @param {string} id
	 * @param {string} name
	 */
	async renameCategory(id, name) {
		return this.patchCategory(id, { name });
	}

	/**
	 * Delete category and its function-entries; structures become Uncategorized.
	 * @param {string} id
	 */
	async removeCategory(id) {
		const cat = this.#categories.get(id);
		if (!cat) return false;
		const childEntries = [...this.#catalogEntries.values()].filter(e => e.categoryId === id);
		const seedKeys = [`cat:${cat.slug}`, ...childEntries.map(e => `ent:${cat.slug}/${e.slug}`)];
		this.#categories.delete(id);
		for (const ent of childEntries) {
			this.#catalogEntries.delete(ent.id);
		}
		const moved = [];
		const childIds = new Set(childEntries.map(e => e.id));
		for (const entry of this.#entries.values()) {
			if (entry.entryId && childIds.has(entry.entryId)) {
				entry.entryId = null;
				moved.push(entry);
			}
		}
		const tagged = [];
		for (const feat of this.#features.values()) {
			if (feat.categoryIds.includes(id)) {
				feat.categoryIds = feat.categoryIds.filter(cid => cid !== id);
				tagged.push(feat);
			}
		}
		this.#notify();
		if (this.#persistEnabled) {
			try {
				await dbRemoveCategoryCascade(this.#dbName, {
					categoryId: id,
					childEntryIds: childEntries.map(e => e.id),
					movedStructures: moved,
					taggedFeatures: tagged
				});
				this.lastPersistError = null;
			} catch (e) {
				const msg = e?.message ?? String(e);
				this.lastPersistError = msg;
				console.warn("[basi] category delete failed:", e);
				throw e;
			}
		}
		await this.#markSeedAppliedKeys(seedKeys);
		return true;
	}

	/**
	 * @param {string} id
	 * @param {boolean} collapsed
	 */
	async setCategoryCollapsed(id, collapsed) {
		return this.patchCategory(id, { collapsed: !!collapsed });
	}

	/**
	 * @param {string} id
	 * @param {-1|1} direction
	 */
	async reorderCategory(id, direction) {
		const ordered = this.listCategories();
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
		this.#notify();
		await this.#tryPersist(() => dbPutCategories(this.listCategories(), this.#dbName), "category reorder");
		return true;
	}

	/**
	 * Place `id` before or after `targetId` in category sort order.
	 * @param {string} id
	 * @param {string} targetId
	 * @param {"before"|"after"} place
	 */
	async moveCategoryTo(id, targetId, place) {
		const ordered = this.listCategories();
		if (!moveCategoryInList(ordered, id, targetId, place)) return false;
		this.#notify();
		await this.#tryPersist(() => dbPutCategories(this.listCategories(), this.#dbName), "category move");
		return true;
	}

	// ---- Catalog function-entries ----

	/**
	 * @param {string} [categoryId]
	 * @returns {CatalogEntry[]}
	 */
	listCatalogEntries(categoryId) {
		let rows = [...this.#catalogEntries.values()];
		if (categoryId) rows = rows.filter(e => e.categoryId === categoryId);
		return rows.sort(
			(a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
		);
	}

	/**
	 * @param {string} id
	 * @returns {CatalogEntry|undefined}
	 */
	getCatalogEntry(id) {
		return this.#catalogEntries.get(id);
	}

	/**
	 * @param {{ categoryId: string, name?: string, description?: string, slug?: string, id?: string, collapsed?: boolean, isDefault?: boolean, sortOrder?: number }} partial
	 * @returns {Promise<CatalogEntry>}
	 */
	async addCatalogEntry(partial) {
		const categoryId = partial.categoryId;
		if (!categoryId || !this.#categories.has(categoryId)) {
			throw new Error("Catalog entry requires a valid category");
		}
		const name = String(partial.name || "").trim() || "New entry";
		const taken = new Set(
			this.listCatalogEntries(categoryId).map(e => e.slug)
		);
		const slug = uniqueSlug(partial.slug || slugFromName(name), taken);
		const maxOrder = this.listCatalogEntries(categoryId).reduce(
			(m, e) => Math.max(m, e.sortOrder),
			-1
		);
		/** @type {CatalogEntry} */
		const ent = {
			id: partial.id || newId("ent"),
			slug,
			categoryId,
			name,
			description: typeof partial.description === "string" ? partial.description : "",
			sortOrder: Number.isFinite(partial.sortOrder) ? partial.sortOrder : maxOrder + 1,
			collapsed: partial.collapsed != null ? !!partial.collapsed : false,
			isDefault: !!partial.isDefault
		};
		this.#catalogEntries.set(ent.id, ent);
		this.#notify();
		await this.#tryPersist(() => dbPutEntry(ent, this.#dbName), "entry put");
		return ent;
	}

	/**
	 * @param {string} id
	 * @param {Partial<Pick<CatalogEntry, "name"|"description"|"collapsed"|"sortOrder"|"categoryId">>} partial
	 */
	async patchCatalogEntry(id, partial) {
		const ent = this.#catalogEntries.get(id);
		if (!ent) return null;
		if (partial.name != null) {
			const trimmed = String(partial.name).trim();
			if (trimmed) ent.name = trimmed;
		}
		if ("description" in partial) ent.description = String(partial.description ?? "");
		if ("collapsed" in partial) ent.collapsed = !!partial.collapsed;
		if (Number.isFinite(partial.sortOrder)) ent.sortOrder = /** @type {number} */ (partial.sortOrder);
		if ("categoryId" in partial && partial.categoryId && this.#categories.has(partial.categoryId)) {
			ent.categoryId = partial.categoryId;
		}
		this.#notify();
		await this.#tryPersist(() => dbPutEntry(ent, this.#dbName), "entry patch");
		return ent;
	}

	/**
	 * @param {string} id
	 */
	async removeCatalogEntry(id) {
		const ent = this.#catalogEntries.get(id);
		if (!ent) return false;
		this.#catalogEntries.delete(id);
		const moved = [];
		for (const entry of this.#entries.values()) {
			if (entry.entryId === id) {
				entry.entryId = null;
				moved.push(entry);
			}
		}
		this.#notify();
		if (this.#persistEnabled) {
			try {
				await dbRemoveEntryCascade(this.#dbName, {
					entryId: id,
					movedStructures: moved
				});
				this.lastPersistError = null;
			} catch (e) {
				const msg = e?.message ?? String(e);
				this.lastPersistError = msg;
				console.warn("[basi] entry delete failed:", e);
				throw e;
			}
		}
		const parent = this.#categories.get(ent.categoryId);
		await this.#markSeedAppliedKeys([parent ? `ent:${parent.slug}/${ent.slug}` : `ent:${ent.slug}`]);
		return true;
	}

	/**
	 * @param {string} id
	 * @param {boolean} collapsed
	 */
	async setCatalogEntryCollapsed(id, collapsed) {
		return this.patchCatalogEntry(id, { collapsed: !!collapsed });
	}

	/**
	 * @param {string} id
	 * @param {-1|1} direction
	 */
	async reorderCatalogEntry(id, direction) {
		const ent = this.#catalogEntries.get(id);
		if (!ent) return false;
		const ordered = this.listCatalogEntries(ent.categoryId);
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
		this.#notify();
		await this.#tryPersist(
			() => dbPutEntries(this.listCatalogEntries(ent.categoryId), this.#dbName),
			"entry reorder"
		);
		return true;
	}

	// ---- Features ----

	/**
	 * @returns {CatalogFeature[]}
	 */
	listFeatures() {
		return [...this.#features.values()].sort(
			(a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
		);
	}

	/**
	 * @param {string} id
	 * @returns {CatalogFeature|undefined}
	 */
	getFeature(id) {
		return this.#features.get(id);
	}

	/**
	 * @param {string} structureId
	 * @returns {CatalogFeature[]}
	 */
	listFeaturesForStructure(structureId) {
		const entry = this.#entries.get(structureId);
		if (!entry) return [];
		return (entry.featureIds || [])
			.map(id => this.#features.get(id))
			.filter(Boolean);
	}

	/**
	 * @param {{ name?: string, description?: string, useCases?: string, color?: string, categoryIds?: string[], slug?: string, id?: string, isDefault?: boolean, sortOrder?: number }} partial
	 */
	async addFeature(partial = {}) {
		const name = String(partial.name || "").trim() || "New feature";
		const taken = new Set([...this.#features.values()].map(f => f.slug));
		const slug = uniqueSlug(partial.slug || slugFromName(name), taken);
		const maxOrder = this.listFeatures().reduce((m, f) => Math.max(m, f.sortOrder), -1);
		const categoryIds = Array.isArray(partial.categoryIds)
			? [...new Set(partial.categoryIds.filter(id => this.#categories.has(id)))]
			: [];
		/** @type {CatalogFeature} */
		const feat = {
			id: partial.id || newId("feat"),
			slug,
			name,
			description: typeof partial.description === "string" ? partial.description : "",
			useCases: typeof partial.useCases === "string" ? partial.useCases : "",
			color: this.#nextColor(partial.color),
			categoryIds,
			sortOrder: Number.isFinite(partial.sortOrder) ? partial.sortOrder : maxOrder + 1,
			isDefault: !!partial.isDefault
		};
		this.#features.set(feat.id, feat);
		this.#notify();
		await this.#tryPersist(() => dbPutFeature(feat, this.#dbName), "feature put");
		return feat;
	}

	/**
	 * @param {string} id
	 * @param {Partial<Pick<CatalogFeature, "name"|"description"|"useCases"|"color"|"categoryIds"|"sortOrder">>} partial
	 */
	async patchFeature(id, partial) {
		const feat = this.#features.get(id);
		if (!feat) return null;
		if (partial.name != null) {
			const trimmed = String(partial.name).trim();
			if (trimmed) feat.name = trimmed;
		}
		if ("description" in partial) feat.description = String(partial.description ?? "");
		if ("useCases" in partial) feat.useCases = String(partial.useCases ?? "");
		if ("color" in partial) feat.color = this.#nextColor(partial.color);
		if ("categoryIds" in partial) {
			feat.categoryIds = Array.isArray(partial.categoryIds)
				? [...new Set(partial.categoryIds.filter(cid => this.#categories.has(cid)))]
				: [];
		}
		if (Number.isFinite(partial.sortOrder)) feat.sortOrder = /** @type {number} */ (partial.sortOrder);
		this.#notify();
		await this.#tryPersist(() => dbPutFeature(feat, this.#dbName), "feature patch");
		return feat;
	}

	/**
	 * @param {string} id
	 */
	async removeFeature(id) {
		const feat = this.#features.get(id);
		if (!feat) return false;
		this.#features.delete(id);
		const touched = [];
		for (const entry of this.#entries.values()) {
			if ((entry.featureIds || []).includes(id)) {
				entry.featureIds = (entry.featureIds || []).filter(fid => fid !== id);
				touched.push(entry);
			}
		}
		this.#notify();
		if (this.#persistEnabled) {
			try {
				await dbRemoveFeatureCascade(this.#dbName, {
					featureId: id,
					touchedStructures: touched
				});
				this.lastPersistError = null;
			} catch (e) {
				const msg = e?.message ?? String(e);
				this.lastPersistError = msg;
				console.warn("[basi] feature delete failed:", e);
				throw e;
			}
		}
		await this.#markSeedAppliedKeys([`feat:${feat.slug}`]);
		return true;
	}

	/**
	 * @param {string} id
	 * @param {-1|1} direction
	 */
	async reorderFeature(id, direction) {
		const ordered = this.listFeatures();
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
		this.#notify();
		await this.#tryPersist(() => dbPutFeatures(this.listFeatures(), this.#dbName), "feature reorder");
		return true;
	}

	/**
	 * Tree for viewer + editor. Uncategorized structures first.
	 * @param {{ query?: string }} [opts]
	 * @returns {{
	 *   uncategorized: { collapsed: boolean, structures: StructureCatalogEntry[] },
	 *   categories: { category: StructureCategory, structureCount: number, entries: { entry: CatalogEntry, structures: StructureCatalogEntry[] }[] }[]
	 * }}
	 */
	listTree({ query = "" } = {}) {
		return buildCatalogTree({
			structures: this.list(),
			categories: this.listCategories(),
			entriesByCategory: id => this.listCatalogEntries(id),
			catalogEntries: this.#catalogEntries,
			matchedIds: new Set(this.search({ query }).map(s => s.id)),
			query
		});
	}

	/**
	 * Insert seed rows whose slugs are not present. Deleted seeds stay gone
	 * (tracked in the catalog meta store) when persistence is on.
	 * @returns {Promise<{ categories: number, entries: number, features: number }>}
	 */
	async ensureSeedTaxonomy() {
		const applied = await this.#loadAppliedSeedKeys();
		const result = applySeedTaxonomy({
			categories: this.#categories,
			catalogEntries: this.#catalogEntries,
			features: this.#features,
			applied,
			skipApplied: this.#persistEnabled
		});
		if (this.#persistEnabled) {
			const dbName = this.#dbName;
			try {
				if (result.categories.length) await dbPutCategories(result.categories, dbName);
				if (result.entries.length) await dbPutEntries(result.entries, dbName);
				if (result.features.length) await dbPutFeatures(result.features, dbName);
				await this.#saveAppliedSeedKeys(result.applied);
				this.lastPersistError = null;
			} catch (e) {
				const msg = e?.message ?? String(e);
				this.lastPersistError = msg;
				console.warn("[basi] seed persist failed:", e);
			}
		}
		const nCat = result.categories.length;
		const nEnt = result.entries.length;
		const nFeat = result.features.length;
		if (nCat || nEnt || nFeat) this.#notify();
		return { categories: nCat, entries: nEnt, features: nFeat };
	}

	async #loadAppliedSeedKeys() {
		if (!this.#persistEnabled) return new Set();
		try {
			const meta = await dbGetMeta(this.#dbName);
			if (Array.isArray(meta?.applied)) return new Set(meta.applied);
			if (typeof localStorage === "undefined") return new Set();
			let raw = localStorage.getItem(`${TAXONOMY_SEED_STATE_KEY}::${this.#dbName}`);
			if (!raw && this.#dbName === DEFAULT_DB_NAME) {
				raw = localStorage.getItem(TAXONOMY_SEED_STATE_KEY);
			}
			if (!raw) return new Set();
			const o = JSON.parse(raw);
			return new Set(Array.isArray(o?.applied) ? o.applied : []);
		} catch {
			return new Set();
		}
	}

	async #saveAppliedSeedKeys(applied) {
		if (!this.#persistEnabled) return;
		try {
			await dbPutMeta(
				{ version: TAXONOMY_SEED_VERSION, applied: [...applied] },
				this.#dbName
			);
		} catch {
			/* ignore */
		}
	}

	/**
	 * Wipe maps and reload `dbName` (or the current catalog DB).
	 * @param {string} [dbName]
	 */
	async reloadFromDb(dbName) {
		const gen = ++this.#hydrateGen;
		if (dbName) this.#dbName = dbName;
		setActiveDbName(this.#dbName);
		this.#entries.clear();
		this.#categories.clear();
		this.#catalogEntries.clear();
		this.#features.clear();
		return this.hydrateFromDb(gen);
	}

	async #markSeedAppliedKeys(keys) {
		if (!this.#persistEnabled) return;
		const applied = await this.#loadAppliedSeedKeys();
		for (const k of keys) {
			if (k) applied.add(k);
		}
		await this.#saveAppliedSeedKeys(applied);
	}

	/**
	 * @param {() => void} listener
	 * @returns {() => void}
	 */
	subscribe(listener) {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	/**
	 * Restore catalog from IndexedDB, then seed missing taxonomy slugs.
	 * @returns {Promise<number>} count of structures loaded
	 */
	async hydrateFromDb(gen = this.#hydrateGen) {
		clearLegacyLocalStorageIndex();
		const dbName = this.#dbName;
		try {
			const [rows, cats, ents, feats] = await Promise.all([
				dbLoadAll(dbName),
				dbLoadCategories(dbName),
				dbLoadEntries(dbName),
				dbLoadFeatures(dbName)
			]);
			if (gen !== this.#hydrateGen) return 0;
			fillHydratedMaps({
				rows,
				cats,
				ents,
				feats,
				entries: this.#entries,
				categories: this.#categories,
				catalogEntries: this.#catalogEntries,
				features: this.#features
			});
			await this.ensureSeedTaxonomy();
			if (gen !== this.#hydrateGen) return 0;
			this.#notify();
			return rows.length;
		} catch (e) {
			console.warn("[basi] IndexedDB hydrate failed:", e);
			if (gen !== this.#hydrateGen) return 0;
			try {
				await this.ensureSeedTaxonomy();
			} catch (seedErr) {
				console.warn("[basi] seed after hydrate fail:", seedErr);
			}
			return 0;
		}
	}

	/** Disable IDB writes (unit tests). */
	setPersistEnabled(enabled) {
		this.#persistEnabled = !!enabled;
	}

	async #persistStructure(entry, dbName = this.#dbName) {
		if (!this.#persistEnabled) return;
		try {
			await dbPutStructure(entry, dbName);
			this.lastPersistError = null;
			delete entry.persistError;
		} catch (e) {
			const msg = e?.message ?? String(e);
			this.lastPersistError = msg;
			entry.persistError = msg;
			console.warn("[basi] IndexedDB put failed:", e);
		}
	}

	/**
	 * @param {() => Promise<void>} fn
	 * @param {string} label
	 */
	async #tryPersist(fn, label) {
		if (!this.#persistEnabled) return;
		try {
			await fn();
			this.lastPersistError = null;
		} catch (e) {
			const msg = e?.message ?? String(e);
			this.lastPersistError = msg;
			console.warn(`[basi] ${label} failed:`, e);
		}
	}

	#notify() {
		for (const listener of this.#listeners) {
			try {
				listener();
			} catch (e) {
				console.error(e);
			}
		}
	}
}
