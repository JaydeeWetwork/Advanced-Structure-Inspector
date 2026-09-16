/**
 * Selection + preview lifecycle (park/load/remove).
 */

import { isAbortError, clearFileBuildCache } from "../viewer/api/build.js";
import {
	catalog,
	els,
	getSelectedId,
	setSelectedId,
	session,
	primaryPreview
} from "./state.js";
import { setStatus, formatSize, stat } from "./dom.js";
import { flashFloatDock, closeDetailFloatIfIdle, openFloatDock, peekFloatDock, isFloatPinned } from "../ui/docks.js";
import { renderList } from "../ui/catalogList.js";
import { normalizeCameraPreset, normalizeCameraZoom } from "../viewer/cameraPrefs.js";
import { clearInspectPanel } from "../ui/inspectChrome.js";
import {
	syncLayerUiFromPreview,
	syncCamBarActive,
	updateLayerBadge,
	syncDefaultCamUi
} from "../ui/cameraBar.js";
import { showPreviewPlaceholder } from "../ui/previewChrome.js";
import { updatePreviewLoading, removePreviewLoading } from "../ui/previewLoading.js";
import {
	updateSelectionHeader,
	syncMetaFields,
	renderMaterialList,
	renderUserDetails,
	syncDetailCollapsibles,
	renderHopperChip,
	ensureHopperStats
} from "../ui/detailPanel.js";

function disposeParkedPreview(entryId) {
	const entry = catalog.get(entryId);
	session.disposeParked(entryId, entry?.file);
}

function restoreParkedPreview(entryId) {
	return session.restore(entryId);
}

export function parkCurrentPreview(entryId) {
	session.selectedId = getSelectedId();
	session.parkCurrent(entryId);
}

export function selectEntry(id, opts = {}) {
	// Park previous selection's preview (keep GPU meshes for fast return)
	if (getSelectedId() && getSelectedId() !== id) {
		parkCurrentPreview(getSelectedId());
	}

	setSelectedId(id);
	renderList();
	const entry = id ? catalog.get(id) : null;
	clearInspectPanel();

	// Body classes drive floating dock visibility (left open when empty)
	document.body.classList.toggle("basi-has-selection", !!entry);
	document.body.classList.toggle("basi-no-selection", !entry);

	if (!entry) {
		els.emptyState?.classList.remove("hidden");
		els.detailPanel?.classList.add("hidden");
		closeDetailFloatIfIdle({ force: true });
		openFloatDock(els.catalogFloat);
		updateSelectionHeader(null);
		syncMetaFields(null);
		if (els.previewHost) {
			els.previewHost.replaceChildren();
		}
		session.clearActive();
		if (els.previewBtn) els.previewBtn.disabled = true;
		return;
	}

	els.emptyState?.classList.add("hidden");
	els.detailPanel?.classList.remove("hidden");
	if (!isFloatPinned(els.catalogFloat)) {
		peekFloatDock(els.catalogFloat);
		const ae = document.activeElement;
		if (ae instanceof HTMLElement && els.catalogFloat?.contains(ae)) ae.blur();
	}
	updateSelectionHeader(entry);
	// Briefly reveal the right dock so users notice stats/materials
	flashFloatDock("detailFloat", 1600);
	// Older IndexedDB entries may lack hopperStats — light scan once, then persist
	if (entry.hopperStats == null && entry.file && !entry._hopperLoadAttempted) {
		entry._hopperLoadAttempted = true;
		void ensureHopperStats(entry).then(async stats => {
			if (stats == null) return;
			entry.hopperStats = stats;
			try {
				await catalog.patch(entry.id, { hopperStats: stats });
			} catch {
				/* persist optional */
			}
			if (getSelectedId() === entry.id) {
				renderHopperChip(stats);
			}
		});
	}

	syncDefaultCamUi(entry);
	syncMetaFields(entry);

	if (els.detailStats) {
		els.detailStats.innerHTML = [
			stat("Size", formatSize(entry.size)),
			stat("Blocks", Number(entry.blockCount || 0).toLocaleString()),
			stat("Entities", String(entry.entityCount ?? 0))
		].join("");
	}

	renderUserDetails(entry);
	renderMaterialList(entry);
	syncDetailCollapsibles();

	if (els.previewBtn) els.previewBtn.disabled = false;

	// Auto-load or restore preview
	if (opts.forceReloadPreview) {
		disposeParkedPreview(entry.id);
		void loadPreview({ force: true });
	} else if (restoreParkedPreview(entry.id)) {
		setStatus(`Preview restored for “${entry.name}” (cached).`, "ok", { catalog: false });
		syncLayerUiFromPreview();
		syncCamBarActive();
	} else {
		void loadPreview();
	}
}


export async function loadPreview(opts = {}) {
	const entryId = getSelectedId();
	const entry = entryId ? catalog.get(entryId) : null;
	if (!entry?.file) return;

	// Fast path: already showing this entry
	if (!opts.force && session.hasActive && entryId === getSelectedId()) {
		const hostHasCanvas = els.previewHost?.querySelector("canvas");
		if (hostHasCanvas) return;
	}

	if (opts.force) {
		disposeParkedPreview(entryId);
		session.disposeActive();
	}

	const signal = session.beginPreviewJob();
	const buildForId = entryId;

	if (els.previewBtn) els.previewBtn.disabled = true;
	// Drop any leftover conts/guis before building (force: intentional start of a new load)
	showPreviewPlaceholder("Building geometry & textures…", { force: true });
	setStatus(`Loading “${entry.name}”…`, "", { catalog: false });

	const host = els.previewHost;
	if (host) host.dataset.basiPreviewBuilding = "1";

	try {
		const { renderStructurePreview } = await import("../viewer/structurePreview.js");
		const { default: ResourcePackStack } = await import("../ResourcePackStack.js");
		if (signal.aborted || getSelectedId() !== buildForId) return;

		const previewCont = document.createElement("div");
		previewCont.className = "previewCont";
		host?.replaceChildren(previewCont);
		updatePreviewLoading(host, {
			msg: "Building geometry & textures…",
			fraction: 0.05
		});

		clearInspectPanel();
		updateLayerBadge(null);

		const previews = await renderStructurePreview(
			entry.file,
			previewCont,
			{
				PACK_NAME: entry.name,
				SHOW_PREVIEW_SKYBOX: false,
				SHOW_PREVIEW_WIDGETS: false
			},
			new ResourcePackStack(),
			{
				signal,
				onProgress: (msg, fraction) => {
					if (signal.aborted || getSelectedId() !== buildForId) return;
					setStatus(msg, "", { catalog: false });
					updatePreviewLoading(host, { msg, fraction });
				}
			}
		);

		if (signal.aborted || getSelectedId() !== buildForId) {
			previews.forEach(p => p.dispose?.());
			return;
		}
		session.setActive(previews);
		session.endPreviewJob();
		updatePreviewLoading(host, { msg: "Ready", fraction: 1 });
		removePreviewLoading(host);
		// Sanity: canvas must still be in the host (silent blank if something wiped it)
		const canvasInHost = host?.querySelector("canvas");
		if (!canvasInHost) {
			console.error(
				"[basi] Preview finished but no canvas in #previewHost — "
				+ "DOM was cleared mid-build (would show as a blank preview with no earlier error)."
			);
			setStatus("Preview built but view was cleared — try loading again.", "error");
		}
		// Init already built all layers — only fit/redraw (no full mesh rebuild)
		for (const pr of previews) {
			pr.requestRedraw?.();
		}
		updateLayerBadge(null);
		// Next frame: host has layout size + correct aspect; apply structure default cam
		requestAnimationFrame(() => {
			const tiltEl = /** @type {HTMLInputElement|null} */ (document.getElementById("camTilt"));
			const tilt = tiltEl ? +tiltEl.value : 28;
			const entryNow = catalog.get(buildForId);
			const defaultCam = normalizeCameraPreset(entryNow?.defaultCameraPreset);
			const defaultZoom = normalizeCameraZoom(entryNow?.defaultCameraZoom);
			for (const pr of session.activePreviews) {
				pr.setCameraTilt?.(tilt, { reframe: false });
				pr.setCameraZoom?.(defaultZoom, { reframe: false });
				pr.setCameraPreset?.(defaultCam);
				pr.requestRedraw?.();
			}
			syncCamBarActive(defaultCam);
		});
		els.previewHost?.focus?.({ preventScroll: true });

		setStatus("", "");
	} catch (e) {
		if (isAbortError(e) || signal.aborted || getSelectedId() !== buildForId) {
			if (getSelectedId() === buildForId) setStatus("Preview cancelled.", "", { catalog: false });
			return;
		}
		console.error("[basi] preview failed", e);
		showPreviewPlaceholder(`Preview failed: ${e?.message || e}`, { force: true, error: true });
		setStatus(String(e?.message ?? e), "error");
	} finally {
		if (host) delete host.dataset.basiPreviewBuilding;
		if (!signal.aborted && els.previewBtn) els.previewBtn.disabled = !getSelectedId();
	}
}

export function downloadSelected() {
	const entry = getSelectedId() ? catalog.get(getSelectedId()) : null;
	if (!entry?.file) return;
	const url = URL.createObjectURL(entry.file);
	const a = document.createElement("a");
	a.href = url;
	a.download = entry.file.name || `${entry.name}.mcstructure`;
	document.body.appendChild(a);
	a.click();
	a.remove();
	URL.revokeObjectURL(url);
}

export async function removeSelected() {
	if (!getSelectedId()) return;
	const id = getSelectedId();
	const entry = catalog.get(id);
	disposeParkedPreview(id);
	if (session.hasActive) session.disposeActive();
	if (entry?.file) {
		try {
			clearFileBuildCache(entry.file);
		} catch {
			/* ignore */
		}
	}
	setSelectedId(null);
	try {
		await catalog.remove(id);
		selectEntry(null);
		renderList();
		setStatus("Removed from list.", "ok");
	} catch (e) {
		// Entry already removed from memory; still refresh UI
		selectEntry(null);
		renderList();
		setStatus(`Removed in-memory; IndexedDB delete failed: ${e?.message ?? e}`, "warn");
	}
}

