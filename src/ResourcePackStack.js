// Allows us to stack multiple resource packs on top of each other and get a singular resource, much like Minecraft would do.
// Currently this just grabs the vanilla resources.

import { all as mergeObjects } from "deepmerge";

import LocalResourcePack from "./LocalResourcePack.js";
import { jsonc, removeFalsies } from "./utils.js";
import { packAssetStore } from "./viewer/appearance/PackAssetStore.js";

export default class ResourcePackStack {
	static JSON_FILES_TO_MERGE = ["blocks.json", "textures/terrain_texture.json", "textures/flipbook_textures.json"];
	/** @type {Map<string, Promise<any>>} */
	static #vanillaJsonByPath = new Map();
	
	/**
	 * @param {string} resourcePath
	 * @returns {Promise<any>}
	 */
	static #loadVanillaJson(resourcePath) {
		if(!this.#vanillaJsonByPath.has(resourcePath)) {
			this.#vanillaJsonByPath.set(resourcePath, packAssetStore.getJson(`resource_pack/${resourcePath}`).then(json => {
				if(!json) throw new Error(`Missing vanilla JSON ${resourcePath}`);
				return json;
			}).catch(err => {
				this.#vanillaJsonByPath.delete(resourcePath);
				throw err;
			}));
		}
		return this.#vanillaJsonByPath.get(resourcePath);
	}
	
	/** Whether or not there are any resource packs attached (apart from vanilla ofc) @type {boolean} */
	hasResourcePacks;
	/** @type {LocalResourcePack[]} */
	localResourcePacks;
	
	/**
	 * Creates a resource pack stack to get resources.
	 * @param {LocalResourcePack[]} [localResourcePacks] Local resource packs to apply. Front of the list is on top (i.e. applied first.)
	 */
	constructor(localResourcePacks = []) {
		this.localResourcePacks = localResourcePacks;
		this.hasResourcePacks = localResourcePacks.length > 0;
	}
	
	/**
	 * Fetches a resource pack file.
	 * @param {string} resourcePath
	 * @returns {Promise<Response>}
	 */
	async fetchResource(resourcePath) {
		let filePath = `resource_pack/${resourcePath}`;
		if(ResourcePackStack.JSON_FILES_TO_MERGE.includes(resourcePath)) {
			let vanillaJson = await ResourcePackStack.#loadVanillaJson(resourcePath);
			if(!this.hasResourcePacks) {
				return new Response(JSON.stringify(vanillaJson));
			}
			let resourcePackFiles = this.localResourcePacks.map(resourcePack => resourcePack.getFile(resourcePath));
			let resourcePackJsons = await Promise.all(removeFalsies(resourcePackFiles).map(file => jsonc(file)));
			resourcePackJsons.reverse(); // start with the lowest priority pack, so that they get overwritten by higher priority packs
			let mergedJson = mergeObjects([vanillaJson, ...resourcePackJsons]);
			console.debug(`Merged JSON file ${resourcePath}:`, mergedJson, "From:", [vanillaJson, ...resourcePackJsons]);
			return new Response(JSON.stringify(mergedJson));
		}
		const local = this.getLocalFile(resourcePath);
		if(local) {
			return new Response(local);
		}
		return packAssetStore.fetchVanillaResponse(filePath);
	}

	/**
	 * Overlay pack file only (no vanilla CDN).
	 * @param {string} resourcePath
	 * @returns {File|Blob|null}
	 */
	getLocalFile(resourcePath) {
		for(let localResourcePack of this.localResourcePacks) {
			let resource = localResourcePack.getFile(resourcePath);
			if(resource) return resource;
		}
		return null;
	}
}