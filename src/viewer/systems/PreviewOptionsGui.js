/**
 * lil-gui option panel for PreviewRenderer (optional).
 */

/**
 * @param {object} args
 * @param {import("lil-gui").GUI} args.gui
 * @param {object} args.options PreviewRenderer.options
 * @param {object} args.owner methods: downloadScreenshot, exportGlb
 * @param {import("./LightingSystem.js").default} args.lighting
 * @param {import("three").WebGLRenderer} args.renderer
 * @param {import("three").Scene} args.scene
 * @param {import("three").Object3D[]} args.debugHelpers
 * @param {() => void} args.requestRender
 * @param {() => void} args.setSize
 * @param {import("../PreviewResourcePool.js").default} args.pool
 * @param {boolean} [args.inProduction]
 * @param {() => void} [args.rebuildOverlays]
 */
export function wirePreviewOptionsGui({
	gui,
	options,
	owner,
	lighting,
	renderer,
	scene,
	debugHelpers,
	requestRender,
	setSize,
	pool,
	inProduction = false
}) {
	const loc = (controller, key) => {
		controller.$name.dataset.translate = key;
		return controller;
	};

	if (lighting.pointLights.length > 0) {
		loc(
			gui.add(options, "maxPointLights", 0, lighting.pointLights.length, 1).onChange(() => {
				lighting.syncPointLightsInScene();
				requestRender();
			}),
			"preview.options.maxPointLights"
		);
	}

	let shadowOption;
	loc(
		gui.add(options, "shadowsEnabled").onChange(enabled => {
			renderer.shadowMap.enabled = enabled;
			lighting.setShadowsEnabled(enabled);
			if (enabled) shadowOption?.show();
			else shadowOption?.hide();
			requestRender();
		}),
		"preview.options.shadowsEnabled"
	);
	shadowOption = loc(
		gui.add(options, "directionalLightShadowMapResolution", 1, 5, 1).onChange(() => {
			lighting.updateDirectionalLightShadowMapSize();
			requestRender();
		}),
		"preview.options.shadowQuality"
	);
	if (!options.shadowsEnabled) shadowOption.hide();

	loc(
		gui.add(options, "directionalLightAngle", 0, 360, 1).onChange(() => {
			lighting.setDirectionalLightPos();
			requestRender();
		}),
		"preview.options.lightAngle"
	);
	loc(
		gui.add(options, "directionalLightHeight", 0.1, 2, 0.01).onChange(() => {
			lighting.setDirectionalLightPos();
			requestRender();
		}),
		"preview.options.lightHeight"
	);
	loc(
		gui.add(options, "showSkybox").onChange(async () => {
			await lighting.initBackground(pool);
			requestRender();
		}),
		"preview.options.showSkybox"
	);
	loc(
		gui.add(options, "highResolution").onChange(() => {
			setSize();
			requestRender();
		}),
		"preview.options.highRes"
	);
	loc(gui.add(owner, "downloadScreenshot"), "preview.options.takeScreenshot");
	loc(gui.add(owner, "exportGlb"), "preview.options.exportGlb");

	if (!inProduction) {
		gui.add(options, "debugHelpersVisible")
			.onChange(() => {
				if (options.debugHelpersVisible) scene.add(...debugHelpers);
				else scene.remove(...debugHelpers);
				requestRender();
			})
			.name("Debug");
	}
	gui.show();
}
