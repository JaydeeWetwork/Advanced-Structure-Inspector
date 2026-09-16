import { GEO_SPACE_ENTITY, loadPackGeometryCubes } from "./geoToEngineCubes.js";

export default class EntityGeoMaker {
	resourcePackStack;

	/**
	 * @param {ResourcePackStack} resourcePackStack
	 */
	constructor(resourcePackStack) {
		this.resourcePackStack = resourcePackStack;
	}
	/**
	 * Flatten an entity geo.json (entity space: boxed UV + translate [8,0,8]).
	 * @param {Data.EntityModelInfo} entityModelInfo
	 * @returns {Promise<Data.Cube[]>}
	 */
	async entityModelToCubes(entityModelInfo) {
		return loadPackGeometryCubes(this.resourcePackStack, entityModelInfo, GEO_SPACE_ENTITY);
	}
}

/** @import ResourcePackStack from "./ResourcePackStack.js" */
/** @import * as Data from "./data/schemas" */
