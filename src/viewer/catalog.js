/**
 * Structure catalog with IndexedDB persistence
 * (structure files + category → entry tree + features).
 */

import {
	dbPutCategories,
	dbPutEntries,
	dbPutFeatures,
	DEFAULT_DB_NAME,
	setActiveDbName
} from "./db.js";
import { ensureDefaultCatalogMigrated } from "./dbMigrate.js";
import { applySeedTaxonomy } from "./catalogSeed.js";
import {
	buildCatalogTree,
	contrastText
} from "./catalogQuery.js";
import { CatalogEntryBook } from "./catalogEntries.js";
import {
	hydrateCatalogStores,
	loadAppliedSeedKeys,
	persistStructureEntry,
	saveAppliedSeedKeys,
	tryPersist
} from "./catalogPersist.js";
import { normalizeCameraZoom } from "./cameraPrefs.js";

export { contrastText };
import {
	activateCatalog,
	createEmptyCatalog,
	deleteActiveCatalog,
	renameActiveCatalog,
	saveCatalogAs
} from "./catalogSwitch.js";
import { getActiveCatalog } from "./catalogRegistry.js";
import { reportPersistFailure } from "./persistNotice.js";
import * as taxonomy from "./catalogTaxonomy.js";

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

/** Taxonomy functions StructureCatalog forwards. Each receives `#taxStore` first. */
const TAXONOMY_METHODS = [
	"listCategories",
	"getCategory",
	"getCategoryForStructure",
	"addCategory",
	"patchCategory",
	"renameCategory",
	"removeCategory",
	"setCategoryCollapsed",
	"reorderCategory",
	"moveCategoryTo",
	"listCatalogEntries",
	"getCatalogEntry",
	"addCatalogEntry",
	"patchCatalogEntry",
	"removeCatalogEntry",
	"setCatalogEntryCollapsed",
	"reorderCatalogEntry",
	"listFeatures",
	"getFeature",
	"listFeaturesForStructure",
	"addFeature",
	"patchFeature",
	"removeFeature",
	"reorderFeature"
];

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
	 * Built once. Taxonomy and the entry book share this object. The maps are the fields above.
	 * @type {import("./catalogEntries.js").CatalogEntryStore}
	 */
	#taxStore = {
		categories: this.#categories,
		catalogEntries: this.#catalogEntries,
		features: this.#features,
		entries: this.#entries,
		dbName: () => this.#dbName,
		persistEnabled: () => this.#persistEnabled,
		notify: () => this.#notify(),
		tryPersist: (fn, label) => this.#tryPersist(fn, label),
		markSeedApplied: keys => this.#markSeedAppliedKeys(keys),
		setLastPersistError: msg => {
			this.lastPersistError = msg;
		},
		persistStructure: entry => this.#persistStructure(entry),
		normalizeZoom: normalizeCameraZoom
	};
	/** @type {CatalogEntryBook} */
	#entryBook = new CatalogEntryBook(this.#taxStore);
	/**
	 * @type {string|null}
	 */
	lastPersistError = null;

	// Assigned in the constructor. Declared here so the checker can see them.
	/** @type {() => StructureCategory[]} */
	listCategories;
	/** @type {(id: string) => StructureCategory|undefined} */
	getCategory;
	/** @type {(structureId: string) => StructureCategory|undefined} */
	getCategoryForStructure;
	/** @type {(nameOrPartial: string|object) => Promise<StructureCategory>} */
	addCategory;
	/** @type {(id: string, partial: { name?: string, description?: string, color?: string, collapsed?: boolean, sortOrder?: number }) => Promise<StructureCategory|null>} */
	patchCategory;
	/** @type {(id: string, name: string) => Promise<StructureCategory|null>} */
	renameCategory;
	/** @type {(id: string) => Promise<boolean>} */
	removeCategory;
	/** @type {(id: string, collapsed: boolean) => Promise<StructureCategory|null>} */
	setCategoryCollapsed;
	/** @type {(id: string, direction: -1|1) => Promise<boolean>} */
	reorderCategory;
	/** @type {(id: string, targetId: string, place: "before"|"after") => Promise<boolean>} */
	moveCategoryTo;
	/** @type {(categoryId?: string) => CatalogEntry[]} */
	listCatalogEntries;
	/** @type {(id: string) => CatalogEntry|undefined} */
	getCatalogEntry;
	/** @type {(partial: { categoryId: string, name?: string, description?: string, slug?: string, id?: string, collapsed?: boolean, isDefault?: boolean, sortOrder?: number }) => Promise<CatalogEntry>} */
	addCatalogEntry;
	/** @type {(id: string, partial: { name?: string, description?: string, collapsed?: boolean, sortOrder?: number, categoryId?: string }) => Promise<CatalogEntry|null>} */
	patchCatalogEntry;
	/** @type {(id: string) => Promise<boolean>} */
	removeCatalogEntry;
	/** @type {(id: string, collapsed: boolean) => Promise<CatalogEntry|null>} */
	setCatalogEntryCollapsed;
	/** @type {(id: string, direction: -1|1) => Promise<boolean>} */
	reorderCatalogEntry;
	/** @type {() => CatalogFeature[]} */
	listFeatures;
	/** @type {(id: string) => CatalogFeature|undefined} */
	getFeature;
	/** @type {(structureId: string) => CatalogFeature[]} */
	listFeaturesForStructure;
	/** @type {(partial?: { name?: string, description?: string, useCases?: string, color?: string, categoryIds?: string[], slug?: string, id?: string, isDefault?: boolean, sortOrder?: number }) => Promise<CatalogFeature>} */
	addFeature;
	/** @type {(id: string, partial: { name?: string, description?: string, useCases?: string, color?: string, categoryIds?: string[], sortOrder?: number }) => Promise<CatalogFeature|null>} */
	patchFeature;
	/** @type {(id: string) => Promise<boolean>} */
	removeFeature;
	/** @type {(id: string, direction: -1|1) => Promise<boolean>} */
	reorderFeature;

	constructor() {
		for (const name of TAXONOMY_METHODS) {
			const fn = taxonomy[name];
			if (typeof fn !== "function") throw new Error(`catalog taxonomy missing ${name}`);
			this[name] = (...args) => fn(this.#taxStore, ...args);
		}
	}

	getDbName() {
		return this.#dbName;
	}

	async bootFromRegistry() {
		try {
			await ensureDefaultCatalogMigrated();
		} catch (e) {
			console.warn("[bLayers] default IndexedDB migrate failed:", e);
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
		return this.#entryBook.add(partial);
	}

	/**
	 * @param {string} id
	 * @param {Partial<Pick<StructureCatalogEntry, "materials"|"hopperStats"|"name"|"entityCount"|"blockCount"|"blockNames"|"parseError"|"entryId"|"featureIds"|"acquiredMaterials"|"defaultCameraPreset"|"defaultCameraZoom"|"userDetails"|"creator"|"credits"|"sourceLink">>} partial
	 * @returns {Promise<StructureCatalogEntry|null>}
	 */
	async patch(id, partial) {
		return this.#entryBook.patch(id, partial);
	}

	/**
	 * @param {string} structureId
	 * @param {string|null} entryId
	 */
	async setStructureEntry(structureId, entryId) {
		return this.#entryBook.setStructureEntry(structureId, entryId);
	}

	/**
	 * Default (or first) function-entry in a category.
	 * @param {string} categoryId
	 * @returns {CatalogEntry|undefined}
	 */
	defaultEntryForCategory(categoryId) {
		return this.#entryBook.defaultEntryForCategory(categoryId);
	}

	/**
	 * Assign a structure to a category (its default/first entry) or Uncategorized.
	 * @param {string} structureId
	 * @param {string|null} categoryId
	 */
	async assignStructureToCategory(structureId, categoryId) {
		return this.#entryBook.assignStructureToCategory(structureId, categoryId);
	}

	/**
	 * @param {string} structureId
	 * @param {string[]} featureIds
	 */
	async setStructureFeatures(structureId, featureIds) {
		return this.#entryBook.setStructureFeatures(structureId, featureIds);
	}

	/**
	 * @param {string} structureId
	 * @param {string} featureId
	 */
	async toggleStructureFeature(structureId, featureId) {
		return this.#entryBook.toggleStructureFeature(structureId, featureId);
	}

	/**
	 * @param {string} id
	 * @returns {Promise<boolean>}
	 */
	async remove(id) {
		return this.#entryBook.remove(id);
	}

	/** Clear imported structures only; taxonomy stays. */
	async clear() {
		return this.#entryBook.clear();
	}

	/**
	 * @param {string} id
	 * @returns {StructureCatalogEntry|undefined}
	 */
	get(id) {
		return this.#entryBook.get(id);
	}

	/**
	 * @returns {StructureCatalogEntry[]}
	 */
	list() {
		return this.#entryBook.list();
	}

	/**
	 * @param {{ query?: string }} [opts]
	 * @returns {StructureCatalogEntry[]}
	 */
	search({ query = "" } = {}) {
		return this.#entryBook.search({ query });
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
		const applied = await loadAppliedSeedKeys(this.#persistEnabled, this.#dbName);
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
				await saveAppliedSeedKeys(this.#persistEnabled, dbName, result.applied);
				this.lastPersistError = null;
			} catch (e) {
				const msg = e?.message ?? String(e);
				this.lastPersistError = msg;
				console.warn("[bLayers] seed persist failed:", e);
			}
		}
		const nCat = result.categories.length;
		const nEnt = result.entries.length;
		const nFeat = result.features.length;
		if (nCat || nEnt || nFeat) this.#notify();
		return { categories: nCat, entries: nEnt, features: nFeat };
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
		const applied = await loadAppliedSeedKeys(true, this.#dbName);
		for (const k of keys) {
			if (k) applied.add(k);
		}
		await saveAppliedSeedKeys(true, this.#dbName, applied);
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
		try {
			const n = await hydrateCatalogStores({
				dbName: this.#dbName,
				entries: this.#entries,
				categories: this.#categories,
				catalogEntries: this.#catalogEntries,
				features: this.#features,
				isStale: () => gen !== this.#hydrateGen
			});
			if (gen !== this.#hydrateGen) return 0;
			await this.ensureSeedTaxonomy();
			if (gen !== this.#hydrateGen) return 0;
			this.#notify();
			return n;
		} catch (e) {
			console.warn("[bLayers] IndexedDB hydrate failed:", e);
			if (gen !== this.#hydrateGen) return 0;
			try {
				await this.ensureSeedTaxonomy();
			} catch (seedErr) {
				console.warn("[bLayers] seed after hydrate fail:", seedErr);
			}
			return 0;
		}
	}

	/** Disable IDB writes (unit tests). */
	setPersistEnabled(enabled) {
		this.#persistEnabled = !!enabled;
	}

	async #persistStructure(entry, dbName = this.#dbName) {
		await persistStructureEntry(this.#persistEnabled, dbName, entry, err => {
			if (!err) {
				this.lastPersistError = null;
				delete entry.persistError;
				return;
			}
			const msg = err?.message ?? String(err);
			this.lastPersistError = msg;
			entry.persistError = msg;
			reportPersistFailure(msg);
		});
	}

	/**
	 * @param {() => Promise<void>} fn
	 * @param {string} label
	 */
	async #tryPersist(fn, label) {
		await tryPersist(this.#persistEnabled, fn, label, err => {
			const msg = err ? err.message ?? String(err) : "";
			this.lastPersistError = msg || null;
			if (msg) reportPersistFailure(msg);
		});
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
