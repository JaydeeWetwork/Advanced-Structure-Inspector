/**
 * Quad winding and UV crop for one template face.
 * BlockGeoMaker calls these while it owns the template.
 */

import { tuple, vec3 } from "../../utils.js";

/**
 * Cross product of (v1-v0) × (v2-v0) for a 4-vertex face.
 * @param {{ pos: Vec3 }[]} vertices
 * @returns {Vec3}
 */
export function quadWinding(vertices) {
	return vec3.crossProduct(
		vec3.sub(vertices[1]["pos"], vertices[0]["pos"]),
		vec3.sub(vertices[2]["pos"], vertices[0]["pos"])
	);
}
/**
 * @template {{ pos: Vec3 }} V
 * @param {[V, V, V, V]} vertices
 * @returns {[V, V, V, V]}
 */
export function reverseQuad(vertices) {
	return tuple([vertices[0], vertices[3], vertices[2], vertices[1]]);
}
/**
 * Crops a face, modifying the input object.
 * @param {PolyMeshTemplateFace} face
 * @param {Rectangle} crop
 */
export function applyFaceCropping(face, crop) {
	let v0 = face["vertices"][0];
	let v1 = face["vertices"][1];
	let v2 = face["vertices"][2];
	let v3 = face["vertices"][3];
	let v0pos = v0["pos"];
	let v1pos = v1["pos"];
	let v2pos = v2["pos"];
	let v3pos = v3["pos"];
	let textureXDir = vec3.sub(v1pos, v0pos);
	let textureYDir = vec3.sub(v2pos, v0pos);
	let cropXRem = 1 - crop["w"] - crop["x"]; // remaining horizontal space on the other side of the cropped region
	let cropYRem = 1 - crop["h"] - crop["y"];
	v0["pos"] = vec3.add(v0pos, [textureXDir[0] * crop["x"] + textureYDir[0] * crop["y"], textureXDir[1] * crop["x"] + textureYDir[1] * crop["y"], textureXDir[2] * crop["x"] + textureYDir[2] * crop["y"]]);
	v1["pos"] = vec3.add(v1pos, [-textureXDir[0] * cropXRem + textureYDir[0] * crop["y"], -textureXDir[1] * cropXRem + textureYDir[1] * crop["y"], -textureXDir[2] * cropXRem + textureYDir[2] * crop["y"]]);
	v2["pos"] = vec3.add(v2pos, [textureXDir[0] * crop["x"] - textureYDir[0] * cropYRem, textureXDir[1] * crop["x"] - textureYDir[1] * cropYRem, textureXDir[2] * crop["x"] - textureYDir[2] * cropYRem]);
	v3["pos"] = vec3.add(v3pos, [-textureXDir[0] * cropXRem - textureYDir[0] * cropYRem, -textureXDir[1] * cropXRem - textureYDir[1] * cropYRem, -textureXDir[2] * cropXRem - textureYDir[2] * cropYRem]);
}

