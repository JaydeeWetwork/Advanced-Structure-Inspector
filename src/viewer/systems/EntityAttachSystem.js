/**
 * Entity + item-frame attach system.
 * Generation counter drops stale concurrent attaches (layer changes / re-init).
 */

import { disposeObject3D } from "./disposeObject3D.js";
import { isOnActiveLayer } from "../layerVisibility.js";

/**
 * Structure Y layer for an entity continuous pos.
 * @param {number[]|undefined|null} pos
 */
export function entityStructureLayer(pos) {
	if (!pos || pos.length < 2) return 0;
	return Math.floor(Number(pos[1]) || 0);
}

/**
 * Read rail_direction under an entity (block below feet / same cell).
 * @param {import("./PreviewContext.js").default} ctx
 * @param {number[]|undefined|null} pos
 * @returns {number|null}
 */
function railDirectionUnder(ctx, pos) {
	if (!pos || !ctx?.blockPalette || !ctx?.blockIndices || !ctx?.structureSize) return null;
	const [sx, sy, sz] = ctx.structureSize;
	const x = Math.floor(Number(pos[0]));
	const y = Math.floor(Number(pos[1]));
	const z = Math.floor(Number(pos[2]));
	const tryCell = (cx, cy, cz) => {
		if (cx < 0 || cy < 0 || cz < 0 || cx >= sx || cy >= sy || cz >= sz) return null;
		const i = (cx * sy + cy) * sz + cz;
		const pi = Number(ctx.blockIndices[0]?.[i] ?? -1);
		if (pi < 0) return null;
		const b = ctx.blockPalette[pi];
		const name = String(b?.name ?? "").replace(/^minecraft:/, "");
		if (!name.includes("rail")) return null;
		const rd = b?.states?.rail_direction ?? b?.states?.rail_direction_bit;
		return rd != null && Number.isFinite(Number(rd)) ? Number(rd) : null;
	};
	// Prefer block at feet (cart y often ~0.35 above rail)
	return tryCell(x, y, z) ?? tryCell(x, y - 1, z) ?? tryCell(x, Math.max(0, y - 1), z);
}

export default class EntityAttachSystem {
	#attachGen = 0;
	/** @type {import("./entityExtract.js").PreviewEntity[]} */
	allPreviewEntities = [];

	/**
	 * Sole owner of the structure entity list for this preview.
	 * @param {import("../entityExtract.js").PreviewEntity[]} list
	 */
	setList(list) {
		this.allPreviewEntities = Array.isArray(list) ? [...list] : [];
	}

	/** @returns {import("../entityExtract.js").PreviewEntity[]} */
	get list() {
		return this.allPreviewEntities;
	}


	/**
	 * @param {import("./PreviewContext.js").default} ctx
	 */
	constructor(ctx) {
		this.ctx = ctx;
	}

	get attachGen() {
		return this.#attachGen;
	}

	/**
	 * Strip previous entity / item-frame meshes without killing shared textures.
	 */
	clearEntityMeshes() {
		const scene = this.ctx.scene;
		const pool = this.ctx.pool;
		if (!scene) return;
		const toRemove = [];
		scene.traverse(obj => {
			if (obj.userData?.previewEntity || obj.userData?.itemFrameItem) {
				toRemove.push(obj);
			}
		});
		const policy = pool.disposePolicy();
		for (const obj of toRemove) {
			obj.parent?.remove(obj);
			disposeObject3D(obj, policy);
		}
	}

	/**
	 * @param {import("./entityExtract.js").PreviewEntity[]} [entityList]
	 * @param {import("../../ResourcePackStack.js").default} [resourcePackStack]
	 * @param {{ keepFullList?: boolean }} [opts]
	 * @returns {Promise<number>}
	 */
	async attach(entityList, resourcePackStack, opts = {}) {
		const gen = ++this.#attachGen;
		const THREE = this.ctx.THREE;
		const scene = this.ctx.scene;
		const pool = this.ctx.pool;

		if (this.ctx.isDisposed() || !scene || !THREE) {
			console.warn("[basi] EntityAttachSystem: renderer not ready", {
				disposed: this.ctx.isDisposed(),
				hasScene: !!scene,
				hasTHREE: !!THREE
			});
			return 0;
		}

		const ents = Array.isArray(entityList)
			? entityList
			: (this.allPreviewEntities?.length ? this.allPreviewEntities : []);

		if (!opts.keepFullList && Array.isArray(entityList)) {
			this.setList(entityList);
		}

		this.clearEntityMeshes();

		if (gen !== this.#attachGen || this.ctx.isDisposed()) return 0;

		const layerFilter = this.ctx.selectedLayer;
		let added = 0;

		// —— Minecarts / structure entities ——
		const options = this.ctx.options;
		if (options.showEntities !== false && ents.length) {
			console.info(
				`[basi] EntityAttachSystem: meshing ${ents.length}`,
				ents.slice(0, 5).map(e =>
					`${e.identifier}@${(e.pos || []).map(n => Number(n).toFixed(2)).join(",")}`
				)
			);

			let createEntityObject3D;
			let loadEntityModelKit;
			let buildCargoKit;
			try {
				({ createEntityObject3D, loadEntityModelKit, buildCargoKit } = await import(
					"../entityMeshes.js"
				));
			} catch (e) {
				console.error("[basi] failed to load entityMeshes module:", e);
			}
			if (gen !== this.#attachGen || this.ctx.isDisposed()) return 0;

			const rps = resourcePackStack ?? options.entityResourcePackStack;
			if (rps && !pool.entityModelKit && loadEntityModelKit) {
				try {
					const kit = await loadEntityModelKit(THREE, rps);
					if (gen !== this.#attachGen || this.ctx.isDisposed()) return 0;
					if (kit?.size) pool.entityModelKit = kit;
					console.info(`[basi] vanilla entity kit: ${kit?.size ?? 0} kind(s)`);
				} catch (e) {
					console.warn("[basi] vanilla entity kit load failed:", e);
				}
			}
			if (gen !== this.#attachGen || this.ctx.isDisposed()) return 0;

			if (buildCargoKit && options.cargoTemplates && !pool.cargoKit) {
				try {
					pool.cargoKit = buildCargoKit(THREE, options.cargoTemplates, pool);
					console.info(`[basi] cargo kit: ${pool.cargoKit?.size ?? 0} kind(s)`);
				} catch (e) {
					console.warn("[basi] cargo kit failed:", e);
				}
			}
			if (gen !== this.#attachGen || this.ctx.isDisposed()) return 0;

			if (createEntityObject3D) {
				for (const ent of ents) {
					if (gen !== this.#attachGen || this.ctx.isDisposed()) return added;
					try {
						const ly = entityStructureLayer(ent.pos);
						if (!isOnActiveLayer(ly, layerFilter)) continue;
						const railDirection = railDirectionUnder(this.ctx, ent.pos);
						const obj = createEntityObject3D(THREE, ent, {
							entityKit: pool.entityModelKit,
							cargoKit: pool.cargoKit,
							railDirection
						});
						obj.userData.previewEntity = true;
						obj.userData.basiEntity = ent;
						obj.userData.layerY = ly;
						this.ctx.getLayerGroup(ly).add(obj);
						added++;
					} catch (e) {
						console.error("[basi] failed to mesh entity", ent, e);
					}
				}
			}
		}

		// —— Item / glow item frame contents ——
		try {
			const frameAdded = await this.#attachItemFrameItems(gen, layerFilter);
			added += frameAdded;
		} catch (e) {
			console.warn("[basi] item frame items failed:", e);
		}

		console.info(`[basi] EntityAttachSystem: added ${added} group(s)`);
		this.ctx.requestRender();
		return added;
	}

	/**
	 * @param {number} gen
	 * @param {number|null} layerFilter
	 */
	async #attachItemFrameItems(gen, layerFilter) {
		if (this.ctx.isDisposed() || !this.ctx.THREE || !this.ctx.inspectIndex) {
			return 0;
		}
		const THREE = this.ctx.THREE;
		const pool = this.ctx.pool;

		let extractItemFramePlacements;
		let createItemFrameItemObject3D;
		let loadItemTexture;
		try {
			({
				extractItemFramePlacements,
				createItemFrameItemObject3D,
				loadItemTexture
			} = await import("../itemFrameItems.js"));
		} catch (e) {
			console.error("[basi] itemFrameItems module failed:", e);
			return 0;
		}
		if (gen !== this.#attachGen || this.ctx.isDisposed()) return 0;

		const placements = extractItemFramePlacements(this.ctx.inspectIndex);
		if (!placements.length) return 0;

		// Parallel-load unique icons
		const uniqueNames = [...new Set(placements.map(p => p.itemName))];
		await Promise.all(
			uniqueNames.map(async name => {
				if (pool.itemFrameTexCache.has(name)) return;
				if (gen !== this.#attachGen || this.ctx.isDisposed()) return;
				try {
					const tex = await loadItemTexture(THREE, name);
					if (gen !== this.#attachGen || this.ctx.isDisposed()) {
						try {
							tex?.dispose?.();
						} catch {
							/* ignore */
						}
						return;
					}
					pool.itemFrameTexCache.set(name, tex);
				} catch (e) {
					console.warn("[basi] item frame texture failed:", name, e);
					pool.itemFrameTexCache.set(name, null);
				}
			})
		);
		if (gen !== this.#attachGen || this.ctx.isDisposed()) return 0;

		let added = 0;
		for (const pl of placements) {
			if (gen !== this.#attachGen || this.ctx.isDisposed()) return added;
			if (!isOnActiveLayer(pl.y, layerFilter)) continue;
			try {
				const tex = pool.itemFrameTexCache.get(pl.itemName) ?? null;
				const obj = createItemFrameItemObject3D(THREE, pl, tex);
				this.ctx.getLayerGroup(pl.y).add(obj);
				added++;
			} catch (e) {
				console.warn("[basi] failed item frame item", pl, e);
			}
		}
		if (added) {
			console.info(`[basi] EntityAttachSystem: placed ${added} item icon(s)`);
		}
		return added;
	}

	/**
	 * Re-place entities for current layer filter.
	 * @param {boolean} showEntities
	 */
	async rebuildForLayer(showEntities) {
		const ents = this.allPreviewEntities.length ? this.allPreviewEntities : [];
		if (showEntities === false) {
			await this.attach([], this.ctx.options.entityResourcePackStack, {
				keepFullList: true
			});
			return;
		}
		const filter = this.ctx.selectedLayer;
		const filtered =
			filter == null
				? ents
				: ents.filter(e => isOnActiveLayer(entityStructureLayer(e.pos), filter));
		await this.attach(filtered, this.ctx.options.entityResourcePackStack, {
			keepFullList: true
		});
	}

	/** Invalidate in-flight attaches (e.g. on dispose). */
	bumpGen() {
		this.#attachGen++;
	}

	dispose() {
		this.bumpGen();
		this.clearEntityMeshes();
		this.allPreviewEntities = [];
	}
}
