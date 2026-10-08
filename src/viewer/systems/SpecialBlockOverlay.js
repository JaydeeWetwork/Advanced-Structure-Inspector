/**
 * Overlays that need per-cell shape (not palette InstancedMesh):
 *  - sign face text planes
 *  - lectern open-book indicator
 */

import { disposeObject3D } from "./disposeObject3D.js";
import { geoPointToThree } from "../previewSpace.js";
import { signPlaneInstanceVerts } from "../signPlacement.js";
import { isOnActiveLayer } from "../layerVisibility.js";
import { parseSignStyleRuns, parseSignTextLines, signArgbCss } from "../inspectStructure.js";

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
				if (o.userData?.bLayersSpecialOverlay) remove.push(o);
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
		root.name = "bLayers-special-overlays";
		root.userData.bLayersSpecialOverlay = true;
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
				if (!face?.lines?.some(l => String(l).trim())) continue;
				const lines = face.raw
					? parseSignTextLines(face.raw, true)
					: face.lines;
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
		const tex = this.#makeTextTexture(THREE, lines, face.color, { glowing });
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

		const geo = new THREE.PlaneGeometry(1, 1);
		const mesh = new THREE.Mesh(geo, mat);
		writeSignPlaneVerts(mesh, baseline);
		mesh.renderOrder = 8;
		mesh.userData.bLayersSpecialOverlay = true;
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

			g.userData.bLayersSpecialOverlay = true;
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

		const base = opts.fill || signArgbCss(argb, !!opts.glowing);
		const glowing = !!opts.glowing;
		const doOutline = opts.outline === true || glowing;
		c2d.textBaseline = "middle";
		c2d.lineJoin = "round";
		c2d.miterLimit = 2;

		const usable = lines.length ? lines : [""];
		const lineH = h / Math.max(usable.length, 4);

		usable.slice(0, 8).forEach((line, i) => {
			const runs = parseSignStyleRuns(String(line).slice(0, 80), base);
			const y = lineH * (i + 0.5);
			const widths = runs.map(run => {
				c2d.font = opts.font || `${run.italic ? "italic " : ""}bold 22px 'Segoe UI', sans-serif`;
				return c2d.measureText(run.text).width;
			});
			const total = widths.reduce((sum, n) => sum + n, 0);
			let x = Math.max(8, (w - total) / 2);
			runs.forEach((run, ri) => {
				c2d.font = opts.font || `${run.italic ? "italic " : ""}bold 22px 'Segoe UI', sans-serif`;
				if (doOutline) {
					c2d.strokeStyle = "rgba(12,10,8,0.9)";
					c2d.lineWidth = glowing ? 5 : 3;
					c2d.strokeText(run.text, x, y);
					if (glowing) {
						c2d.shadowColor = run.color;
						c2d.shadowBlur = 10;
					}
				}
				c2d.fillStyle = run.color;
				c2d.fillText(run.text, x, y);
				c2d.shadowBlur = 0;
				x += widths[ri];
			});
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

