/**
 * Official Bedrock entity visuals — Mojang/bedrock-samples only.
 * Structure NBT supplies identifier + pose; geo/PNG come from ResourcePackStack
 * (`resource_pack/…` via fetchers.vanillaData → Mojang/bedrock-samples).
 */

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
 * Flatten bones → cubes in entity space (static pose; ignore animation).
 * Cube origins are Bedrock entity-space. Bone pivot is the default cube pivot.
 *
 * @param {any} geo one minecraft:geometry[] item
 * @returns {{ origin: number[], size: number[], rotation: number[], pivot: number[], uv: any, inflate: number }[]}
 */
export function flattenEntityCubes(geo) {
	const bones = Array.isArray(geo?.bones) ? geo.bones : [];
	/** @type {ReturnType<typeof flattenEntityCubes>} */
	const out = [];
	for (const bone of bones) {
		const bonePivot = Array.isArray(bone?.pivot) ? bone.pivot : [0, 0, 0];
		for (const cube of bone?.cubes ?? []) {
			const origin = [...(cube.origin ?? [0, 0, 0])];
			const size = [...(cube.size ?? [0, 0, 0])];
			const inflate = Number(cube.inflate) || 0;
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
				rotation: Array.isArray(cube.rotation) ? cube.rotation : [0, 0, 0],
				pivot: Array.isArray(cube.pivot) ? cube.pivot : bonePivot,
				uv: cube.uv,
				inflate
			});
		}
	}
	return out;
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
