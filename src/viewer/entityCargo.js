/**
 * Minecart cargo = the same BlockGeoMaker cubes we use for placed blocks
 * (chest / hopper / tnt / command_block), scaled into the vanilla hull.
 * Java AbstractMinecartRenderer uses 0.75 scale; we match that in 16-unit space.
 */

import { vanillaModelDefFor } from "./entityModels.js?v=judo37";

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
 * Poly-mesh template (resolved UVs) → BufferGeometry.
 * Same Z-flip + winding as BlockGeoSystem.polyMeshTemplateToBufferGeo.
 *
 * @param {typeof import("three")} THREE
 * @param {any[]} faces
 * @returns {import("three").BufferGeometry|null}
 */
export function polyMeshTemplateToGeometry(THREE, faces) {
	if (!THREE || !Array.isArray(faces) || !faces.length) return null;
	const positions = [];
	const normals = [];
	const uvs = [];
	const indices = [];
	let i = 0;
	for (const face of faces) {
		const verts = face?.vertices;
		if (!Array.isArray(verts) || verts.length < 4) continue;
		const n = Array.isArray(face.normal) ? face.normal : [0, 1, 0];
		for (const v of verts) {
			const p = v?.pos ?? [0, 0, 0];
			const uv = v?.uv ?? [0, 0];
			positions.push(Number(p[0]) || 0, Number(p[1]) || 0, 16 - (Number(p[2]) || 0));
			normals.push(Number(n[0]) || 0, Number(n[1]) || 0, Number(n[2]) || 0);
			uvs.push(Number(uv[0]) || 0, 1 - (Number(uv[1]) || 0));
		}
		indices.push(i + 2, i + 1, i, i + 2, i, i + 3);
		i += verts.length;
	}
	if (!positions.length) return null;
	const geo = new THREE.BufferGeometry();
	geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
	geo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(normals), 3));
	geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uvs), 2));
	geo.setIndex(indices);
	geo.computeVertexNormals();
	return geo;
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
			side: THREE.FrontSide,
			alphaTest: 0.05,
			polygonOffset: true,
			polygonOffsetFactor: -1,
			polygonOffsetUnits: -2,
			depthWrite: true
		});
	}

	for (const [kind, faces] of Object.entries(templates)) {
		const geo = polyMeshTemplateToGeometry(THREE, faces);
		if (!geo) continue;
		kit.set(kind, { geometry: geo, material: pool.cargoMat });
	}
	return kit;
}
