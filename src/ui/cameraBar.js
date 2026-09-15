/**
 * Camera bar, default-cam UI, layer badge, preset apply.
 */

import { catalog, els, getSelectedId, primaryPreview, session } from "../app/state.js";
import {
	isIsoPreset,
	normalizeCameraPreset,
	normalizeCameraZoom
} from "../viewer/systems/isoCamera.js";
import { deselectInspectAndRefresh } from "./inspectChrome.js";

export const ISO_PRESETS = /** @type {const} */ (["iso-north", "iso-south", "iso-east", "iso-west"]);
export const ISO_LABELS = {
	"iso-north": "Iso N",
	"iso-south": "Iso S",
	"iso-east": "Iso E",
	"iso-west": "Iso W",
	iso: "Iso N"
};

/**
 * @param {number} index
 * @param {number} count
 * @param {number} deltaY
 */
export function stepSelectIndex(index, count, deltaY) {
	const dir = deltaY > 0 ? 1 : deltaY < 0 ? -1 : 0;
	if (!dir || count <= 0) return index;
	return Math.max(0, Math.min(count - 1, index + dir));
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @param {number} step
 * @param {number} deltaY
 */
export function stepRangeValue(value, min, max, step, deltaY) {
	const dir = deltaY < 0 ? 1 : deltaY > 0 ? -1 : 0;
	if (!dir) return value;
	const next = value + dir * step;
	return Math.max(min, Math.min(max, next));
}

/**
 * @param {{ defaultCameraPreset?: string, defaultCameraZoom?: number }|null|undefined} entry
 */
export function syncDefaultCamUi(entry) {
	if (els.defaultCamSelect) {
		els.defaultCamSelect.value = normalizeCameraPreset(entry?.defaultCameraPreset);
	}
	const z = normalizeCameraZoom(entry?.defaultCameraZoom);
	const pct = String(Math.round(z * 100));
	if (els.defaultZoom) els.defaultZoom.value = pct;
	if (els.defaultZoomVal) els.defaultZoomVal.textContent = `${pct}%`;
}

/**
 * @param {string} current
 * @returns {string}
 */
export function nextIsoPreset(current) {
	const cur = normalizeCameraPreset(current);
	const i = ISO_PRESETS.indexOf(/** @type {any} */ (cur));
	if (i < 0) return ISO_PRESETS[0];
	return ISO_PRESETS[(i + 1) % ISO_PRESETS.length];
}

/**
 * @param {number|null|undefined} layer
 * @param {number} [maxLayer]
 */
export function updateLayerBadge(layer, maxLayer) {
	if (!els.layerBadge) return;
	if (layer == null || !Number.isFinite(layer)) {
		els.layerBadge.classList.add("hidden");
		els.layerBadge.textContent = "";
		return;
	}
	const max = maxLayer ?? primaryPreview()?.getMaxLayer?.() ?? "?";
	els.layerBadge.classList.remove("hidden");
	els.layerBadge.textContent = `Layer ${layer} / ${max}`;
	els.layerBadge.title = `Active slice Y=${layer}`;
}

export function syncLayerUiFromPreview() {
	const p = primaryPreview();
	if (!p?.getSelectedLayer) {
		updateLayerBadge(null);
		return;
	}
	updateLayerBadge(p.getSelectedLayer(), p.getMaxLayer?.());
}

/** @param {string|null|undefined} id */
export function isNsewPreset(id) {
	return id === "north" || id === "south" || id === "east" || id === "west";
}

/**
 * @param {string} [preset]
 */
export function syncCamBarActive(preset) {
	const p = primaryPreview();
	const id = normalizeCameraPreset(preset || p?.getCameraPreset?.() || "iso-north");
	document.querySelectorAll("#camBar [data-cam]").forEach(btn => {
		const cam = btn.getAttribute("data-cam") || "";
		const active =
			cam === id
			|| (cam === "iso" && isIsoPreset(id));
		btn.classList.toggle("active", active);
	});
	if (els.camIsoBtn) {
		const isoId = isIsoPreset(id) ? (id === "iso" ? "iso-north" : id) : null;
		els.camIsoBtn.textContent = isoId ? (ISO_LABELS[isoId] || "Iso") : "Iso N";
		els.camIsoBtn.title = isoId
			? `Isometric 3/4 ${isoId.replace("iso-", "").toUpperCase()} (ortho) — click to cycle N→S→E→W`
			: "Cycle isometric 3/4 N → S → E → W (orthographic)";
	}
	const inLayer = p?.getSelectedLayer?.() != null && Number.isFinite(p.getSelectedLayer());
	const showTilt = inLayer && isNsewPreset(id);
	const tiltWrap = document.querySelector(".basi-cam-tilt");
	if (tiltWrap) {
		tiltWrap.classList.toggle("hidden", !showTilt);
	}
	const camTilt = /** @type {HTMLInputElement|null} */ (document.getElementById("camTilt"));
	const camTiltVal = document.getElementById("camTiltVal");
	const tilt = p?.getCameraTilt?.();
	if (camTilt && tilt != null && Number.isFinite(tilt)) {
		camTilt.value = String(Math.round(tilt));
		if (camTiltVal) camTiltVal.textContent = `${Math.round(tilt)}°`;
	}
}

/**
 * @param {string} preset
 * @param {{ cycleIso?: boolean }} [opts]
 */
export function applyCameraPreset(preset, opts = {}) {
	const p = primaryPreview();
	if (!p?.setCameraPreset) {
		console.warn("[basi] applyCameraPreset: no active preview");
		return false;
	}
	let next = preset;
	if (opts.cycleIso || preset === "iso") {
		const cur = p.getCameraPreset?.() || "iso-north";
		next = isIsoPreset(cur) ? nextIsoPreset(cur) : "iso-north";
	}
	next = normalizeCameraPreset(next);
	const inLayer = p.getSelectedLayer?.() != null && Number.isFinite(p.getSelectedLayer());
	if (inLayer && isNsewPreset(next)) {
		const t = p.getCameraTilt?.();
		if (t == null || !Number.isFinite(t)) {
			p.setCameraTilt?.(67, { reframe: false });
		}
	}
	const tiltEl = /** @type {HTMLInputElement|null} */ (document.getElementById("camTilt"));
	if (tiltEl && p.setCameraTilt && isNsewPreset(next)) {
		p.setCameraTilt(+tiltEl.value, { reframe: false });
	}
	try {
		p.setCameraPreset(next);
	} catch (err) {
		console.error("[basi] setCameraPreset failed", next, err);
		return false;
	}
	syncCamBarActive(next);
	p.requestRedraw?.();
	return true;
}

/**
 * @param {1|-1|"all"} delta
 * @returns {boolean}
 */
export function applyLayerStep(delta) {
	if (!session.hasActive) return false;
	if (els.detailPanel?.classList.contains("hidden")) return false;
	const p = primaryPreview();
	if (!p) return false;
	if (delta === "all") {
		p.showAllLayers?.();
		updateLayerBadge(null);
	} else {
		const layer = p.stepLayer?.(delta);
		updateLayerBadge(layer, p.getMaxLayer?.());
	}
	syncCamBarActive(p.getCameraPreset?.());
	p.requestRedraw?.();
	deselectInspectAndRefresh();
	return true;
}

/**
 * @returns {boolean}
 */
export function restoreDefaultCamera() {
	if (!session.hasActive) return false;
	if (els.detailPanel?.classList.contains("hidden")) return false;
	const p = primaryPreview();
	if (!p) return false;
	p.showAllLayers?.();
	updateLayerBadge(null);
	const entry = getSelectedId() ? catalog.get(getSelectedId()) : null;
	const preset = normalizeCameraPreset(entry?.defaultCameraPreset);
	const zoom = normalizeCameraZoom(entry?.defaultCameraZoom);
	p.setCameraZoom?.(zoom, { reframe: false });
	applyCameraPreset(preset);
	deselectInspectAndRefresh();
	return true;
}

/**
 * @param {boolean} [force]
 */
export function toggleCamDock(force) {
	const dock = document.getElementById("camDock");
	if (!dock) return false;
	const on = force == null ? !dock.classList.contains("basi-cam-open") : !!force;
	dock.classList.toggle("basi-cam-open", on);
	dock.setAttribute("aria-expanded", on ? "true" : "false");
	return on;
}
