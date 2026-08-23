/**
 * PreviewRenderer — thin orchestrator for structure 3D preview.
 * Systems share a single PreviewContext (no host-getter soup).
 * Entity list ownership: EntityAttachSystem only.
 */

import { AsyncFactory, max, min, toImageData } from "./utils.js";
import PolyMeshMaker from "./PolyMeshMaker.js";
import {
	PreviewContext,
	PreviewResourcePool,
	LayerMeshSystem,
	EntityAttachSystem,
	CameraController,
	InspectRaycaster,
	BlockGeoSystem,
	LightingSystem,
	ViewportSystem,
	scanStructureBlocks,
	POINT_LIGHT_DEFS,
	POINT_LIGHT_DEFAULT_INTENSITY,
	createOrbitCameraAndControls,
	bindOrbitInteraction,
	isWeakGpu,
	DEFAULT_FOV,
	downloadScreenshot as exportScreenshot,
	exportGlb as exportGlbFile,
	wirePreviewOptionsGui,
	SpecialBlockOverlay
} from "./viewer/systems/index.js?v=judo27";
import { disposeObject3D } from "./viewer/systems/disposeObject3D.js?v=judo27";

import Stats from "stats.js";

/** @type {typeof import("three")} */
let THREE;
/** @type {typeof import("three/examples/jsm/controls/OrbitControls.js").OrbitControls} */
let OrbitControls;

const IN_PRODUCTION = false;

export default class PreviewRenderer extends AsyncFactory {
	static #WEAK_DEVICE_OPTIONS = {
		maxPointLights: 0,
		directionalLightShadowMapResolution: 1,
		shadowsEnabled: false,
		antialias: false,
		maxPixelRatio: 1,
		enableDamping: false
	};

	/** Fast defaults for the structure DB viewer. */
	static PERFORMANCE_OPTIONS = {
		maxPointLights: 0,
		shadowsEnabled: false,
		antialias: false,
		maxPixelRatio: 1.5,
		directionalLightShadowMapResolution: 1,
		enableDamping: false,
		instanceMergeThreshold: 1,
		materialSide: "double",
		canvasScale: 0.65,
		showSkybox: false,
		showEntities: true,
		backgroundColor: 0x121214
	};

	cont;
	packName;
	structureSize;
	blockPalette;
	polyMeshTemplatePalette;
	blockIndices;

	/** @type {PreviewContext} */
	#ctx;
	#pool = new PreviewResourcePool();
	/** @type {LayerMeshSystem} */
	#layers;
	/** @type {EntityAttachSystem} */
	#entities;
	/** @type {CameraController} */
	#cameraCtrl;
	/** @type {InspectRaycaster} */
	#inspect;
	/** @type {BlockGeoSystem} */
	#geo;
	/** @type {LightingSystem} */
	#lighting;
	/** @type {ViewportSystem} */
	#viewport;
	/** @type {SpecialBlockOverlay} */
	#overlays;

	options = {
		showSkybox: true,
		maxPointLights: 100,
		directionalLightHeight: 1,
		directionalLightAngle: 120,
		directionalLightShadowMapResolution: 2,
		highResolution: false,
		debugHelpersVisible: false,
		showFps: true,
		showOptions: true,
		shadowsEnabled: true,
		antialias: true,
		maxPixelRatio: 2,
		enableDamping: true,
		instanceMergeThreshold: 3,
		materialSide: "double",
		canvasScale: 0.8,
		showEntities: true,
		backgroundColor: 0x121214,
		abortSignal: null
	};

	#canvasSize = min(window.innerWidth, window.innerHeight) * 0.8;
	#loadingMessage;
	#can;
	#polyMeshMaker;
	#imageBlob;
	/** @type {Vec3[][]} */
	#blockPositions = [];
	#lastFrameTime = performance.now();
	#optionsGui;
	/** @type {import("three").Object3D[]} */
	#debugHelpers = [];

	/**
	 * Sole public list accessor — storage lives on EntityAttachSystem.
	 * @returns {import("./viewer/entityExtract.js").PreviewEntity[]}
	 */
	get previewEntities() {
		return this.#entities?.list ?? [];
	}

	/**
	 * @returns {import("./viewer/inspectStructure.js").InspectIndex|null}
	 */
	get inspectIndex() {
		return this.#ctx?.inspectIndex ?? null;
	}

	/**
	 * @param {import("./viewer/inspectStructure.js").InspectIndex|null} v
	 */
	set inspectIndex(v) {
		if (this.#ctx) this.#ctx.inspectIndex = v;
	}

	/**
	 * @param {Node} cont
	 * @param {string} packName
	 * @param {Blob} imageBlob
	 * @param {I32Vec3} structureSize
	 * @param {Block[]} blockPalette
	 * @param {PolyMeshTemplateFaceWithUvs[][]} polyMeshTemplatePalette
	 * @param {[Int32Array, Int32Array]} blockIndices
	 * @param {Partial<typeof this.options>} [options]
	 * @param {import("./viewer/entityExtract.js").PreviewEntity[]} [entitiesArg]
	 */
	constructor(
		cont,
		packName,
		imageBlob,
		structureSize,
		blockPalette,
		polyMeshTemplatePalette,
		blockIndices,
		options = {},
		entitiesArg = []
	) {
		super();
		this.cont = cont;
		this.packName = packName;
		this.structureSize = structureSize;
		this.blockPalette = blockPalette;
		this.polyMeshTemplatePalette = polyMeshTemplatePalette;
		this.blockIndices = blockIndices;
		const fromArg = Array.isArray(entitiesArg) && entitiesArg.length ? entitiesArg : null;
		const fromOpts = Array.isArray(options?.entities) && options.entities.length
			? options.entities
			: null;
		const entityList = fromArg ?? fromOpts ?? [];
		this.options = {
			...this.options,
			...options,
			entities: entityList
		};
		this.#canvasSize = min(window.innerWidth, window.innerHeight) * (this.options.canvasScale ?? 0.8);
		this.#can = document.createElement("canvas");
		this.#polyMeshMaker = new PolyMeshMaker(polyMeshTemplatePalette);
		this.#imageBlob = imageBlob;
		this.#initSystems();
		this.#entities.setList(entityList);
		if (options?.inspectIndex) this.#ctx.inspectIndex = options.inspectIndex;
		console.info("[sdb] PreviewRenderer constructed, entities:", this.previewEntities.length);
		this.#buildLoadingChrome();
	}

	#buildLoadingChrome() {
		this.#loadingMessage = document.createElement("div");
		this.#loadingMessage.classList.add("previewMessage");
		const p = document.createElement("p");
		const span = document.createElement("span");
		span.dataset.translate = "preview.loading";
		p.appendChild(span);
		const loader = document.createElement("div");
		loader.classList.add("loader");
		p.appendChild(loader);
		this.#loadingMessage.appendChild(p);
		this.cont.appendChild(this.#loadingMessage);

		if (this.options.showFps) {
			const stats = new Stats();
			stats.showPanel(0);
			stats.dom.classList.add("statsPanel");
			stats.dom.childNodes.forEach(can => {
				if (!(can instanceof HTMLCanvasElement)) return;
				const c2d = can.getContext("2d");
				const defaultFontFamilies = "Helvetica";
				c2d.font = c2d.font.replace(
					defaultFontFamilies,
					`"Space Grotesk", ${defaultFontFamilies}`
				);
			});
			this.#ctx.stats = stats;
		}
		if (this.options.showOptions) {
			try {
				const guiEl = document.createElement("lil-gui");
				this.cont.appendChild(guiEl);
				// Upgrade + connect: custom elements only run connectedCallback when in a document
				try {
					customElements.upgrade?.(guiEl);
				} catch {
					/* ignore */
				}
				const gui = /** @type {{ gui?: import("lil-gui").GUI }} */ (guiEl).gui;
				if (!gui) {
					console.warn("[sdb] lil-gui panel not ready — options disabled for this preview");
					guiEl.remove();
				} else {
					this.#optionsGui = gui;
					if (gui.$title) {
						gui.$title.dataset.translate = "preview.options";
					}
					gui.hide?.();
					gui.close?.();
					gui.onChange?.(() => this.#viewport?.requestRender?.());
				}
			} catch (e) {
				console.warn("[sdb] options GUI setup failed:", e);
				this.#optionsGui = undefined;
			}
		}
	}

	#initSystems() {
		const ctx = new PreviewContext();
		this.#ctx = ctx;

		ctx.pool = this.#pool;
		ctx.options = this.options;
		ctx.cont = this.cont;
		ctx.canvas = this.#can;
		ctx.structureSize = this.structureSize;
		ctx.blockIndices = this.blockIndices;
		ctx.blockPalette = this.blockPalette;
		ctx.polyMeshTemplatePalette = this.polyMeshTemplatePalette;
		ctx.polyMeshMaker = this.#polyMeshMaker;
		ctx.maxDim = max(...this.structureSize);
		ctx.maxDimPixels = ctx.maxDim * 16;
		ctx.canvasSizeFallback = this.#canvasSize;
		ctx.hostEl =
			this.cont?.closest?.(".sdb-preview-host")
			|| this.cont?.parentElement
			|| this.cont;

		this.#geo = new BlockGeoSystem(ctx);
		this.#lighting = new LightingSystem(ctx);
		this.#layers = new LayerMeshSystem(ctx);
		this.#entities = new EntityAttachSystem(ctx);
		this.#cameraCtrl = new CameraController(ctx);
		this.#inspect = new InspectRaycaster(ctx);
		this.#viewport = new ViewportSystem(ctx);
		this.#overlays = new SpecialBlockOverlay(ctx);

		ctx.geo = this.#geo;
		ctx.lighting = this.#lighting;
		ctx.layers = this.#layers;
		ctx.entities = this.#entities;
		ctx.cameraCtrl = this.#cameraCtrl;
		ctx.inspect = this.#inspect;
		ctx.viewport = this.#viewport;
	}

	/** Redstone arms + sign/lectern text overlays for current layer. */
	#rebuildOverlays() {
		try {
			this.#overlays?.rebuild?.({
				inspectIndex: this.inspectIndex,
				layerFilter: this.#layers?.selectedLayer ?? null
			});
		} catch (e) {
			console.warn("[sdb] special overlays failed:", e);
		}
	}

	#initAborted() {
		if (this.#ctx.isDisposed()) return true;
		const signal = this.options?.abortSignal;
		return !!(signal && signal.aborted);
	}

	async init() {
		if (this.#initAborted()) return;
		THREE ??= await import("three");
		if (this.#initAborted()) return;
		OrbitControls ??= (await import("three/examples/jsm/controls/OrbitControls.js"))
			.OrbitControls;
		if (this.#initAborted()) return;

		const ctx = this.#ctx;
		ctx.THREE = THREE;
		ctx.center = new THREE.Vector3(
			-this.structureSize[0] * 8,
			this.structureSize[1] * 8,
			-this.structureSize[2] * 8
		);
		ctx.imageBlobData = await toImageData(this.#imageBlob);
		if (this.#initAborted()) return;

		ctx.renderer = new THREE.WebGLRenderer({
			canvas: this.#can,
			alpha: true,
			antialias: this.options.antialias,
			powerPreference: "high-performance",
			stencil: false,
			depth: true
		});

		if (isWeakGpu(ctx.renderer)) {
			console.info("Switching to faster preview options");
			Object.assign(this.options, PreviewRenderer.#WEAK_DEVICE_OPTIONS);
		}

		ctx.renderer.setPixelRatio(
			min(window.devicePixelRatio || 1, this.options.maxPixelRatio)
		);
		ctx.renderer.shadowMap.enabled = this.options.shadowsEnabled;
		ctx.renderer.shadowMap.type = THREE.BasicShadowMap;

		const { camera, controls, axesHelper } = createOrbitCameraAndControls({
			THREE,
			OrbitControls,
			canvas: this.#can,
			structureSize: this.structureSize,
			maxDimPixels: ctx.maxDimPixels,
			enableDamping: this.options.enableDamping,
			fov: DEFAULT_FOV
		});
		ctx.camera = camera;
		ctx.controls = controls;
		this.#debugHelpers.push(axesHelper);

		this.#viewport.setInitialSize();
		ctx.scene = new THREE.Scene();
		this.#viewport.bindHostResize();

		bindOrbitInteraction({
			controls: ctx.controls,
			camera: ctx.camera,
			canvas: this.#can,
			getOptions: () => this.options,
			getLastFrameTime: () => this.#lastFrameTime,
			cameraCtrl: this.#cameraCtrl,
			requestRender: () => this.#viewport.requestRender()
		});

		// Scan indices once (mesh positions + optional emissive lights)
		{
			const collectLights = (this.options.maxPointLights ?? 0) > 0;
			const scan = scanStructureBlocks({
				structureSize: this.structureSize,
				blockIndices: this.blockIndices,
				polyMeshTemplatePalette: this.polyMeshTemplatePalette,
				blockPalette: this.blockPalette,
				pointLightDefs: POINT_LIGHT_DEFS,
				defaultLightIntensity: POINT_LIGHT_DEFAULT_INTENSITY,
				collectLights
			});
			this.#blockPositions = scan.blockPositions;
			if (collectLights) this.#lighting.setPointLightSources(scan.pointLights);
		}
		this.#lighting.addBaseLighting();
		this.#debugHelpers.push(...this.#lighting.debugHelpers);
		await this.#lighting.initBackground(this.#pool);
		if (this.#initAborted()) return;

		if (this.options.showFps && ctx.stats) {
			this.cont.appendChild(ctx.stats.dom);
		}
		if (this.options.showOptions && this.#optionsGui) {
			wirePreviewOptionsGui({
				gui: this.#optionsGui,
				options: this.options,
				owner: this,
				lighting: this.#lighting,
				renderer: ctx.renderer,
				scene: ctx.scene,
				debugHelpers: this.#debugHelpers,
				requestRender: () => this.#viewport.requestRender(),
				setSize: () => this.#viewport.setInitialSize(),
				pool: this.#pool,
				inProduction: IN_PRODUCTION
			});
		}

		const texture = this.#geo.createAtlasTexture(ctx.imageBlobData);
		if (this.#initAborted()) {
			try {
				texture?.dispose?.();
			} catch {
				/* ignore */
			}
			return;
		}
		this.#pool.atlasTexture = texture;
		this.#pool.ensureMaterials(THREE, texture, this.options);

		this.#layers.mount(ctx.scene, this.#blockPositions);
		this.#inspect.init();
		this.#layers.rebuildBlockMeshes(null);
		this.#rebuildOverlays();
		if (this.#initAborted()) return;

		try {
			await this.attachEntities(this.previewEntities, this.options.entityResourcePackStack);
		} catch (e) {
			console.error("[sdb] entity attach during init failed:", e);
		}
		if (this.#initAborted()) return;

		this.#viewport.start();
		this.#loadingMessage.replaceWith(this.#can);
	}

	// —— Public API ——

	getMaxLayer() {
		return Math.max(0, (this.structureSize?.[1] ?? 1) - 1);
	}

	getSelectedLayer() {
		return this.#layers.selectedLayer;
	}

	/**
	 * Layer change: mesh rebuild + camera layer-mode policy only.
	 * @param {number|null} layer
	 */
	setSelectedLayer(layer) {
		const prev = this.#layers.selectedLayer;
		const maxY = this.getMaxLayer();
		const want =
			layer == null || !Number.isFinite(layer)
				? null
				: Math.max(0, Math.min(maxY, Math.floor(layer)));
		// No-op when already on this layer (avoids double rebuild after init)
		if (want === prev) {
			return prev;
		}
		this.#layers.setSelectedLayer(layer, maxY);
		this.#rebuildOverlays();
		void this.#entities
			.rebuildForLayer(this.options.showEntities !== false)
			.then(() => this.#viewport.requestRender());

		const next = this.#layers.selectedLayer;
		const entering = prev == null && next != null;
		const leaving = prev != null && next == null;

		// Layer camera policy: N@67 on enter, reframe while layered, restore on leave
		if (entering) {
			if (typeof this.#cameraCtrl.enterLayerMode === "function") {
				this.#cameraCtrl.enterLayerMode();
			} else {
				this.#cameraCtrl.tiltDeg = 67;
				this.#cameraCtrl.setPreset("north");
			}
		} else if (next != null) {
			if (typeof this.#cameraCtrl.stayInLayerMode === "function") {
				this.#cameraCtrl.stayInLayerMode();
			} else {
				this.#cameraCtrl.setPreset(this.#cameraCtrl.lastPreset || "north");
			}
		} else if (leaving) {
			if (typeof this.#cameraCtrl.leaveLayerMode === "function") {
				this.#cameraCtrl.leaveLayerMode();
			} else {
				this.#cameraCtrl.setPreset("iso-north");
			}
		}
		this.#viewport.requestRender();
		this.#viewport.paintNow?.();
		return next;
	}

	/**
	 * @param {1|-1} delta
	 */
	stepLayer(delta) {
		const maxY = this.getMaxLayer();
		if (this.#layers.selectedLayer == null) {
			return this.setSelectedLayer(delta > 0 ? 0 : maxY);
		}
		const next = this.#layers.selectedLayer + delta;
		if (next < 0 || next > maxY) return this.#layers.selectedLayer;
		return this.setSelectedLayer(next);
	}

	showAllLayers() {
		return this.setSelectedLayer(null);
	}

	get isFlyMode() {
		return this.#cameraCtrl.isFlyMode;
	}

	getCameraTilt() {
		return this.#cameraCtrl.tiltDeg;
	}

	getCameraPreset() {
		return this.#cameraCtrl.lastPreset || "iso";
	}

	/**
	 * @param {number} deg
	 * @param {{ reframe?: boolean }} [opts]
	 */
	setCameraTilt(deg, opts = {}) {
		return this.#cameraCtrl.setTilt(deg, opts);
	}

	/**
	 * @param {string} [preset]
	 */
	setCameraPreset(preset = "iso") {
		this.#cameraCtrl.setPreset(preset);
	}

	resetCamera() {
		this.#cameraCtrl.resetCamera();
	}

	requestRedraw(_opts = {}) {
		this.#viewport.fitCanvasToHost();
		this.#viewport.requestRender();
	}

	/**
	 * @param {number} clientX
	 * @param {number} clientY
	 */
	pickAtClient(clientX, clientY) {
		return this.#inspect.pickAtClient(clientX, clientY);
	}

	/**
	 * @param {import("./viewer/entityExtract.js").PreviewEntity[]} entityList
	 * @param {import("./ResourcePackStack.js").default} [resourcePackStack]
	 * @param {{ keepFullList?: boolean }} [opts]
	 */
	async attachEntities(entityList, resourcePackStack, opts = {}) {
		return this.#entities.attach(entityList, resourcePackStack, opts);
	}

	/** @deprecated use previewEntities */
	get entities() {
		return this.previewEntities;
	}

	downloadScreenshot() {
		exportScreenshot(this.#ctx.renderer, this.packName, () => this.#viewport.paintNow());
	}

	async exportGlb() {
		return exportGlbFile({
			scene: this.#ctx.scene,
			geo: this.#geo,
			packName: this.packName
		});
	}

	dispose() {
		this.#ctx?.markDisposed();
		try {
			this.#viewport?.dispose?.();
		} catch {
			/* ignore */
		}
		try {
			this.#cameraCtrl?.setFlyMode?.(false);
		} catch {
			/* ignore */
		}
		try {
			this.#ctx?.controls?.dispose?.();
		} catch (e) {
			console.warn("OrbitControls dispose failed:", e);
		}
		if (this.#ctx) this.#ctx.controls = null;

		try {
			this.#entities?.dispose?.();
		} catch {
			/* ignore */
		}
		try {
			this.#layers?.dispose?.();
		} catch {
			/* ignore */
		}
		try {
			this.#inspect?.dispose?.();
		} catch {
			/* ignore */
		}
		try {
			this.#cameraCtrl?.dispose?.();
		} catch {
			/* ignore */
		}
		try {
			this.#lighting?.dispose?.();
		} catch {
			/* ignore */
		}
		try {
			this.#overlays?.dispose?.();
		} catch {
			/* ignore */
		}

		const scene = this.#ctx?.scene;
		if (scene) {
			const policy = this.#pool?.disposePolicy?.() ?? {};
			const kids = [...scene.children];
			for (const child of kids) {
				scene.remove(child);
				disposeObject3D(child, policy);
			}
		}
		try {
			this.#pool?.disposeAll?.();
		} catch {
			/* ignore */
		}
		try {
			this.#ctx?.renderer?.dispose?.();
			this.#ctx?.renderer?.forceContextLoss?.();
		} catch (e) {
			console.warn("WebGLRenderer dispose failed:", e);
		}
		if (this.#ctx) {
			this.#ctx.renderer = null;
			this.#ctx.scene = null;
			this.#ctx.camera = null;
			this.#ctx.stats?.dom?.remove?.();
			this.#ctx.stats = null;
		}
		try {
			this.#optionsGui?.destroy?.();
		} catch {
			/* ignore */
		}
		this.#optionsGui = undefined;
		try {
			this.cont?.querySelectorAll?.("lil-gui")?.forEach(el => {
				el.destroyGui?.();
				el.remove();
			});
		} catch {
			/* ignore */
		}
		this.#can?.remove?.();
		this.#loadingMessage?.remove?.();
		this.#geo = null;
		this.#blockPositions = [];
		if (this.#ctx) this.#ctx.inspectIndex = null;
	}

	get disposed() {
		return this.#ctx?.isDisposed() === true;
	}
}

/** @import { I32Vec3, Vec3, Block, PolyMeshTemplateFaceWithUvs } from "./HoloPrint.js" */
