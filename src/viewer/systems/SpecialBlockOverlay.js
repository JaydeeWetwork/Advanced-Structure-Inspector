/**
 * Overlays that need per-cell shape (not palette InstancedMesh):
 *  - sign face text planes
 *  - lectern open-book indicator
 * (Redstone neighbour walk removed — dust uses original power-tint plate only.)
 */

import { disposeObject3D } from "./disposeObject3D.js?v=judo14";
import { extractSignText, extractLecternBook } from "../inspectStructure.js";

export default class SpecialBlockOverlay {
	/** @type {import("three").Group|null} */
	#root = null;

	/**
	 * @param {import("./PreviewContext.js").default} ctx
	 */
	constructor(ctx) {
		this.ctx = ctx;
	}

	clear() {
		const scene = this.ctx.scene;
		const pool = this.ctx.pool;
		if (this.#root) {
			this.#root.parent?.remove(this.#root);
			disposeObject3D(this.#root, pool?.disposePolicy?.() ?? {});
			this.#root = null;
		}
		if (scene) {
			const remove = [];
			scene.traverse(o => {
				if (o.userData?.sdbSpecialOverlay) remove.push(o);
			});
			const policy = pool?.disposePolicy?.() ?? {};
			for (const o of remove) {
				o.parent?.remove(o);
				disposeObject3D(o, policy);
			}
		}
	}

	/**
	 * @param {object} args
	 * @param {import("../inspectStructure.js").InspectIndex|null} [args.inspectIndex]
	 * @param {number|null} [args.layerFilter]
	 */
	rebuild({ inspectIndex = null, layerFilter = null } = {}) {
		const THREE = this.ctx.THREE;
		const scene = this.ctx.scene;
		if (!THREE || !scene) return;

		this.clear();
		const root = new THREE.Group();
		root.name = "sdb-special-overlays";
		root.userData.sdbSpecialOverlay = true;
		this.#root = root;
		scene.add(root);

		if (inspectIndex) {
			this.#addSignFaces(THREE, root, inspectIndex, layerFilter);
			this.#addLecternBooks(THREE, root, inspectIndex, layerFilter);
		}
		this.ctx.requestRender();
	}

	/**
	 * @param {typeof import("three")} THREE
	 * @param {import("three").Group} root
	 * @param {import("../inspectStructure.js").InspectIndex} inspectIndex
	 */
	#addSignFaces(THREE, root, inspectIndex, layerFilter) {
		if (!inspectIndex?.blocks) return;
		for (const b of inspectIndex.blocks.values()) {
			const name = String(b.name || "").replace(/^minecraft:/, "");
			if (!name.includes("sign")) continue;
			if (layerFilter != null && Number.isFinite(layerFilter)) {
				const s = Math.floor(layerFilter);
				if (b.y !== s && !(s > 0 && b.y === s - 1)) continue;
			}
			const sign = extractSignText(b.blockEntity);
			if (!sign) continue;
			const lines = sign.front.lines;
			if (!lines.some(l => String(l).trim())) continue;

			const tex = this.#makeTextTexture(THREE, lines, sign.front.color);
			const mat = new THREE.MeshBasicMaterial({
				map: tex,
				transparent: true,
				side: THREE.DoubleSide,
				depthWrite: false
			});
			const mesh = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), mat);
			const bx = -16 * b.x - 8;
			const by = 16 * b.y + 10;
			const bz = -16 * b.z - 8;
			mesh.position.set(bx, by, bz);
			if (b.states?.facing_direction != null) {
				const fd = Number(b.states.facing_direction);
				const yaw = { 2: 0, 3: Math.PI, 4: Math.PI / 2, 5: -Math.PI / 2 }[fd] ?? 0;
				mesh.rotation.y = yaw;
			} else {
				const facing = Number(b.states?.ground_sign_direction ?? 0) || 0;
				mesh.rotation.y = -((facing / 16) * Math.PI * 2);
			}
			mesh.userData.sdbSpecialOverlay = true;
			root.add(mesh);
		}
	}

	/**
	 * @param {typeof import("three")} THREE
	 * @param {import("three").Group} root
	 * @param {import("../inspectStructure.js").InspectIndex} inspectIndex
	 */
	#addLecternBooks(THREE, root, inspectIndex, layerFilter) {
		if (!inspectIndex?.blocks) return;
		const bookMat = new THREE.MeshLambertMaterial({ color: 0xc4a574 });
		const pageMat = new THREE.MeshBasicMaterial({ color: 0xf5f0e6, side: THREE.DoubleSide });
		for (const b of inspectIndex.blocks.values()) {
			const name = String(b.name || "").replace(/^minecraft:/, "");
			if (name !== "lectern") continue;
			if (layerFilter != null && Number.isFinite(layerFilter)) {
				const s = Math.floor(layerFilter);
				if (b.y !== s && !(s > 0 && b.y === s - 1)) continue;
			}
			const lec = extractLecternBook(b.blockEntity);
			if (!lec?.hasBook) continue;

			const g = new THREE.Group();
			g.position.set(-16 * b.x - 8, 16 * b.y + 14, -16 * b.z - 8);

			const left = new THREE.Mesh(new THREE.BoxGeometry(5, 0.4, 7), pageMat);
			left.position.set(-2.5, 0, 0);
			left.rotation.z = 0.15;
			const right = new THREE.Mesh(new THREE.BoxGeometry(5, 0.4, 7), pageMat);
			right.position.set(2.5, 0, 0);
			right.rotation.z = -0.15;
			const cover = new THREE.Mesh(new THREE.BoxGeometry(11, 0.5, 7.5), bookMat);
			cover.position.set(0, -0.4, 0);
			g.add(left, right, cover);

			const pageText = lec.book?.pages?.[lec.page] || lec.book?.pages?.[0];
			if (pageText) {
				const tex = this.#makeTextTexture(
					THREE,
					String(pageText).split("\n").slice(0, 6),
					null,
					{ w: 256, h: 320, font: "14px sans-serif", fill: "#222" }
				);
				const pagePlane = new THREE.Mesh(
					new THREE.PlaneGeometry(4.5, 5.5),
					new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
				);
				pagePlane.position.set(2.5, 0.4, 0.1);
				pagePlane.rotation.z = -0.15;
				g.add(pagePlane);
			}

			if (typeof b.states?.minecraft_cardinal_direction === "string") {
				const c = b.states.minecraft_cardinal_direction;
				const yaw = { north: 0, south: Math.PI, west: Math.PI / 2, east: -Math.PI / 2 }[c] ?? 0;
				g.rotation.y = yaw;
			}

			g.userData.sdbSpecialOverlay = true;
			root.add(g);
		}
	}

	/**
	 * @param {typeof import("three")} THREE
	 * @param {string[]} lines
	 * @param {number|null} [argb]
	 * @param {{ w?: number, h?: number, font?: string, fill?: string }} [opts]
	 */
	#makeTextTexture(THREE, lines, argb = null, opts = {}) {
		const w = opts.w ?? 256;
		const h = opts.h ?? 128;
		const canvas = document.createElement("canvas");
		canvas.width = w;
		canvas.height = h;
		const c2d = canvas.getContext("2d");
		c2d.clearRect(0, 0, w, h);
		let fill = opts.fill || "#1a1010";
		if (argb != null && Number.isFinite(argb)) {
			const c = argb >>> 0;
			const r = (c >> 16) & 0xff;
			const g = (c >> 8) & 0xff;
			const b = c & 0xff;
			if (!(r === 0 && g === 0 && b === 0)) fill = `rgb(${r},${g},${b})`;
		}
		c2d.fillStyle = fill;
		c2d.font = opts.font || "bold 22px 'Segoe UI', sans-serif";
		c2d.textAlign = "center";
		c2d.textBaseline = "middle";
		const usable = lines.length ? lines : [""];
		const lineH = h / Math.max(usable.length, 4);
		usable.slice(0, 8).forEach((line, i) => {
			c2d.fillText(String(line).slice(0, 42), w / 2, lineH * (i + 0.5), w - 16);
		});
		const tex = new THREE.CanvasTexture(canvas);
		tex.colorSpace = THREE.SRGBColorSpace;
		tex.magFilter = THREE.LinearFilter;
		tex.minFilter = THREE.LinearFilter;
		return tex;
	}

	dispose() {
		this.clear();
	}
}
