/**
 * Status, formatting, float pins — shared DOM helpers.
 */

import { els } from "./state.js";

export {
	applyFloatPin,
	closeDetailFloatIfIdle,
	closeFloatDock,
	flashFloatDock,
	initFloatPins,
	isFloatPinned,
	isFloatShowing,
	loadFloatPins,
	openFloatDock,
	peekFloatDock,
	saveFloatPins,
	setDockVisibility
} from "../ui/docks.js";

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
