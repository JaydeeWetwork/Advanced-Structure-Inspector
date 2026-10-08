/**
 * Structure rows inside one catalog. The catalog owns the maps.
 */

import { dbClearStructures, dbDeleteStructure } from "./db.js";
import { filterFeatureIds, newCatalogId, structureSearchText } from "./catalogQuery.js";
import { listCatalogEntries } from "./catalogTaxonomy.js";

/**
 * The catalog store, plus the two hooks structure rows need.
 * Taxonomy reads the same object and ignores these two.
 * @typedef {import("./catalogTaxonomy.js").CatalogTaxonomyStore & {
 *   persistStructure: (entry: import("./catalog.js").StructureCatalogEntry) => Promise<void>,
 *   normalizeZoom: (value: unknown) => number
 * }} CatalogEntryStore
 */

export class CatalogEntryBook {
	/** @param {CatalogEntryStore} store */
	constructor(store) {
		/** @type {CatalogEntryStore} */
		this.#store = store;
	}

	/** @type {CatalogEntryStore} */
	#store;

	/**
	 * @param {Omit<import("./catalog.js").StructureCatalogEntry, "id"|"addedAt"|"entityCount"|"entryId"|"featureIds"> & { id?: string, addedAt?: number, entityCount?: number, entryId?: string|null, featureIds?: string[], parseError?: string }} partial
	 * @returns {Promise<import("./catalog.js").StructureCatalogEntry>}
	 */
	async add(partial) {
		const store = this.#store;
		const id = partial.id ?? newCatalogId("bLayers");
		const entryId =
			partial.entryId != null && store.catalogEntries.has(partial.entryId)
				? partial.entryId
				: null;
		const featureIds = filterFeatureIds(partial.featureIds, store.features);
		/** @type {import("./catalog.js").StructureCatalogEntry} */
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
			defaultCameraZoom: store.normalizeZoom(partial.defaultCameraZoom),
			userDetails: Array.isArray(partial.userDetails)
				? partial.userDetails.map(d => ({ ...d }))
				: [],
			creator: typeof partial.creator === "string" ? partial.creator : "",
			credits: typeof partial.credits === "string" ? partial.credits : "",
			sourceLink: typeof partial.sourceLink === "string" ? partial.sourceLink : "",
			addedAt: partial.addedAt ?? Date.now(),
			file: partial.file,
			contentCrc32: typeof partial.contentCrc32 === "string" ? partial.contentCrc32 : ""
		};
		if (partial.parseError) entry.parseError = partial.parseError;
		store.entries.set(id, entry);
		store.notify();
		await store.persistStructure(entry);
		return entry;
	}

	/**
	 * @param {string} id
	 * @param {Partial<Pick<import("./catalog.js").StructureCatalogEntry, "materials"|"hopperStats"|"name"|"entityCount"|"blockCount"|"blockNames"|"parseError"|"entryId"|"featureIds"|"acquiredMaterials"|"defaultCameraPreset"|"defaultCameraZoom"|"userDetails"|"creator"|"credits"|"sourceLink">>} partial
	 * @returns {Promise<import("./catalog.js").StructureCatalogEntry|null>}
	 */
	async patch(id, partial) {
		const store = this.#store;
		const entry = store.entries.get(id);
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
			entry.defaultCameraZoom = store.normalizeZoom(partial.defaultCameraZoom);
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
			entry.entryId = eid && store.catalogEntries.has(eid) ? eid : null;
		}
		if ("featureIds" in partial) {
			entry.featureIds = filterFeatureIds(partial.featureIds, store.features);
		}
		if (partial.parseError !== undefined) {
			if (partial.parseError) entry.parseError = partial.parseError;
			else delete entry.parseError;
		}
		store.notify();
		await store.persistStructure(entry);
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
	 * @returns {import("./catalog.js").CatalogEntry|undefined}
	 */
	defaultEntryForCategory(categoryId) {
		const entries = listCatalogEntries(this.#store, categoryId);
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
		if (!this.#store.categories.has(categoryId)) return this.get(structureId) ?? null;
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
		const store = this.#store;
		const entry = store.entries.get(structureId);
		if (!entry || !store.features.has(featureId)) return null;
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
		const store = this.#store;
		if (!store.entries.has(id)) return false;
		const dbName = store.dbName();
		if (store.persistEnabled()) {
			try {
				await dbDeleteStructure(id, dbName);
				store.setLastPersistError(null);
			} catch (e) {
				const msg = e?.message ?? String(e);
				store.setLastPersistError(msg);
				console.warn("[bLayers] IndexedDB delete failed:", e);
				throw e;
			}
		}
		store.entries.delete(id);
		store.notify();
		return true;
	}

	/** Clear imported structures only; taxonomy stays. */
	async clear() {
		const store = this.#store;
		const dbName = store.dbName();
		if (store.persistEnabled()) {
			try {
				await dbClearStructures(dbName);
				store.setLastPersistError(null);
			} catch (e) {
				const msg = e?.message ?? String(e);
				store.setLastPersistError(msg);
				console.warn("[bLayers] IndexedDB clear failed:", e);
				throw e;
			}
		}
		store.entries.clear();
		store.notify();
	}

	/**
	 * @param {string} id
	 * @returns {import("./catalog.js").StructureCatalogEntry|undefined}
	 */
	get(id) {
		return this.#store.entries.get(id);
	}

	/**
	 * @returns {import("./catalog.js").StructureCatalogEntry[]}
	 */
	list() {
		return [...this.#store.entries.values()].sort((a, b) => b.addedAt - a.addedAt);
	}

	/**
	 * @param {{ query?: string }} [opts]
	 * @returns {import("./catalog.js").StructureCatalogEntry[]}
	 */
	search({ query = "" } = {}) {
		const q = query.trim().toLowerCase();
		const all = this.list();
		if (!q) return all;
		return all.filter(entry => this.#haystack(entry).includes(q));
	}

	/**
	 * @param {import("./catalog.js").StructureCatalogEntry} entry
	 * @returns {string}
	 */
	#haystack(entry) {
		const store = this.#store;
		return structureSearchText(entry, {
			catalogEntries: store.catalogEntries,
			categories: store.categories,
			features: store.features
		});
	}
}
