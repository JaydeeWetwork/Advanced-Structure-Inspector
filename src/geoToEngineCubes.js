import { jsonc, tuple, vec3 } from "./utils.js";

export const GEO_SPACE_ENTITY = "entity";
export const GEO_SPACE_BLOCK = "block";

const FACE_NAMES = ["north", "south", "east", "west", "up", "down"];
const BLOCK_ORIGIN_SHIFT = /** @type {Vec3} */ ([8, 0, 8]);

/**
 * Flatten one geo.json cube into an ASI engine cube.
 * Entity space keeps `translate: [8,0,8]` (entity models).
 * Block space bakes that shift into `pos`/`pivot` (Mojang block-center origin).
 * @param {object} geoCube
 * @param {string} texture
 * @param {number} textureWidth
 * @param {number} textureHeight
 * @param {typeof GEO_SPACE_ENTITY | typeof GEO_SPACE_BLOCK} [space]
 * @returns {Data.Cube}
 */
export function geoCubeToEngineCube(geoCube, texture, textureWidth, textureHeight, space = GEO_SPACE_ENTITY) {
	const isBlock = space === GEO_SPACE_BLOCK;
	let pos = /** @type {Vec3} */ ([...(geoCube["origin"] ?? [0, 0, 0])]);
	let size = /** @type {Vec3} */ ([...(geoCube["size"] ?? [0, 0, 0])]);
	size = /** @type {Vec3} */ (size.map(n => (Math.abs(n) < 1e-6 ? 0 : n)));
	if ("inflate" in geoCube) {
		const inflate3 = tuple([geoCube.inflate, geoCube.inflate, geoCube.inflate]);
		pos = vec3.sub(pos, inflate3);
		size = vec3.add(size, vec3.mul(inflate3, 2));
	}
	/** @type {Data.Cube} */
	const cube = {
		pos,
		size,
		textures: { "*": texture },
		texture_size: [textureWidth, textureHeight]
	};
	if (isBlock) {
		cube.pos = vec3.add(cube.pos, BLOCK_ORIGIN_SHIFT);
	} else {
		cube.translate = BLOCK_ORIGIN_SHIFT;
	}
	const uv = geoCube["uv"];
	if (uv && typeof uv === "object" && !Array.isArray(uv)) {
		cube.uv = {};
		cube.uv_sizes = {};
		cube.uv_rot = {};
		for (const face of FACE_NAMES) {
			const spec = uv[face];
			if (!spec) {
				cube.textures[face] = "none";
				continue;
			}
			if (Array.isArray(spec.uv)) cube.uv[face] = spec.uv;
			if (Array.isArray(spec.uv_size)) cube.uv_sizes[face] = spec.uv_size;
			if (spec.uv_rotation != null) cube.uv_rot[face] = spec.uv_rotation;
		}
	} else {
		cube.box_uv = uv;
		cube.box_uv_size = geoCube["size"];
		cube.box_uv_flip_east_west = true;
	}
	if ("rotation" in geoCube) {
		cube.rot = geoCube["rotation"];
		const pivot = geoCube["pivot"] ?? [0, 0, 0];
		cube.pivot = isBlock ? vec3.add(pivot, BLOCK_ORIGIN_SHIFT) : pivot;
	}
	return cube;
}

/**
 * @param {object} geoFile
 * @param {string} identifier
 * @param {string} texture
 * @param {typeof GEO_SPACE_ENTITY | typeof GEO_SPACE_BLOCK} space
 * @returns {Data.Cube[]}
 */
export function geometryDocumentToCubes(geoFile, identifier, texture, space) {
	const matchingGeo = geoFile?.["minecraft:geometry"]?.find(
		geo => geo["description"]["identifier"] == identifier
	);
	if (!matchingGeo) return [];
	const textureWidth = matchingGeo["description"]["texture_width"];
	const textureHeight = matchingGeo["description"]["texture_height"];
	const cubes = [];
	for (const bone of matchingGeo["bones"] ?? []) {
		for (const geoCube of bone["cubes"] ?? []) {
			cubes.push(geoCubeToEngineCube(geoCube, texture, textureWidth, textureHeight, space));
		}
	}
	return cubes;
}

/**
 * @param {{ fetchResource: (path: string) => Promise<Response> }} resourcePackStack
 * @param {{ identifier: string, geo_file: string, texture: string }} modelInfo
 * @param {typeof GEO_SPACE_ENTITY | typeof GEO_SPACE_BLOCK} space
 * @returns {Promise<Data.Cube[]>}
 */
export async function loadPackGeometryCubes(resourcePackStack, modelInfo, space) {
	const geoFileRes = await resourcePackStack.fetchResource(modelInfo["geo_file"]);
	if (!geoFileRes.ok) {
		console.error(`Unable to load geometry file ${modelInfo["geo_file"]}`);
		return [];
	}
	const geoFile = await jsonc(geoFileRes);
	const cubes = geometryDocumentToCubes(geoFile, modelInfo["identifier"], modelInfo["texture"], space);
	if (!cubes.length) {
		console.error(`Unable to find ${modelInfo["identifier"]} in geometry file ${modelInfo["geo_file"]}`);
	}
	return cubes;
}

/** @import * as Data from "./data/schemas" */
/** @typedef {[number, number, number]} Vec3 */
