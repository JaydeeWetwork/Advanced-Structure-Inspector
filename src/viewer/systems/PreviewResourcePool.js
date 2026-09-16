/**
 * Owns shared GPU resources for a single PreviewRenderer instance:
 * atlas texture, block materials, palette geos, minecart texture, item-frame icons.
 */

export default class PreviewResourcePool {
	/** @type {import("three").Texture|null} */
	atlasTexture = null;
	/** @type {import("three").MeshLambertMaterial|null} */
	regularMat = null;
	/** @type {import("three").MeshLambertMaterial|null} */
	transparentMat = null;
	/** @type {import("three").MeshLambertMaterial|null} */
	solidFloorMat = null;
	/** DoubleSide clone for N/S double chests (instance scale.x = -1). */
	/** @type {import("three").MeshLambertMaterial|null} */
	chestMirrorMat = null;
	/** DoubleSide material for card-face geos only (0-thickness cubes). */
	/** @type {import("three").MeshLambertMaterial|null} */
	cardDoubleMat = null;

	/** @type {Map<number, { volume: import("three").BufferGeometry|null, cards: import("three").BufferGeometry|null }>} */
	geoByPalette = new Map();
	/** @type {import("three").Texture|null} */
	minecartTexture = null;
	/** @type {Map<string, { template: import("three").Object3D, texture: import("three").Texture, cargo: string }>|null} */
	entityModelKit = null;
	/** @type {Map<string, { geometry: import("three").BufferGeometry, material: import("three").Material }>|null} */
	cargoKit = null;
	/** @type {import("three").Material|null} */
	cargoMat = null;
	/** @type {Map<string, import("three").Texture|null>} */
	itemFrameTexCache = new Map();
	/** @type {import("three").CubeTexture|null|undefined} */
	skyboxCubemap = null;

	/**
	 * @param {typeof import("three")} THREE
	 * @param {import("three").Texture} atlasTexture
	 * @param {{ materialSide?: string }} [opts]
	 */
	ensureMaterials(THREE, atlasTexture, opts = {}) {
		this.atlasTexture = atlasTexture;
		const side = opts.materialSide === "front" ? THREE.FrontSide : THREE.DoubleSide;
		const alphaTest = 0.05;

		if (this.regularMat) {
			this.regularMat.map = atlasTexture;
			this.regularMat.side = side;
			this.regularMat.alphaTest = alphaTest;
			this.regularMat.needsUpdate = true;
		} else {
			this.regularMat = new THREE.MeshLambertMaterial({
				map: atlasTexture,
				side,
				alphaTest,
				depthWrite: true
			});
		}

		if (this.transparentMat) {
			this.transparentMat.map = atlasTexture;
			this.transparentMat.side = THREE.DoubleSide;
			this.transparentMat.alphaTest = alphaTest;
			this.transparentMat.needsUpdate = true;
		} else {
			this.transparentMat = new THREE.MeshLambertMaterial({
				map: atlasTexture,
				side: THREE.DoubleSide,
				alphaTest,
				transparent: true,
				depthWrite: true
			});
		}

		if (this.chestMirrorMat) {
			this.chestMirrorMat.map = atlasTexture;
			this.chestMirrorMat.side = THREE.DoubleSide;
			this.chestMirrorMat.alphaTest = alphaTest;
			this.chestMirrorMat.needsUpdate = true;
		}
		if (this.cardDoubleMat) {
			this.cardDoubleMat.map = atlasTexture;
			this.cardDoubleMat.side = THREE.DoubleSide;
			this.cardDoubleMat.alphaTest = alphaTest;
			this.cardDoubleMat.needsUpdate = true;
		}

		if (this.solidFloorMat) {
			this.solidFloorMat.map = atlasTexture;
			this.solidFloorMat.side = side;
			this.solidFloorMat.alphaTest = 0.5;
			this.solidFloorMat.transparent = false;
			this.solidFloorMat.opacity = 1;
			this.solidFloorMat.depthWrite = true;
			this.solidFloorMat.needsUpdate = true;
		} else {
			this.solidFloorMat = new THREE.MeshLambertMaterial({
				map: atlasTexture,
				side,
				alphaTest: 0.5,
				transparent: false,
				opacity: 1,
				depthWrite: true
			});
		}
	}

	/**
	 * @param {typeof import("three")} THREE
	 */
	ensureChestMirrorMat(THREE) {
		if (this.chestMirrorMat) return this.chestMirrorMat;
		if (!this.regularMat || !THREE) return null;
		this.chestMirrorMat = this.regularMat.clone();
		this.chestMirrorMat.side = THREE.DoubleSide;
		this.chestMirrorMat.polygonOffset = true;
		this.chestMirrorMat.polygonOffsetFactor = -1;
		this.chestMirrorMat.polygonOffsetUnits = -2;
		return this.chestMirrorMat;
	}

	/**
	 * @param {typeof import("three")} THREE
	 */
	ensureCardDoubleMat(THREE) {
		if (this.cardDoubleMat) return this.cardDoubleMat;
		if (!this.regularMat || !THREE) return null;
		this.cardDoubleMat = this.regularMat.clone();
		this.cardDoubleMat.side = THREE.DoubleSide;
		return this.cardDoubleMat;
	}

	/** @param {import("three").BufferGeometry} geo */
	isSharedGeometry(geo) {
		for (const entry of this.geoByPalette.values()) {
			if (entry?.volume === geo || entry?.cards === geo) return true;
		}
		if (this.entityModelKit) {
			for (const entry of this.entityModelKit.values()) {
				let hit = false;
				entry?.template?.traverse?.(o => {
					if (o.isMesh && o.geometry === geo) hit = true;
				});
				if (hit) return true;
			}
		}
		if (this.cargoKit) {
			for (const entry of this.cargoKit.values()) {
				if (entry?.geometry === geo) return true;
			}
		}
		return false;
	}

	/** @param {import("three").Material} mat */
	isSharedMaterial(mat) {
		if (mat === this.regularMat
			|| mat === this.transparentMat
			|| mat === this.solidFloorMat
			|| mat === this.chestMirrorMat
			|| mat === this.cardDoubleMat
			|| mat === this.cargoMat) return true;
		if (this.entityModelKit) {
			for (const entry of this.entityModelKit.values()) {
				let hit = false;
				entry?.template?.traverse?.(o => {
					if (o.isMesh && o.material === mat) hit = true;
				});
				if (hit) return true;
			}
		}
		return false;
	}

	/** @param {import("three").Texture} map */
	isSharedMap(map) {
		if (!map) return false;
		if (map === this.atlasTexture) return true;
		if (map === this.minecartTexture) return true;
		if (this.entityModelKit) {
			for (const entry of this.entityModelKit.values()) {
				if (entry?.texture === map) return true;
			}
		}
		for (const t of this.itemFrameTexCache.values()) {
			if (t === map) return true;
		}
		return false;
	}

	/** Policy object for disposeObject3D / clearChildren. */
	disposePolicy() {
		return {
			isSharedGeometry: g => this.isSharedGeometry(g),
			isSharedMaterial: m => this.isSharedMaterial(m),
			isSharedMap: m => this.isSharedMap(m)
		};
	}

	/**
	 * @param {number} paletteI
	 * @param {() => { volume: import("three").BufferGeometry|null, cards: import("three").BufferGeometry|null }} factory
	 */
	getOrCreateGeos(paletteI, factory) {
		let geos = this.geoByPalette.get(paletteI);
		if (!geos) {
			geos = factory();
			this.geoByPalette.set(paletteI, geos);
		}
		return geos;
	}

	/**
	 * Full teardown — disposes everything this pool owns.
	 */
	disposeAll() {
		for (const entry of this.geoByPalette.values()) {
			try {
				entry?.volume?.dispose?.();
			} catch {
				/* ignore */
			}
			try {
				entry?.cards?.dispose?.();
			} catch {
				/* ignore */
			}
		}
		this.geoByPalette.clear();

		for (const t of this.itemFrameTexCache.values()) {
			try {
				t?.dispose?.();
			} catch {
				/* ignore */
			}
		}
		this.itemFrameTexCache.clear();

		try {
			this.regularMat?.dispose?.();
		} catch {
			/* ignore */
		}
		try {
			this.transparentMat?.dispose?.();
		} catch {
			/* ignore */
		}
		try {
			this.solidFloorMat?.dispose?.();
		} catch {
			/* ignore */
		}
		try {
			this.chestMirrorMat?.dispose?.();
		} catch {
			/* ignore */
		}
		try {
			this.cardDoubleMat?.dispose?.();
		} catch {
			/* ignore */
		}
		try {
			this.atlasTexture?.dispose?.();
		} catch {
			/* ignore */
		}
		try {
			this.minecartTexture?.dispose?.();
		} catch {
			/* ignore */
		}
		if (this.entityModelKit) {
			const seenGeo = new Set();
			const seenMat = new Set();
			const seenTex = new Set();
			for (const entry of this.entityModelKit.values()) {
				entry?.template?.traverse?.(o => {
					if (!o.isMesh) return;
					if (o.geometry && !seenGeo.has(o.geometry)) {
						seenGeo.add(o.geometry);
						try {
							o.geometry.dispose?.();
						} catch {
							/* ignore */
						}
					}
					if (o.material && !seenMat.has(o.material)) {
						seenMat.add(o.material);
						try {
							o.material.dispose?.();
						} catch {
							/* ignore */
						}
					}
				});
				if (entry?.texture && !seenTex.has(entry.texture)) {
					seenTex.add(entry.texture);
					try {
						entry.texture.dispose?.();
					} catch {
						/* ignore */
					}
				}
			}
		}
		if (this.cargoKit) {
			for (const entry of this.cargoKit.values()) {
				try {
					entry?.geometry?.dispose?.();
				} catch {
					/* ignore */
				}
			}
		}
		try {
			this.cargoMat?.dispose?.();
		} catch {
			/* ignore */
		}
		try {
			this.skyboxCubemap?.dispose?.();
		} catch {
			/* ignore */
		}

		this.regularMat = null;
		this.transparentMat = null;
		this.solidFloorMat = null;
		this.chestMirrorMat = null;
		this.cardDoubleMat = null;
		this.atlasTexture = null;
		this.minecartTexture = null;
		this.entityModelKit = null;
		this.cargoKit = null;
		this.cargoMat = null;
		this.skyboxCubemap = null;
	}
}
