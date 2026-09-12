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
	dbDeleteCategory,
	dbLoadCategories,
	dbPutEntry,
	dbPutEntries,
	dbDeleteEntry,
	dbLoadEntries,
	dbPutFeature,
	dbPutFeatures,
	dbDeleteFeature,
	dbLoadFeatures,
	clearLegacyLocalStorageIndex,
	getActiveDbName
} from "./db.js";
import {
	TAXONOMY_SEED_STATE_KEY,
	TAXONOMY_SEED_VERSION,
	buildSeedTaxonomy
} from "../data/taxonomy.js";

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

/**
 * @param {string} hex
 * @returns {string}
 */
export function contrastText(hex) {
	const h = String(hex || "").replace("#", "");
	if (h.length !== 3 && h.length !== 6) return "#0f0f0f";
	const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
	const r = parseInt(full.slice(0, 2), 16);
	const g = parseInt(full.slice(2, 4), 16);
	const b = parseInt(full.slice(4, 6), 16);
	if (![r, g, b].every(n => Number.isFinite(n))) return "#0f0f0f";
	const yiq = (r * 299 + g * 587 + b * 114) / 1000;
	return yiq >= 160 ? "#0f0f0f" : "#ffffff";
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
	/**
	 * @type {string|null}
	 */
	lastPersistError = null;

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
		const featureIds = this.#filterFeatureIds(partial.featureIds);
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
		await this.#persistStructure(entry);
		return entry;
	}

	/**
	 * @param {string} id
	 * @param {Partial<Pick<StructureCatalogEntry, "materials"|"hopperStats"|"name"|"entityCount"|"blockCount"|"blockNames"|"parseError"|"entryId"|"featureIds"|"acquiredMaterials"|"defaultCameraPreset"|"userDetails"|"creator"|"credits"|"sourceLink">>} partial
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
			entry.featureIds = this.#filterFeatureIds(partial.featureIds);
		}
		if (partial.parseError !== undefined) {
			if (partial.parseError) entry.parseError = partial.parseError;
			else delete entry.parseError;
		}
		this.#notify();
		await this.#persistStructure(entry);
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
		const ok = this.#entries.delete(id);
		if (ok) {
			this.#notify();
			if (this.#persistEnabled) {
				try {
					await dbDeleteStructure(id);
					this.lastPersistError = null;
				} catch (e) {
					const msg = e?.message ?? String(e);
					this.lastPersistError = msg;
					console.warn("[basi] IndexedDB delete failed:", e);
					throw e;
				}
			}
		}
		return ok;
	}

	/** Clear imported structures only; taxonomy stays. */
	async clear() {
		this.#entries.clear();
		this.#notify();
		if (this.#persistEnabled) {
			try {
				await dbClearStructures();
				this.lastPersistError = null;
			} catch (e) {
				const msg = e?.message ?? String(e);
				this.lastPersistError = msg;
				console.warn("[basi] IndexedDB clear failed:", e);
				throw e;
			}
		}
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

	#filterFeatureIds(ids) {
		if (!Array.isArray(ids)) return [];
		return [...new Set(ids.filter(id => this.#features.has(id)))];
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
		await this.#tryPersist(() => dbPutCategory(cat), "category put");
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
		await this.#tryPersist(() => dbPutCategory(cat), "category patch");
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
				await dbDeleteCategory(id);
				for (const ent of childEntries) await dbDeleteEntry(ent.id);
				for (const entry of moved) await dbPutStructure(entry);
				for (const feat of tagged) await dbPutFeature(feat);
				this.lastPersistError = null;
			} catch (e) {
				const msg = e?.message ?? String(e);
				this.lastPersistError = msg;
				console.warn("[basi] category delete failed:", e);
				throw e;
			}
		}
		this.#markSeedAppliedKeys(seedKeys);
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
		await this.#tryPersist(() => dbPutCategories(this.listCategories()), "category reorder");
		return true;
	}

	/**
	 * Place `id` before or after `targetId` in category sort order.
	 * @param {string} id
	 * @param {string} targetId
	 * @param {"before"|"after"} place
	 */
	async moveCategoryTo(id, targetId, place) {
		if (!id || id === targetId) return false;
		const ordered = this.listCategories();
		const from = ordered.findIndex(c => c.id === id);
		const to = ordered.findIndex(c => c.id === targetId);
		if (from < 0 || to < 0) return false;
		const [item] = ordered.splice(from, 1);
		let insert = ordered.findIndex(c => c.id === targetId);
		if (insert < 0) return false;
		if (place === "after") insert += 1;
		ordered.splice(insert, 0, item);
		ordered.forEach((c, i) => {
			c.sortOrder = i;
		});
		this.#notify();
		await this.#tryPersist(() => dbPutCategories(this.listCategories()), "category move");
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
		await this.#tryPersist(() => dbPutEntry(ent), "entry put");
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
		await this.#tryPersist(() => dbPutEntry(ent), "entry patch");
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
				await dbDeleteEntry(id);
				for (const entry of moved) await dbPutStructure(entry);
				this.lastPersistError = null;
			} catch (e) {
				const msg = e?.message ?? String(e);
				this.lastPersistError = msg;
				console.warn("[basi] entry delete failed:", e);
				throw e;
			}
		}
		const parent = this.#categories.get(ent.categoryId);
		this.#markSeedAppliedKeys([parent ? `ent:${parent.slug}/${ent.slug}` : `ent:${ent.slug}`]);
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
			() => dbPutEntries(this.listCatalogEntries(ent.categoryId)),
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
		await this.#tryPersist(() => dbPutFeature(feat), "feature put");
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
		await this.#tryPersist(() => dbPutFeature(feat), "feature patch");
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
				await dbDeleteFeature(id);
				for (const entry of touched) await dbPutStructure(entry);
				this.lastPersistError = null;
			} catch (e) {
				const msg = e?.message ?? String(e);
				this.lastPersistError = msg;
				console.warn("[basi] feature delete failed:", e);
				throw e;
			}
		}
		this.#markSeedAppliedKeys([`feat:${feat.slug}`]);
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
		await this.#tryPersist(() => dbPutFeatures(this.listFeatures()), "feature reorder");
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
		const q = query.trim().toLowerCase();
		const matched = new Set(this.search({ query }).map(s => s.id));
		const byEntry = new Map();
		const uncategorized = [];
		for (const s of this.list()) {
			const fn = s.entryId ? this.#catalogEntries.get(s.entryId) : null;
			if (!fn) {
				if (!q || matched.has(s.id)) uncategorized.push(s);
				continue;
			}
			if (!byEntry.has(fn.id)) byEntry.set(fn.id, []);
			byEntry.get(fn.id).push(s);
		}

		const categories = [];
		for (const category of this.listCategories()) {
			const catHit = q && category.name.toLowerCase().includes(q);
			const entries = [];
			for (const entry of this.listCatalogEntries(category.id)) {
				const entryHit = q && (
					entry.name.toLowerCase().includes(q)
					|| (entry.description || "").toLowerCase().includes(q)
				);
				const raw = byEntry.get(entry.id) || [];
				const structures = q && !catHit && !entryHit
					? raw.filter(s => matched.has(s.id))
					: raw;
				if (q && !catHit && !entryHit && !structures.length) continue;
				entries.push({ entry, structures });
			}
			if (q && !catHit && !entries.length) continue;
			const structureCount = entries.reduce((n, e) => n + e.structures.length, 0);
			categories.push({ category, structureCount, entries });
		}

		return {
			uncategorized: { collapsed: false, structures: uncategorized },
			categories
		};
	}

	/**
	 * Insert seed rows whose slugs are not present. Deleted seeds stay gone
	 * (tracked in localStorage) when persistence is on.
	 * @returns {Promise<{ categories: number, entries: number, features: number }>}
	 */
	async ensureSeedTaxonomy() {
		const seed = buildSeedTaxonomy();
		const applied = this.#loadAppliedSeedKeys();
		const persistApplied = this.#persistEnabled;
		let nCat = 0;
		let nEnt = 0;
		let nFeat = 0;
		const newCats = [];
		const newEntries = [];
		const newFeats = [];

		const catBySlug = new Map([...this.#categories.values()].map(c => [c.slug, c]));
		for (const cat of seed.categories) {
			const key = `cat:${cat.slug}`;
			if (catBySlug.has(cat.slug) || this.#categories.has(cat.id)) {
				applied.add(key);
				continue;
			}
			if (persistApplied && applied.has(key)) continue;
			this.#categories.set(cat.id, { ...cat });
			newCats.push(cat);
			applied.add(key);
			nCat++;
		}

		for (const ent of seed.entries) {
			const parent = this.#categories.get(ent.categoryId);
			const key = parent ? `ent:${parent.slug}/${ent.slug}` : `ent:${ent.slug}`;
			const exists =
				this.#catalogEntries.has(ent.id)
				|| [...this.#catalogEntries.values()].some(
					e => e.slug === ent.slug && e.categoryId === ent.categoryId
				);
			if (exists) {
				applied.add(key);
				continue;
			}
			if (persistApplied && applied.has(key)) continue;
			if (!this.#categories.has(ent.categoryId)) continue;
			this.#catalogEntries.set(ent.id, { ...ent });
			newEntries.push(ent);
			applied.add(key);
			nEnt++;
		}

		for (const feat of seed.features) {
			const key = `feat:${feat.slug}`;
			const exists =
				this.#features.has(feat.id)
				|| [...this.#features.values()].some(f => f.slug === feat.slug);
			if (exists) {
				applied.add(key);
				continue;
			}
			if (persistApplied && applied.has(key)) continue;
			this.#features.set(feat.id, {
				...feat,
				categoryIds: feat.categoryIds.filter(id => this.#categories.has(id))
			});
			newFeats.push(this.#features.get(feat.id));
			applied.add(key);
			nFeat++;
		}

		this.#saveAppliedSeedKeys(applied);
		if (this.#persistEnabled) {
			try {
				if (newCats.length) await dbPutCategories(newCats);
				if (newEntries.length) await dbPutEntries(newEntries);
				if (newFeats.length) await dbPutFeatures(newFeats);
				this.lastPersistError = null;
			} catch (e) {
				const msg = e?.message ?? String(e);
				this.lastPersistError = msg;
				console.warn("[basi] seed persist failed:", e);
			}
		}
		if (nCat || nEnt || nFeat) this.#notify();
		return { categories: nCat, entries: nEnt, features: nFeat };
	}

	#seedStateKey() {
		return `${TAXONOMY_SEED_STATE_KEY}::${getActiveDbName()}`;
	}

	#loadAppliedSeedKeys() {
		if (!this.#persistEnabled || typeof localStorage === "undefined") {
			return new Set();
		}
		try {
			let raw = localStorage.getItem(this.#seedStateKey());
			if (!raw && getActiveDbName() === "structure-db-viewer") {
				raw = localStorage.getItem(TAXONOMY_SEED_STATE_KEY);
			}
			if (!raw) return new Set();
			const o = JSON.parse(raw);
			return new Set(Array.isArray(o?.applied) ? o.applied : []);
		} catch {
			return new Set();
		}
	}

	#saveAppliedSeedKeys(applied) {
		if (!this.#persistEnabled || typeof localStorage === "undefined") return;
		try {
			localStorage.setItem(
				this.#seedStateKey(),
				JSON.stringify({ version: TAXONOMY_SEED_VERSION, applied: [...applied] })
			);
		} catch {
			/* ignore */
		}
	}

	/** Wipe in-memory maps and reload the active IndexedDB catalog. */
	async reloadFromDb() {
		this.#entries.clear();
		this.#categories.clear();
		this.#catalogEntries.clear();
		this.#features.clear();
		return this.hydrateFromDb();
	}

	#markSeedAppliedKeys(keys) {
		if (!this.#persistEnabled) return;
		const applied = this.#loadAppliedSeedKeys();
		for (const k of keys) {
			if (k) applied.add(k);
		}
		this.#saveAppliedSeedKeys(applied);
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
	async hydrateFromDb() {
		clearLegacyLocalStorageIndex();
		try {
			const [rows, cats, ents, feats] = await Promise.all([
				dbLoadAll(),
				dbLoadCategories(),
				dbLoadEntries(),
				dbLoadFeatures()
			]);
			this.#categories.clear();
			for (const c of cats) {
				if (!c.slug) continue;
				this.#categories.set(c.id, {
					id: c.id,
					slug: c.slug,
					name: c.name,
					description: c.description || "",
					color: c.color || "#64748b",
					sortOrder: c.sortOrder,
					collapsed: c.collapsed,
					isDefault: !!c.isDefault
				});
			}
			this.#catalogEntries.clear();
			for (const e of ents) {
				if (!this.#categories.has(e.categoryId)) continue;
				this.#catalogEntries.set(e.id, {
					id: e.id,
					slug: e.slug || "",
					categoryId: e.categoryId,
					name: e.name,
					description: e.description || "",
					sortOrder: e.sortOrder,
					collapsed: e.collapsed,
					isDefault: !!e.isDefault
				});
			}
			this.#features.clear();
			for (const f of feats) {
				this.#features.set(f.id, {
					id: f.id,
					slug: f.slug || "",
					name: f.name,
					description: f.description || "",
					useCases: f.useCases || "",
					color: f.color || "#64748b",
					categoryIds: Array.isArray(f.categoryIds)
						? f.categoryIds.filter(id => this.#categories.has(id))
						: [],
					sortOrder: f.sortOrder,
					isDefault: !!f.isDefault
				});
			}
			this.#entries.clear();
			for (const row of rows) {
				const entryId =
					row.entryId && this.#catalogEntries.has(row.entryId) ? row.entryId : null;
				this.#entries.set(row.id, {
					id: row.id,
					name: row.name,
					sourceName: row.sourceName,
					sourceKind: row.sourceKind,
					size: row.size,
					worldOrigin: row.worldOrigin,
					paletteSize: row.paletteSize,
					blockCount: row.blockCount,
					blockNames: row.blockNames ?? [],
					entityCount: row.entityCount ?? 0,
					materials: row.materials ?? [],
					hopperStats: row.hopperStats ?? null,
					entryId,
					featureIds: this.#filterFeatureIds(row.featureIds),
					acquiredMaterials: Array.isArray(row.acquiredMaterials)
						? [...row.acquiredMaterials]
						: [],
					defaultCameraPreset: row.defaultCameraPreset || "iso-north",
					userDetails: Array.isArray(row.userDetails)
						? row.userDetails.map(d => ({ ...d }))
						: [],
					creator: typeof row.creator === "string" ? row.creator : "",
					credits: typeof row.credits === "string" ? row.credits : "",
					sourceLink: typeof row.sourceLink === "string" ? row.sourceLink : "",
					addedAt: row.addedAt,
					file: row.file,
					parseError: row.parseError
				});
			}
			await this.ensureSeedTaxonomy();
			this.#notify();
			return rows.length;
		} catch (e) {
			console.warn("[basi] IndexedDB hydrate failed:", e);
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

	async #persistStructure(entry) {
		if (!this.#persistEnabled) return;
		try {
			await dbPutStructure(entry);
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
