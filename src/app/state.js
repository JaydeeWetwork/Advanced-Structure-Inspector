/**
 * Shared app state — single owner for selection + preview session.
 */

import { StructureCatalog } from "../viewer/api/catalog.js";
import PreviewSessionManager from "./PreviewSessionManager.js";

export const catalog = new StructureCatalog();

/** @type {string|null} */
let _selectedId = null;

export function getSelectedId() {
	return _selectedId;
}

/**
 * @param {string|null} id
 */
export function setSelectedId(id) {
	_selectedId = id;
	session.selectedId = id;
}

/** @type {ReturnType<typeof createEls>|null} */
export let els = null;

/**
 * @param {ReturnType<typeof createEls>} value
 */
export function setEls(value) {
	els = value;
}

export const session = new PreviewSessionManager({
	maxParked: 2,
	getPreviewHost: () => els?.previewHost ?? document.getElementById("previewHost"),
	log: m => console.info(m)
});

/** Session UI collapse flags */
export const uiFlags = {
	uncategorizedCollapsed: false,
	detailsSectionCollapsed: false,
	materialsSectionCollapsed: false
};

/** Database editor selection (not the viewer preview selection). */
export const editorUi = {
	/** @type {{ kind: "category"|"entry"|"structure"|"uncategorized", id: string }|null} */
	selected: null,
	featureFilter: "",
	expandedFeatureId: /** @type {string|null} */ (null),
	uncategorizedCollapsed: false,
	featuresOpen: false,
	treeScroll: 0,
	dragCategoryId: /** @type {string|null} */ (null),
	/** @type {null|{ mode: "saveAs"|"new"|"delete", name?: string }} */
	dbForm: null,
	inspectConfirm: /** @type {string|null} */ (null)
};

/** Single-flight import */
export const importState = {
	inFlight: false,
	/** @type {AbortController|null} */
	abort: null
};

/**
 * @returns {import("../PreviewRenderer.js").default|null}
 */
export function primaryPreview() {
	return session.primary();
}

/**
 * @param {string} id
 */
function $(id) {
	const el = document.getElementById(id);
	if (!el) console.warn(`[basi] missing #${id}`);
	return el;
}

export function createEls() {
	return {
		importInput: /** @type {HTMLInputElement|null} */ ($("importInput")),
		importBtn: $("importBtn"),
		clearCatalogBtn: $("clearCatalogBtn"),
		creditsBtn: $("creditsBtn"),
		themeBtn: $("themeBtn"),
		creditsFooterBtn: $("creditsFooterBtn"),
		creditsDialog: /** @type {HTMLDialogElement|null} */ ($("creditsDialog")),
		searchInput: /** @type {HTMLInputElement|null} */ ($("searchInput")),
		catalogList: $("catalogList"),
		catalogCount: $("catalogCount"),
		statusBox: $("statusBox"),
		emptyState: $("emptyState"),
		detailPanel: $("detailPanel"),
		// name/source live in #selectionBar (headerName / headerSource), not detail dock
		detailStats: $("detailStats"),
		detailMaterialList: $("detailMaterialList"),
		materialListHint: $("materialListHint"),
		defaultCamSelect: /** @type {HTMLSelectElement|null} */ ($("defaultCamSelect")),
		metaCreator: /** @type {HTMLInputElement|null} */ ($("metaCreator")),
		metaCredits: /** @type {HTMLInputElement|null} */ ($("metaCredits")),
		metaSourceLink: /** @type {HTMLInputElement|null} */ ($("metaSourceLink")),
		metaSourceLinkError: $("metaSourceLinkError"),
		detailAddFeatureBtn: $("detailAddFeatureBtn"),
		featureDialog: /** @type {HTMLDialogElement|null} */ ($("featureDialog")),
		featureDialogList: $("featureDialogList"),
		featureDialogHint: $("featureDialogHint"),
		featureNewName: /** @type {HTMLInputElement|null} */ ($("featureNewName")),
		featureNewColor: /** @type {HTMLInputElement|null} */ ($("featureNewColor")),
		featureCreateBtn: $("featureCreateBtn"),
		detailFloatTitle: $("detailFloatTitle"),
		userDetailsList: $("userDetailsList"),
		materialsCollapseBtn: $("materialsCollapseBtn"),
		materialsCollapseBody: $("materialsCollapseBody"),
		detailsCollapseBtn: $("detailsCollapseBtn"),
		detailsCollapseBody: $("detailsCollapseBody"),
		detailCategorySelect: /** @type {HTMLSelectElement|null} */ ($("detailCategorySelect")),
		detailEntrySelect: /** @type {HTMLSelectElement|null} */ ($("detailEntrySelect")),
		detailEntryField: $("detailEntryField"),
		camIsoBtn: $("camIsoBtn"),
		camDock: $("camDock"),
		camBar: $("camBar"),
		previewHost: $("previewHost"),
		previewBtn: /** @type {HTMLButtonElement|null} */ ($("previewBtn")),
		downloadBtn: $("downloadBtn"),
		removeBtn: $("removeBtn"),
		bootBadge: $("bootBadge"),
		layerBadge: $("layerBadge"),
		inspectPanel: $("inspectPanel"),
		inspectPanelBody: $("inspectPanelBody"),
		inspectWinBar: $("inspectWinBar"),
		inspectWinTitle: $("inspectWinTitle"),
		inspectCollapseBtn: /** @type {HTMLButtonElement|null} */ ($("inspectCollapseBtn")),
		inspectCloseBtn: /** @type {HTMLButtonElement|null} */ ($("inspectCloseBtn")),
		selectionBar: $("selectionBar"),
		headerName: $("headerName"),
		headerSource: $("headerSource"),
		hopperStatsLabel: $("hopperStatsLabel"),
		hopperStatsDetail: $("hopperStatsDetail"),
		pinCatalogBtn: /** @type {HTMLButtonElement|null} */ ($("pinCatalogBtn")),
		pinDetailBtn: /** @type {HTMLButtonElement|null} */ ($("pinDetailBtn")),
		catalogFloat: $("catalogFloat"),
		detailFloat: $("detailFloat"),
		viewViewerBtn: $("viewViewerBtn"),
		viewEditorBtn: $("viewEditorBtn"),
		openEditorBtn: $("openEditorBtn"),
		editorStage: $("editorStage"),
		appStage: $("appStage"),
		editorTree: $("editorTree"),
		editorDbBar: $("editorDbBar"),
		editorTreeToolbar: $("editorTreeToolbar"),
		editorInspector: $("editorInspector"),
		editorFeatures: $("editorFeatures"),
		editorFeatureList: $("editorFeatureList"),
		editorFeatureFilter: /** @type {HTMLInputElement|null} */ ($("editorFeatureFilter")),
		editorFeatureHint: $("editorFeatureHint"),
		addFeatureBtn: $("addFeatureBtn"),
		editorFeatureCloseBtn: $("editorFeatureCloseBtn"),
		detailFeatureChips: $("detailFeatureChips")
	};
}
