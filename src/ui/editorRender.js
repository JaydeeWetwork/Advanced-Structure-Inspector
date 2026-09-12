/** Runtime-bound so tree/features can request a full editor redraw without a cycle. */

/** @type {() => void} */
let _renderEditor = () => {};

export function setEditorRender(fn) {
	_renderEditor = typeof fn === "function" ? fn : () => {};
}

export function renderEditor() {
	_renderEditor();
}
