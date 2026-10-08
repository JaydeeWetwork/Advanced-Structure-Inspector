/**
 * Loading message and the optional lil-gui panel for one preview.
 * PreviewRenderer still owns the canvas, the scene, and dispose of WebGL.
 */

export class PreviewLoadingChrome {
	/** @type {HTMLDivElement} */
	message;
	/** @type {import("lil-gui").GUI|undefined} */
	optionsGui;

	/**
	 * @param {Node} cont
	 * @param {{ showOptions?: boolean }} options
	 * @param {() => void} requestRender
	 */
	constructor(cont, options, requestRender) {
		this.#cont = cont;
		this.message = document.createElement("div");
		this.message.classList.add("previewMessage");
		const p = document.createElement("p");
		const span = document.createElement("span");
		span.dataset.translate = "preview.loading";
		p.appendChild(span);
		const loader = document.createElement("div");
		loader.classList.add("loader");
		p.appendChild(loader);
		this.message.appendChild(p);
		cont.appendChild(this.message);

		if (!options.showOptions) return;
		try {
			const guiEl = document.createElement("lil-gui");
			cont.appendChild(guiEl);
			try {
				customElements.upgrade?.(guiEl);
			} catch {
				/* ignore */
			}
			const gui = /** @type {{ gui?: import("lil-gui").GUI }} */ (guiEl).gui;
			if (!gui) {
				console.warn("[bLayers] lil-gui panel not ready — options disabled for this preview");
				guiEl.remove();
			} else {
				this.optionsGui = gui;
				if (gui.$title) {
					gui.$title.dataset.translate = "preview.options";
				}
				gui.hide?.();
				gui.close?.();
				gui.onChange?.(() => requestRender());
			}
		} catch (e) {
			console.warn("[bLayers] options GUI setup failed:", e);
			this.optionsGui = undefined;
		}
	}

	/** @type {Node} */
	#cont;

	dispose() {
		try {
			this.optionsGui?.destroy?.();
		} catch {
			/* ignore */
		}
		this.optionsGui = undefined;
		try {
			this.#cont?.querySelectorAll?.("lil-gui")?.forEach(el => {
				el.destroyGui?.();
				el.remove();
			});
		} catch {
			/* ignore */
		}
		this.message?.remove?.();
	}
}
