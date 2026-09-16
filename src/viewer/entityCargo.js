/**
 * Minecart cargo = the same BlockGeoMaker cubes we use for placed blocks
 * (chest / hopper / tnt / command_block), scaled into the vanilla hull.
 * Java AbstractMinecartRenderer uses 0.75 scale; we match that in 16-unit space.
 */

import { vanillaModelDefFor } from "./entityModels.js";
import { facesToBufferGeometry } from "./polyMeshBufferGeo.js";

export { facesToBufferGeometry as polyMeshTemplateToGeometry };

/** Vanilla in-cart scale (Java 0.75F). */
export const CARGO_SCALE = 0.75;
/** Sit on the hull floor (top y=2.5) with a hair of lift so faces don't z-fight. */
export const CARGO_FLOOR_Y = 2.65;

/**
 * Palette blocks for cargo. Names are un-namespaced (same as tweakBlockPalette)
 * so BlockGeoMaker + TextureAtlas hit blockShapes / blocks.json. `minecraft:chest`
 * misses both and samples the magenta-black missing tile.
 * States pick the down-facing hopper spout and a non-conditional command block facing up.
 *
 * @type {Record<"chest"|"hopper"|"tnt"|"command", { name: string, states: Record<string, string|number|boolean> }>}
 */
export const CARGO_BLOCKS = {
	chest: { name: "chest", states: {} },
	hopper: { name: "hopper", states: { facing_direction: 0 } },
	tnt: { name: "tnt", states: {} },
	command: {
		name: "command_block",
		states: { facing_direction: 1, conditional_bit: 0 }
	}
};

/**
 * @param {Iterable<{ identifier?: string }>} entities
 * @returns {("chest"|"hopper"|"tnt"|"command")[]}
 */
export function cargoKindsNeeded(entities) {
	const set = new Set();
	for (const e of entities ?? []) {
		const cargo = vanillaModelDefFor(e?.identifier)?.cargo;
		if (cargo && cargo !== "none" && cargo in CARGO_BLOCKS) set.add(cargo);
	}
	return [...set];
}

/**
 * @param {Iterable<{ identifier?: string }>} entities
 * @returns {{ kind: string, block: { name: string, states: Record<string, string|number|boolean> } }[]}
 */
export function cargoPaletteEntries(entities) {
	return cargoKindsNeeded(entities).map(kind => ({
		kind,
		block: CARGO_BLOCKS[kind]
	}));
}

/**
 * @param {import("three").Object3D} mesh
 */
export function placeCargoMesh(mesh) {
	const s = CARGO_SCALE;
	mesh.scale.setScalar(s);
	mesh.position.set(-8 * s, CARGO_FLOOR_Y, -8 * s);
	mesh.frustumCulled = false;
}

/**
 * @param {typeof import("three")} THREE
 * @param {Record<string, any[]>} templates  kind → resolved poly faces
 * @param {import("./systems/PreviewResourcePool.js").default} pool
 * @returns {Map<string, { geometry: import("three").BufferGeometry, material: import("three").Material }>}
 */
export function buildCargoKit(THREE, templates, pool) {
	/** @type {Map<string, { geometry: import("three").BufferGeometry, material: import("three").Material }>} */
	const kit = new Map();
	if (!THREE || !templates || !pool?.atlasTexture) return kit;

	if (!pool.cargoMat) {
		pool.cargoMat = new THREE.MeshLambertMaterial({
			map: pool.atlasTexture,
			side: THREE.DoubleSide,
			alphaTest: 0.05,
			polygonOffset: true,
			polygonOffsetFactor: -1,
			polygonOffsetUnits: -2,
			depthWrite: true
		});
	}

	for (const [kind, faces] of Object.entries(templates)) {
		const geo = facesToBufferGeometry(THREE, faces);
		if (!geo) continue;
		kit.set(kind, { geometry: geo, material: pool.cargoMat });
	}
	return kit;
}
