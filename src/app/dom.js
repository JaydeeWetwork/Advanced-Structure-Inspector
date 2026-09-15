/**
 * Status, formatting, float pins — shared DOM helpers.
 */

import { els } from "./state.js";

const PIN_LS_KEY = "basi.floatPins.v3";
const _floatFlashTimers = new Map();

/**
 * @param {string} message
 * @param {string} [kind]
 * @param {{ catalog?: boolean }} [opts] catalog defaults true; false = toast only
 */
export function setStatus(message, kind = "", opts = {}) {
	const toast = document.getElementById("statusToast");
	const apply = el => {
		if (!el) return;
		if (!message) {
			el.classList.add("hidden");
			el.textContent = "";
			el.classList.remove("error", "ok", "warn");
			return;
		}
		el.classList.remove("hidden", "error", "ok", "warn");
		if (kind) el.classList.add(kind);
		el.textContent = message;
	};
	if (opts.catalog !== false) apply(els?.statusBox);
	apply(toast);
	if (message && toast) {
		clearTimeout(setStatus._toastTimer);
		setStatus._toastTimer = setTimeout(() => {
			if (toast.textContent === message) {
				toast.classList.add("hidden");
			}
		}, kind === "error" ? 8000 : 4500);
	}
}

/**
 * @param {any} size
 */
export function formatSize(size) {
	if (!size || !(Array.isArray(size) || ArrayBuffer.isView(size))) return "?";
	const a = [...size];
	return `${a[0]}×${a[1]}×${a[2]}`;
}

/**
 * @param {string} s
 */
export function escapeHtml(s) {
	return String(s)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");
}

/**
 * @param {string} label
 * @param {string|number} value
 */
export function stat(label, value) {
	return `<div class="basi-stat"><span class="label">${label}</span><span class="value">${escapeHtml(value)}</span></div>`;
}

/**
 * @returns {{ catalog: boolean, detail: boolean }}
 */
export function loadFloatPins() {
	try {
		const raw = localStorage.getItem(PIN_LS_KEY);
		if (!raw) return { catalog: false, detail: false };
		const o = JSON.parse(raw);
		return { catalog: !!o.catalog, detail: !!o.detail };
	} catch {
		return { catalog: false, detail: false };
	}
}

/**
 * @param {{ catalog: boolean, detail: boolean }} pins
 */
export function saveFloatPins(pins) {
	try {
		localStorage.setItem(PIN_LS_KEY, JSON.stringify(pins));
	} catch {
		/* ignore */
	}
}

/**
 * @param {HTMLElement|null} floatEl
 * @param {HTMLButtonElement|null} btn
 * @param {boolean} pinned
 */
export function applyFloatPin(floatEl, btn, pinned) {
	if (floatEl) floatEl.classList.toggle("basi-float-pinned", pinned);
	if (btn) {
		const isLeft = !!floatEl?.classList.contains("basi-float-left");
		btn.setAttribute("aria-pressed", pinned ? "true" : "false");
		btn.title = pinned ? "Unpin — hide until hover" : "Pin — keep open";
		btn.setAttribute("aria-label", btn.title);
		btn.textContent = pinned ? (isLeft ? "«" : "»") : (isLeft ? "»" : "«");
		btn.classList.toggle("is-pinned", pinned);
	}
}

export function initFloatPins() {
	const pins = loadFloatPins();
	applyFloatPin(els?.catalogFloat, els?.pinCatalogBtn, pins.catalog);
	applyFloatPin(els?.detailFloat, els?.pinDetailBtn, pins.detail);

	const toggle = which => {
		const cur = loadFloatPins();
		cur[which] = !cur[which];
		saveFloatPins(cur);
		if (which === "catalog") {
			applyFloatPin(els?.catalogFloat, els?.pinCatalogBtn, cur.catalog);
		} else {
			applyFloatPin(els?.detailFloat, els?.pinDetailBtn, cur.detail);
		}
	};

	els?.pinCatalogBtn?.addEventListener("click", e => {
		e.preventDefault();
		e.stopPropagation();
		toggle("catalog");
	});
	els?.pinDetailBtn?.addEventListener("click", e => {
		e.preventDefault();
		e.stopPropagation();
		toggle("detail");
	});

	// Wheel over docks must not zoom/orbit the canvas, even at scroll ends.
	const trapWheel = el => {
		el?.addEventListener("wheel", e => e.stopPropagation(), { passive: true });
	};
	trapWheel(els?.detailFloat);
	trapWheel(els?.catalogFloat);
}

/**
 * @param {HTMLElement|null|undefined} el
 * @returns {boolean}
 */
export function isFloatPinned(el) {
	return !!el?.classList.contains("basi-float-pinned");
}

/**
 * @param {HTMLElement|null|undefined} el
 */
export function openFloatDock(el) {
	if (!el) return;
	el.classList.remove("basi-float-tucked");
	el.classList.add("basi-float-open");
}

/**
 * Hide a dock even if it is pinned or held open by :hover / no-selection.
 * Pin preference stays; the next swipe-open clears the tuck.
 * @param {HTMLElement|null|undefined} el
 */
export function tuckFloatDock(el) {
	if (!el) return;
	el.classList.add("basi-float-tucked");
	el.classList.remove("basi-float-open");
}

/**
 * @param {HTMLElement|null|undefined} el
 * @param {{ force?: boolean }} [opts]
 */
export function closeFloatDock(el, opts = {}) {
	if (!el) return;
	if (!opts.force && el.classList.contains("basi-float-pinned")) return;
	el.classList.remove("basi-float-open");
}

/**
 * Tuck the right details dock unless pinned or the pointer is still over it.
 * On coarse-pointer (iPad), hover is meaningless — close unless pinned.
 * @param {{ force?: boolean }} [opts]
 */
export function closeDetailFloatIfIdle(opts = {}) {
	const el = els?.detailFloat;
	if (!el) return;
	if (el.classList.contains("basi-float-pinned")) return;
	const touch = document.body.classList.contains("basi-touch");
	if (!opts.force && !touch && el.matches(":hover")) return;
	el.classList.remove("basi-float-open");
}

/**
 * @param {string} floatId
 * @param {number} [ms]
 */
export function flashFloatDock(floatId, ms = 1500) {
	const el = document.getElementById(floatId);
	if (!el) return;
	if (el.classList.contains("basi-float-pinned")) return;
	el.classList.add("basi-float-open");
	if (document.body.classList.contains("basi-touch")) {
		// Stay open until swipe-away or canvas tap; hover cannot hold it.
		return;
	}
	const prev = _floatFlashTimers.get(floatId);
	if (prev) clearTimeout(prev);
	_floatFlashTimers.set(
		floatId,
		setTimeout(() => {
			if (el.classList.contains("basi-float-pinned")) {
				el.classList.remove("basi-float-open");
				_floatFlashTimers.delete(floatId);
				return;
			}
			if (el.matches(":hover")) {
				el.addEventListener("pointerleave", () => closeDetailFloatIfIdle(), { once: true });
			} else {
				closeDetailFloatIfIdle();
			}
			_floatFlashTimers.delete(floatId);
		}, ms)
	);
}
