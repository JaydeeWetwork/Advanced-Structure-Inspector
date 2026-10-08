/**
 * PreviewRenderer — thin orchestrator for structure 3D preview.
 * Systems share a single PreviewContext (no host-getter soup).
 * Entity list ownership: EntityAttachSystem only.
 */

import { AsyncFactory, max, min, toImageData } from "../../utils.js";
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
} from "../systems/index.js";
import { disposeObject3D } from "../systems/disposeObject3D.js";
import { filterBuriedUnitCubes, occludesAsUnitCube } from "../occupancySkip.js";
import { PreviewLoadingChrome } from "./previewLoadingChrome.js";


/** @type {typeof import("three")} */
let THREE;
/** @type {typeof import("three/examples/jsm/controls/OrbitControls.js").OrbitControls} */
let OrbitControls;

const IN_PRODUCTION =
	typeof location !== "undefined"
	&& location.hostname !== ""
	&& location.hostname !== "localhost"
	&& location.hostname !== "127.0.0.1";

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
		materialSide: "front",
		canvasScale: 0.65,
		showSkybox: false,
		showEntities: true,
		backgroundColor: 0x121214
	};

	cont;
	packName;
	structureSize;
	blockPalette;
	blockFaceTemplates;
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
		showFps: false,
		showOptions: false,
		shadowsEnabled: true,
		antialias: true,
		maxPixelRatio: 2,
		enableDamping: true,
		instanceMergeThreshold: 3,
		materialSide: "front",
		canvasScale: 0.8,
		showEntities: true,
		backgroundColor: 0x121214,
		abortSignal: null,
		/** @type {string[]|null} shape name per palette row */
		shapeByPalette: null,
		/** @type {import("../entityExtract.js").PreviewEntity[]|null} */
		entities: null,
		/** @type {import("../inspectStructure.js").InspectIndex|null} */
		inspectIndex: null
	};

	#canvasSize = min(window.innerWidth, window.innerHeight) * 0.8;
	/** @type {PreviewLoadingChrome} */
	#chrome;
	#can;
	#imageBlob;
	/** @type {Vec3[][]} */
	#blockPositions = [];
	#waterlogPositions = [];
	#lastFrameTime = performance.now();
	/** @type {import("three").Object3D[]} */
	#debugHelpers = [];
	/**
	 * Sole public list accessor — storage lives on EntityAttachSystem.
	 * @returns {import("../entityExtract.js").PreviewEntity[]}
	 */
	get previewEntities() {
		return this.#entities?.list ?? [];
	}

	/**
	 * @returns {import("../inspectStructure.js").InspectIndex|null}
	 */
	get inspectIndex() {
		return this.#ctx?.inspectIndex ?? null;
	}

	/**
	 * @param {import("../inspectStructure.js").InspectIndex|null} v
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
	 * @param {PolyMeshTemplateFaceWithUvs[][]} blockFaceTemplates
	 * @param {[Int32Array, Int32Array]} blockIndices
	 * @param {Partial<typeof this.options>} [options]
	 * @param {import("../entityExtract.js").PreviewEntity[]} [entitiesArg]
	 */
	constructor(
		cont,
		packName,
		imageBlob,
		structureSize,
		blockPalette,
		blockFaceTemplates,
		blockIndices,
		options = {},
		entitiesArg = []
	) {
		super();
		this.cont = cont;
		this.packName = packName;
		this.structureSize = structureSize;
		this.blockPalette = blockPalette;
		this.blockFaceTemplates = blockFaceTemplates;
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
		this.#imageBlob = imageBlob;
		this.#initSystems();
		this.#entities.setList(entityList);
		if (options?.inspectIndex) this.#ctx.inspectIndex = options.inspectIndex;
		console.info("[bLayers] PreviewRenderer constructed, entities:", this.previewEntities.length);
		this.#chrome = new PreviewLoadingChrome(
			this.cont,
			this.options,
			() => this.#viewport?.requestRender?.()
		);
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
		ctx.shapeByPalette = this.options?.shapeByPalette ?? null;
		ctx.blockFaceTemplates = this.blockFaceTemplates;
		ctx.maxDim = max(...this.structureSize);
		ctx.maxDimPixels = ctx.maxDim * 16;
		ctx.canvasSizeFallback = this.#canvasSize;
		ctx.hostEl =
			this.cont?.closest?.(".bLayers-preview-host")
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
			console.warn("[bLayers] special overlays failed:", e);
		}
	}

	#initAborted() {
		if (this.#ctx.isDisposed()) return true;
		const signal = this.options?.abortSignal;
		return !!(signal && signal.aborted);
	}

	/**
	 * Occupancy next to the index scan (after atlas ImageData exists).
	 * LayerMeshSystem only chooses this list vs the unculled scan.
	 */
	#culledBlockPositions() {
		const layer0 = this.blockIndices?.[0];
		if (!this.structureSize || !layer0) return this.#blockPositions;
		const templates = this.blockFaceTemplates || [];
		const shapes = this.options?.shapeByPalette || [];
		const occludesByPalette = [];
		for (let i = 0; i < templates.length; i++) {
			occludesByPalette[i] = occludesAsUnitCube(
				shapes[i],
				this.#geo.isFaceTemplateFullyOpaque(templates[i])
			);
		}
		return filterBuriedUnitCubes(
			this.structureSize,
			layer0,
			occludesByPalette,
			this.#blockPositions
		);
	}

	async init() {
		const setupStarted = performance.now();
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
		ctx.imageBlobData = this.#imageBlob instanceof ImageData
			? this.#imageBlob
			: await toImageData(this.#imageBlob);
		if (this.#initAborted()) return;

		ctx.renderer = new THREE.WebGLRenderer({
			canvas: this.#can,
			alpha: true,
			antialias: this.options.antialias,
			powerPreference: "high-performance",
			stencil: false,
			depth: true,
			logarithmicDepthBuffer: true
		});
		console.info(
			`[bLayers] preview setup ${((performance.now() - setupStarted) / 1000).toFixed(2)}s`
		);

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
		const scanStarted = performance.now();
		{
			const collectLights = (this.options.maxPointLights ?? 0) > 0;
			const scan = scanStructureBlocks({
				structureSize: this.structureSize,
				blockIndices: this.blockIndices,
				blockFaceTemplates: this.blockFaceTemplates,
				blockPalette: this.blockPalette,
				pointLightDefs: POINT_LIGHT_DEFS,
				defaultLightIntensity: POINT_LIGHT_DEFAULT_INTENSITY,
				collectLights
			});
			this.#blockPositions = scan.blockPositions;
			this.#waterlogPositions = scan.waterlogPositions;
			if (collectLights) this.#lighting.setPointLightSources(scan.pointLights);
		}
		const scanMs = performance.now() - scanStarted;
		this.#lighting.addBaseLighting();
		this.#debugHelpers.push(...this.#lighting.debugHelpers);
		await this.#lighting.initBackground(this.#pool);
		if (this.#initAborted()) return;

		if (this.options.showFps) {
			try {
				const { default: Stats } = await import("stats.js");
				const stats = new Stats();
				stats.showPanel(0);
				stats.dom.classList.add("statsPanel");
				ctx.stats = stats;
				this.cont.appendChild(stats.dom);
			} catch (e) {
				console.warn("[bLayers] stats.js skipped:", e);
			}
		}
		if (this.options.showOptions && this.#chrome.optionsGui) {
			wirePreviewOptionsGui({
				gui: this.#chrome.optionsGui,
				options: this.options,
				owner: this,
				lighting: this.#lighting,
				renderer: ctx.renderer,
				scene: ctx.scene,
				debugHelpers: this.#debugHelpers,
				requestRender: () => this.#viewport.requestRender(),
				setSize: () => this.#viewport.setInitialSize(),
				pool: this.#pool,
				inProduction: IN_PRODUCTION,
				rebuildOverlays: () => this.#rebuildOverlays()
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

		const meshStarted = performance.now();
		this.#layers.mount(
			ctx.scene,
			this.#blockPositions,
			this.#culledBlockPositions(),
			this.#waterlogPositions
		);
		this.#inspect.init();
		this.#layers.rebuildBlockMeshes(null);
		this.#rebuildOverlays();
		const meshMs = performance.now() - meshStarted;
		if (this.#initAborted()) return;

		// Block meshes are ready. Entity textures come from the CDN and a single
		// 403 can sit in the connection queue for a long time. Show the canvas
		// now and mesh entities when those responses arrive.
		this.#viewport.start();
		this.#chrome.message.replaceWith(this.#can);
		this.#viewport.fitCanvasToHost();
		this.#viewport.requestRender();
		console.info(
			`[bLayers] preview mesh ${((scanMs + meshMs) / 1000).toFixed(2)}s (entities still attaching)`
		);

		const entities = this.previewEntities;
		const packs = this.options.entityResourcePackStack;
		void this.attachEntities(entities, packs).catch(e => {
			console.error("[bLayers] entity attach during init failed:", e);
		});
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

		// Layer camera policy lives on CameraController.
		if (entering) this.#cameraCtrl.enterLayerMode();
		else if (next != null) this.#cameraCtrl.stayInLayerMode();
		else if (leaving) this.#cameraCtrl.leaveLayerMode();
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

	/** OrbitControls instance, or null before init / after dispose. */
	get orbitControls() {
		return this.#ctx?.controls ?? null;
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

	getCameraZoom() {
		return this.#cameraCtrl.userZoom ?? 1;
	}

	/**
	 * @param {number} z
	 * @param {{ reframe?: boolean }} [opts]
	 */
	setCameraZoom(z, opts = {}) {
		return this.#cameraCtrl.setUserZoom(z, opts);
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
	 * @param {import("../entityExtract.js").PreviewEntity[]} entityList
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
		this.#chrome?.dispose();
		this.#can?.remove?.();
		this.#geo = null;
		this.#blockPositions = [];
		this.#waterlogPositions = [];
		if (this.#ctx) this.#ctx.inspectIndex = null;
	}

	get disposed() {
		return this.#ctx?.isDisposed() === true;
	}
}

/** @import { I32Vec3, Vec3, Block, PolyMeshTemplateFaceWithUvs } from "../../types.js" */
