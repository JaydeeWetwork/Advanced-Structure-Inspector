/**
 * Hide viewer chrome (docks, camera bar, inspect) — iPad tap on the 3D view.
 */

import { els } from "../app/state.js";
import { peekFloatDock } from "./docks.js";
import { clearInspectPanel } from "./inspectChrome.js";

export function hidePreviewChrome() {
	peekFloatDock(els?.catalogFloat);
	peekFloatDock(els?.detailFloat);
	const dock = document.getElementById("camDock");
	if (dock) {
		dock.classList.remove("basi-cam-open");
		dock.setAttribute("aria-expanded", "false");
	}
	const active = document.activeElement;
	if (active instanceof HTMLElement && active.closest?.(".basi-float, .basi-cam-dock, .basi-inspect-panel")) {
		active.blur();
	}
	clearInspectPanel();
}
