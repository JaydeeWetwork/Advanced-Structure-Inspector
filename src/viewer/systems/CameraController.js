/**
 * Orbit presets, tilt, free mode; fly delegated to FlyController.
 * Uses PreviewContext only (never host-getter bags).
 */

import FlyController from "./FlyController.js";

export default class CameraController {
	/** @type {string} */
	lastPreset = "iso";
	/** @type {number} */
	tiltDeg = 67;
	/** Snapshot at orbit start */
	orbitSnapshot = null;
	/** @type {FlyController} */
	#fly;
	/** @type {import("three").Vector3|null} */
	#facingDir = null;

	/**
	 * @param {import("./PreviewContext.js").default} ctx
	 */
	constructor(ctx) {
		this.ctx = ctx;
		this.#fly = new FlyController(ctx);
	}

	get flyMode() {
		return this.#fly.enabled;
	}

	get isFlyMode() {
		return this.#fly.isActive;
	}

	emitFacing() {
		const camera = this.ctx.camera;
		const THREE = this.ctx.THREE;
		if (!camera || !THREE) return;
		this.#facingDir ??= new THREE.Vector3();
		camera.getWorldDirection(this.#facingDir);
		const d = this.#facingDir;
		try {
			this.ctx.eventTarget?.dispatchEvent?.(
				new CustomEvent("basi-camera-facing", {
					bubbles: true,
					detail: { x: d.x, y: d.y, z: d.z }
				})
			);
		} catch {
			/* ignore */
		}
	}

	/** @param {string} preset */
	emitPreset(preset) {
		try {
			const target = this.ctx.eventTarget;
			target?.dispatchEvent?.(
				new CustomEvent("basi-camera-preset", {
					bubbles: true,
					detail: { preset, tilt: this.tiltDeg }
				})
			);
		} catch {
			/* ignore */
		}
		this.emitFacing();
	}

	enterFreeCamera() {
		if (this.#fly.enabled) return;
		if (this.lastPreset === "free") return;
		this.lastPreset = "free";
		this.emitPreset("free");
	}

	/**
	 * Entering layer mode: default N @ 67°.
	 */
	enterLayerMode() {
		this.tiltDeg = 67;
		this.lastPreset = "north";
		this.setPreset("north");
	}

	/**
	 * Leaving layer mode: restore non-layer preset (or iso).
	 * @param {string} [prevPreset]
	 */
	leaveLayerMode(prevPreset) {
		if (this.lastPreset === "free") return;
		const p =
			prevPreset === "layer" || this.lastPreset === "layer"
				? "iso-north"
				: prevPreset || this.lastPreset || "iso-north";
		const next = p === "iso" ? "iso-north" : p;
		this.setPreset(next);
	}

	/**
	 * Stay in layer mode: re-apply last framed preset (not free).
	 */
	stayInLayerMode() {
		if (this.lastPreset === "free") return;
		const p = this.lastPreset || "north";
		this.setPreset(p === "iso" ? "north" : p);
	}

	/**
	 * @param {boolean} enabled
	 */
	setFlyMode(enabled) {
		this.#fly.setEnabled(enabled);
		if (enabled) this.lastPreset = "fly";
	}

	tickFly(dtSec) {
		return this.#fly.tick(dtSec);
	}

	flyNeedsLoop() {
		return this.#fly.needsLoop();
	}

	/**
	 * @param {number} deg
	 * @param {{ reframe?: boolean }} [opts]
	 */
	setTilt(deg, opts = {}) {
		const d = Number(deg);
		if (!Number.isFinite(d)) return this.tiltDeg;
		this.tiltDeg = Math.max(0, Math.min(85, d));
		const reframe = opts.reframe !== false;
		const p = this.lastPreset;
		if (reframe && (p === "north" || p === "south" || p === "east" || p === "west")) {
			this.setPreset(p);
		}
		return this.tiltDeg;
	}

	/**
	 * @param {import("three").Box3} box
	 * @param {import("three").Vector3} dirFromCenter
	 * @param {number} [padding]
	 */
	fitDistanceForBox(box, dirFromCenter, padding = 1.06) {
		const THREE = this.ctx.THREE;
		const camera = this.ctx.camera;
		const center = box.getCenter(new THREE.Vector3());
		const forward = dirFromCenter.clone().normalize().negate();
		let up = new THREE.Vector3(0, 1, 0);
		if (Math.abs(forward.dot(up)) > 0.98) {
			up = new THREE.Vector3(0, 0, 1);
		}
		const right = new THREE.Vector3().crossVectors(up, forward).normalize();
		const camUp = new THREE.Vector3().crossVectors(forward, right).normalize();
		const corners = this.#boxCorners(box);
		let maxRight = 0;
		let maxUp = 0;
		for (const p of corners) {
			const v = p.clone().sub(center);
			maxRight = Math.max(maxRight, Math.abs(v.dot(right)));
			maxUp = Math.max(maxUp, Math.abs(v.dot(camUp)));
		}
		const vFov = (camera.fov * Math.PI) / 180;
		const aspect = Math.max(camera.aspect || 1, 0.01);
		const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
		const minAlongView = Math.min(
			...corners.map(p => p.clone().sub(center).dot(forward))
		);
		const tanH = Math.tan(hFov / 2);
		const tanV = Math.tan(vFov / 2);
		const distH = maxRight / Math.max(tanH, 1e-6) - minAlongView;
		const distV = maxUp / Math.max(tanV, 1e-6) - minAlongView;
		const dist = Math.max(distH, distV, 12) * padding;
		return { dist, center };
	}

	#boxCorners(box) {
		const THREE = this.ctx.THREE;
		const { min, max } = box;
		return [
			new THREE.Vector3(min.x, min.y, min.z),
			new THREE.Vector3(min.x, min.y, max.z),
			new THREE.Vector3(min.x, max.y, min.z),
			new THREE.Vector3(min.x, max.y, max.z),
			new THREE.Vector3(max.x, min.y, min.z),
			new THREE.Vector3(max.x, min.y, max.z),
			new THREE.Vector3(max.x, max.y, min.z),
			new THREE.Vector3(max.x, max.y, max.z)
		];
	}

	/** Force OrbitControls internal spherical to match current camera pose. */
	#syncControlsFromCamera() {
		const controls = this.ctx.controls;
		const camera = this.ctx.camera;
		if (!controls || !camera) return;
		// Zero residual deltas so update() doesn't undo our pose
		if (controls._sphericalDelta) {
			controls._sphericalDelta.set?.(0, 0, 0);
		}
		if (controls._panOffset?.set) controls._panOffset.set(0, 0, 0);
		// update() reads offset from camera→target then writes back
		try {
			controls.update();
		} catch {
			/* ignore */
		}
	}

	/**
	 * Immediate paint after camera move.
	 */
	#paint() {
		this.ctx.requestRender();
		this.ctx.viewport?.paintNow?.();
	}

	/**
	 * @param {string} [preset]
	 * @returns {boolean} true if camera was updated
	 */
	setPreset(preset = "iso") {
		const THREE = this.ctx?.THREE;
		const camera = this.ctx?.camera;
		const controls = this.ctx?.controls;
		if (!camera || !controls || !THREE) {
			console.warn("[basi] setPreset: camera not ready", {
				hasCamera: !!camera,
				hasControls: !!controls,
				hasTHREE: !!THREE,
				preset,
				hasCtx: !!this.ctx
			});
			return false;
		}

		this.ctx.fitCanvasToHost();

		if (preset === "free") {
			this.setFlyMode(false);
			this.lastPreset = "free";
			this.emitPreset("free");
			this.#paint();
			return true;
		}

		if (preset === "fly") {
			this.lastPreset = "fly";
			camera.up.set(0, 1, 0);
			if (!this.#fly.enabled) {
				const b = this.ctx.boundsForLayer(this.ctx.selectedLayer);
				const center = b.getCenter(new THREE.Vector3());
				const dist = camera.position.distanceTo(center);
				if (dist < 8 || dist > this.ctx.maxDimPixels * 8) {
					const r = Math.max(b.getSize(new THREE.Vector3()).length() * 0.4, 48);
					camera.position.set(
						center.x + r * 0.6,
						center.y + r * 0.35,
						center.z + r * 0.6
					);
				}
				camera.lookAt(center);
				controls.target.copy(center);
			}
			this.setFlyMode(true);
			this.#fly.applyOrientation();
			this.emitPreset("fly");
			this.#paint();
			return true;
		}

		this.setFlyMode(false);
		this.lastPreset = preset;
		const layer = this.ctx.selectedLayer;
		const b =
			layer != null || preset === "layer"
				? this.ctx.boundsForLayer(layer ?? 0)
				: this.ctx.boundsForLayer(null);

		const center = b.getCenter(new THREE.Vector3());
		const size = b.getSize(new THREE.Vector3());
		const radius = Math.max(size.length() * 0.5, 16);
		const maxDim = this.ctx.maxDimPixels || 256;

		camera.up.set(0, 1, 0);

		if (preset === "top") {
			camera.up.set(0, 0, -1);
			const vFov = (camera.fov * Math.PI) / 180;
			const aspect = Math.max(camera.aspect || 1, 0.01);
			const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
			const halfX = Math.max(size.x * 0.5, 8);
			const halfZ = Math.max(size.z * 0.5, 8);
			const dist =
				Math.max(halfX / Math.tan(hFov / 2), halfZ / Math.tan(vFov / 2), 20) * 1.04;
			camera.position.set(center.x + 0.001, center.y + dist, center.z);
			camera.lookAt(center);
			camera.near = Math.max(0.1, dist / 500);
			camera.far = Math.max(dist * 10, maxDim * 10);
			camera.updateProjectionMatrix();
			controls.target.copy(center);
			controls.minDistance = Math.max(4, radius * 0.06);
			controls.maxDistance = Math.max(dist * 5, maxDim * 6);
			controls.minPolarAngle = 0.001;
			controls.maxPolarAngle = Math.PI - 0.001;
			this.#syncControlsFromCamera();
			this.emitPreset("top");
			this.#paint();
			return true;
		}

		const tilt = (this.tiltDeg * Math.PI) / 180;
		const cosT = Math.cos(tilt);
		const sinT = Math.sin(tilt);

		/** @type {import("three").Vector3} */
		let dir;
		let pad = 1.04;
		let zoom = 1;
		switch (preset) {
			case "north":
				dir = new THREE.Vector3(0, sinT, -cosT);
				pad = 1.03;
				break;
			case "south":
				dir = new THREE.Vector3(0, sinT, cosT);
				pad = 1.03;
				break;
			case "east":
				dir = new THREE.Vector3(cosT, sinT, 0);
				pad = 1.03;
				break;
			case "west":
				dir = new THREE.Vector3(-cosT, sinT, 0);
				pad = 1.03;
				break;
			case "layer":
				dir = new THREE.Vector3(1, 0.85, 1);
				pad = 1.0;
				zoom = 0.92;
				break;
			case "iso-north":
				dir = new THREE.Vector3(0.5, 0.72, -1);
				pad = 0.96;
				zoom = 0.686;
				break;
			case "iso-south":
				dir = new THREE.Vector3(-0.5, 0.72, 1);
				pad = 0.96;
				zoom = 0.686;
				break;
			case "iso-east":
				dir = new THREE.Vector3(1, 0.72, 0.5);
				pad = 0.96;
				zoom = 0.686;
				break;
			case "iso-west":
				dir = new THREE.Vector3(-1, 0.72, -0.5);
				pad = 0.96;
				zoom = 0.686;
				break;
			case "iso":
			case "default":
			default:
				dir = new THREE.Vector3(0.5, 0.72, -1);
				pad = 0.96;
				zoom = 0.686;
				break;
		}
		if (dir.lengthSq() < 1e-8) dir.set(1, 1, 1);
		dir.normalize();

		let { dist } = this.fitDistanceForBox(b, dir, pad);
		dist = Math.max(dist * zoom, 8);

		camera.position.copy(center).addScaledVector(dir, dist);
		camera.lookAt(center);
		camera.near = Math.max(0.1, dist / 500);
		camera.far = Math.max(dist * 10, maxDim * 10);
		camera.updateProjectionMatrix();
		controls.target.copy(center);
		controls.minDistance = Math.max(4, radius * 0.05);
		controls.maxDistance = Math.max(dist * 5, maxDim * 6);
		controls.minPolarAngle = 0.001;
		controls.maxPolarAngle = Math.PI - 0.001;
		this.#syncControlsFromCamera();
		this.emitPreset(preset);
		this.#paint();
		return true;
	}

	resetCamera() {
		const layer = this.ctx.selectedLayer;
		const p =
			this.lastPreset === "free"
				? layer != null
					? "layer"
					: "iso-north"
				: this.lastPreset || (layer != null ? "layer" : "iso-north");
		this.setPreset(p);
	}

	dispose() {
		this.#fly.dispose();
	}
}
