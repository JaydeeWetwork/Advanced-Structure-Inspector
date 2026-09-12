/**
 * Raycast pick: canvas client coords → block / entity inspect hit.
 * Hits are already distance-sorted. First classified object wins.
 * Minecarts carry an invisible pick-volume so the open tub is solid.
 */

import { entityStructureLayer } from "./EntityAttachSystem.js";
import { isOnActiveLayer } from "../layerVisibility.js";

export default class InspectRaycaster {
	/** @type {import("three").Raycaster|null} */
	#raycaster = null;
	/** @type {import("three").Vector2|null} */
	#pointerNdc = null;

	/**
	 * @param {import("./PreviewContext.js").default} ctx
	 */
	constructor(ctx) {
		this.ctx = ctx;
	}

	/** Call once THREE + scene exist. */
	init() {
		const THREE = this.ctx.THREE;
		if (!THREE) return;
		this.#raycaster = new THREE.Raycaster();
		this.#pointerNdc = new THREE.Vector2();
		this.#raycaster.layers.set(0);
	}

	/**
	 * @param {number} clientX
	 * @param {number} clientY
	 * @returns {{ kind: "block"|"entity"|"miss", block?: any, entity?: any, structurePos?: [number,number,number] }}
	 */
	pickAtClient(clientX, clientY) {
		const can = this.ctx.canvas;
		const camera = this.ctx.camera;
		const scene = this.ctx.scene;
		if (!can || !camera || !scene || !this.#raycaster || !this.#pointerNdc) {
			return { kind: "miss" };
		}
		const rect = can.getBoundingClientRect();
		if (rect.width <= 0 || rect.height <= 0) return { kind: "miss" };
		const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
		const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
		this.#pointerNdc.set(ndcX, ndcY);
		this.#raycaster.setFromCamera(this.#pointerNdc, camera);

		const layerRoot = this.ctx.layers?.layerRoot;
		const roots = layerRoot ? [layerRoot] : scene.children;
		const hits = this.#raycaster.intersectObjects(roots, true);
		const layerFilter = this.ctx.selectedLayer;

		for (const hit of hits) {
			if (this.#isHidden(hit.object)) continue;
			const picked = this.#classifyHit(hit, layerFilter);
			if (picked) return picked;
		}
		return { kind: "miss" };
	}

	/**
	 * @param {import("three").Object3D} obj
	 */
	#isHidden(obj) {
		let walk = obj;
		while (walk) {
			if (walk.visible === false) return true;
			walk = walk.parent;
		}
		return false;
	}

	/**
	 * @param {import("three").Intersection} hit
	 * @param {number|null} layerFilter
	 */
	#classifyHit(hit, layerFilter) {
		let obj = hit.object;
		while (obj) {
			if (obj.userData?.basiEntity || obj.userData?.previewEntity) {
				const ent =
					obj.userData.basiEntity ?? obj.userData.previewEntityData ?? null;
				if (ent) {
					const ey = entityStructureLayer(ent.pos);
					if (!isOnActiveLayer(ey, layerFilter)) {
						obj = obj.parent;
						continue;
					}
					const fromIndex = this.#findInspectEntity(ent);
					const base =
						fromIndex ?? {
							identifier: ent.identifier ?? "entity",
							rawId: ent.rawId ?? ent.identifier,
							pos: ent.pos,
							items: ent.items ?? [],
							customName: ent.customName ?? null,
							raw: ent.raw ?? ent
						};
					if (!base.raw) base.raw = ent.raw ?? ent;
					if ((!base.items || !base.items.length) && ent.items?.length) {
						base.items = ent.items;
					}
					return { kind: "entity", entity: base };
				}
			}
			if (obj.userData?.basiBlock && obj.userData.basiBlockPositions) {
				if (obj.userData.basiPickable === false) {
					obj = obj.parent;
					continue;
				}
				const positions = obj.userData.basiBlockPositions;
				const idx = hit.instanceId != null ? hit.instanceId : 0;
				const sp = positions[idx];
				if (sp) {
					const [x, y, z] = sp;
					if (!isOnActiveLayer(y, layerFilter)) {
						obj = obj.parent;
						continue;
					}
					const key = `${x},${y},${z}`;
					const block =
						this.ctx.inspectIndex?.blocks?.get?.(key)
						?? this.#fallbackBlockInfo(x, y, z, obj.userData.basiPaletteI);
					return {
						kind: "block",
						block: this.#withDoubleChest(block, x, y, z),
						structurePos: [x, y, z]
					};
				}
			}
			obj = obj.parent;
		}
		return null;
	}

	/**
	 * @param {any} ent
	 */
	#findInspectEntity(ent) {
		const list = this.ctx.inspectIndex?.entities;
		if (!list?.length || !ent?.pos) return null;
		const [ex, ey, ez] = ent.pos;
		let best = null;
		let bestD = Infinity;
		for (const e of list) {
			const [x, y, z] = e.pos;
			const d = (x - ex) ** 2 + (y - ey) ** 2 + (z - ez) ** 2;
			if (d < bestD) {
				bestD = d;
				best = e;
			}
		}
		return bestD < 1.5 ? best : null;
	}

	/**
	 * @param {number} x
	 * @param {number} y
	 * @param {number} z
	 * @param {number} paletteI
	 */
	/**
	 * If this cell is a paired chest, use the inspect index's combined 54-slot list.
	 * @param {any} block
	 * @param {number} x
	 * @param {number} y
	 * @param {number} z
	 */
	#withDoubleChest(block, x, y, z) {
		if (!block) return block;
		if (block.doubleChest && Array.isArray(block.doubleItems)) return block;
		const indexed = this.ctx.inspectIndex?.blocks?.get?.(`${x},${y},${z}`);
		if (indexed?.doubleChest) {
			return {
				...block,
				doubleChest: indexed.doubleChest,
				doubleItems: indexed.doubleItems ?? indexed.items ?? []
			};
		}
		return block;
	}

	#fallbackBlockInfo(x, y, z, paletteI) {
		const b = this.ctx.blockPalette?.[paletteI];
		return {
			x,
			y,
			z,
			name: String(b?.name ?? "unknown").replace(/^minecraft:/, ""),
			states: b?.states,
			blockEntityId: b?.block_entity_data?.id ?? null,
			blockEntity: b?.block_entity_data ?? null,
			items: [],
			waterlogName: null
		};
	}

	dispose() {
		this.#raycaster = null;
		this.#pointerNdc = null;
	}
}
