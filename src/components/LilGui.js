import { GUI } from "lil-gui";
import { html, htmlCodeToElement, selectEls } from "../utils.js";

/**
 * Custom element wrapper around lil-gui.
 * Important: do NOT destroy the GUI on disconnect — Structure Inspector parks
 * preview DOM when switching structures; destroying on detach left empty
 * duplicate panels after reattach.
 */
export default class LilGui extends HTMLElement {
	/** @type {HTMLStyleElement} */
	static #lilGuiStylesheet;

	/** @type {GUI|undefined} */
	gui;
	#ready = false;

	constructor() {
		super();
		this.attachShadow({
			mode: "open"
		});
	}

	connectedCallback() {
		// Already initialized (e.g. reattached after park) — keep controllers
		if (this.#ready && this.gui) {
			return;
		}
		// Clean any stale shadow content from a prior partial init
		if (this.shadowRoot) {
			this.shadowRoot.replaceChildren();
		}
		const previousStyles = new Set(selectEls("head > style"));
		try {
			this.gui = new GUI({
				// @ts-ignore
				container: this.shadowRoot
			});
		} catch (e) {
			console.warn("[basi] lil-gui GUI construct failed:", e);
			this.gui = undefined;
			return;
		}
		if (!LilGui.#lilGuiStylesheet) {
			const injected = Array.from(selectEls("head > style")).find(
				el => !previousStyles.has(el)
			);
			if (injected instanceof HTMLStyleElement) {
				LilGui.#lilGuiStylesheet = injected;
				LilGui.#lilGuiStylesheet.remove();
			} else {
				// Newer lil-gui may not inject a head <style>; empty host sheet is fine
				LilGui.#lilGuiStylesheet = document.createElement("style");
			}
		}
		try {
			this.shadowRoot.appendChild(LilGui.#lilGuiStylesheet.cloneNode(true));
			this.shadowRoot.appendChild(htmlCodeToElement(html`
			<style>
				:host {
					width: min(calc(100% - 20px), 245px);
					/* Host is positioned bottom-right by .basi-preview-host CSS */
					display: block;
					max-height: min(48vh, 420px);
					overflow: auto;
				}
				.lil-gui {
					--font-family: "Space Grotesk", monospace;
					--widget-height: 20px !important;
					--spacing: 4px !important;
					--width: 100%;
					/* Dark panel + light type so titles read over the black preview */
					--background-color: #1e1a22;
					--text-color: #f2ebf2;
					--title-background-color: #2a2430;
					--title-text-color: #ffffff;
					--widget-color: #3a3342;
					--hover-color: #4a4254;
					--focus-color: #c57cc5;
					--number-color: #f0d0f0;
					--string-color: #e8d8f0;
					--padding: 6px;
					/* Align panel contents to the right edge */
					margin-left: auto;
					margin-right: 0;
					float: none;
					border: 1px solid #ffffff28;
					border-radius: 8px;
					box-shadow: 0 4px 18px #000a;
				}
				/* Title bar (folder / root "Controls") — high contrast on dark stage */
				.lil-gui .title {
					color: #ffffff !important;
					text-shadow: 0 1px 2px #000a;
					font-weight: 700;
					letter-spacing: 0.02em;
				}
				.lil-gui .controller > .name {
					color: #ebe4ec !important;
				}
			</style>
		`));
		} catch (e) {
			console.warn("[basi] lil-gui shadow styles failed:", e);
		}
		this.#ready = true;
	}

	disconnectedCallback() {
		// Intentionally do not destroy — park/restore reattaches this node.
		// Call destroyGui() from PreviewRenderer.dispose for real teardown.
	}

	/** Full teardown when the preview is disposed. */
	destroyGui() {
		try {
			this.gui?.destroy?.();
		} catch {
			/* ignore */
		}
		this.gui = undefined;
		this.#ready = false;
		try {
			this.shadowRoot?.replaceChildren();
		} catch {
			/* ignore */
		}
	}
}
