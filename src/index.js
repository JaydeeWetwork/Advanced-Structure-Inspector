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
	initFloatPins
} from "./app/dom.js";
import { initTheme } from "./app/theme.js";
import {
	bindCatalogHandlers,
	renderList
} from "./ui/catalogList.js";
import { bindEditor, renderEditor } from "./ui/editorPage.js";
import {
	syncDetailCollapsibles,
	saveMetaField,
	addUserDetail
} from "./ui/detailPanel.js";
import {
	normalizeCameraPreset,
	applyCameraPreset,
	syncCamBarActive,
	onPreviewKeydown,
	onPreviewDblClick,
	initInspectWindow
} from "./ui/previewChrome.js";
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

function wireUi() {
	initTheme();
	initFloatPins();
	initInspectWindow();
	initCameraCompass();
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
		if (isEditorView()) renderEditor();
	});
	applyView();

	els.defaultCamSelect?.addEventListener("change", () => {
		if (!getSelectedId()) return;
		const val = normalizeCameraPreset(els.defaultCamSelect?.value);
		void catalog.patch(getSelectedId(), { defaultCameraPreset: val }).then(() => {
			const p = primaryPreview();
			if (p?.setCameraPreset && val !== "free") {
				applyCameraPreset(val);
			} else if (p && (val === "free" || val === "fly")) {
				p.setCameraPreset?.(val);
				syncCamBarActive(val);
			}
			setStatus(`Default camera: ${val}`, "ok");
		});
	});

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

	els.addDetailBtn?.addEventListener("click", () => {
		if (!getSelectedId()) return;
		const text = prompt("Add a detail for this structure:");
		if (text == null) return;
		void addUserDetail(getSelectedId(), text);
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
