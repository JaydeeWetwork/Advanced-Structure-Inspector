/**
 * Overlays that need per-cell shape (not palette InstancedMesh):
 *  - sign face text planes (aligned to blockShapeGeos sign boards)
 *  - lectern open-book indicator
 * (Redstone neighbour walk removed — dust uses original power-tint plate only.)
 */

import { disposeObject3D } from "./disposeObject3D.js?v=judo17";
import { structurePosToThree } from "../entityMeshes.js?v=judo17";
import { applyBlockGeoEuler } from "../itemFrameItems.js?v=judo17";
import { extractSignText, extractLecternBook } from "../inspectStructure.js";

/** Wall-sign board center in 0–16 geo (template_wall_sign). */
const WALL_BOARD = { x: 8, y: 8.125, z: 15, w: 14, h: 6.5 };
/** Standing-sign board center (template_standing_sign plaque). */
const STAND_BOARD = { x: 8, y: 12.125, z: 8, w: 14, h: 6.5 };
/** Push text slightly off the wood face (geo units). */
const TEXT_LIFT = 0.35;

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

			const faces = [
				{ face: sign.front, isBack: false },
				{ face: sign.back, isBack: true }
			];
			for (const { face, isBack } of faces) {
				const lines = face?.lines;
				if (!lines?.some(l => String(l).trim())) continue;
				const mesh = this.#makeSignTextMesh(THREE, b, name, lines, face, isBack);
				if (mesh) root.add(mesh);
			}
		}
	}

	/**
	 * Place a text plane on the sign board using the same geo→three path as item frames.
	 * @param {typeof import("three")} THREE
	 * @param {{ x: number, y: number, z: number, states?: Record<string, unknown> }} b
	 * @param {string} name
	 * @param {string[]} lines
	 * @param {{ color?: number|null, glowing?: boolean }} face
	 * @param {boolean} isBack
	 */
	#makeSignTextMesh(THREE, b, name, lines, face, isBack) {
		const isWall =
			/wall_?sign/i.test(name)
			|| (b.states?.facing_direction != null && b.states?.ground_sign_direction == null
				&& !/hanging/i.test(name));
		const isHanging = /hanging/i.test(name);
		const isStanding = !isWall && !isHanging;

		const board = isStanding ? STAND_BOARD : WALL_BOARD;
		// Wall board sits on +Z edge; room-side (front) is −Z. Standing front is +Z (south @ dir 0).
		// Half thickness of board plate is 0.75 geo units.
		const halfT = 0.75;
		let localZ;
		if (isStanding) {
			localZ = board.z + (isBack ? -1 : 1) * (halfT + TEXT_LIFT);
		} else {
			// wall / hanging: front toward room (−Z of default geo), back toward wall
			localZ = board.z - (isBack ? -1 : 1) * (halfT + TEXT_LIFT);
		}

		const eulerDeg = this.#signEulerDeg(b, isWall || isHanging);

		// Text anchor slightly off the wood face
		const [gx, gy, gz] = applyBlockGeoEuler([board.x, board.y, localZ], eulerDeg);
		const [tx, ty, tz] = structurePosToThree(
			b.x + gx / 16,
			b.y + gy / 16,
			b.z + gz / 16
		);

		// Board center in three-space — outward = text − board (toward the reader for that face)
		const [bcx, bcy, bcz] = applyBlockGeoEuler([board.x, board.y, board.z], eulerDeg);
		const [bx, by, bz] = structurePosToThree(
			b.x + bcx / 16,
			b.y + bcy / 16,
			b.z + bcz / 16
		);

		const glowing = !!face.glowing;
		const tex = this.#makeTextTexture(THREE, lines, face.color, {
			glowing,
			// Always outline for readability on wood textures
			outline: true
		});
		const mat = new THREE.MeshBasicMaterial({
			map: tex,
			transparent: true,
			// FrontSide only: DoubleSide shows a mirrored back when the normal is wrong
			side: THREE.FrontSide,
			depthWrite: false,
			// Slight lift so wood z-fighting doesn't eat glyphs
			polygonOffset: true,
			polygonOffsetFactor: -1,
			polygonOffsetUnits: -1
		});
		if (glowing) {
			mat.color?.setHex?.(0xffffee);
		}

		const mesh = new THREE.Mesh(
			new THREE.PlaneGeometry(board.w, board.h),
			mat
		);
		mesh.position.set(tx, ty, tz);

		// Orient with lookAt so the plane's +Z faces the reader without the horizontal
		// mirror that a bare 180° Y flip introduces on some wall facings.
		// Object3D.lookAt points local −Z at the target, so aim "behind" the board:
		// then local +Z (PlaneGeometry normal) points outward toward the reader.
		const outward = new THREE.Vector3(tx - bx, ty - by, tz - bz);
		if (outward.lengthSq() < 1e-8) {
			// Degenerate — fall back to geo −Z / +Z
			outward.set(0, 0, isStanding ? (isBack ? 1 : -1) : (isBack ? -1 : 1));
		} else {
			outward.normalize();
		}
		const behind = new THREE.Vector3(tx, ty, tz).sub(outward);
		mesh.up.set(0, 1, 0);
		mesh.lookAt(behind);

		mesh.userData.sdbSpecialOverlay = true;
		mesh.frustumCulled = false;
		return mesh;
	}

	/**
	 * Euler degrees matching blockStateDefinitions wall_sign / ground_sign_direction.
	 * @param {{ states?: Record<string, unknown> }} b
	 * @param {boolean} wallLike
	 * @returns {[number, number, number]}
	 */
	#signEulerDeg(b, wallLike) {
		const st = b.states || {};
		if (wallLike) {
			if (typeof st.minecraft_cardinal_direction === "string") {
				const map = {
					north: [0, 0, 0],
					south: [0, 180, 0],
					west: [0, -90, 0],
					east: [0, 90, 0]
				};
				return map[st.minecraft_cardinal_direction] ?? [0, 0, 0];
			}
			const fd = Number(st.facing_direction);
			// Same as wall_sign in blockStateDefinitions.json
			const map = {
				2: [0, 0, 0], // north
				3: [0, 180, 0], // south
				4: [0, -90, 0], // west
				5: [0, 90, 0] // east
			};
			return map[fd] ?? [0, 0, 0];
		}
		const facing = Number(st.ground_sign_direction ?? 0) || 0;
		const yaw = (facing / 16) * 360;
		return [0, yaw, 0];
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

			g.userData.sdbSpecialOverlay = true;
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
			// Pure black dye still needs to read — bump slightly when not glowing
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
			const maxW = w - 16;

			if (glowing) {
				// Soft colored bloom under the glyphs
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
				// Dark outline for contrast on light/dark wood
				c2d.strokeStyle = glowing ? "rgba(0,0,0,0.75)" : "rgba(0,0,0,0.92)";
				c2d.lineWidth = glowing ? 5.5 : 4;
				c2d.strokeText(text, x, y, maxW);
				// Thin light rim so dark dyes stay readable
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
 * @param {string} css
 * @param {number} amount 0–1 toward white
 */
function lightenCss(css, amount) {
	const m = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(css);
	if (!m) return css;
	const lift = (c) => Math.min(255, Math.round(Number(c) + (255 - Number(c)) * amount));
	return `rgb(${lift(m[1])},${lift(m[2])},${lift(m[3])})`;
}
