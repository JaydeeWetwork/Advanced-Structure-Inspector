/**
 * Canvas sizing + demand-driven RAF render loop.
 */

import { abs, min } from "../../utils/math.js";

export default class ViewportSystem {
	#rafId = 0;
	#shouldRender = true;
	#lastFrameTime = performance.now();
	/** @type {(() => void)|null} */
	#onWindowResize = null;
	/** @type {ResizeObserver|null} */
	#hostResizeObserver = null;
	#disposed = false;

	/**
	 * @param {import("./PreviewContext.js").default} ctx
	 */
	constructor(ctx) {
		this.ctx = ctx;
	}

	requestRender() {
		if (this.#disposed || this.ctx.isDisposed()) return;
		this.#shouldRender = true;
		if (!this.#rafId) {
			this.#rafId = window.requestAnimationFrame(() => this.#loop());
		}
	}

	/** Start loop once after first frame content is ready. */
	start() {
		this.requestRender();
	}

	/**
	 * Match drawing buffer to host CSS box (prevents stretch).
	 */
	fitCanvasToHost() {
		const renderer = this.ctx.renderer;
		const can = this.ctx.canvas;
		const camera = this.ctx.camera;
		const options = this.ctx.options;
		if (!renderer || !can || !camera) return;

		const host = this.ctx.hostEl;
		const cw = host?.clientWidth || 0;
		const ch = host?.clientHeight || 0;
		let w = Math.max(1, Math.floor(cw));
		let h = Math.max(1, Math.floor(ch));
		if (w < 32 || h < 32) {
			w = Math.max(320, Math.floor(window.innerWidth * 0.45));
			h = Math.max(240, Math.floor(window.innerHeight * 0.55));
		}
		const pr = min(window.devicePixelRatio || 1, options.maxPixelRatio ?? 2);
		renderer.setPixelRatio(pr);
		renderer.setSize(w, h, true);
		can.style.width = `${w}px`;
		can.style.height = `${h}px`;
		can.style.maxWidth = "100%";
		can.style.maxHeight = "100%";
		can.style.border = "none";
		can.style.display = "block";
		can.style.aspectRatio = "auto";
		camera.aspect = w / Math.max(h, 1);
		camera.updateProjectionMatrix();
	}

	/** Initial size (fit host, or square fallback). */
	setInitialSize() {
		this.fitCanvasToHost();
		const renderer = this.ctx.renderer;
		const can = this.ctx.canvas;
		const options = this.ctx.options;
		if (!renderer || can?.clientWidth) return;
		const size =
			(this.ctx.canvasSizeFallback ?? 400)
			* (options.highResolution ? 2 : 1);
		renderer.setSize(size, size, false);
		renderer.setPixelRatio(min(window.devicePixelRatio || 1, options.maxPixelRatio));
	}

	/** Window + ResizeObserver — never reframes camera. */
	bindHostResize() {
		this.#onWindowResize = () => {
			this.fitCanvasToHost();
			this.requestRender();
		};
		window.addEventListener("resize", this.#onWindowResize);
		try {
			const host = this.ctx.hostEl;
			if (host && typeof ResizeObserver !== "undefined") {
				this.#hostResizeObserver = new ResizeObserver(() => this.#onWindowResize?.());
				this.#hostResizeObserver.observe(host);
			}
		} catch {
			/* ignore */
		}
	}

	#loop() {
		this.#rafId = 0;
		if (this.#disposed || this.ctx.isDisposed()) return;
		const renderer = this.ctx.renderer;
		if (!renderer) return;

		const now = performance.now();
		const dt = Math.min(0.05, Math.max(0, (now - this.#lastFrameTime) / 1000));
		this.#lastFrameTime = now;

		const cameraCtrl = this.ctx.cameraCtrl;
		const controls = this.ctx.controls;
		const options = this.ctx.options;

		if (cameraCtrl?.flyMode) {
			cameraCtrl.tickFly(dt);
			if (cameraCtrl.flyNeedsLoop()) this.#shouldRender = true;
		} else if (controls) {
			controls.update();
		}

		if (this.#shouldRender) {
			this.#shouldRender = false;
			this.#paint();
		}

		if (cameraCtrl?.flyNeedsLoop?.()) {
			this.#shouldRender = true;
			this.#rafId = window.requestAnimationFrame(() => this.#loop());
		} else if (options.enableDamping && controls?.enableDamping) {
			const stillDamping =
				abs(controls._sphericalDelta?.phi ?? 0) > 1e-6
				|| abs(controls._sphericalDelta?.theta ?? 0) > 1e-6
				|| abs(controls._panOffset?.lengthSq?.() ?? controls._panDelta?.lengthSq?.() ?? 0) > 1e-8;
			if (stillDamping) {
				this.#shouldRender = true;
				this.#rafId = window.requestAnimationFrame(() => this.#loop());
			}
		}
	}

	#paint() {
		const stats = this.ctx.stats;
		stats?.begin?.();
		const options = this.ctx.options;
		const lighting = this.ctx.lighting;
		if (options.maxPointLights > 0 && lighting?.pointLights?.length > 0) {
			lighting.updatePointLights();
		}
		const renderer = this.ctx.renderer;
		const scene = this.ctx.scene;
		const camera = this.ctx.camera;
		if (renderer && scene && camera) {
			renderer.render(scene, camera);
		}
		this.ctx.cameraCtrl?.emitFacing?.();
		stats?.end?.();
	}

	/** Immediate paint (e.g. before screenshot). */
	paintNow() {
		this.#paint();
	}

	dispose() {
		this.#disposed = true;
		if (this.#rafId) {
			cancelAnimationFrame(this.#rafId);
			this.#rafId = 0;
		}
		this.#shouldRender = false;
		if (this.#onWindowResize) {
			window.removeEventListener("resize", this.#onWindowResize);
			this.#onWindowResize = null;
		}
		try {
			this.#hostResizeObserver?.disconnect?.();
		} catch {
			/* ignore */
		}
		this.#hostResizeObserver = null;
	}
}
