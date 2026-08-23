/**
 * Official Bedrock entity visuals — Mojang/bedrock-samples only.
 * Structure NBT supplies identifier + pose; geo/PNG come from ResourcePackStack
 * (`resource_pack/…` via fetchers.vanillaData → Mojang/bedrock-samples).
 *
 * Cube/bone rules (geometry 1.12.0):
 * - cube rotation is x-then-y-then-z around cube.pivot, else the box center
 *   (NOT the parent bone pivot). Schema: bedrock-studio/bedrock-json-schemas
 *   + Microsoft geometry.v1.12.0.
 * - bone.rotation / parent is animation bind-pose; cubes are model-space.
 * Three.js reference: PrismarineJS/prismarine-viewer `viewer/lib/entity/Entity.js`
 * (negated euler, bone hierarchy). Their cube euler is around 0,0,0 — we rotate
 * around the schema pivot instead.
 */

import { applyBlockGeoEuler } from "./previewSpace.js";
import { entityMeshKind } from "./entityExtract.js";

/**
 * @typedef {object} VanillaEntityModelDef
 * @property {string} entityFile  client entity JSON under resource_pack/
 * @property {string} geoFile
 * @property {string[]} geoIds  preferred geometry identifiers (first match)
 * @property {string} texture   path without extension
 * @property {"none"|"chest"|"hopper"|"tnt"|"command"} cargo
 */

/** @type {Record<string, VanillaEntityModelDef>} */
export const VANILLA_ENTITY_MODELS = {
	minecart: {
		entityFile: "entity/minecart.entity.json",
		geoFile: "models/entity/minecart.geo.json",
		geoIds: ["geometry.minecart.v1.8", "geometry.minecart"],
		texture: "textures/entity/minecart",
		cargo: "none"
	},
	hopper_minecart: {
		entityFile: "entity/hopper_minecart.entity.json",
		geoFile: "models/entity/minecart.geo.json",
		geoIds: ["geometry.minecart.v1.8", "geometry.minecart"],
		texture: "textures/entity/minecart",
		cargo: "hopper"
	},
	chest_minecart: {
		entityFile: "entity/chest_minecart.entity.json",
		geoFile: "models/entity/minecart.geo.json",
		geoIds: ["geometry.minecart.v1.8", "geometry.minecart"],
		texture: "textures/entity/minecart",
		cargo: "chest"
	},
	tnt_minecart: {
		entityFile: "entity/tnt_minecart.entity.json",
		geoFile: "models/entity/minecart.geo.json",
		geoIds: ["geometry.minecart.v1.8", "geometry.minecart"],
		texture: "textures/entity/minecart",
		cargo: "tnt"
	},
	command_block_minecart: {
		entityFile: "entity/command_block_minecart.entity.json",
		geoFile: "models/entity/minecart.geo.json",
		geoIds: ["geometry.minecart.v1.8", "geometry.minecart"],
		texture: "textures/entity/minecart",
		cargo: "command"
	}
};

/**
 * @param {string} identifier
 * @returns {VanillaEntityModelDef|null}
 */
export function vanillaModelDefFor(identifier) {
	const kind = entityMeshKind(identifier);
	if (!kind) return null;
	return VANILLA_ENTITY_MODELS[kind] ?? null;
}

/**
 * Pick a geometry block from a Bedrock geo JSON file.
 * Client entity files often ask for `geometry.minecart` while the geo file
 * only ships `geometry.minecart.v1.8`.
 *
 * @param {any} geoFile
 * @param {string|string[]} wanted
 */
export function pickGeometry(geoFile, wanted) {
	const list = Array.isArray(geoFile?.["minecraft:geometry"])
		? geoFile["minecraft:geometry"]
		: [];
	const want = Array.isArray(wanted) ? wanted : [wanted];
	for (const id of want) {
		const exact = list.find(g => g?.description?.identifier === id);
		if (exact) return exact;
	}
	for (const id of want) {
		const prefix = list.find(g =>
			String(g?.description?.identifier || "").startsWith(String(id))
		);
		if (prefix) return prefix;
	}
	return list[0] ?? null;
}

/**
 * Cube rotation pivot: explicit cube.pivot, else center of the (inflated) box.
 * @param {number[]} origin
 * @param {number[]} size
 * @param {number[]|null|undefined} cubePivot
 * @returns {number[]}
 */
export function cubeRotationPivot(origin, size, cubePivot) {
	if (Array.isArray(cubePivot) && cubePivot.length >= 3) {
		return [Number(cubePivot[0]) || 0, Number(cubePivot[1]) || 0, Number(cubePivot[2]) || 0];
	}
	return [
		(Number(origin[0]) || 0) + (Number(size[0]) || 0) / 2,
		(Number(origin[1]) || 0) + (Number(size[1]) || 0) / 2,
		(Number(origin[2]) || 0) + (Number(size[2]) || 0) / 2
	];
}

/**
 * @param {any} bone
 * @returns {number[]}
 */
function boneBindRotation(bone) {
	if (Array.isArray(bone?.bind_pose_rotation) && bone.bind_pose_rotation.length >= 3) {
		return [...bone.bind_pose_rotation];
	}
	if (Array.isArray(bone?.rotation) && bone.rotation.length >= 3) {
		return [...bone.rotation];
	}
	return [0, 0, 0];
}

/**
 * Flatten bones → cubes in model space (static bind pose).
 * Cube origins stay in entity/model space. Default cube pivot is the box
 * center (Microsoft 1.12.0 schema) — never the bone pivot.
 *
 * @param {any} geo one minecraft:geometry[] item
 * @returns {{ origin: number[], size: number[], rotation: number[], pivot: number[], uv: any, inflate: number, boneChain: { pivot: number[], rotation: number[] }[] }[]}
 */
export function flattenEntityCubes(geo) {
	const bones = Array.isArray(geo?.bones) ? geo.bones : [];
	/** @type {Map<string, any>} */
	const byName = new Map();
	for (const bone of bones) {
		if (bone?.name) byName.set(String(bone.name), bone);
	}

	const boneChainFor = (startName) => {
		/** @type {{ pivot: number[], rotation: number[] }[]} */
		const chain = [];
		const seen = new Set();
		let name = startName;
		while (name && byName.has(name) && !seen.has(name)) {
			seen.add(name);
			const b = byName.get(name);
			chain.push({
				pivot: Array.isArray(b.pivot) ? [...b.pivot] : [0, 0, 0],
				rotation: boneBindRotation(b)
			});
			name = b.parent ? String(b.parent) : "";
		}
		return chain;
	};

	/** @type {ReturnType<typeof flattenEntityCubes>} */
	const out = [];
	for (const bone of bones) {
		const chain = boneChainFor(bone?.name ? String(bone.name) : "");
		for (const cube of bone?.cubes ?? []) {
			const origin = [...(cube.origin ?? [0, 0, 0])];
			const size = [...(cube.size ?? [0, 0, 0])];
			const inflate = Number(cube.inflate) || Number(bone?.inflate) || 0;
			if (inflate) {
				origin[0] -= inflate;
				origin[1] -= inflate;
				origin[2] -= inflate;
				size[0] += inflate * 2;
				size[1] += inflate * 2;
				size[2] += inflate * 2;
			}
			out.push({
				origin,
				size,
				rotation: Array.isArray(cube.rotation) ? [...cube.rotation] : [0, 0, 0],
				pivot: cubeRotationPivot(origin, size, cube.pivot),
				uv: cube.uv,
				inflate,
				boneChain: chain
			});
		}
	}
	return out;
}

/**
 * Model-space point after cube rotation then parent bone bind-pose.
 * @param {[number, number, number]} pos
 * @param {{ rotation: number[], pivot: number[], boneChain?: { pivot: number[], rotation: number[] }[] }} cube
 * @returns {[number, number, number]}
 */
export function transformEntityPoint(pos, cube) {
	let p = applyBlockGeoEuler(pos, cube.rotation, cube.pivot);
	for (const bone of cube.boneChain ?? []) {
		const r = bone.rotation;
		if (!r || (r[0] === 0 && r[1] === 0 && r[2] === 0)) continue;
		p = applyBlockGeoEuler(p, r, bone.pivot);
	}
	return p;
}

/**
 * Bedrock box-UV faces (same layout as BlockGeoMaker.#calculateUv for entities).
 * Values are in texture pixels; add `uvOrigin` then divide by texture size.
 *
 * @param {[number, number, number]} boxSize
 * @param {boolean} [flipEastWest=true]
 */
export function boxUvLayout(boxSize, flipEastWest = true) {
	const w = Number(boxSize[0]) || 0;
	const h = Number(boxSize[1]) || 0;
	const d = Number(boxSize[2]) || 0;
	return {
		up: { uv: [d, 0], uv_size: [w, d] },
		down: { uv: [w + d, 0], uv_size: [w, d] },
		west: { uv: [flipEastWest ? w + d : 0, d], uv_size: [d, h] },
		north: { uv: [d, d], uv_size: [w, h] },
		east: { uv: [flipEastWest ? 0 : w + d, d], uv_size: [d, h] },
		south: { uv: [w + d * 2, d], uv_size: [w, h] }
	};
}
