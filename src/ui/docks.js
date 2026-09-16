/**
 * Dock visibility: peek | open. Pin keeps the dock open (peek is a no-op).
 */

import { els } from "../app/state.js";
import { prefersFineHover } from "./pointerMode.js";

const PIN_LS_KEY = "basi.floatPins.v3";
const _floatFlashTimers = new Map();

/**
 * @param {HTMLElement|null|undefined} el
 * @returns {"open"|"peek"}
 */
export function getDockVisibility(el) {
	return el?.getAttribute("data-visibility") === "open" ? "open" : "peek";
}

/**
 * @param {HTMLElement|null|undefined} el
 * @param {"open"|"peek"} vis
 */
export function setDockVisibility(el, vis) {
	if (!el) return;
	el.setAttribute("data-visibility", vis === "open" ? "open" : "peek");
}

/**
 * @param {HTMLElement|null|undefined} el
 */
export function openFloatDock(el) {
	setDockVisibility(el, "open");
}

/**
 * @param {HTMLElement|null|undefined} el
 */
export function peekFloatDock(el) {
	if (!el) return;
	if (isFloatPinned(el)) return;
	setDockVisibility(el, "peek");
}

/**
 * @param {HTMLElement|null|undefined} el
 * @returns {boolean}
 */
export function isFloatShowing(el) {
	return getDockVisibility(el) === "open";
}

/**
 * @param {HTMLElement|null|undefined} el
 * @returns {boolean}
 */
export function isFloatPinned(el) {
	return !!el?.classList.contains("basi-float-pinned");
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
	if (floatEl) {
		floatEl.classList.toggle("basi-float-pinned", pinned);
		if (pinned) openFloatDock(floatEl);
		else peekFloatDock(floatEl);
	}
	if (btn) {
		const isLeft = !!floatEl?.classList.contains("basi-float-left");
		btn.setAttribute("aria-pressed", pinned ? "true" : "false");
		btn.title = pinned ? "Unpin this dock" : "Pin this dock";
		btn.setAttribute("aria-label", btn.title);
		btn.textContent = pinned ? (isLeft ? "«" : "»") : (isLeft ? "»" : "«");
		btn.classList.toggle("is-pinned", pinned);
	}
}

export function initFloatPins() {
	const pins = loadFloatPins();
	applyFloatPin(els?.catalogFloat, els?.pinCatalogBtn, pins.catalog);
	applyFloatPin(els?.detailFloat, els?.pinDetailBtn, pins.detail);
	if (!pins.catalog) peekFloatDock(els?.catalogFloat);
	if (!pins.detail) peekFloatDock(els?.detailFloat);

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

	const trapWheel = el => {
		el?.addEventListener("wheel", e => e.stopPropagation(), { passive: true });
	};
	trapWheel(els?.detailFloat);
	trapWheel(els?.catalogFloat);
}

/**
 * @param {{ force?: boolean }} [opts]
 */
export function closeDetailFloatIfIdle(opts = {}) {
	const el = els?.detailFloat;
	if (!el) return;
	if (isFloatPinned(el)) return;
	if (!opts.force && prefersFineHover() && el.matches(":hover")) return;
	peekFloatDock(el);
}

/**
 * @param {string} floatId
 * @param {number} [ms]
 */
export function flashFloatDock(floatId, ms = 1500) {
	const el = document.getElementById(floatId);
	if (!el) return;
	openFloatDock(el);
	if (isFloatPinned(el) || !prefersFineHover()) return;
	const prev = _floatFlashTimers.get(floatId);
	if (prev) clearTimeout(prev);
	_floatFlashTimers.set(
		floatId,
		setTimeout(() => {
			if (isFloatPinned(el)) {
				_floatFlashTimers.delete(floatId);
				return;
			}
			if (el.matches(":hover")) {
				el.addEventListener("pointerleave", () => peekFloatDock(el), { once: true });
			} else {
				peekFloatDock(el);
			}
			_floatFlashTimers.delete(floatId);
		}, ms)
	);
}
