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
import { setStatus, formatSize, flashFloatDock, stat } from "./dom.js";
import { renderList } from "../ui/catalogList.js";
import {
	clearInspectPanel,
	syncLayerUiFromPreview,
	syncCamBarActive,
	updateLayerBadge,
	showPreviewPlaceholder,
	normalizeCameraPreset
} from "../ui/previewChrome.js";
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
	document.body.classList.toggle("sdb-has-selection", !!entry);
	document.body.classList.toggle("sdb-no-selection", !entry);

	if (!entry) {
		els.emptyState?.classList.remove("hidden");
		els.detailPanel?.classList.add("hidden");
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

	if (els.defaultCamSelect) {
		els.defaultCamSelect.value = normalizeCameraPreset(entry.defaultCameraPreset);
	}
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
		setStatus(`Preview restored for “${entry.name}” (cached).`, "ok");
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
	setStatus(`Loading “${entry.name}”…`, "");

	const host = els.previewHost;
	if (host) host.dataset.sdbPreviewBuilding = "1";

	try {
		const { renderStructurePreview } = await import("../viewer/structurePreview.js?v=judo34");
		const { default: ResourcePackStack } = await import("../ResourcePackStack.js");
		if (signal.aborted || getSelectedId() !== buildForId) return;

		const previewCont = document.createElement("div");
		previewCont.className = "previewCont";
		// Exactly one root under the host — never clear host again until load finishes
		host?.replaceChildren(previewCont);
		// Loading label lives *inside* cont so progress updates cannot wipe the preview
		const loadingLabel = document.createElement("p");
		loadingLabel.className = "meta sdb-preview-loading-msg";
		loadingLabel.style.cssText = "padding:12px;color:#ccc;margin:0";
		loadingLabel.textContent = "Building geometry & textures…";
		previewCont.appendChild(loadingLabel);

		clearInspectPanel();
		updateLayerBadge(null);

		const previews = await renderStructurePreview(
			entry.file,
			previewCont,
			{
				PACK_NAME: entry.name,
				SHOW_PREVIEW_SKYBOX: false,
				SHOW_PREVIEW_WIDGETS: true
			},
			new ResourcePackStack(),
			{
				signal,
				onProgress: msg => {
					if (signal.aborted || getSelectedId() !== buildForId) return;
					// Status bar + in-cont label only — never replaceChildren on host
					setStatus(msg, "");
					if (loadingLabel.isConnected) loadingLabel.textContent = msg;
				}
			}
		);

		if (signal.aborted || getSelectedId() !== buildForId) {
			previews.forEach(p => p.dispose?.());
			return;
		}
		session.setActive(previews);
		session.endPreviewJob();
		// Drop outer progress label if still present (renderer has its own canvas now)
		try {
			loadingLabel.remove();
		} catch {
			/* ignore */
		}
		// Sanity: canvas must still be in the host (silent blank if something wiped it)
		const canvasInHost = host?.querySelector("canvas");
		if (!canvasInHost) {
			console.error(
				"[sdb] Preview finished but no canvas in #previewHost — "
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
			for (const pr of session.activePreviews) {
				pr.setCameraTilt?.(tilt, { reframe: false });
				pr.setCameraPreset?.(defaultCam);
				pr.requestRedraw?.();
			}
			syncCamBarActive(defaultCam);
		});
		els.previewHost?.focus?.({ preventScroll: true });

		const entN = previews.reduce((n, p) => n + (p.previewEntities?.length ?? p.entities?.length ?? 0), 0);
		const maxY = previews[0]?.getMaxLayer?.() ?? 0;
		setStatus(
			entN
				? `Preview ready for “${entry.name}” (${entN} entity mesh${entN === 1 ? "" : "es"}). Layers 0–${maxY}: ↑↓ · ← all · → cam · dbl-click inspect.`
				: `Preview ready for “${entry.name}”. Layers 0–${maxY}: ↑↓ · ← all · → cam · dbl-click inspect.`,
			"ok"
		);
	} catch (e) {
		if (isAbortError(e) || signal.aborted || getSelectedId() !== buildForId) {
			if (getSelectedId() === buildForId) setStatus("Preview cancelled.", "");
			return;
		}
		console.error("[sdb] preview failed", e);
		showPreviewPlaceholder(`Preview failed: ${e?.message || e}`, { force: true });
		setStatus(String(e?.message ?? e), "error");
	} finally {
		if (host) delete host.dataset.sdbPreviewBuilding;
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

