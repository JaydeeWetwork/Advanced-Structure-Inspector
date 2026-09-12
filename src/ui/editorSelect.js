import { editorUi } from "../app/state.js";
import { renderEditor } from "./editorRender.js";

export function selectEditorNode(kind, id) {
	editorUi.selected = { kind, id };
	editorUi.expandedFeatureId = null;
	renderEditor();
}
