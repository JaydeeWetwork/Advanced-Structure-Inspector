/**
 * Bedrock ASI — boot + wire only.
 */

import {
	catalog,
	els,
	setEls,
	createEls,
	getSelectedId,
	setSelectedId,
	session,
	uiFlags,
	primaryPreview,
	importState
} from "./app/state.js";
import {
	setStatus,
	initFloatPins,
	openFloatDock,
	peekFloatDock,
	isFloatShowing
} from "./app/dom.js";
import { initPointerMode } from "./ui/pointerMode.js";
import { bindEdgeSwipe } from "./ui/edgeSwipe.js";
import { initTheme } from "./app/theme.js";
import {
	bindCatalogHandlers,
	renderList
} from "./ui/catalogList.js";
import { bindEditor, renderEditor } from "./ui/editorPage.js";
import {
	syncDetailCollapsibles,
	saveMetaField,
	openFeatureDialog,
	closeFeatureDialog,
	createFeatureFromDialog,
	renderCategoryAssign
} from "./ui/detailPanel.js";
import {
	normalizeCameraPreset,
	normalizeCameraZoom,
	stepSelectIndex,
	stepRangeValue,
	applyCameraPreset,
	syncCamBarActive,
	onPreviewKeydown,
	onPreviewDblClick,
	bindPreviewInspectLongPress,
	toggleCamDock,
	applyLayerStep,
	restoreDefaultCamera,
	hidePreviewChrome,
	initInspectWindow
} from "./ui/previewChrome.js";
import { bindLayerTaps } from "./ui/layerTap.js";
import { initCameraCompass } from "./ui/cameraCompass.js";
import {
	selectEntry,
	loadPreview,
	downloadSelected,
	removeSelected
} from "./app/previewLifecycle.js";
import { handleFiles } from "./app/importExport.js";
import { BUILD_ID } from "./buildId.js";


setEls(createEls());

const buildLabel = document.getElementById("buildLabel");
if (buildLabel) {
	buildLabel.textContent = BUILD_ID;
	buildLabel.title = `Build ${BUILD_ID}`;
}

bindCatalogHandlers({ selectEntry });

function openFilePicker() {
	els.importInput?.click();
}

function isEditorView() {
	return location.hash.replace(/^#\/?/, "") === "editor";
}

function applyView() {
	const editor = isEditorView();
	document.body.classList.toggle("basi-view-editor", editor);
	document.body.classList.toggle("basi-view-viewer", !editor);
	els.editorStage?.classList.toggle("hidden", !editor);
	els.appStage?.classList.toggle("hidden", editor);
	els.viewViewerBtn?.classList.toggle("is-active", !editor);
	els.viewEditorBtn?.classList.toggle("is-active", editor);
	if (editor) renderEditor();
	else renderList();
}

function goView(view) {
	const next = view === "editor" ? "#/editor" : "#/";
	if (location.hash === next || (view !== "editor" && (location.hash === "" || location.hash === "#/"))) {
		applyView();
		return;
	}
	location.hash = next;
}

function suppressPreviewOrbit(on) {
	const canvas = els.previewHost?.querySelector?.("canvas");
	if (canvas) {
		if (on) canvas.dataset.basiSuppressOrbit = "1";
		else delete canvas.dataset.basiSuppressOrbit;
	}
	const controls = primaryPreview()?.orbitControls;
	if (controls) controls.enabled = !on;
}

function wireUi() {
	initPointerMode();
	initTheme();
	initFloatPins();
	initInspectWindow();
	initCameraCompass();
	bindEdgeSwipe(els.appStage, {
		openCatalog: () => openFloatDock(els.catalogFloat),
		closeCatalog: () => peekFloatDock(els.catalogFloat),
		openDetail: () => {
			if (!getSelectedId()) return;
			openFloatDock(els.detailFloat);
		},
		closeDetail: () => peekFloatDock(els.detailFloat),
		openCam: () => toggleCamDock(true),
		closeCam: () => toggleCamDock(false),
		isCamOpen: () => !!els.camDock?.classList.contains("basi-cam-open"),
		isCatalogOpen: () => isFloatShowing(els.catalogFloat),
		isDetailOpen: () => isFloatShowing(els.detailFloat),
		closeUnpinned: () => hidePreviewChrome(),
		suppressOrbit: () => suppressPreviewOrbit(true),
		releaseOrbit: () => {
			requestAnimationFrame(() => suppressPreviewOrbit(false));
		}
	});
	bindPreviewInspectLongPress(els.previewHost);
	bindLayerTaps(els.previewHost, {
		onUp: () => applyLayerStep(1),
		onDown: () => applyLayerStep(-1),
		onAll: () => restoreDefaultCamera(),
		suppressOrbit: () => suppressPreviewOrbit(true),
		releaseOrbit: () => {
			requestAnimationFrame(() => suppressPreviewOrbit(false));
		}
	});
	els.importInput?.addEventListener("change", () => {
		handleFiles(els.importInput.files);
	});
	els.importBtn?.addEventListener("click", openFilePicker);
	bindEditor();
	els.viewViewerBtn?.addEventListener("click", () => goView("viewer"));
	els.viewEditorBtn?.addEventListener("click", () => goView("editor"));
	els.openEditorBtn?.addEventListener("click", () => goView("editor"));
	window.addEventListener("hashchange", applyView);
	catalog.subscribe(() => {
		renderList();
		const id = getSelectedId();
		renderCategoryAssign(id ? catalog.get(id) : null);
		if (isEditorView()) renderEditor();
	});
	applyView();

	const applyDefaultCamFromSelect = persist => {
		if (!getSelectedId()) return;
		const val = normalizeCameraPreset(els.defaultCamSelect?.value);
		const p = primaryPreview();
		if (p?.setCameraPreset && val !== "free") {
			applyCameraPreset(val);
		} else if (p && (val === "free" || val === "fly")) {
			p.setCameraPreset?.(val);
			syncCamBarActive(val);
		}
		if (!persist) return;
		void catalog.patch(getSelectedId(), { defaultCameraPreset: val }).then(() => {
			setStatus(`Default camera: ${val}`, "ok");
		});
	};
	els.defaultCamSelect?.addEventListener("change", () => applyDefaultCamFromSelect(true));

	const applyDefaultZoomUi = persist => {
		const z = normalizeCameraZoom(Number(els.defaultZoom?.value) / 100);
		if (els.defaultZoomVal) els.defaultZoomVal.textContent = `${Math.round(z * 100)}%`;
		const p = primaryPreview();
		p?.setCameraZoom?.(z, { reframe: true });
		if (!persist || !getSelectedId()) return;
		void catalog.patch(getSelectedId(), { defaultCameraZoom: z }).then(() => {
			setStatus(`Default zoom: ${Math.round(z * 100)}%`, "ok");
		});
	};
	els.defaultZoom?.addEventListener("input", () => applyDefaultZoomUi(false));
	els.defaultZoom?.addEventListener("change", () => applyDefaultZoomUi(true));

	let zoomWheelPersistTimer = 0;
	const scheduleZoomPersist = () => {
		if (zoomWheelPersistTimer) clearTimeout(zoomWheelPersistTimer);
		zoomWheelPersistTimer = window.setTimeout(() => {
			zoomWheelPersistTimer = 0;
			applyDefaultZoomUi(true);
		}, 280);
	};

	const camWrap = els.defaultCamSelect?.closest(".basi-default-cam");
	camWrap?.addEventListener(
		"wheel",
		e => {
			if (!getSelectedId()) return;
			e.preventDefault();
			e.stopPropagation();
			const overZoom =
				e.target instanceof Element && !!e.target.closest(".basi-default-zoom");
			if (overZoom) {
				const input = els.defaultZoom;
				if (!input) return;
				const next = stepRangeValue(
					Number(input.value),
					Number(input.min),
					Number(input.max),
					Number(input.step) || 5,
					e.deltaY
				);
				if (next === Number(input.value)) return;
				input.value = String(next);
				applyDefaultZoomUi(false);
				scheduleZoomPersist();
				return;
			}
			const sel = els.defaultCamSelect;
			if (!sel) return;
			const next = stepSelectIndex(sel.selectedIndex, sel.options.length, e.deltaY);
			if (next === sel.selectedIndex) return;
			sel.selectedIndex = next;
			applyDefaultCamFromSelect(true);
		},
		{ passive: false }
	);

	const wireMetaInput = (input, field) => {
		if (!input) return;
		const commit = () => {
			void saveMetaField(field, input.value);
		};
		input.addEventListener("blur", commit);
		input.addEventListener("keydown", e => {
			if (e.key === "Enter") {
				e.preventDefault();
				input.blur();
			}
		});
		if (field === "sourceLink") {
			input.addEventListener("input", () => {
				input.classList.remove("is-invalid");
				els.metaSourceLinkError?.classList.add("hidden");
			});
		}
	};
	wireMetaInput(els.metaCreator, "creator");
	wireMetaInput(els.metaCredits, "credits");
	wireMetaInput(els.metaSourceLink, "sourceLink");

	els.detailAddFeatureBtn?.addEventListener("click", () => {
		openFeatureDialog();
	});
	els.featureCreateBtn?.addEventListener("click", () => {
		void createFeatureFromDialog(els.featureNewName?.value, els.featureNewColor?.value);
	});
	els.featureNewName?.addEventListener("keydown", e => {
		if (e.key !== "Enter") return;
		e.preventDefault();
		void createFeatureFromDialog(els.featureNewName?.value, els.featureNewColor?.value);
	});
	els.featureDialog?.addEventListener("click", e => {
		if (e.target === els.featureDialog) closeFeatureDialog();
	});

	els.detailsCollapseBtn?.addEventListener("click", () => {
		uiFlags.detailsSectionCollapsed = !uiFlags.detailsSectionCollapsed;
		syncDetailCollapsibles();
	});
	els.materialsCollapseBtn?.addEventListener("click", () => {
		uiFlags.materialsSectionCollapsed = !uiFlags.materialsSectionCollapsed;
		syncDetailCollapsibles();
	});

	els.clearCatalogBtn?.addEventListener("click", async () => {
		if (!catalog.list().length) {
			setStatus("List is already empty.", "");
			return;
		}
		if (!confirm("Clear the entire list (including IndexedDB storage)?")) return;
		setSelectedId(null);
		session.clearEverything({ resetIcons: true });
		try {
			await catalog.clear();
			selectEntry(null);
			renderList();
			setStatus("List cleared.", "ok");
		} catch (e) {
			renderList();
			setStatus(`Clear failed (IndexedDB): ${e?.message ?? e}`, "error");
		}
	});

	els.searchInput?.addEventListener("input", () => renderList());
	els.previewBtn?.addEventListener("click", () => loadPreview({ force: true }));
	els.downloadBtn?.addEventListener("click", () => downloadSelected());
	els.removeBtn?.addEventListener("click", () => removeSelected());

	const openCredits = () => {
		const dlg = els.creditsDialog;
		if (!dlg) return;
		if (typeof dlg.showModal === "function") dlg.showModal();
		else dlg.setAttribute("open", "");
	};
	els.creditsBtn?.addEventListener("click", openCredits);
	els.creditsFooterBtn?.addEventListener("click", openCredits);
	els.creditsDialog?.addEventListener("click", e => {
		const dlg = els.creditsDialog;
		if (!dlg || e.target !== dlg) return;
		dlg.close?.();
	});

	window.addEventListener("keydown", onPreviewKeydown);
	els.previewHost?.addEventListener("dblclick", onPreviewDblClick);

	document.getElementById("camBar")?.addEventListener("click", e => {
		const btn = e.target instanceof Element ? e.target.closest("[data-cam]") : null;
		if (!btn) return;
		e.preventDefault();
		e.stopPropagation();
		const preset = btn.getAttribute("data-cam") || "iso";
		const ok = applyCameraPreset(preset, { cycleIso: preset === "iso" });
		if (!ok && !primaryPreview()) {
			setStatus("Load a preview first, then use camera buttons.", "warn");
		}
	});

	document.addEventListener("basi-camera-preset", e => {
		const detail = /** @type {CustomEvent} */ (e).detail || {};
		const preset = detail.preset;
		if (detail.tilt != null && Number.isFinite(detail.tilt)) {
			const camTilt = /** @type {HTMLInputElement|null} */ (document.getElementById("camTilt"));
			const camTiltVal = document.getElementById("camTiltVal");
			if (camTilt) camTilt.value = String(Math.round(detail.tilt));
			if (camTiltVal) camTiltVal.textContent = `${Math.round(detail.tilt)}°`;
		}
		if (preset) syncCamBarActive(preset);
	});

	const camTilt = /** @type {HTMLInputElement|null} */ (document.getElementById("camTilt"));
	const camTiltVal = document.getElementById("camTiltVal");
	if (camTilt) camTilt.value = "67";
	if (camTiltVal) camTiltVal.textContent = "67°";
	document.querySelector(".basi-cam-tilt")?.classList.add("hidden");

	camTilt?.addEventListener("input", () => {
		const deg = +camTilt.value;
		if (camTiltVal) camTiltVal.textContent = `${deg}°`;
		const p = primaryPreview();
		if (!p?.setCameraTilt) return;
		p.setCameraTilt(deg);
		syncCamBarActive(p.getCameraPreset?.());
		p.requestRedraw?.();
	});

	window.addEventListener("dragover", e => e.preventDefault());
	window.addEventListener("drop", e => {
		e.preventDefault();
		const files = e.dataTransfer?.files;
		if (files?.length) handleFiles(files);
	});
}

async function boot() {
	void import("./viewer/preloadVanilla.js").then(m => m.preloadVanillaAssets()).catch(e => {
		console.warn("[basi] vanilla preload failed", e);
	});
	wireUi();
	renderList();
	selectEntry(null);
	if (els.bootBadge) {
		els.bootBadge.textContent = "Loading…";
	}
	const n = await catalog.bootFromRegistry();
	applyView();
	if (n > 0) {
		setStatus(`Restored ${n} structure(s) from IndexedDB.`, "ok");
	}
	if (els.bootBadge) {
		els.bootBadge.textContent = "Ready";
		els.bootBadge.classList.add("ok");
	}
	console.info("[basi] Bedrock ASI ready");
}

boot().catch(e => {
	console.error("[basi] boot failed", e);
	setStatus(`App failed to start: ${e?.message ?? e}`, "error");
	if (els.bootBadge) {
		els.bootBadge.textContent = "Error";
		els.bootBadge.classList.add("error");
	}
});
