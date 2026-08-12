/**
 * First-person fly: WASD + Space/Shift + pointer look.
 * Owned by CameraController; talks to PreviewContext only.
 */

export default class FlyController {
	enabled = false;
	#keys = { w: false, a: false, s: false, d: false, space: false, shift: false };
	#yaw = 0;
	#pitch = 0;
	#lookDragging = false;
	#lastX = 0;
	#lastY = 0;
	/** @type {((e: KeyboardEvent) => void)|null} */
	#onKeyDown = null;
	/** @type {((e: KeyboardEvent) => void)|null} */
	#onKeyUp = null;
	/** @type {((e: PointerEvent) => void)|null} */
	#onPointerDown = null;
	/** @type {((e: PointerEvent) => void)|null} */
	#onPointerMove = null;
	/** @type {((e: PointerEvent) => void)|null} */
	#onPointerUp = null;
	/** @type {(() => void)|null} */
	#onBlur = null;

	/**
	 * @param {import("./PreviewContext.js").default} ctx
	 */
	constructor(ctx) {
		this.ctx = ctx;
	}

	get isActive() {
		return this.enabled;
	}

	/**
	 * @param {boolean} on
	 */
	setEnabled(on) {
		const enabled = !!on;
		const { THREE, camera, controls } = this.ctx;
		if (enabled === this.enabled) {
			if (enabled) this.syncAnglesFromCamera();
			return;
		}
		this.enabled = enabled;
		if (controls) controls.enabled = !enabled;
		if (enabled) {
			camera?.up?.set?.(0, 1, 0);
			this.syncAnglesFromCamera();
			this.#bind();
			this.ctx.requestRender();
		} else {
			this.#unbind();
			this.#lookDragging = false;
			this.#keys = { w: false, a: false, s: false, d: false, space: false, shift: false };
			if (camera && controls && THREE) {
				const forward = new THREE.Vector3();
				camera.getWorldDirection(forward);
				const dist = Math.max(40, this.ctx.maxDimPixels * 0.35);
				controls.target.copy(camera.position).addScaledVector(forward, dist);
				controls.update();
			}
		}
	}

	syncAnglesFromCamera() {
		const { THREE, camera } = this.ctx;
		if (!camera || !THREE) return;
		const e = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
		this.#yaw = e.y;
		this.#pitch = e.x;
		const maxP = Math.PI / 2 - 0.05;
		this.#pitch = Math.max(-maxP, Math.min(maxP, this.#pitch));
	}

	applyOrientation() {
		const { THREE, camera } = this.ctx;
		if (!camera || !THREE) return;
		camera.up.set(0, 1, 0);
		camera.quaternion.setFromEuler(new THREE.Euler(this.#pitch, this.#yaw, 0, "YXZ"));
	}

	/**
	 * @param {number} dtSec
	 * @returns {boolean}
	 */
	tick(dtSec) {
		const { THREE, camera } = this.ctx;
		if (!this.enabled || !camera || !THREE) return false;
		const k = this.#keys;
		const moving = k.w || k.a || k.s || k.d || k.space || k.shift;
		if (!moving) return false;

		const base = Math.max(48, this.ctx.maxDimPixels * 0.55);
		const speed = base * Math.min(dtSec, 0.05);
		const forward = new THREE.Vector3();
		camera.getWorldDirection(forward);
		const forwardH = new THREE.Vector3(forward.x, 0, forward.z);
		if (forwardH.lengthSq() < 1e-8) {
			forwardH.set(-Math.sin(this.#yaw), 0, -Math.cos(this.#yaw));
		}
		forwardH.normalize();
		const right = new THREE.Vector3()
			.crossVectors(forwardH, new THREE.Vector3(0, 1, 0))
			.normalize();

		const delta = new THREE.Vector3();
		const forwardFull = forward.clone().normalize();
		if (k.w) delta.add(forwardFull);
		if (k.s) delta.sub(forwardFull);
		if (k.d) delta.add(right);
		if (k.a) delta.sub(right);
		if (k.space) delta.y += 1;
		if (k.shift) delta.y -= 1;

		if (delta.lengthSq() > 1e-8) {
			delta.normalize().multiplyScalar(speed);
			camera.position.add(delta);
		}
		return true;
	}

	needsLoop() {
		if (!this.enabled) return false;
		const k = this.#keys;
		return !!(k.w || k.a || k.s || k.d || k.space || k.shift || this.#lookDragging);
	}

	#isTypingTarget(el) {
		if (!el || !(el instanceof Element)) return false;
		const tag = el.tagName;
		if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
		if (/** @type {HTMLElement} */ (el).isContentEditable) return true;
		return false;
	}

	#preventContext = e => {
		if (this.enabled) e.preventDefault();
	};

	#bind() {
		if (this.#onKeyDown) return;
		const can = this.ctx.canvas;
		this.#onKeyDown = e => {
			if (this.ctx.isDisposed() || !this.enabled) return;
			if (this.#isTypingTarget(e.target)) return;
			const k = e.code;
			let handled = true;
			if (k === "KeyW") this.#keys.w = true;
			else if (k === "KeyA") this.#keys.a = true;
			else if (k === "KeyS") this.#keys.s = true;
			else if (k === "KeyD") this.#keys.d = true;
			else if (k === "Space") this.#keys.space = true;
			else if (k === "ShiftLeft" || k === "ShiftRight") this.#keys.shift = true;
			else handled = false;
			if (handled) {
				e.preventDefault();
				this.ctx.requestRender();
			}
		};
		this.#onKeyUp = e => {
			if (this.ctx.isDisposed()) return;
			const k = e.code;
			let handled = true;
			if (k === "KeyW") this.#keys.w = false;
			else if (k === "KeyA") this.#keys.a = false;
			else if (k === "KeyS") this.#keys.s = false;
			else if (k === "KeyD") this.#keys.d = false;
			else if (k === "Space") this.#keys.space = false;
			else if (k === "ShiftLeft" || k === "ShiftRight") this.#keys.shift = false;
			else handled = false;
			if (handled && this.enabled) this.ctx.requestRender();
		};
		this.#onPointerDown = e => {
			if (this.ctx.isDisposed() || !this.enabled || !can) return;
			if (e.button !== 0 && e.button !== 2) return;
			this.#lookDragging = true;
			this.#lastX = e.clientX;
			this.#lastY = e.clientY;
			try {
				can.setPointerCapture?.(e.pointerId);
			} catch {
				/* ignore */
			}
			e.preventDefault();
		};
		this.#onPointerMove = e => {
			if (!this.#lookDragging || !this.enabled) return;
			const dx = e.clientX - this.#lastX;
			const dy = e.clientY - this.#lastY;
			this.#lastX = e.clientX;
			this.#lastY = e.clientY;
			const sens = 0.005;
			this.#yaw -= dx * sens;
			this.#pitch -= dy * sens;
			const maxP = Math.PI / 2 - 0.05;
			this.#pitch = Math.max(-maxP, Math.min(maxP, this.#pitch));
			this.applyOrientation();
			this.ctx.requestRender();
		};
		this.#onPointerUp = e => {
			if (!this.#lookDragging) return;
			this.#lookDragging = false;
			try {
				this.ctx.canvas?.releasePointerCapture?.(e.pointerId);
			} catch {
				/* ignore */
			}
		};
		this.#onBlur = () => {
			this.#keys = { w: false, a: false, s: false, d: false, space: false, shift: false };
			this.#lookDragging = false;
		};
		window.addEventListener("keydown", this.#onKeyDown, true);
		window.addEventListener("keyup", this.#onKeyUp, true);
		window.addEventListener("blur", this.#onBlur);
		can?.addEventListener("pointerdown", this.#onPointerDown);
		window.addEventListener("pointermove", this.#onPointerMove);
		window.addEventListener("pointerup", this.#onPointerUp);
		can?.addEventListener("contextmenu", this.#preventContext);
	}

	#unbind() {
		const can = this.ctx.canvas;
		if (this.#onKeyDown) {
			window.removeEventListener("keydown", this.#onKeyDown, true);
			this.#onKeyDown = null;
		}
		if (this.#onKeyUp) {
			window.removeEventListener("keyup", this.#onKeyUp, true);
			this.#onKeyUp = null;
		}
		if (this.#onBlur) {
			window.removeEventListener("blur", this.#onBlur);
			this.#onBlur = null;
		}
		if (this.#onPointerDown) {
			can?.removeEventListener("pointerdown", this.#onPointerDown);
			this.#onPointerDown = null;
		}
		if (this.#onPointerMove) {
			window.removeEventListener("pointermove", this.#onPointerMove);
			this.#onPointerMove = null;
		}
		if (this.#onPointerUp) {
			window.removeEventListener("pointerup", this.#onPointerUp);
			this.#onPointerUp = null;
		}
		can?.removeEventListener("contextmenu", this.#preventContext);
	}

	dispose() {
		this.setEnabled(false);
		this.#unbind();
	}
}
