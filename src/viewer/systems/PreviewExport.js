/**
 * Screenshot + GLB export for a live PreviewRenderer scene.
 */

import { downloadFile } from "../../utils/files.js";

/**
 * @param {import("three").WebGLRenderer} renderer
 * @param {string} packName
 * @param {() => void} [paintNow]
 */
export function downloadScreenshot(renderer, packName, paintNow) {
	paintNow?.();
	renderer.domElement.toBlob(imageBlob => {
		const imageFile = new File([imageBlob], `Screenshot ${packName}.png`);
		downloadFile(imageFile);
	});
}

/**
 * @param {object} args
 * @param {import("three").Scene} args.scene
 * @param {import("./BlockGeoSystem.js").default} args.geo
 * @param {string} args.packName
 */
export async function exportGlb({ scene, geo, packName }) {
	const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
	const exporter = new GLTFExporter();
	const exportReadyScene = geo.expandInstancedMeshes(scene);
	return new Promise((resolve, reject) => {
		exporter.parse(
			exportReadyScene,
			glbData => {
				const glbFile = new File([glbData], `${packName}.glb`, {
					type: "model/gltf-binary"
				});
				downloadFile(glbFile);
				resolve(glbFile);
			},
			e => {
				console.error("Error exporting GLB:", e);
				reject(e);
			},
			{ binary: true, trs: true }
		);
	});
}
