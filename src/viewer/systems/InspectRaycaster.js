/**
 * Raycast pick: canvas client coords → block / entity inspect hit.
 *
 * Minecarts are open tubs — a ray through the basin hits the rail first.
 * Prefer an entity hit if it is within ENTITY_PICK_SLACK of the nearest block
 * (model units; 8 ≈ half a block). Pair with the entity pick-volume mesh.
 */

import { entityStructureLayer } from "./EntityAttachSystem.js";
import { isOnActiveLayer } from "../layerVisibility.js";

/** How much closer a block may be and still lose to a cart behind it. */
export const ENTITY_PICK_SLACK = 8;

/**
 * @param {number} entityDist
 * @param {number} blockDist
 * @param {number} [slack=ENTITY_PICK_SLACK]
 * @returns {"entity"|"block"|"miss"}
 */
export function chooseInspectHit(entityDist, blockDist, slack = ENTITY_PICK_SLACK) {
	const hasE = Number.isFinite(entityDist);
	const hasB = Number.isFinite(blockDist);
	if (hasE && hasB) {
		return entityDist <= blockDist + slack ? "entity" : "block";
	}
	if (hasE) return "entity";
	if (hasB) return "block";
	return "miss";
}

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

		let bestEntity = null;
		let bestEntityDist = Infinity;
		let bestBlock = null;
		let bestBlockDist = Infinity;

		for (const hit of hits) {
			if (hit.object.visible === false) continue;
			let hidden = false;
			let walk = hit.object;
			while (walk) {
				if (walk.visible === false) {
					hidden = true;
					break;
				}
				walk = walk.parent;
			}
			if (hidden) continue;

			let obj = hit.object;
			while (obj) {
				if (obj.userData?.sdbEntity || obj.userData?.previewEntity) {
					const ent =
						obj.userData.sdbEntity ?? obj.userData.previewEntityData ?? null;
					if (ent) {
						const ey = entityStructureLayer(ent.pos);
						if (!isOnActiveLayer(ey, layerFilter)) {
							obj = obj.parent;
							continue;
						}
						if (hit.distance < bestEntityDist) {
							bestEntityDist = hit.distance;
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
							bestEntity = { kind: "entity", entity: base };
						}
						break;
					}
				}
				if (obj.userData?.sdbBlock && obj.userData.sdbBlockPositions) {
					if (obj.userData.sdbPickable === false) {
						obj = obj.parent;
						continue;
					}
					const positions = obj.userData.sdbBlockPositions;
					const idx = hit.instanceId != null ? hit.instanceId : 0;
					const sp = positions[idx];
					if (sp) {
						const [x, y, z] = sp;
						if (!isOnActiveLayer(y, layerFilter)) {
							obj = obj.parent;
							continue;
						}
						if (hit.distance < bestBlockDist) {
							bestBlockDist = hit.distance;
							const key = `${x},${y},${z}`;
							const block =
								this.ctx.inspectIndex?.blocks?.get?.(key)
								?? this.#fallbackBlockInfo(x, y, z, obj.userData.sdbPaletteI);
							bestBlock = {
								kind: "block",
								block,
								structurePos: [x, y, z]
							};
						}
						break;
					}
				}
				obj = obj.parent;
			}
		}

		const choice = chooseInspectHit(bestEntityDist, bestBlockDist);
		if (choice === "entity") return bestEntity;
		if (choice === "block") return bestBlock;
		return { kind: "miss" };
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
