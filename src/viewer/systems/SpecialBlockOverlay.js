/**
 * Overlays that need per-cell shape (not palette InstancedMesh):
 *  - sign face text planes
 *  - lectern open-book indicator
 */

import { disposeObject3D } from "./disposeObject3D.js";
import { geoPointToThree } from "../previewSpace.js";
import { signPlaneInstanceVerts } from "../signPlacement.js";
import { isOnActiveLayer } from "../layerVisibility.js";

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
				if (o.userData?.basiSpecialOverlay) remove.push(o);
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
		root.name = "basi-special-overlays";
		root.userData.basiSpecialOverlay = true;
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
	 * @param {number|null} layerFilter
	 */
	#addSignFaces(THREE, root, inspectIndex, layerFilter) {
		if (!inspectIndex?.blocks) return;
		for (const b of inspectIndex.blocks.values()) {
			const name = String(b.name || "").replace(/^minecraft:/, "");
			if (!name.includes("sign")) continue;
			if (!isOnActiveLayer(b.y, layerFilter)) continue;
			const sign = b.sign;
			if (!sign) continue;

			for (const { face, isBack } of [
				{ face: sign.front, isBack: false },
				{ face: sign.back, isBack: true }
			]) {
				const lines = face?.lines;
				if (!lines?.some(l => String(l).trim())) continue;
				root.add(this.#makeSignTextMesh(THREE, b, name, lines, face, isBack));
			}
		}
	}

	/**
	 * @param {typeof import("three")} THREE
	 * @param {{ x: number, y: number, z: number, states?: Record<string, unknown> }} b
	 * @param {string} name
	 * @param {string[]} lines
	 * @param {{ color?: number|null, glowing?: boolean }} face
	 * @param {boolean} isBack
	 */
	#makeSignTextMesh(THREE, b, name, lines, face, isBack) {
		const baseline = signPlaneInstanceVerts(b, name, isBack);
		const glowing = !!face.glowing;
		const tex = this.#makeTextTexture(THREE, lines, face.color, {
			glowing,
			outline: true
		});
		const mat = new THREE.MeshBasicMaterial({
			map: tex,
			transparent: true,
			side: THREE.FrontSide,
			depthWrite: true,
			alphaTest: 0.08,
			polygonOffset: true,
			polygonOffsetFactor: -2,
			polygonOffsetUnits: -2
		});
		if (glowing) mat.color?.setHex?.(0xffffee);

		const geo = new THREE.PlaneGeometry(1, 1);
		const mesh = new THREE.Mesh(geo, mat);
		writeSignPlaneVerts(mesh, baseline);
		mesh.renderOrder = 8;
		mesh.userData.basiSpecialOverlay = true;
		mesh.frustumCulled = false;
		return mesh;
	}

	/**
	 * @param {typeof import("three")} THREE
	 * @param {import("three").Group} root
	 * @param {import("../inspectStructure.js").InspectIndex} inspectIndex
	 * @param {number|null} layerFilter
	 */
	#addLecternBooks(THREE, root, inspectIndex, layerFilter) {
		if (!inspectIndex?.blocks) return;
		const bookMat = new THREE.MeshLambertMaterial({ color: 0xc4a574 });
		const pageMat = new THREE.MeshBasicMaterial({ color: 0xf5f0e6, side: THREE.DoubleSide });
		for (const b of inspectIndex.blocks.values()) {
			const name = String(b.name || "").replace(/^minecraft:/, "");
			if (name !== "lectern") continue;
			if (!isOnActiveLayer(b.y, layerFilter)) continue;
			const lec = b.lectern;
			if (!lec?.hasBook) continue;

			const g = new THREE.Group();
			const [tx, ty, tz] = geoPointToThree(b.x, b.y, b.z, 8, 14, 8);
			g.position.set(tx, ty, tz);

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
					{ w: 256, h: 320, font: "14px sans-serif", fill: "#222", outline: true }
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

			g.userData.basiSpecialOverlay = true;
			root.add(g);
		}
	}

	/**
	 * @param {typeof import("three")} THREE
	 * @param {string[]} lines
	 * @param {number|null} [argb]
	 * @param {{
	 *   w?: number,
	 *   h?: number,
	 *   font?: string,
	 *   fill?: string,
	 *   outline?: boolean,
	 *   glowing?: boolean
	 * }} [opts]
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
			if (r === 0 && g === 0 && b === 0) {
				fill = opts.glowing ? "#fff8e0" : "#2a2018";
			} else {
				fill = `rgb(${r},${g},${b})`;
			}
		}

		const glowing = !!opts.glowing;
		const doOutline = opts.outline !== false;
		c2d.font = opts.font || "bold 22px 'Segoe UI', sans-serif";
		c2d.textAlign = "center";
		c2d.textBaseline = "middle";
		c2d.lineJoin = "round";
		c2d.miterLimit = 2;

		const usable = lines.length ? lines : [""];
		const lineH = h / Math.max(usable.length, 4);

		usable.slice(0, 8).forEach((line, i) => {
			const text = String(line).slice(0, 42);
			const x = w / 2;
			const y = lineH * (i + 0.5);
			const maxW = w - 28;

			if (glowing) {
				c2d.save();
				c2d.shadowColor = fill;
				c2d.shadowBlur = 14;
				c2d.fillStyle = fill;
				c2d.globalAlpha = 0.85;
				c2d.fillText(text, x, y, maxW);
				c2d.shadowBlur = 6;
				c2d.fillText(text, x, y, maxW);
				c2d.restore();
			}

			if (doOutline) {
				c2d.strokeStyle = glowing ? "rgba(0,0,0,0.75)" : "rgba(0,0,0,0.92)";
				c2d.lineWidth = glowing ? 5.5 : 4;
				c2d.strokeText(text, x, y, maxW);
				c2d.strokeStyle = glowing
					? "rgba(255,250,220,0.55)"
					: "rgba(255,255,255,0.22)";
				c2d.lineWidth = glowing ? 2.2 : 1.5;
				c2d.strokeText(text, x, y, maxW);
			}

			c2d.fillStyle = glowing ? lightenCss(fill, 0.25) : fill;
			c2d.fillText(text, x, y, maxW);
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

/**
 * @param {import("three").Mesh} mesh
 * @param {{ origin: [number, number, number], verts: [number, number, number][] }} baked
 */
function writeSignPlaneVerts(mesh, baked) {
	const pos = mesh.geometry.attributes.position;
	for (let i = 0; i < 4; i++) {
		pos.setXYZ(i, baked.verts[i][0], baked.verts[i][1], baked.verts[i][2]);
	}
	pos.needsUpdate = true;
	mesh.geometry.computeVertexNormals();
	mesh.geometry.computeBoundingBox();
	mesh.geometry.computeBoundingSphere();
	mesh.position.set(baked.origin[0], baked.origin[1], baked.origin[2]);
}

/**
 * @param {typeof import("three")} THREE
 * @param {import("three").Object3D} markers
 * @param {ReturnType<typeof signPlaneInstanceVerts>} baked
 */
function lightenCss(css, amount) {
	const m = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(css);
	if (!m) return css;
	const lift = (c) => Math.min(255, Math.round(Number(c) + (255 - Number(c)) * amount));
	return `rgb(${lift(m[1])},${lift(m[2])},${lift(m[3])})`;
}
