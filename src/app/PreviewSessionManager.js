/**
 * Park / restore / LRU WebGL preview sessions by catalog entry id.
 * Keeps concurrent WebGL contexts under browser limits.
 */

import { clearFileBuildCache, clearAllPreviewCaches } from "../viewer/api/build.js";
import { resetItemIconCache } from "../viewer/api/icons.js";

export default class PreviewSessionManager {
	/**
	 * @param {object} [opts]
	 * @param {number} [opts.maxParked=2]
	 * @param {() => HTMLElement|null} [opts.getPreviewHost]
	 * @param {(msg: string, kind?: string) => void} [opts.log]
	 */
	constructor(opts = {}) {
		/** @type {Map<string, { wrap: HTMLElement, previews: any[] }>} */
		this.cache = new Map();
		/** @type {string[]} */
		this.parkOrder = [];
		this.maxParked = opts.maxParked ?? 2;
		this.getPreviewHost = opts.getPreviewHost ?? (() => null);
		this.log = opts.log ?? ((m) => console.info(m));
		/** @type {any[]} */
		this.activePreviews = [];
		/** @type {AbortController|null} */
		this.previewAbort = null;
		/** @type {HTMLElement|null} */
		this.#stash = null;
		/** Currently selected entry — never LRU-evict this park slot first. */
		this.selectedId = null;
	}

	/** @type {HTMLElement|null} */
	#stash;

	ensureStash() {
		if (this.#stash) return this.#stash;
		this.#stash = document.createElement("div");
		this.#stash.id = "sdbPreviewStash";
		this.#stash.hidden = true;
		this.#stash.setAttribute("aria-hidden", "true");
		document.body.appendChild(this.#stash);
		return this.#stash;
	}

	/** @returns {any|null} */
	primary() {
		return this.activePreviews[0] ?? null;
	}

	/** @deprecated use primary() */
	primaryPreview() {
		return this.primary();
	}

	/** @returns {number} */
	get activeCount() {
		return this.activePreviews.length;
	}

	/** @returns {boolean} */
	get hasActive() {
		return this.activePreviews.length > 0;
	}

	/**
	 * Replace the active preview list (sole owner — no external alias).
	 * @param {any[]} previews
	 */
	setActive(previews) {
		this.activePreviews = Array.isArray(previews) ? previews : [];
	}

	/** Clear active without dispose (host DOM already empty / transferred). */
	clearActive() {
		this.activePreviews = [];
	}

	disposeActive() {
		for (const p of this.activePreviews) {
			try {
				p.dispose?.();
			} catch (e) {
				console.warn("[sdb] preview dispose:", e);
			}
		}
		this.activePreviews = [];
	}

	/** Abort in-flight preview build (does not dispose parked). */
	cancelWork() {
		if (this.previewAbort) {
			this.previewAbort.abort();
			this.previewAbort = null;
		}
	}

	/** @param {string} entryId */
	touchParkOrder(entryId) {
		const i = this.parkOrder.indexOf(entryId);
		if (i >= 0) this.parkOrder.splice(i, 1);
		this.parkOrder.push(entryId);
	}

	evictIfNeeded() {
		while (this.cache.size > this.maxParked && this.parkOrder.length) {
			const oldest = this.parkOrder.shift();
			if (!oldest || !this.cache.has(oldest)) continue;
			if (oldest === this.selectedId) {
				this.parkOrder.push(oldest);
				if (this.cache.size <= this.maxParked + 1) break;
				continue;
			}
			this.log(`[sdb] LRU evict parked preview ${oldest}`);
			this.disposeParked(oldest);
		}
	}

	/**
	 * Park current preview DOM for entryId (do not dispose — for fast reselect).
	 * @param {string|null} entryId
	 */
	parkCurrent(entryId) {
		this.cancelWork();
		const host = this.getPreviewHost();
		if (!entryId || !host) {
			this.activePreviews = [];
			return;
		}
		let cont =
			host.querySelector(".previewCont")
			|| (host.firstElementChild?.classList?.contains("previewCont")
				? host.firstElementChild
				: null);
		const allConts = [...host.querySelectorAll(".previewCont")];
		if (allConts.length > 1) {
			console.warn(`[sdb] park: found ${allConts.length} previewCont — keeping one`);
			cont = allConts[allConts.length - 1];
			for (const c of allConts) {
				if (c !== cont) c.remove();
			}
		}
		if (!cont || !this.activePreviews.length) {
			this.activePreviews = [];
			return;
		}
		const stash = this.ensureStash();
		const prev = this.cache.get(entryId);
		if (prev && prev.previews !== this.activePreviews) {
			for (const p of prev.previews) {
				try {
					p.dispose?.();
				} catch {
					/* ignore */
				}
			}
			prev.wrap?.remove?.();
		} else if (prev) {
			if (prev.wrap && prev.wrap !== cont) prev.wrap.remove();
		}
		const holder = document.createElement("div");
		holder.className = "sdb-preview-cached";
		holder.dataset.entryId = entryId;
		holder.hidden = true;
		holder.appendChild(cont);
		stash.appendChild(holder);
		this.cache.set(entryId, {
			wrap: holder,
			previews: this.activePreviews
		});
		this.touchParkOrder(entryId);
		this.activePreviews = [];
		host.replaceChildren();
		this.evictIfNeeded();
		this.log(`[sdb] parked preview for ${entryId} (cache size ${this.cache.size})`);
	}

	/**
	 * @param {string} entryId
	 * @param {File} [file] optional File to drop CPU build cache
	 */
	disposeParked(entryId, file) {
		const cached = this.cache.get(entryId);
		if (!cached) return;
		for (const p of cached.previews) {
			try {
				p.dispose?.();
			} catch (e) {
				console.warn("[sdb] parked preview dispose:", e);
			}
		}
		cached.wrap?.remove?.();
		this.cache.delete(entryId);
		const i = this.parkOrder.indexOf(entryId);
		if (i >= 0) this.parkOrder.splice(i, 1);
		if (file) {
			try {
				clearFileBuildCache(file);
			} catch {
				/* ignore */
			}
		}
	}

	disposeAllParked() {
		for (const id of [...this.cache.keys()]) {
			this.disposeParked(id);
		}
		this.parkOrder.length = 0;
	}

	/**
	 * @param {string} entryId
	 * @returns {boolean}
	 */
	restore(entryId) {
		const host = this.getPreviewHost();
		const cached = this.cache.get(entryId);
		if (!cached || !host) return false;
		const cont =
			cached.wrap.querySelector(".previewCont") || cached.wrap.firstElementChild;
		if (!cont) {
			this.disposeParked(entryId);
			return false;
		}
		host.replaceChildren();
		host.appendChild(cont);
		// Ensure a single lil-gui inside this cont
		const guis = cont.querySelectorAll("lil-gui");
		if (guis.length > 1) {
			for (let i = 1; i < guis.length; i++) {
				try {
					guis[i].destroyGui?.();
				} catch {
					/* ignore */
				}
				guis[i].remove();
			}
		}
		cached.wrap?.remove?.();
		this.activePreviews = cached.previews;
		this.cache.delete(entryId);
		const oi = this.parkOrder.indexOf(entryId);
		if (oi >= 0) this.parkOrder.splice(oi, 1);
		// Kick redraw on restored WebGL
		for (const p of this.activePreviews) {
			try {
				if (typeof p.requestRedraw === "function") p.requestRedraw();
			} catch {
				/* ignore */
			}
		}
		this.log(`[sdb] restored parked preview ${entryId}`);
		return true;
	}

	/**
	 * Full clear: active + parked + CPU caches + item icon blobs.
	 * @param {{ resetIcons?: boolean }} [opts]
	 */
	clearEverything(opts = {}) {
		this.cancelWork();
		this.disposeActive();
		this.disposeAllParked();
		try {
			clearAllPreviewCaches();
		} catch {
			/* ignore */
		}
		if (opts.resetIcons !== false) {
			try {
				resetItemIconCache();
			} catch {
				/* ignore */
			}
		}
	}

	/**
	 * Start a new abortable preview job.
	 * @returns {AbortSignal}
	 */
	beginPreviewJob() {
		this.cancelWork();
		this.previewAbort = new AbortController();
		return this.previewAbort.signal;
	}

	/** Mark preview job finished without aborting. */
	endPreviewJob() {
		this.previewAbort = null;
	}
}
