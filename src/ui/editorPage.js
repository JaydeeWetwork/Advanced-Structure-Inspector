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
import { editorUi, els } from "../app/state.js";

export { renderEditor };

function redraw() {
	renderEditorToolbar();
	renderEditorTree();
	renderEditorInspector();
	renderEditorFeatures();
}

setEditorRender(redraw);

export function bindEditor() {
	setEditorRender(redraw);
	els.addFeatureBtn?.addEventListener("click", () => {
		void addFeatureFromEditor();
	});
	els.editorFeatureFilter?.addEventListener("input", () => {
		editorUi.featureFilter = els.editorFeatureFilter?.value ?? "";
		renderEditorFeatures();
	});
}
