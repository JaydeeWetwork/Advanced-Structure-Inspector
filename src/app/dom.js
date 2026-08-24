/**
 * Status, formatting, float pins — shared DOM helpers.
 */

import { els } from "./state.js";

const PIN_LS_KEY = "basi.floatPins.v1";
const _floatFlashTimers = new Map();

/**
 * @param {string} message
 * @param {string} [kind]
 */
export function setStatus(message, kind = "") {
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
	apply(els?.statusBox);
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
		btn.setAttribute("aria-pressed", pinned ? "true" : "false");
		btn.title = pinned ? "Unpin menu (auto-hide when not hovered)" : "Pin menu open";
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
			if (!el.matches(":hover") && !el.contains(document.activeElement)) {
				el.classList.remove("basi-float-open");
			} else {
				const onLeave = () => {
					if (!el.classList.contains("basi-float-pinned")) {
						el.classList.remove("basi-float-open");
					}
					el.removeEventListener("pointerleave", onLeave);
				};
				el.addEventListener("pointerleave", onLeave, { once: true });
			}
			_floatFlashTimers.delete(floatId);
		}, ms)
	);
}
