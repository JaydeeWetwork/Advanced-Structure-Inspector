/** Cube merge, UV, and vertex math for BlockGeoMaker. No block-shape tables. */
import { conditionallyGroup, max, rotateDeg, tuple, vec2, vec3 } from "../../utils.js";
/** @typedef {import("../../data/schemas").Cube & Record<"x" | "y" | "z" | "w" | "h" | "d", number>} CubeWithEasyProperties */
/** @import { Vec3, PolyMeshTemplateFace, PolyMeshTemplateFaceWithUvs, PolyMeshTemplateVertex, CubeUv } from "../../types.js" */
/** @import * as Data from "../../data/schemas" */
/**
 * Applies Euler rotations on a position in 3D space in the order X-Y-Z.
 * @param {Vec3} pos
 * @param {Vec3} rotation Angles in degrees
 * @param {Vec3} pivot
 * @returns {Vec3}
 */
export function applyEulerRotation(pos, rotation, pivot) {
	let res = vec3.add(pos, vec3.mul(pivot, -1));
	[res[1], res[2]] = rotateDeg([res[1], res[2]], -rotation[0]); // idk why but it's negative
	[res[0], res[2]] = rotateDeg([res[0], res[2]], -rotation[1]);
	[res[0], res[1]] = rotateDeg([res[0], res[1]], -rotation[2]);
	res = vec3.add(res, pivot);
	return res;
}
/**
 * Returns the entries of a block's states and block entity data (prefixed by `entity.`; only first-level properties are supported).
 * @param {Block} block
 * @returns {[string, any][]}
 */
export function getBlockStatesAndEntityDataEntries(block) {
	return [...Object.entries(block["states"] ?? {}), ...Object.entries(block["block_entity_data"] ?? {}).map(([key, value]) => [`entity.${key}`, value])];
}
/**
 * Adds x/y/z/w/h/d properties to cubes for easy typing.
 * @param {Data.Cube} cube
 * @returns {CubeWithEasyProperties}
 */
export function addEasyPropertyAccessors(cube) {
	Object.defineProperties(cube, Object.fromEntries(["x", "y", "z", "w", "h", "d"].map((prop, i) => [prop, {
		get() {
			return (i < 3? this["pos"] : this["size"])[i % 3];
		},
		set(value) {
			(i < 3? this["pos"] : this["size"])[i % 3] = value;
		}
	}])));
	// @ts-expect-error
	return cube;
}
/**
 * Optimises geometries by merging adjacent cubes and culling hidden faces.
 * @param {CubeWithEasyProperties[]} cubes
 * @returns {object[]}
 */
export function optimizeGeometry(cubes) {
	let [unoptimizableCubes, optimizableCubes] = conditionallyGroup(cubes, cube => !("rot" in cube));
	optimizableCubes.forEach(cube => {
		if("translate" in cube) {
			cube["pos"] = vec3.add(cube["pos"], cube["translate"]);
		}
	});
	let mergeableGroups = new Map(optimizableCubes.map(cube => [cube, getMergingGroup(cube)]));
	
	let mergedCubes = [];
	optimizableCubes.forEach(cube1 => { // this is the cube we're trying to add to mergedCubes
		tryMerging: while(true) {
			for(let [i, cube2] of mergedCubes.entries()) {
				let mergeable = mergeableGroups.get(cube1) == mergeableGroups.get(cube2);
				if(tryMergeCubesOneWayAndCullFaces(cube1, cube2, mergeable)) {
					console.debug("Merged cube", cube2, "into", cube1);
					Object.entries(cube1["culled_faces"] ?? {}).forEach(([faceName, preCullingValue]) => {
						if(preCullingValue) {
							cube1["textures"][faceName] = preCullingValue;
						} else {
							delete cube1["textures"][faceName];
						}
					});
					delete cube1["culled_faces"];
					mergedCubes.splice(i, 1);
					continue tryMerging; // since boneCube1 has been mutated, this stops the current comparison of boneCube1 with the already merged cubes, and makes it start again.
				} else if(tryMergeCubesOneWayAndCullFaces(cube2, cube1, mergeable)) {
					console.debug("Merged cube", cube1, "into", cube2);
					Object.entries(cube2["culled_faces"] ?? {}).forEach(([faceName, preCullingValue]) => {
						if(preCullingValue) {
							cube2["textures"][faceName] = preCullingValue;
						} else {
							delete cube2["textures"][faceName];
						}
					});
					delete cube2["culled_faces"];
					mergedCubes.splice(i, 1);
					cube1 = cube2;
					continue tryMerging; // boneCube2 has been mutated, so we removed it from mergedCubes and swap it out for boneCube1, then restart trying to merge it.
				}
			}
			break; // we'll only get to here when it's checked all combinations between the already merged cubes and the new cube (cube1)
		}
		mergedCubes.push(cube1);
	});
	mergedCubes.forEach(cube => {
		if("translate" in cube) {
			cube["pos"] = vec3.sub(cube["pos"], cube["translate"]);
		}
	});
	
	return [...unoptimizableCubes, ...mergedCubes];
}
/**
 * Returns a "merging group" for a cube. Cubes in the same merging group can be merged together. It doesn't affect face culling.
 * @param {Data.Cube} cube
 * @returns {number | string}
 */
function getMergingGroup(cube) {
	if(cube["disable_merging"] || "translate" in cube || "uv" in cube || "uv_sizes" in cube || "uv_rot" in cube || "box_uv" in cube) {
		return NaN; // in JS, NaN == NaN is false, disabling these cubes from being merged at all
	} else {
		return JSON.stringify([cube["textures"], cube["texture_size"], cube["block_override"], cube["terrain_texture"], cube["variant"], cube["ignore_eigenvariant"], cube["tint"], cube["fullbright"], cube["flip_textures_horizontally"], cube["flip_textures_vertically"], cube["arrays"]]); // these are all the properties that could exist on a cube at this point - basically, two cubes have to be identical in all of these in order to be mergeable
	}
}
/**
 * Unpurely tries to merge the second cube into the first if it is positively adjacent, and culls hidden faces if they are touching.
 * @param {CubeWithEasyProperties} cube1
 * @param {CubeWithEasyProperties} cube2
 * @param {boolean} mergeable If the cubes can be merged
 * @returns {boolean} If the second cube was merged into the first.
 */
function tryMergeCubesOneWayAndCullFaces(cube1, cube2, mergeable) {
	if(cube1.x + cube1.w == cube2.x) { // cube 2 is to the right of cube 1
		if(mergeable && cube1.y == cube2.y && cube1.z == cube2.z && cube1.h == cube2.h && cube1.d == cube2.d) {
			cube1.w += cube2.w; // grow cube 1...
			return true;
		}
	} else if(cube1.y + cube1.h == cube2.y) { // cube 2 is above cube 1
		if(mergeable && cube1.x == cube2.x && cube1.z == cube2.z && cube1.w == cube2.w && cube1.d == cube2.d) {
			cube1.h += cube2.h;
			return true;
		}
	} else if(cube1.z + cube1.d == cube2.z) { // cube 2 is behind cube 1
		if(mergeable && cube1.x == cube2.x && cube1.y == cube2.y && cube1.w == cube2.w && cube1.h == cube2.h) {
			cube1.d += cube2.d;
			return true;
		}
	}
	if(cube1.w == 0 || cube1.h == 0 || cube1.d == 0 || cube2.w == 0 || cube2.h == 0 || cube2.d == 0) {
		return false; // don't cull flat cubes
	}
	if(cube1.x < cube2.x && cube1.x + cube1.w >= cube2.x && cube1.x + cube1.w <= cube2.x + cube2.w) {
		if(cube1.y >= cube2.y && cube1.y + cube1.h <= cube2.y + cube2.h && cube1.z >= cube2.z && cube1.z + cube1.d <= cube2.z + cube2.d) { // right face of cube1 fits within left face of cube2
			cube1["textures"] ??= {};
			if(cube1["textures"]["west"] != "none") {
				cube1["culled_faces"] ??= {};
				cube1["culled_faces"]["west"] = cube1["textures"]["west"]; // keep track of faces which were culled. this is so if the cubes are merged, they reset to before the faces were culled; and so if all faces but one are culled, the proper shading can be applied
			}
			cube1["textures"]["west"] = "none";
		}
		if(cube2.y >= cube1.y && cube2.y + cube2.h <= cube1.y + cube1.h && cube2.z >= cube1.z && cube2.z + cube2.d <= cube1.z + cube1.d) { // left face of cube2 fits within right face of cube1
			cube2["textures"] ??= {};
			if(cube2["textures"]["east"] != "none") {
				cube2["culled_faces"] ??= {};
				cube2["culled_faces"]["east"] = cube2["textures"]["east"]; // keep track of faces which were culled. this is so if the cubes are merged, they reset to before the faces were culled; and so if all faces but one are culled, the proper shading can be applied
			}
			cube2["textures"]["east"] = "none";
		}
	}
	if(cube1.y < cube2.y && cube1.y + cube1.h >= cube2.y && cube1.y + cube1.h <= cube2.y + cube2.h) {
		if(cube1.x >= cube2.x && cube1.x + cube1.w <= cube2.x + cube2.w && cube1.z >= cube2.z && cube1.z + cube1.d <= cube2.z + cube2.d) { // top face of cube1 fits within bottom face of cube2
			cube1["textures"] ??= {};
			if(cube1["textures"]["up"] != "none") {
				cube1["culled_faces"] ??= {};
				cube1["culled_faces"]["up"] = cube1["textures"]["up"]; // keep track of faces which were culled. this is so if the cubes are merged, they reset to before the faces were culled; and so if all faces but one are culled, the proper shading can be applied
			}
			cube1["textures"]["up"] = "none";
		}
		if(cube2.x >= cube1.x && cube2.x + cube2.w <= cube1.x + cube1.w && cube2.z >= cube1.z && cube2.z + cube2.d <= cube1.z + cube1.d) { // bottom face of cube2 fits within top face of cube1
			cube2["textures"] ??= {};
			if(cube2["textures"]["down"] != "none") {
				cube2["culled_faces"] ??= {};
				cube2["culled_faces"]["down"] = cube2["textures"]["down"]; // keep track of faces which were culled. this is so if the cubes are merged, they reset to before the faces were culled; and so if all faces but one are culled, the proper shading can be applied
			}
			cube2["textures"]["down"] = "none";
		}
	}
	if(cube1.z < cube2.z && cube1.z + cube1.d >= cube2.z && cube1.z + cube1.d <= cube2.z + cube2.d) {
		if(cube1.x >= cube2.x && cube1.x + cube1.w <= cube2.x + cube2.w && cube1.y >= cube2.y && cube1.y + cube1.h <= cube2.y + cube2.h) { // back face of cube1 fits within front face of cube2
			cube1["textures"] ??= {};
			if(cube1["textures"]["south"] != "none") {
				cube1["culled_faces"] ??= {};
				cube1["culled_faces"]["south"] = cube1["textures"]["south"]; // keep track of faces which were culled. this is so if the cubes are merged, they reset to before the faces were culled; and so if all faces but one are culled, the proper shading can be applied
			}
			cube1["textures"]["south"] = "none";
		}
		if(cube2.x >= cube1.x && cube2.x + cube2.w <= cube1.x + cube1.w && cube2.y >= cube1.y && cube2.y + cube2.h <= cube1.y + cube1.h) { // front face of cube2 fits within back face of cube1
			cube2["textures"] ??= {};
			if(cube2["textures"]["north"] != "none") {
				cube2["culled_faces"] ??= {};
				cube2["culled_faces"]["north"] = cube2["textures"]["north"]; // keep track of faces which were culled. this is so if the cubes are merged, they reset to before the faces were culled; and so if all faces but one are culled, the proper shading can be applied
			}
			cube2["textures"]["north"] = "none";
		}
	}
	return false;
}
/**
 * Calculates the UV for a cube.
 * @param {CubeWithEasyProperties} cube
 * @returns {CubeUv}
 */
export function calculateUv(cube) {
	if("box_uv" in cube) { // this is where a singular uv coordinate is specified, and the rest is calculated as below. used primarily in entity models.
		let boxUvSize = cube["box_uv_size"] ?? cube["size"];
		let flipEastWest = !!cube["box_uv_flip_east_west"];
		/** @type {CubeUv} */
		let uv = {
			"up": {
				"uv": [boxUvSize[2], 0],
				"uv_size": [boxUvSize[0], boxUvSize[2]]
			},
			"down": {
				"uv": [boxUvSize[0] + boxUvSize[2], 0],
				"uv_size": [boxUvSize[0], boxUvSize[2]]
			},
			"west": {
				"uv": [+flipEastWest * (boxUvSize[0] + boxUvSize[2]), boxUvSize[2]],
				"uv_size": [boxUvSize[2], boxUvSize[1]]
			},
			"north": {
				"uv": [boxUvSize[2], boxUvSize[2]],
				"uv_size": [boxUvSize[0], boxUvSize[1]]
			},
			"east": {
				"uv": [+!flipEastWest * (boxUvSize[0] + boxUvSize[2]), boxUvSize[2]],
				"uv_size": [boxUvSize[2], boxUvSize[1]]
			},
			"south": {
				"uv": [boxUvSize[0] + boxUvSize[2] * 2, boxUvSize[2]],
				"uv_size": [boxUvSize[0], boxUvSize[1]]
			}
		};
		Object.values(uv).forEach(face => {
			face["uv"] = vec2.add(face["uv"], cube["box_uv"]);
		});
		return uv;
	} else {
		// In MCBE most non-full-block textures look at where the part that is being rendered is in relation to the entire cube space it's in - like it's being projected onto a full face then cut out. Kinda hard to explain sorry, I recommend messing around with fence textures so you understand how it works.
		let westUvOffset = tuple([cube.z, 16 - cube.y - cube.h]);
		let eastUvOffset = tuple([16 - cube.z - cube.d, 16 - cube.y - cube.h]);
		let downUvOffset = tuple([16 - cube.x - cube.w, 16 - cube.z - cube.d]);
		let upUvOffset = tuple([16 - cube.x - cube.w, cube.z]);
		let northUvOffset = tuple([cube.x, 16 - cube.y - cube.h]);
		let southUvOffset = tuple([16 - cube.x - cube.w, 16 - cube.y - cube.h]);
		return {
			"west": {
				"uv": cube["uv"]?.["west"] ?? cube["uv"]?.["side"] ?? cube["uv"]?.["*"] ?? westUvOffset,
				"uv_size": cube["uv_sizes"]?.["west"] ?? cube["uv_sizes"]?.["side"] ?? cube["uv_sizes"]?.["*"] ?? [cube.d, cube.h]
			},
			"east": {
				"uv": cube["uv"]?.["east"] ?? cube["uv"]?.["side"] ?? cube["uv"]?.["*"] ?? eastUvOffset,
				"uv_size": cube["uv_sizes"]?.["east"] ?? cube["uv_sizes"]?.["side"] ?? cube["uv_sizes"]?.["*"] ?? [cube.d, cube.h]
			},
			"down": {
				"uv": cube["uv"]?.["down"] ?? cube["uv"]?.["*"] ?? downUvOffset,
				"uv_size": cube["uv_sizes"]?.["down"] ?? cube["uv_sizes"]?.["*"] ?? [cube.w, cube.d]
			},
			"up": {
				"uv": cube["uv"]?.["up"] ?? cube["uv"]?.["*"] ?? upUvOffset,
				"uv_size": cube["uv_sizes"]?.["up"] ?? cube["uv_sizes"]?.["*"] ?? [cube.w, cube.d]
			},
			"north": {
				"uv": cube["uv"]?.["north"] ?? cube["uv"]?.["side"] ?? cube["uv"]?.["*"] ?? northUvOffset,
				"uv_size": cube["uv_sizes"]?.["north"] ?? cube["uv_sizes"]?.["side"] ?? cube["uv_sizes"]?.["*"] ?? [cube.w, cube.h]
			},
			"south": {
				"uv": cube["uv"]?.["south"] ?? cube["uv"]?.["side"] ?? cube["uv"]?.["*"] ?? southUvOffset,
				"uv_size": cube["uv_sizes"]?.["south"] ?? cube["uv_sizes"]?.["side"] ?? cube["uv_sizes"]?.["*"] ?? [cube.w, cube.h]
			}
		};
	}
}
/**
 * Gets the default vertices for a cube and a specific face side.
 * @param {Data.Cube} cube
 * @param {Data.CardinalDirection} faceName
 * @returns {[PolyMeshTemplateVertex, PolyMeshTemplateVertex, PolyMeshTemplateVertex, PolyMeshTemplateVertex]}
 */
export function getVertices(cube, faceName) {
	let { pos, size } = cube;
	const cubeFaces = {
		"west": tuple([[1, 1, 0], [1, 1, 1], [1, 0, 0], [1, 0, 1]]),
		"east": tuple([[0, 1, 1], [0, 1, 0], [0, 0, 1], [0, 0, 0]]),
		"down": tuple([[0, 0, 0], [1, 0, 0], [0, 0, 1], [1, 0, 1]]),
		"up": tuple([[0, 1, 1], [1, 1, 1], [0, 1, 0], [1, 1, 0]]),
		"north": tuple([[0, 1, 0], [1, 1, 0], [0, 0, 0], [1, 0, 0]]),
		"south": tuple([[1, 1, 1], [0, 1, 1], [1, 0, 1], [0, 0, 1]])
	};
	return cubeFaces[faceName].map(([a, b, c], i) => {
		return {
			"pos": tuple([pos[0] + size[0] * a, pos[1] + size[1] * b, pos[2] + size[2] * c]),
			"corner": i
		};
	});
}
/**
 * Gets the surface normal for a specific face of a cube.
 * @param {[PolyMeshTemplateVertex, PolyMeshTemplateVertex, PolyMeshTemplateVertex, PolyMeshTemplateVertex]} vertices
 * @returns {Vec3}
 */
export function getSurfaceNormal(vertices) {
	let dir1 = vec3.sub(vertices[1]["pos"], vertices[0]["pos"]);
	let dir2 = vec3.sub(vertices[2]["pos"], vertices[0]["pos"]);
	let normal = vec3.normalize(vec3.crossProduct(dir1, dir2));
	return normal;
}
/**
 * Calculates the center of mass of some cubes, assuming mass = volume. If all cubes are flat it will take surface area for mass.
 * @param {CubeWithEasyProperties[]} cubes
 * @returns {Vec3}
 */
export function calculateCenterOfMass(cubes) {
	let center = tuple([0, 0, 0]);
	let totalMass = 0;
	cubes.forEach(cube => {
		let mass = cube.w * cube.h * cube.d; // assume uniform mass density
		totalMass += mass;
		let cubeCenter = vec3.add(cube["pos"], vec3.mul(cube["size"], 0.5));
		if("rot" in cube) {
			cubeCenter = applyEulerRotation(cubeCenter, cube["rot"], cube["pivot"] ?? [8, 8, 8]);
		}
		center = vec3.add(center, vec3.mul(cubeCenter, mass));
	});
	if(totalMass == 0) { // all cubes must be flat
		cubes.forEach(cube => {
			let mass = max(cube.w, 1) * max(cube.h, 1) * max(cube.d, 1);
			totalMass += mass;
			let cubeCenter = vec3.add(cube["pos"], vec3.mul(cube["size"], 0.5));
			if("rot" in cube) {
				cubeCenter = applyEulerRotation(cubeCenter, cube["rot"], cube["pivot"] ?? [8, 8, 8]);
			}
			center = vec3.add(center, vec3.mul(cubeCenter, mass));
		});
	}
	if(totalMass == 0) {
		console.error("0 mass...");
		return [8, 8, 8];
	}
	center = vec3.mul(center, 1 / totalMass);
	return center;
}
/**
 * Scales poly mesh templates faces towards a center of mass.
 * @template {PolyMeshTemplateFace | PolyMeshTemplateFaceWithUvs} T
 * @param {T[]} faces
 * @param {Vec3} centerOfMass
 * @returns {T[]}
 */
export function scaleFaces(faces, centerOfMass, scale) {
	return faces.map(face => {
		for(let i = 0; i < 4; i++) {
			let v = face["vertices"][i];
			let translated = vec3.add(v["pos"], vec3.mul(centerOfMass, -1));
			v["pos"] = vec3.add(vec3.mul(translated, scale), centerOfMass); // I long for the day when ECMAScript has native vector types like in GLSL. This is equivalent to (v["pos"] - centerOfMass) * scale + centerOfMass
		}
		return face;
	});
}
