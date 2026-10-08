/**
 * Block layer mesh system — owns layer root/groups and InstancedMesh rebuilds.
 */

import { clearChildren } from "./disposeObject3D.js";
import { allowedLayerYs } from "../layerVisibility.js";
import {
	doubleChestNeedsPreviewXMirror,
	doubleChestNeedsPreviewZMirror
} from "../doubleChest.js";
import { facesToBufferGeometry } from "../polyMeshBufferGeo.js";
import { insetCellShellFaces, partitionTemplateFaces } from "./BlockGeoSystem.js";
import { csrCount, forEachYRun } from "../cellCsr.js";

export default class LayerMeshSystem {
	/** @type {import("three").Group|null} */
	layerRoot = null;
	/** @type {Map<number, import("three").Group>} */
	#layerGroups = new Map();
	/** @type {number|null} */
	selectedLayer = null;
	/** @type {{ off: Int32Array, xyz: Int32Array }|null} */
	#blockPositions = null;
	/** @type {{ off: Int32Array, xyz: Int32Array }|null} */
	#positionsFull = null;
	/** @type {{ off: Int32Array, xyz: Int32Array }|null} */
	#waterlogPositions = null;
	/** @type {Map<number, { volume: import("three").BufferGeometry|null, cards: import("three").BufferGeometry|null }>} */
	#waterlogGeos = new Map();
	/** @type {boolean[]} */
	#translucentByPalette = [];

	/**
	 * @param {import("./PreviewContext.js").default} ctx
	 */
	constructor(ctx) {
		this.ctx = ctx;
	}

	/**
	 * @param {import("three").Scene} scene
	 * @param {{ off: Int32Array, xyz: Int32Array }} blockPositions unculled (layer isolation)
	 * @param {{ off: Int32Array, xyz: Int32Array }} [positionsFull] occupancy-culled (full preview); defaults to unculled
	 * @param {{ off: Int32Array, xyz: Int32Array }} [waterlogPositions] layer-1 liquids, drawn inset so they do not share stair/slab planes
	 */
	mount(scene, blockPositions, positionsFull, waterlogPositions) {
		const THREE = this.ctx.THREE;
		if (!THREE || !scene) return;
		this.#disposeWaterlogGeos();
		this.#blockPositions = blockPositions;
		this.#positionsFull = positionsFull ?? blockPositions;
		this.#waterlogPositions = waterlogPositions ?? null;
		this.layerRoot = new THREE.Group();
		this.layerRoot.name = "bLayers-layers";
		scene.add(this.layerRoot);
		this.#layerGroups = new Map();
		this.selectedLayer = null;
		const palette = this.ctx.blockFaceTemplates || [];
		this.#translucentByPalette = palette.map(t =>
			t?.length ? !!this.ctx.geo.isFaceTemplateTranslucent(t) : false
		);
	}

	/**
	 * @param {number} y
	 * @returns {import("three").Group}
	 */
	getLayerGroup(y) {
		if (!this.#layerGroups.has(y)) {
			const THREE = this.ctx.THREE;
			const g = new THREE.Group();
			g.name = `layer-y-${y}`;
			g.userData.layerY = y;
			this.layerRoot?.add(g);
			this.#layerGroups.set(y, g);
		}
		return this.#layerGroups.get(y);
	}

	/** Clear meshes under layer root without disposing shared resources. */
	clearContents() {
		const pool = this.ctx.pool;
		clearChildren(this.layerRoot, pool.disposePolicy());
		this.#layerGroups = new Map();
	}

	/**
	 * Rebuild InstancedMeshes for whole structure or layer mode.
	 * @param {number|null} yFilter
	 */
	rebuildBlockMeshes(yFilter) {
		const THREE = this.ctx.THREE;
		const pool = this.ctx.pool;
		if (!this.layerRoot || !THREE || !pool.regularMat || !pool.transparentMat) return;

		this.clearContents();
		pool.ensureMaterials(THREE, pool.atlasTexture, this.ctx.options);

		const useShadows = !!this.ctx.options.shadowsEnabled;
		const selected = yFilter != null && Number.isFinite(yFilter) ? Math.floor(yFilter) : null;
		const allowedYs = allowedLayerYs(selected);

		const palette = this.ctx.blockFaceTemplates || [];
		const cells = selected == null ? this.#positionsFull : this.#blockPositions;
		const waterCells = this.#waterlogPositions;
		for (let paletteI = 0; paletteI < palette.length; paletteI++) {
			const faceTemplate = palette[paletteI];
			if (!faceTemplate?.length) continue;
			if (csrCount(cells, paletteI) === 0 && csrCount(waterCells, paletteI) === 0) continue;

			const isTranslucent = this.#translucentByPalette[paletteI]
				?? this.ctx.geo.isFaceTemplateTranslucent(faceTemplate);

			/** @type {{ volume: import("three").BufferGeometry|null, cards: import("three").BufferGeometry|null }|null} */
			let geos = null;
			const blockGeos = () => {
				if (!geos) geos = pool.getOrCreateGeos(paletteI, () => this.ctx.geo.faceTemplateToBufferGeos(paletteI));
				return geos;
			};
			/** @type {{ volume: import("three").BufferGeometry|null, cards: import("three").BufferGeometry|null }|null} */
			let waterlogGeos = null;

			if (cells?.xyz) {
				forEachYRun(cells, paletteI, (y, from, to) => {
					if (allowedYs && !allowedYs.has(y)) return;
					const count = to - from;
					const built = blockGeos();
					const isFloor = selected != null && y === selected - 1;
					const palBlock = this.ctx.blockPalette?.[paletteI];
					const largeChest = String(palBlock?.bLayers_block_shape ?? "").startsWith("chest_large");
					const mirrorX = !isFloor && doubleChestNeedsPreviewXMirror(palBlock);
					const mirrorZ = !isFloor && doubleChestNeedsPreviewZMirror(palBlock);
					let volumeMat = isFloor
						? (pool.solidFloorMat ?? pool.regularMat)
						: (isTranslucent ? pool.transparentMat : pool.regularMat);
					if (largeChest) volumeMat = pool.ensureChestMirrorMat(THREE) ?? volumeMat;
					const addMesh = (geo, material) => {
						if (!geo || !material || !cells.xyz) return;
						const mesh = this.ctx.geo.instanceBufferGeoAtXyz(geo, cells.xyz, from, to, material, {
							mirrorX,
							mirrorZ
						});
						if (isTranslucent && !isFloor) mesh.renderOrder = count;
						if (isFloor) mesh.renderOrder = -1000;
						mesh.castShadow = useShadows;
						mesh.receiveShadow = useShadows;
						mesh.frustumCulled = selected == null;
						mesh.userData.includeInGlbExport = true;
						mesh.userData.bLayersBlock = true;
						mesh.userData.bLayersPaletteI = paletteI;
						mesh.userData.bLayersBlockXyz = cells.xyz;
						mesh.userData.bLayersBlockXyzAt = from;
						mesh.userData.layerY = y;
						mesh.userData.bLayersFloorLayer = isFloor;
						mesh.userData.bLayersPickable = !isFloor;
						this.getLayerGroup(y).add(mesh);
					};
					addMesh(built?.volume, volumeMat);
					if (built?.cards) {
						const cardMat = isTranslucent && !isFloor
							? (pool.ensureTransparentCardMat(THREE) ?? pool.transparentMat)
							: (pool.ensureCardDoubleMat(THREE) ?? volumeMat);
						addMesh(built.cards, cardMat);
					}
				});
			}

			if (waterCells?.xyz && csrCount(waterCells, paletteI) > 0) {
				forEachYRun(waterCells, paletteI, (y, from, to) => {
					if (allowedYs && !allowedYs.has(y)) return;
					if (!waterlogGeos) waterlogGeos = this.#insetWaterlogGeos(paletteI);
					const count = to - from;
					const addWater = (geo) => {
						if (!geo || !pool.transparentMat || !waterCells.xyz) return;
						const mesh = this.ctx.geo.instanceBufferGeoAtXyz(
							geo, waterCells.xyz, from, to, pool.transparentMat
						);
						mesh.renderOrder = count;
						mesh.castShadow = useShadows;
						mesh.receiveShadow = useShadows;
						mesh.frustumCulled = selected == null;
						mesh.userData.includeInGlbExport = true;
						mesh.userData.bLayersBlock = true;
						mesh.userData.bLayersPaletteI = paletteI;
						mesh.userData.bLayersBlockXyz = waterCells.xyz;
						mesh.userData.bLayersBlockXyzAt = from;
						mesh.userData.layerY = y;
						mesh.userData.bLayersPickable = true;
						this.getLayerGroup(y).add(mesh);
					};
					addWater(waterlogGeos.volume);
					addWater(waterlogGeos.cards);
				});
			}
		}

		console.info(
			selected == null
				? "[bLayers] LayerMeshSystem: rebuilt all layers"
				: `[bLayers] LayerMeshSystem: rebuilt layer ${selected}`
					+ (selected > 0 ? ` + solid floor ${selected - 1}` : "")
		);
	}

	/**
	 * @param {number|null} layer
	 * @param {number} maxY
	 * @returns {number|null}
	 */
	setSelectedLayer(layer, maxY) {
		const next =
			layer == null || !Number.isFinite(layer)
				? null
				: Math.max(0, Math.min(maxY, Math.floor(layer)));
		// Skip full InstancedMesh rebuild when nothing changed (big structures)
		if (next === this.selectedLayer) return this.selectedLayer;
		this.selectedLayer = next;
		this.rebuildBlockMeshes(this.selectedLayer);
		return this.selectedLayer;
	}

	/** @param {number|null} [layerY] @param {number[]} structureSize */
	boundsForLayer(THREE, structureSize, layerY = null) {
		const sx = structureSize[0];
		const sy = structureSize[1];
		const sz = structureSize[2];
		let y0 = 0;
		let y1 = sy;
		if (layerY != null && Number.isFinite(layerY)) {
			const y = Math.floor(layerY);
			y0 = Math.max(0, y > 0 ? y - 1 : y);
			y1 = y + 1;
		}
		return new THREE.Box3(
			new THREE.Vector3(-16 * sx, 16 * y0, -16 * sz),
			new THREE.Vector3(0, 16 * y1, 0)
		);
	}

	/**
	 * Inset copy of a liquid template. Shell faces move in; the source top stays.
	 * @param {number} paletteI
	 */
	#insetWaterlogGeos(paletteI) {
		const cached = this.#waterlogGeos.get(paletteI);
		if (cached) return cached;
		const faces = insetCellShellFaces(this.ctx.blockFaceTemplates?.[paletteI]);
		const { volume, cards } = partitionTemplateFaces(faces);
		const THREE = this.ctx.THREE;
		const geos = {
			volume: facesToBufferGeometry(THREE, volume),
			cards: facesToBufferGeometry(THREE, cards)
		};
		this.#waterlogGeos.set(paletteI, geos);
		return geos;
	}

	#disposeWaterlogGeos() {
		for (const geos of this.#waterlogGeos.values()) {
			geos.volume?.dispose?.();
			geos.cards?.dispose?.();
		}
		this.#waterlogGeos.clear();
	}

	dispose() {
		this.clearContents();
		this.#disposeWaterlogGeos();
		this.layerRoot?.parent?.remove(this.layerRoot);
		this.layerRoot = null;
		this.#layerGroups = new Map();
		this.selectedLayer = null;
		this.#blockPositions = null;
		this.#positionsFull = null;
		this.#waterlogPositions = null;
		this.#translucentByPalette = [];
	}
}
