/**
 * Create PerspectiveCamera + OrbitControls framed on the structure AABB.
 */

import { tanDeg } from "../../utils/math.js";

const DEFAULT_FOV = 70;

/**
 * @param {object} args
 * @param {typeof import("three")} args.THREE
 * @param {typeof import("three/examples/jsm/controls/OrbitControls.js").OrbitControls} args.OrbitControls
 * @param {HTMLCanvasElement} args.canvas
 * @param {[number,number,number]} args.structureSize
 * @param {number} args.maxDimPixels
 * @param {boolean} [args.enableDamping]
 * @param {number} [args.fov]
 * @returns {{ camera: import("three").PerspectiveCamera, controls: import("three").OrbitControls, axesHelper: import("three").AxesHelper }}
 */
export function createOrbitCameraAndControls({
	THREE,
	OrbitControls,
	canvas,
	structureSize,
	maxDimPixels,
	enableDamping = true,
	fov = DEFAULT_FOV
}) {
	const controlsMaxDist = (maxDimPixels / tanDeg(fov / 2)) * 5;
	const camera = new THREE.PerspectiveCamera(fov, 1, 1, controlsMaxDist * 1.25);
	const controls = new OrbitControls(camera, canvas);
	controls.minDistance = 10;
	controls.maxDistance = controlsMaxDist;
	controls.enableDamping = enableDamping;
	controls.dampingFactor = 0.1;

	const scale = 1.7;
	const boundingBox = new THREE.Box3(
		new THREE.Vector3(structureSize[0] * -16, 0, structureSize[2] * -16),
		new THREE.Vector3(0, structureSize[1] * 16, 0)
	);
	const boundingSphere = boundingBox.getBoundingSphere(new THREE.Sphere());
	const objectAngularSize = camera.fov * scale;
	const distanceToCamera = boundingSphere.radius / tanDeg(objectAngularSize / 2);
	const len = distanceToCamera * Math.SQRT2;
	camera.position.set(len, len, len);
	camera.lookAt(boundingSphere.center);
	camera.updateProjectionMatrix();
	controls.target.copy(boundingSphere.center);

	const axesHelper = new THREE.AxesHelper(16);
	return { camera, controls, axesHelper };
}

/**
 * Wire orbit interactions: free-camera on real drag, damp snap, pointer redraws.
 * @param {object} args
 * @param {import("three").OrbitControls} args.controls
 * @param {import("three").PerspectiveCamera} args.camera
 * @param {HTMLCanvasElement} args.canvas
 * @param {() => object} args.getOptions
 * @param {() => number} args.getLastFrameTime
 * @param {import("./CameraController.js").default} args.cameraCtrl
 * @param {() => void} args.requestRender
 */
export function bindOrbitInteraction({
	controls,
	camera,
	canvas,
	getOptions,
	getLastFrameTime,
	cameraCtrl,
	requestRender
}) {
	const { abs } = Math;
	controls.addEventListener("start", () => {
		const cam = controls.object || camera;
		cameraCtrl.orbitSnapshot = {
			pos: cam.position.clone(),
			target: controls.target.clone()
		};
	});
	controls.addEventListener("end", () => {
		const snap = cameraCtrl.orbitSnapshot;
		cameraCtrl.orbitSnapshot = null;
		if (!snap) return;
		const cam = controls.object || camera;
		if (canvas?.dataset?.basiSuppressOrbit === "1") {
			cam.position.copy(snap.pos);
			controls.target.copy(snap.target);
			controls.update();
			requestRender();
			return;
		}
		const moved =
			cam.position.distanceTo(snap.pos) > 0.35
			|| controls.target.distanceTo(snap.target) > 0.35;
		if (moved) cameraCtrl.enterFreeCamera();
	});
	controls.addEventListener("change", () => {
		requestRender();
		if (!getOptions().enableDamping) return;
		// Snap tiny spherical deltas so the RAF loop can idle
		const epsilon = 0.001;
		const last = typeof getLastFrameTime === "function" ? getLastFrameTime() : 0;
		const fps = 1000 / Math.max(performance.now() - last, 8);
		const effectiveEpsilon = (epsilon * 60) / Math.max(fps, 1);
		if (abs(controls._sphericalDelta.phi) < effectiveEpsilon) {
			controls._sphericalDelta.phi = 0;
		}
		if (abs(controls._sphericalDelta.theta) < effectiveEpsilon) {
			controls._sphericalDelta.theta = 0;
		}
	});
	canvas.addEventListener("pointerdown", () => requestRender());
	canvas.addEventListener("wheel", () => requestRender(), { passive: true });
	canvas.addEventListener("dblclick", e => {
		e.preventDefault();
	});
}

/**
 * @param {import("three").WebGLRenderer} renderer
 */
export function isWeakGpu(renderer) {
	const gl = renderer.getContext();
	return (
		gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS) <= 1024
		|| gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS) <= 256
	);
}

export { DEFAULT_FOV };
