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
	/** @type {Map<number, import("three").BufferGeometry>} */
	geoByPalette = new Map();
	/** @type {import("three").Texture|null} */
	minecartTexture = null;
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

		if (this.solidFloorMat) {
			this.solidFloorMat.map = atlasTexture;
			this.solidFloorMat.side = THREE.DoubleSide;
			this.solidFloorMat.alphaTest = 0.5;
			this.solidFloorMat.transparent = false;
			this.solidFloorMat.opacity = 1;
			this.solidFloorMat.depthWrite = true;
			this.solidFloorMat.needsUpdate = true;
		} else {
			this.solidFloorMat = new THREE.MeshLambertMaterial({
				map: atlasTexture,
				side: THREE.DoubleSide,
				alphaTest: 0.5,
				transparent: false,
				opacity: 1,
				depthWrite: true
			});
		}
	}

	/** @param {import("three").BufferGeometry} geo */
	isSharedGeometry(geo) {
		for (const g of this.geoByPalette.values()) {
			if (g === geo) return true;
		}
		return false;
	}

	/** @param {import("three").Material} mat */
	isSharedMaterial(mat) {
		return mat === this.regularMat
			|| mat === this.transparentMat
			|| mat === this.solidFloorMat;
	}

	/** @param {import("three").Texture} map */
	isSharedMap(map) {
		if (!map) return false;
		if (map === this.atlasTexture) return true;
		if (map === this.minecartTexture) return true;
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
	 * @param {() => import("three").BufferGeometry} factory
	 */
	getOrCreateGeo(paletteI, factory) {
		let geo = this.geoByPalette.get(paletteI);
		if (!geo) {
			geo = factory();
			this.geoByPalette.set(paletteI, geo);
		}
		return geo;
	}

	/**
	 * Full teardown — disposes everything this pool owns.
	 */
	disposeAll() {
		for (const geo of this.geoByPalette.values()) {
			try {
				geo.dispose?.();
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
			this.atlasTexture?.dispose?.();
		} catch {
			/* ignore */
		}
		try {
			this.minecartTexture?.dispose?.();
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
		this.atlasTexture = null;
		this.minecartTexture = null;
		this.skyboxCubemap = null;
	}
}
