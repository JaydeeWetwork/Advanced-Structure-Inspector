/**
 * Scene lighting for PreviewRenderer: directional, ambient, optional point lights.
 */

import { distanceSquared, min, sinDeg, cosDeg, pi } from "../../utils/math.js";

/** Bedrock-ish emissive blocks → color / [color, intensity] */
export const POINT_LIGHT_DEFS = {
	lantern: 0xffaa55,
	redstone_torch: 0x990000,
	powered_repeater: 0x330000,
	powered_comparator: 0x330000,
	"end_rod": [0xd0c9be, 67.5],
	fire: 0xff9955,
	lava: 0xff9955,
	"campfire[extinguished=0]": [0xff9955, 37.5],
	"soul_campfire[extinguished=0]": [0x00ffff, 25],
	cave_vines_body_with_berries: [0xffaa66, 37.5],
	cave_vines_head_with_berries: [0xffaa66, 37.5],
	torch: 0xefe39d,
	soul_lantern: 0x00ffff,
	soul_torch: 0x00ffff
};

const POINT_LIGHT_MAX_DISTANCE = 30;
const POINT_LIGHT_DEFAULT_INTENSITY = 75;
const DIRECTIONAL_LIGHT_STRENGTH = 1.57;
const FLOOR_SHADOW_DARKNESS = 0.3;

export default class LightingSystem {
	/** @type {import("three").DirectionalLight|null} */
	directionalLight = null;
	/** @type {{ pos: number[], col: import("three").Color, intensity: number }[]} */
	pointLights = [];
	/** @type {import("three").PointLight[]} */
	pointLightsInScene = [];
	/** @type {WeakMap<import("three").PointLight, import("three").PointLightHelper>} */
	#helpers = new WeakMap();
	/** @type {import("three").Object3D[]} */
	#debugHelpers = [];

	/**
	 * @param {import("./PreviewContext.js").default} ctx
	 */
	constructor(ctx) {
		this.ctx = ctx;
	}

	get debugHelpers() {
		return this.#debugHelpers;
	}

	/**
	 * @param {{ pos: number[], col: number, intensity: number }[]} rawLights from scanStructureBlocks
	 */
	setPointLightSources(rawLights) {
		const THREE = this.ctx.THREE;
		this.pointLights = (rawLights || []).map(l => ({
			pos: l.pos,
			col: new THREE.Color(l.col),
			intensity: l.intensity
		}));
		const opts = this.ctx.options;
		opts.maxPointLights = min(opts.maxPointLights ?? 0, this.pointLights.length);
	}

	/** Main directional + z-fill + ambient + optional shadow floor. */
	addBaseLighting() {
		const THREE = this.ctx.THREE;
		const scene = this.ctx.scene;
		const options = this.ctx.options;
		const center = this.ctx.center;
		const maxDimPixels = this.ctx.maxDimPixels;
		if (!THREE || !scene) return;

		this.directionalLight = new THREE.DirectionalLight(0xffffff, DIRECTIONAL_LIGHT_STRENGTH);
		this.directionalLight.position.set(
			center.x + maxDimPixels,
			center.y + maxDimPixels,
			center.z + maxDimPixels
		);
		this.directionalLight.target.position.copy(center);
		this.directionalLight.castShadow = options.shadowsEnabled;
		this.directionalLight.shadow.camera.near = 0.1;
		this.directionalLight.shadow.camera.far = maxDimPixels * 4;
		this.directionalLight.shadow.camera.left = -maxDimPixels;
		this.directionalLight.shadow.camera.right = maxDimPixels;
		this.directionalLight.shadow.camera.bottom = -maxDimPixels;
		this.directionalLight.shadow.camera.top = maxDimPixels;
		this.directionalLight.shadow.bias = -0.001;
		this.directionalLight.shadow.normalBias = 0.1;
		this.directionalLight.shadow.autoUpdate = false;
		scene.add(this.directionalLight);
		scene.add(this.directionalLight.target);
		this.setDirectionalLightPos();
		if (options.shadowsEnabled) {
			this.updateDirectionalLightShadowMapSize();
			this.#debugHelpers.push(new THREE.CameraHelper(this.directionalLight.shadow.camera));
		}

		const zLight1 = new THREE.DirectionalLight(0xffffff, 0.31);
		zLight1.position.set(
			center.x + maxDimPixels * 0.6,
			center.y + maxDimPixels,
			center.z + maxDimPixels * 3
		);
		zLight1.target.position.copy(center);
		scene.add(zLight1);
		scene.add(zLight1.target);
		const zLight2 = new THREE.DirectionalLight(0xffffff, 0.31);
		zLight2.position.set(
			center.x - maxDimPixels * 0.6,
			center.y + maxDimPixels,
			center.z - maxDimPixels * 3
		);
		zLight2.target.position.copy(center);
		scene.add(zLight2);
		scene.add(zLight2.target);
		this.#debugHelpers.push(
			new THREE.DirectionalLightHelper(zLight1, 5),
			new THREE.DirectionalLightHelper(zLight2, 5)
		);

		scene.add(new THREE.AmbientLight(0xffffff, 1.88));

		if (options.shadowsEnabled) {
			const shadowFloor = new THREE.Mesh(
				new THREE.PlaneGeometry(maxDimPixels * 5, maxDimPixels * 5),
				new THREE.ShadowMaterial({ opacity: FLOOR_SHADOW_DARKNESS })
			);
			shadowFloor.rotation.x = -pi / 2;
			shadowFloor.position.set(center.x, 0, center.z);
			shadowFloor.receiveShadow = true;
			scene.add(shadowFloor);
		}

		this.syncPointLightsInScene();
	}

	setDirectionalLightPos() {
		const options = this.ctx.options;
		const center = this.ctx.center;
		const maxDimPixels = this.ctx.maxDimPixels;
		if (!this.directionalLight) return;
		const lightSin = sinDeg(options.directionalLightAngle);
		const lightCos = cosDeg(options.directionalLightAngle);
		this.directionalLight.position.set(
			center.x + maxDimPixels * lightSin,
			center.y + maxDimPixels * options.directionalLightHeight,
			center.z + maxDimPixels * lightCos
		);
		this.directionalLight.shadow.needsUpdate = true;
	}

	updateDirectionalLightShadowMapSize() {
		if (!this.directionalLight) return;
		const options = this.ctx.options;
		const maxDim = this.ctx.maxDim;
		const optionsFactor = 2 ** (options.directionalLightShadowMapResolution - 2);
		const shadowMapSize = (maxDim < 24 ? 1024 : maxDim < 45 ? 2048 : 4096) * optionsFactor;
		this.directionalLight.shadow.mapSize.set(shadowMapSize, shadowMapSize);
		this.directionalLight.shadow.map?.setSize(shadowMapSize, shadowMapSize);
		this.directionalLight.shadow.needsUpdate = true;
	}

	/** Grow/shrink PointLight pool to options.maxPointLights. */
	syncPointLightsInScene() {
		const THREE = this.ctx.THREE;
		const scene = this.ctx.scene;
		const options = this.ctx.options;
		if (!THREE || !scene) return;
		const target = options.maxPointLights ?? 0;

		while (this.pointLightsInScene.length < target) {
			const light = new THREE.PointLight(0, 0, POINT_LIGHT_MAX_DISTANCE, 0.35);
			this.pointLightsInScene.push(light);
			scene.add(light);
			const helper = new THREE.PointLightHelper(light, POINT_LIGHT_MAX_DISTANCE);
			this.#debugHelpers.push(helper);
			this.#helpers.set(light, helper);
			if (options.debugHelpersVisible) scene.add(helper);
		}
		while (this.pointLightsInScene.length > target) {
			const light = this.pointLightsInScene.pop();
			scene.remove(light);
			const helper = this.#helpers.get(light);
			if (helper) {
				scene.remove(helper);
				const i = this.#debugHelpers.indexOf(helper);
				if (i >= 0) this.#debugHelpers.splice(i, 1);
			}
		}
	}

	/** Closest lights in frustum → assign to pooled PointLights. */
	updatePointLights() {
		const THREE = this.ctx.THREE;
		const camera = this.ctx.camera;
		const options = this.ctx.options;
		const maxLightsInScene = min(this.pointLights.length, options.maxPointLights ?? 0);
		if (maxLightsInScene === 0 || !THREE || !camera) return;

		const cameraPosVec = camera.getWorldPosition(new THREE.Vector3());
		const cameraPos = [cameraPosVec.x, cameraPosVec.y, cameraPosVec.z];
		const lightsInView = this.#getPointLightsInView();
		const closest = lightsInView
			.sort((a, b) => distanceSquared(a.pos, cameraPos) - distanceSquared(b.pos, cameraPos))
			.slice(0, options.maxPointLights);

		closest.forEach((lightInfo, i) => {
			const pl = this.pointLightsInScene[i];
			if (!pl) return;
			pl.visible = true;
			pl.position.set(...lightInfo.pos);
			pl.intensity = lightInfo.intensity;
			pl.color.copy(lightInfo.col);
		});
		for (let i = closest.length; i < maxLightsInScene; i++) {
			if (this.pointLightsInScene[i]) this.pointLightsInScene[i].intensity = 0;
		}
	}

	#getPointLightsInView() {
		const THREE = this.ctx.THREE;
		const camera = this.ctx.camera;
		const frustum = new THREE.Frustum();
		const projMatrix = new THREE.Matrix4();
		projMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
		frustum.setFromProjectionMatrix(projMatrix);
		return this.pointLights.filter(light => {
			const sphere = new THREE.Sphere(
				new THREE.Vector3(...light.pos),
				POINT_LIGHT_MAX_DISTANCE
			);
			return frustum.intersectsSphere(sphere);
		});
	}

	/**
	 * Skybox cubemap or solid clear color.
	 * @param {import("../PreviewResourcePool.js").default} pool
	 */
	async initBackground(pool) {
		const THREE = this.ctx.THREE;
		const scene = this.ctx.scene;
		const options = this.ctx.options;
		if (!THREE || !scene) return;
		if (options.showSkybox) {
			if (!pool.skyboxCubemap) {
				const loader = new THREE.CubeTextureLoader();
				loader.setPath("assets/previewPanorama/");
				pool.skyboxCubemap = await loader.loadAsync(
					[1, 3, 4, 5, 0, 2].map(x => `${x}.png`)
				);
			}
			scene.background = pool.skyboxCubemap;
		} else {
			scene.background = new THREE.Color(options.backgroundColor ?? 0x121214);
		}
	}

	setShadowsEnabled(enabled) {
		const scene = this.ctx.scene;
		if (this.directionalLight) this.directionalLight.castShadow = enabled;
		scene?.traverse(obj => {
			if (obj.isMesh || obj.isInstancedMesh) {
				obj.castShadow = enabled;
				obj.receiveShadow = enabled;
			}
		});
		if (enabled && this.directionalLight) {
			this.directionalLight.shadow.needsUpdate = true;
		}
	}

	dispose() {
		this.pointLightsInScene = [];
		this.pointLights = [];
		this.directionalLight = null;
		this.#debugHelpers = [];
		this.#helpers = new WeakMap();
	}
}

export {
	POINT_LIGHT_MAX_DISTANCE,
	POINT_LIGHT_DEFAULT_INTENSITY,
	DIRECTIONAL_LIGHT_STRENGTH
};
