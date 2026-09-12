/**
 * Database editor view: tree + inspector + feature library.
 */

import { setEditorRender, renderEditor } from "./editorRender.js";
import {
	renderEditorTree,
	renderEditorToolbar,
	renderEditorInspector
} from "./editorTree.js";
import { addFeatureFromEditor, renderEditorFeatures } from "./editorFeatures.js";
import { renderEditorDbBar } from "./editorDatabases.js";
import { editorUi, els } from "../app/state.js";

export { renderEditor };

function syncFeatureDrawer() {
	els.editorFeatures?.classList.toggle("hidden", !editorUi.featuresOpen);
}

function redraw() {
	syncFeatureDrawer();
	renderEditorDbBar();
	renderEditorToolbar();
	renderEditorTree();
	renderEditorInspector();
	if (editorUi.featuresOpen) renderEditorFeatures();
}

setEditorRender(redraw);

export function openFeatureDrawer() {
	editorUi.featuresOpen = true;
	renderEditor();
}

export function closeFeatureDrawer() {
	editorUi.featuresOpen = false;
	editorUi.expandedFeatureId = null;
	renderEditor();
}

export function bindEditor() {
	setEditorRender(redraw);
	els.addFeatureBtn?.addEventListener("click", () => {
		editorUi.featuresOpen = true;
		void addFeatureFromEditor();
	});
	els.editorFeatureCloseBtn?.addEventListener("click", () => closeFeatureDrawer());
	els.editorFeatureFilter?.addEventListener("input", () => {
		editorUi.featureFilter = els.editorFeatureFilter?.value ?? "";
		renderEditorFeatures();
	});
}
