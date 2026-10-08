/**
 * Terrain-key lookup and atlas stitch for TextureAtlas.
 * The atlas class keeps the cache, the image load, and the pack export.
 */

import potpack from "potpack";
import { ceil, floor, tuple, vec2 } from "../../utils.js";
import {
	addTextureOutlines,
	checkImageDataEquivalence,
	getImageFragmentTransparencies,
	hashPixels
} from "./atlasPixels.js";
import { applyBlocksJsonPatch } from "../blocksJsonPatch.js";

export class AtlasComposer {
	/**
	 * @param {object} patches
	 * @param {string[]} carried
	 */
	constructor(patches, carried) {
		this.#patches = patches;
		this.#carried = carried;
	}

	/** @type {object} */
	#patches;
	/** @type {string[]} */
	#carried;

	/**
	 * Finds the terrain texture key for a texture reference.
	 * @param {object} blocksDotJson
	 * @param {TextureReference} textureRef
	 * @returns {string}
	 */
	terrainKey(blocksDotJson, textureRef) {
		if("terrain_texture_override" in textureRef) {
			return textureRef["terrain_texture_override"];
		}
		let blockName = textureRef["block_name"];
		if(!(blockName in blocksDotJson) && blockName in this.#patches) {
			const patched = applyBlocksJsonPatch(blockName, this.#patches);
			if(patched.variant != null) {
				textureRef["variant"] = patched.variant;
			}
			blockName = patched.name;
		}
		let blockEntry = blocksDotJson[blockName];
		let terrainTextureKeys;
		if(!blockEntry) {
			console.error(`No blocks.json entry for ${blockName}`);
			return "missing";
		}

		let textureFace = textureRef["texture_face"];
		if(textureFace.startsWith("carried")) {
			if("carried_textures" in blockEntry) {
				if(textureFace == "carried") {
					if(typeof blockEntry["carried_textures"] == "string") {
						return blockEntry["carried_textures"];
					} else {
						console.error(`Specified carried texture for ${blockName} has multiple faces!`);
					}
				} else {
					let carriedFace = textureFace.slice(8);
					let terrainTextureKey = blockEntry["carried_textures"][carriedFace];
					if(["west", "east", "north", "south"].includes(carriedFace)) {
						terrainTextureKey ??= blockEntry["carried_textures"]["side"];
					}
					if(carriedFace == undefined) {
						console.error(`Could not find carried texture face ${carriedFace}!`);
					} else {
						return terrainTextureKey;
					}
				}
			} else {
				console.error(`No carried texture for ${blockName}!`, textureRef, blockEntry);
			}
		}
		if(this.#carried.includes(blockName)) {
			terrainTextureKeys = blockEntry["carried_textures"];
			console.debug(`Using carried textures for ${blockName}`);
			if(!terrainTextureKeys) {
				console.error(`Specified carried texture in blocks.json for ${blockName} could not be found`);
			}
		}
		terrainTextureKeys ??= blockEntry["textures"];
		if(!terrainTextureKeys) {
			if("carried_textures" in blockEntry) {
				terrainTextureKeys = blockEntry["carried_textures"];
				console.error(`No texture entry found in blocks.json for block ${blockName}! Defaulting to carried texture.`);
			} else {
				terrainTextureKeys = "missing";
				console.error(`No texture entry found in blocks.json for block ${blockName}!`);
			}
		}

		if(typeof terrainTextureKeys == "string") {
			return terrainTextureKeys;
		} else {
			return terrainTextureKeys[textureFace] ?? terrainTextureKeys[["west", "east", "north", "south"].includes(textureFace)? "side" : function() {
				let defaultFace = Object.keys(terrainTextureKeys)[0];
				console.error(`Unknown texture face ${textureFace}! Defaulting to ${defaultFace}.`);
				return defaultFace;
			}()];
		}
	}

	/**
	 * Gets the texture path from a terrain texture key and variant index.
	 * @param {object} terrainTexture
	 * @param {string} terrainTextureKey
	 * @param {number} variant
	 * @returns {{ texturePath: string, tint?: string }}
	 */
	pathAndTint(terrainTexture, terrainTextureKey, variant) {
		let texturePath = terrainTexture["texture_data"][terrainTextureKey]?.["textures"];
		if(!texturePath) {
			console.warn(`No terrain_texture.json entry for key ${terrainTextureKey}`);
			return;
		}
		if(Array.isArray(texturePath)) {
			if(texturePath.length == 1) {
				texturePath = texturePath[0];
			} else {
				if(variant == -1) {
					console.debug(
						`No texture variant for terrain key ${terrainTextureKey}; using first`
					);
					variant = 0;
				}
				if(!(variant in texturePath)) {
					console.error(`Variant ${variant} does not exist for terrain texture key ${terrainTextureKey}! Defaulting to 0.`);
					variant = 0;
				}
				texturePath = texturePath[variant];
			}
		}
		if(typeof texturePath == "string") {
			return { texturePath };
		} else {
			return {
				"texturePath": texturePath["path"],
				"tint": texturePath["overlay_color"] ?? texturePath["tint_color"]
			};
		}
	}

	/**
	 * Stitches images. The atlas assigns the returned size and pixels itself.
	 * @param {ImageFragment[]} imageFragments
	 * @param {{ TEXTURE_OUTLINE_WIDTH: number }} config
	 * @returns {Promise<{ imageUvs: ImageUv[], textureWidth: number, textureHeight: number, textureFillEfficiency: number, atlasImageData: ImageData, imageBlobs: null }>}
	 */
	async stitch(imageFragments, config) {
		const started = performance.now();
		/** @type {Map<number, [ImageFragment, number]>} */
		let hashBuckets = new Map();
		/** @type {Map<number, number>} */
		let identicalFragmentIndices = new Map();
		imageFragments.forEach((imageFragment, i) => {
			imageFragment["i"] = i;
			let pixelsHash = hashPixels(imageFragment);
			if(hashBuckets.has(pixelsHash)) {
				let [oldFrag, oldI] = hashBuckets.get(pixelsHash);
				if(oldFrag.w == imageFragment.w && oldFrag.h == imageFragment.h) {
					if(checkImageDataEquivalence(oldFrag.imageData, imageFragment.imageData, oldFrag.sourceX, oldFrag.sourceY, imageFragment.sourceX, imageFragment.sourceY, imageFragment.w, imageFragment.h)) {
						identicalFragmentIndices.set(i, oldI);
						imageFragment["w"] = 0;
						imageFragment["h"] = 0;
						return;
					}
					console.debug("Extremely rare hash collision! 0.000000023283% chance!");
				}
			}
			hashBuckets.set(pixelsHash, [imageFragment, i]);
			imageFragment["actualSize"] = [imageFragment["w"], imageFragment["h"]];
			imageFragment["offset"] = [0, 0];
			if(!Number.isInteger(imageFragment["sourceX"])) {
				imageFragment["offset"][0] = imageFragment["sourceX"] % 1;
				imageFragment["w"] += imageFragment["offset"][0];
				imageFragment["sourceX"] = floor(imageFragment["sourceX"]);
			}
			if(!Number.isInteger(imageFragment["sourceY"])) {
				imageFragment["offset"][1] = imageFragment["sourceY"] % 1;
				imageFragment["h"] += imageFragment["offset"][1];
				imageFragment["sourceY"] = floor(imageFragment["sourceY"]);
			}
			if(!Number.isInteger(imageFragment["w"])) {
				imageFragment["w"] = ceil(imageFragment["w"]);
			}
			if(!Number.isInteger(imageFragment["h"])) {
				imageFragment["h"] = ceil(imageFragment["h"]);
			}
		});
		let imageFragments2 = imageFragments.map(imageFragment => ({ ...imageFragment }));
		let packing1 = potpack(imageFragments);
		let packing2 = potpack(imageFragments2.sort((a, b) => b.h - a.h || b.w - a.w));
		let packing = packing1.fill > packing2.fill? packing1 : packing2;
		if(packing2.fill >= packing1.fill) {
			imageFragments = imageFragments2;
		}
		imageFragments.sort((a, b) => a["i"] - b["i"]);
		/** @type {(ImageFragment & Rectangle & { actualSize: Vec2, offset: Vec2 })[]} */
		// @ts-ignore
		let packedImageFragments = imageFragments;
		const textureWidth = packing.w;
		const textureHeight = packing.h;
		const textureFillEfficiency = packing.fill;

		let can = new OffscreenCanvas(textureWidth, textureHeight);
		let ctx = can.getContext("2d");
		let imageUvs = [];
		packedImageFragments.forEach((imageFragment, i) => {
			if(identicalFragmentIndices.has(i)) {
				imageUvs.push(imageUvs[identicalFragmentIndices.get(i)]);
				return;
			}
			let sourcePos = tuple([imageFragment.sourceX, imageFragment.sourceY]);
			let destPos = tuple([imageFragment.x, imageFragment.y]);
			let textureSize = tuple([imageFragment.w, imageFragment.h]);
			ctx.putImageData(imageFragment.imageData, ...vec2.sub(destPos, sourcePos), ...sourcePos, ...textureSize);
			let imageUv = {
				"uv": vec2.add(destPos, imageFragment["offset"]),
				"uv_size": imageFragment["actualSize"],
				"transparency": NaN
			};
			if("crop" in imageFragment) {
				imageUv["crop"] = imageFragment["crop"];
			}
			imageUvs.push(imageUv);
		});
		let canImageData = can.getContext("2d").getImageData(0, 0, can.width, can.height);
		let transparencies = getImageFragmentTransparencies(canImageData, packedImageFragments);
		transparencies.forEach((transparency, i) => {
			imageUvs[i]["transparency"] = transparency;
		});

		if(config.TEXTURE_OUTLINE_WIDTH != 0) {
			can = addTextureOutlines(can, packedImageFragments, config, canImageData);
			canImageData = can.getContext("2d").getImageData(0, 0, can.width, can.height);
		}

		console.info(
			`atlas stitch ${textureWidth}×${textureHeight} ${(textureFillEfficiency * 100).toFixed(2)}% ${((performance.now() - started) / 1000).toFixed(2)}s`
		);
		return {
			imageUvs,
			textureWidth,
			textureHeight,
			textureFillEfficiency,
			atlasImageData: canImageData,
			imageBlobs: null
		};
	}
}

/** @import { TextureReference, ImageFragment, Vec2, Rectangle, ImageUv } from "../../types.js" */
