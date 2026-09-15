/**
 * Preview host placeholder + keyboard shortcuts.
 */

import { els, primaryPreview, session } from "../app/state.js";
import { updatePreviewLoading } from "./previewLoading.js";
import { clearInspectPanel } from "./inspectChrome.js";
import {
	applyCameraPreset,
	applyLayerStep,
	toggleCamDock,
	updateLayerBadge
} from "./cameraBar.js";

export function isTypingTarget(el) {
	if (!el || !(el instanceof Element)) return false;
	const tag = el.tagName;
	if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
	if (/** @type {HTMLElement} */ (el).isContentEditable) return true;
	return false;
}

/**
 * @param {string} msg
 * @param {{ force?: boolean, error?: boolean }} [opts]
 */
export function showPreviewPlaceholder(msg, opts = {}) {
	if (!els.previewHost) return;

	const host = els.previewHost;
	const locked = host.dataset.basiPreviewBuilding === "1";
	const hasLive =
		!!host.querySelector("canvas")
		|| !!host.querySelector(".previewCont");

	if (!opts.force && (locked || hasLive)) {
		console.warn(
			"[basi] showPreviewPlaceholder refused to clear host "
			+ `(building=${locked}, live=${hasLive}): "${msg}". `
			+ "Use force:true only when intentionally replacing a preview."
		);
		updatePreviewLoading(host, { msg });
		return;
	}

	host.replaceChildren();
	updatePreviewLoading(host, {
		msg,
		fraction: opts.error ? 0 : 0.04,
		error: !!opts.error
	});
	clearInspectPanel();
	updateLayerBadge(null);
}

/**
 * @param {KeyboardEvent} e
 */
export function onPreviewKeydown(e) {
	if (isTypingTarget(e.target)) return;
	if (!session.hasActive) return;
	if (els.detailPanel?.classList.contains("hidden")) return;

	const p = primaryPreview();
	if (!p) return;

	if (e.key === "ArrowUp") {
		e.preventDefault();
		applyLayerStep(1);
		return;
	}
	if (e.key === "ArrowDown") {
		e.preventDefault();
		applyLayerStep(-1);
		return;
	}
	if (e.key === "ArrowLeft") {
		e.preventDefault();
		applyLayerStep("all");
		return;
	}
	if (e.key === "ArrowRight") {
		e.preventDefault();
		const preset = p.getCameraPreset?.() || "iso";
		if (preset === "free") {
			applyCameraPreset(p.getSelectedLayer?.() != null ? "north" : "iso");
		} else {
			applyCameraPreset(preset);
		}
		return;
	}
	if ((e.key === "c" || e.key === "C") && !e.ctrlKey && !e.metaKey && !e.altKey) {
		e.preventDefault();
		toggleCamDock();
		return;
	}
	if (p.isFlyMode || p.getCameraPreset?.() === "fly") {
		const flyCode = e.code === "KeyW" || e.code === "KeyA" || e.code === "KeyS" || e.code === "KeyD"
			|| e.code === "Space"
			|| e.code === "ShiftLeft" || e.code === "ShiftRight";
		if (flyCode) return;
	}
	const camKeys = {
		"1": "iso",
		"2": "north",
		"3": "south",
		"4": "east",
		"5": "west",
		"6": "top",
		"7": "free",
		"8": "fly"
	};
	if (camKeys[e.key] && p.setCameraPreset) {
		e.preventDefault();
		applyCameraPreset(camKeys[e.key], { cycleIso: camKeys[e.key] === "iso" });
		return;
	}
	if (e.key === "Escape") {
		clearInspectPanel();
		p.requestRedraw?.();
		const dock = document.getElementById("camDock");
		if (dock?.classList.contains("basi-cam-open")) toggleCamDock(false);
	}
}
