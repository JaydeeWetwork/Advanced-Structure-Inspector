/**
 * Structure catalog with IndexedDB persistence (metadata + file blobs + categories).
 */

import {
	dbPutStructure,
	dbDeleteStructure,
	dbClearAll,
	dbLoadAll,
	dbPutCategory,
	dbPutCategories,
	dbDeleteCategory,
	dbLoadCategories,
	clearLegacyLocalStorageIndex
} from "./db.js";

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
 * @property {string|null} [categoryId] null = Uncategorized
 * @property {string[]} [acquiredMaterials] material ids marked acquired
 * @property {string} [defaultCameraPreset] e.g. iso-north, top, free
 * @property {{ id: string, text: string, addedAt?: number }[]} [userDetails] free-text detail lines
 * @property {string} [creator]
 * @property {string} [credits]
 * @property {string} [sourceLink] http(s) URL when set
 * @property {number} addedAt
 * @property {File} file
 * @property {string} [parseError]
 * @property {string} [persistError] set when IndexedDB write fails (in-memory still kept)
 */

/**
 * @typedef {object} StructureCategory
 * @property {string} id
 * @property {string} name
 * @property {number} sortOrder
 * @property {boolean} collapsed
 */

/** Sentinel for the virtual Uncategorized group (not stored in IDB). */
export const UNCATEGORIZED_ID = null;

function newId(prefix = "basi") {
	if (typeof crypto !== "undefined" && crypto.randomUUID) {
		return crypto.randomUUID();
	}
	return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export default class StructureCatalog {
	/** @type {Map<string, StructureCatalogEntry>} */
	#entries = new Map();
	/** @type {Map<string, StructureCategory>} */
	#categories = new Map();
	/** @type {Set<() => void>} */
	#listeners = new Set();
	#persistEnabled = true;
	/**
	 * Last persist failure message (cleared on success). Surfaced to UI.
	 * @type {string|null}
	 */
	lastPersistError = null;

	/**
	 * @param {Omit<StructureCatalogEntry, "id"|"addedAt"|"entityCount"|"categoryId"> & { id?: string, addedAt?: number, entityCount?: number, categoryId?: string|null, parseError?: string }} partial
	 * @returns {Promise<StructureCatalogEntry>}
	 */
	async add(partial) {
		const id = partial.id ?? newId("basi");
		const categoryId =
			partial.categoryId != null && this.#categories.has(partial.categoryId)
				? partial.categoryId
				: null;
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
			categoryId,
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
		if (this.#persistEnabled) {
			try {
				await dbPutStructure(entry);
				this.lastPersistError = null;
			} catch (e) {
				const msg = e?.message ?? String(e);
				this.lastPersistError = msg;
				console.warn("[basi] IndexedDB put failed:", e);
				entry.persistError = msg;
			}
		}
		return entry;
	}

	/**
	 * Patch metadata fields and re-persist (materials, hopperStats, category, etc.).
	 * @param {string} id
	 * @param {Partial<Pick<StructureCatalogEntry, "materials"|"hopperStats"|"name"|"entityCount"|"blockCount"|"blockNames"|"parseError"|"categoryId"|"acquiredMaterials"|"defaultCameraPreset"|"userDetails"|"creator"|"credits"|"sourceLink">>} partial
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
		if ("categoryId" in partial) {
			const cid = partial.categoryId ?? null;
			entry.categoryId = cid && this.#categories.has(cid) ? cid : null;
		}
		if (partial.parseError !== undefined) {
			if (partial.parseError) entry.parseError = partial.parseError;
			else delete entry.parseError;
		}
		this.#notify();
		if (this.#persistEnabled) {
			try {
				await dbPutStructure(entry);
				this.lastPersistError = null;
				delete entry.persistError;
			} catch (e) {
				const msg = e?.message ?? String(e);
				this.lastPersistError = msg;
				entry.persistError = msg;
				console.warn("[basi] IndexedDB patch failed:", e);
			}
		}
		return entry;
	}

	/**
	 * Move a structure into a category (or null = Uncategorized).
	 * @param {string} entryId
	 * @param {string|null} categoryId
	 */
	async setEntryCategory(entryId, categoryId) {
		return this.patch(entryId, { categoryId: categoryId ?? null });
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

	async clear() {
		this.#entries.clear();
		this.#categories.clear();
		this.#notify();
		if (this.#persistEnabled) {
			try {
				await dbClearAll();
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
		return all.filter(entry => {
			const catName = entry.categoryId
				? (this.#categories.get(entry.categoryId)?.name ?? "")
				: "uncategorized";
			const hay = [
				entry.name,
				entry.sourceName,
				entry.sourceKind,
				catName,
				entry.size.join("x"),
				String(entry.entityCount ?? 0),
				...entry.blockNames
			].join(" ").toLowerCase();
			return hay.includes(q);
		});
	}

	// ---- Categories ----

	/**
	 * User-defined categories in sort order (does not include Uncategorized).
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
	 * @param {string} name
	 * @returns {Promise<StructureCategory>}
	 */
	async addCategory(name) {
		const trimmed = String(name || "").trim() || "New category";
		const maxOrder = this.listCategories().reduce((m, c) => Math.max(m, c.sortOrder), -1);
		/** @type {StructureCategory} */
		const cat = {
			id: newId("cat"),
			name: trimmed,
			sortOrder: maxOrder + 1,
			collapsed: false
		};
		this.#categories.set(cat.id, cat);
		this.#notify();
		if (this.#persistEnabled) {
			try {
				await dbPutCategory(cat);
				this.lastPersistError = null;
			} catch (e) {
				const msg = e?.message ?? String(e);
				this.lastPersistError = msg;
				console.warn("[basi] category put failed:", e);
			}
		}
		return cat;
	}

	/**
	 * @param {string} id
	 * @param {string} name
	 */
	async renameCategory(id, name) {
		const cat = this.#categories.get(id);
		if (!cat) return null;
		const trimmed = String(name || "").trim();
		if (!trimmed) return cat;
		cat.name = trimmed;
		this.#notify();
		if (this.#persistEnabled) {
			try {
				await dbPutCategory(cat);
				this.lastPersistError = null;
			} catch (e) {
				const msg = e?.message ?? String(e);
				this.lastPersistError = msg;
				console.warn("[basi] category rename failed:", e);
			}
		}
		return cat;
	}

	/**
	 * Delete category; structures move to Uncategorized.
	 * @param {string} id
	 */
	async removeCategory(id) {
		if (!this.#categories.has(id)) return false;
		this.#categories.delete(id);
		const moved = [];
		for (const entry of this.#entries.values()) {
			if (entry.categoryId === id) {
				entry.categoryId = null;
				moved.push(entry);
			}
		}
		this.#notify();
		if (this.#persistEnabled) {
			try {
				await dbDeleteCategory(id);
				for (const entry of moved) {
					await dbPutStructure(entry);
				}
				this.lastPersistError = null;
			} catch (e) {
				const msg = e?.message ?? String(e);
				this.lastPersistError = msg;
				console.warn("[basi] category delete failed:", e);
				throw e;
			}
		}
		return true;
	}

	/**
	 * @param {string} id
	 * @param {boolean} collapsed
	 */
	async setCategoryCollapsed(id, collapsed) {
		const cat = this.#categories.get(id);
		if (!cat) return null;
		cat.collapsed = !!collapsed;
		this.#notify();
		if (this.#persistEnabled) {
			try {
				await dbPutCategory(cat);
				this.lastPersistError = null;
			} catch (e) {
				console.warn("[basi] category collapse failed:", e);
			}
		}
		return cat;
	}

	/**
	 * Move category up (-1) or down (+1) in order.
	 * @param {string} id
	 * @param {-1|1} direction
	 */
	async reorderCategory(id, direction) {
		const ordered = this.listCategories();
		const i = ordered.findIndex(c => c.id === id);
		if (i < 0) return false;
		const j = i + direction;
		if (j < 0 || j >= ordered.length) return false;
		const a = ordered[i];
		const b = ordered[j];
		const tmp = a.sortOrder;
		a.sortOrder = b.sortOrder;
		b.sortOrder = tmp;
		// If orders were equal, force sequential
		if (a.sortOrder === b.sortOrder) {
			ordered.forEach((c, idx) => {
				c.sortOrder = idx;
			});
		}
		this.#notify();
		if (this.#persistEnabled) {
			try {
				await dbPutCategories(this.listCategories());
				this.lastPersistError = null;
			} catch (e) {
				console.warn("[basi] category reorder failed:", e);
			}
		}
		return true;
	}

	/**
	 * Group search results by category for the list UI.
	 * Order: Uncategorized first, then user categories by sortOrder.
	 * @param {{ query?: string }} [opts]
	 * @returns {{ categoryId: string|null, name: string, collapsed: boolean, entries: StructureCatalogEntry[], isUncategorized: boolean }[]}
	 */
	listGrouped({ query = "" } = {}) {
		const items = this.search({ query });
		/** @type {Map<string|null, StructureCatalogEntry[]>} */
		const buckets = new Map();
		buckets.set(null, []);
		for (const c of this.listCategories()) {
			buckets.set(c.id, []);
		}
		for (const entry of items) {
			const cid =
				entry.categoryId && this.#categories.has(entry.categoryId)
					? entry.categoryId
					: null;
			const list = buckets.get(cid) ?? buckets.get(null);
			list.push(entry);
		}

		/** @type {{ categoryId: string|null, name: string, collapsed: boolean, entries: StructureCatalogEntry[], isUncategorized: boolean }[]} */
		const groups = [];
		// Uncategorized always first
		groups.push({
			categoryId: null,
			name: "Uncategorized",
			collapsed: false, // virtual group — collapse state in session UI only
			entries: buckets.get(null) ?? [],
			isUncategorized: true
		});
		for (const c of this.listCategories()) {
			groups.push({
				categoryId: c.id,
				name: c.name,
				collapsed: c.collapsed,
				entries: buckets.get(c.id) ?? [],
				isUncategorized: false
			});
		}
		return groups;
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
	 * Restore catalog from IndexedDB (includes file blobs + categories).
	 * @returns {Promise<number>} count of structures loaded
	 */
	async hydrateFromDb() {
		clearLegacyLocalStorageIndex();
		try {
			const [rows, cats] = await Promise.all([dbLoadAll(), dbLoadCategories()]);
			this.#categories.clear();
			for (const c of cats) {
				this.#categories.set(c.id, {
					id: c.id,
					name: c.name,
					sortOrder: c.sortOrder,
					collapsed: c.collapsed
				});
			}
			this.#entries.clear();
			for (const row of rows) {
				const categoryId =
					row.categoryId && this.#categories.has(row.categoryId)
						? row.categoryId
						: null;
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
					categoryId,
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
			this.#notify();
			return rows.length;
		} catch (e) {
			console.warn("[basi] IndexedDB hydrate failed:", e);
			return 0;
		}
	}

	/** Disable IDB writes (unit tests). */
	setPersistEnabled(enabled) {
		this.#persistEnabled = !!enabled;
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
