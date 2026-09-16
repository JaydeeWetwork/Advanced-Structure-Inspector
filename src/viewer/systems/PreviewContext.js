/**
 * Single shared context for preview systems.
 * Filled during PreviewRenderer.init(); systems read fields, not host getters.
 */

export default class PreviewContext {
	/** @type {typeof import("three")|null} */
	THREE = null;
	/** @type {import("three").Scene|null} */
	scene = null;
	/** @type {import("three").PerspectiveCamera|import("three").OrthographicCamera|null} */
	camera = null;
	/** @type {import("three").OrbitControls|null} */
	controls = null;
	/** @type {import("three").WebGLRenderer|null} */
	renderer = null;
	/** @type {HTMLCanvasElement|null} */
	canvas = null;
	/** @type {import("./PreviewResourcePool.js").default|null} */
	pool = null;
	/** @type {object} */
	options = {};
	/** @type {import("three").Vector3|null} */
	center = null;
	maxDimPixels = 0;
	maxDim = 0;
	/** @type {[number,number,number]|null} */
	structureSize = null;
	/** @type {[Int32Array|number[], Int32Array|number[]]|null} */
	blockIndices = null;
	/** @type {import("../inspectStructure.js").InspectIndex|null} */
	inspectIndex = null;
	/** @type {any[]|null} */
	blockPalette = null;
	/** @type {string[]|null} */
	shapeByPalette = null;
	/** @type {any[]|null} */
	polyMeshTemplatePalette = null;
	/** @type {any} */
	polyMeshMaker = null;
	/** @type {ImageData|null} */
	imageBlobData = null;
	/** @type {Element|null} */
	hostEl = null;
	/** @type {Element|null} */
	cont = null;
	/** @type {any} */
	stats = null;
	canvasSizeFallback = 400;

	// Cross-system refs (set after construction)
	/** @type {import("./LayerMeshSystem.js").default|null} */
	layers = null;
	/** @type {import("./EntityAttachSystem.js").default|null} */
	entities = null;
	/** @type {import("./CameraController.js").default|null} */
	cameraCtrl = null;
	/** @type {import("./ViewportSystem.js").default|null} */
	viewport = null;
	/** @type {import("./LightingSystem.js").default|null} */
	lighting = null;
	/** @type {import("./BlockGeoSystem.js").default|null} */
	geo = null;
	/** @type {import("./InspectRaycaster.js").default|null} */
	inspect = null;

	#disposed = false;

	isDisposed() {
		return this.#disposed;
	}

	markDisposed() {
		this.#disposed = true;
	}

	requestRender() {
		this.viewport?.requestRender?.();
	}

	/** @returns {number|null} */
	get selectedLayer() {
		return this.layers?.selectedLayer ?? null;
	}

	/** Event target for camera preset CustomEvents */
	get eventTarget() {
		return this.cont || this.canvas;
	}

	/** Layer group helper */
	getLayerGroup(y) {
		return this.layers?.getLayerGroup?.(y);
	}

	/**
	 * @param {number|null} [layerY]
	 * @returns {import("three").Box3}
	 */
	boundsForLayer(layerY) {
		const THREE = this.THREE;
		const size = this.structureSize || [1, 1, 1];
		if (!THREE) {
			throw new Error("boundsForLayer: THREE not loaded");
		}
		if (this.layers?.boundsForLayer) {
			return this.layers.boundsForLayer(THREE, size, layerY);
		}
		// Fallback AABB if layers not ready
		const sx = size[0] ?? 1;
		const sy = size[1] ?? 1;
		const sz = size[2] ?? 1;
		return new THREE.Box3(
			new THREE.Vector3(-16 * sx, 0, -16 * sz),
			new THREE.Vector3(0, 16 * sy, 0)
		);
	}

	fitCanvasToHost() {
		this.viewport?.fitCanvasToHost?.();
	}
}
