/**
 * Block layer mesh system — owns layer root/groups and InstancedMesh rebuilds.
 */

import { clearChildren } from "./disposeObject3D.js";
import { allowedLayerYs } from "../layerVisibility.js";
import { doubleChestNeedsPreviewXMirror } from "../doubleChest.js";

export default class LayerMeshSystem {
	/** @type {import("three").Group|null} */
	layerRoot = null;
	/** @type {Map<number, import("three").Group>} */
	#layerGroups = new Map();
	/** @type {number|null} */
	selectedLayer = null;
	/** @type {Vec3[][]} */
	#blockPositions = [];
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
	 * @param {Vec3[][]} blockPositions
	 */
	mount(scene, blockPositions) {
		const THREE = this.ctx.THREE;
		if (!THREE || !scene) return;
		this.#blockPositions = blockPositions;
		this.layerRoot = new THREE.Group();
		this.layerRoot.name = "basi-layers";
		scene.add(this.layerRoot);
		this.#layerGroups = new Map();
		this.selectedLayer = null;
		// Precompute translucency once (avoids pixel scan every layer rebuild)
		const palette = this.ctx.polyMeshTemplatePalette || [];
		this.#translucentByPalette = palette.map(t =>
			t?.length ? !!this.ctx.geo.isPolyMeshTemplateTranslucent(t) : false
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

		const palette = this.ctx.polyMeshTemplatePalette || [];
		for (const i in this.#blockPositions) {
			const polyMeshTemplate = palette[i];
			if (!polyMeshTemplate?.length) continue;
			const paletteI = +i;

			/** @type {[number, number, number][]} */
			let structPositions = this.#blockPositions[i];
			if (allowedYs) {
				structPositions = structPositions.filter(([, y]) => allowedYs.has(y));
			}
			if (!structPositions.length) continue;

			const geo = pool.getOrCreateGeo(paletteI, () =>
				this.ctx.geo.polyMeshTemplateToBufferGeo(paletteI)
			);

			const isTranslucent = this.#translucentByPalette[paletteI]
				?? this.ctx.geo.isPolyMeshTemplateTranslucent(polyMeshTemplate);

			/** @type {Map<number, [number, number, number][]>} */
			const byY = new Map();
			for (const pos of structPositions) {
				const y = pos[1];
				if (!byY.has(y)) byY.set(y, []);
				byY.get(y).push(pos);
			}

			for (const [y, list] of byY) {
				const isFloor = selected != null && y === selected - 1;
				const palBlock = this.ctx.blockPalette?.[paletteI];
				const largeChest = String(palBlock?.basi_block_shape ?? "").startsWith("chest_large");
				const mirrorX = !isFloor && doubleChestNeedsPreviewXMirror(palBlock);
				let material = isFloor
					? (pool.solidFloorMat ?? pool.regularMat)
					: (isTranslucent ? pool.transparentMat : pool.regularMat);
				if (largeChest) material = pool.ensureChestMirrorMat(this.ctx.THREE) ?? material;
				const threePositions = list.map(([x, yy, z]) => [-16 * x - 16, 16 * yy, -16 * z - 16]);
				const mesh = this.ctx.geo.instanceBufferGeoAtPositions(geo, threePositions, material, {
					mirrorX
				});
				if (isTranslucent && !isFloor) mesh.renderOrder = threePositions.length;
				if (isFloor) mesh.renderOrder = -1000;
				mesh.castShadow = useShadows;
				mesh.receiveShadow = useShadows;
				mesh.frustumCulled = selected == null;
				mesh.userData.includeInGlbExport = true;
				mesh.userData.basiBlock = true;
				mesh.userData.basiPaletteI = paletteI;
				mesh.userData.basiBlockPositions = list;
				mesh.userData.layerY = y;
				mesh.userData.basiFloorLayer = isFloor;
				mesh.userData.basiPickable = !isFloor;
				this.getLayerGroup(y).add(mesh);
			}
		}

		console.info(
			selected == null
				? "[basi] LayerMeshSystem: rebuilt all layers"
				: `[basi] LayerMeshSystem: rebuilt layer ${selected}`
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

	dispose() {
		this.clearContents();
		this.layerRoot?.parent?.remove(this.layerRoot);
		this.layerRoot = null;
		this.#layerGroups = new Map();
		this.selectedLayer = null;
		this.#blockPositions = [];
		this.#translucentByPalette = [];
	}
}
