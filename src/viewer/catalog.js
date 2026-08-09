/**
 * In-memory structure catalog for the structure database viewer.
 * Persistence (IndexedDB / OPFS) is intentionally stubbed for the scaffold.
 */

/**
 * @typedef {object} StructureCatalogEntry
 * @property {string} id
 * @property {string} name
 * @property {string} sourceName
 * @property {"mcstructure"|"mcworld"|"mcpack"|"zip"|"mctemplate"|"unknown"} sourceKind
 * @property {[number, number, number]} size
 * @property {[number, number, number]|null} worldOrigin
 * @property {number} paletteSize
 * @property {number} blockCount
 * @property {string[]} blockNames
 * @property {number} addedAt
 * @property {File} file
 */

/**
 * @typedef {object} StructureCatalogIndex
 * @property {string} id
 * @property {string} name
 * @property {string} sourceName
 * @property {string} sourceKind
 * @property {[number, number, number]} size
 * @property {[number, number, number]|null} worldOrigin
 * @property {number} paletteSize
 * @property {number} blockCount
 * @property {string[]} blockNames
 * @property {number} addedAt
 */

const STORAGE_KEY = "structure-db-viewer.catalog-index.v1";

export default class StructureCatalog {
	/** @type {Map<string, StructureCatalogEntry>} */
	#entries = new Map();
	/** @type {Set<() => void>} */
	#listeners = new Set();

	/**
	 * @param {Omit<StructureCatalogEntry, "id"|"addedAt"> & { id?: string, addedAt?: number }} partial
	 * @returns {StructureCatalogEntry}
	 */
	add(partial) {
		const id = partial.id ?? crypto.randomUUID();
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
			addedAt: partial.addedAt ?? Date.now(),
			file: partial.file
		};
		this.#entries.set(id, entry);
		this.#persistIndex();
		this.#notify();
		return entry;
	}

	/**
	 * @param {StructureCatalogEntry[]} entries
	 */
	addMany(entries) {
		for (const entry of entries) {
			this.#entries.set(entry.id, entry);
		}
		this.#persistIndex();
		this.#notify();
	}

	/**
	 * @param {string} id
	 * @returns {boolean}
	 */
	remove(id) {
		const ok = this.#entries.delete(id);
		if (ok) {
			this.#persistIndex();
			this.#notify();
		}
		return ok;
	}

	clear() {
		this.#entries.clear();
		this.#persistIndex();
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
		return all.filter(entry => {
			const hay = [
				entry.name,
				entry.sourceName,
				entry.sourceKind,
				entry.size.join("x"),
				...entry.blockNames
			].join(" ").toLowerCase();
			return hay.includes(q);
		});
	}

	/**
	 * @param {() => void} listener
	 * @returns {() => void} unsubscribe
	 */
	subscribe(listener) {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	}

	/**
	 * Index-only snapshot for localStorage (File handles are session-only).
	 * @returns {StructureCatalogIndex[]}
	 */
	toIndex() {
		return this.list().map(({ file: _file, ...rest }) => rest);
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

	#persistIndex() {
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(this.toIndex()));
		} catch (e) {
			// Quota / private mode — catalog still works in-memory
			console.warn("Could not persist catalog index:", e);
		}
	}

	/**
	 * Load metadata index from localStorage (files must be re-imported).
	 * @returns {StructureCatalogIndex[]}
	 */
	static loadPersistedIndex() {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (!raw) return [];
			const parsed = JSON.parse(raw);
			return Array.isArray(parsed) ? parsed : [];
		} catch {
			return [];
		}
	}
}
