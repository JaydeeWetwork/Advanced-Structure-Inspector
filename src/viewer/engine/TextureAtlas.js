import { hexColorToClampedTriplet, JSONSet, range } from "../../utils.js";
import ResourcePackStack from "./ResourcePackStack.js";
import { packAssetStore } from "../appearance/PackAssetStore.js";
import { VANILLA_SAMPLES_TAG } from "../../data/packPins.js";
import { AtlasComposer } from "./atlasComposer.js";
import {
	findMostExtremePixels,
	setCanvasOpacity,
	setImageDataOpacity,
	tintImageData
} from "./atlasPixels.js";

/** @type {Map<string, { uvs: ImageUv[], atlasImageData: ImageData|null, imageBlobs: [string, Blob|null][], textureWidth: number, textureHeight: number, textureFillEfficiency: number, checkerboardKeys: string[] }>} */
const packedAtlasCache = new Map();
const PACKED_ATLAS_CACHE_MAX = 8;

/**
 * @param {ResourcePackStack} resourcePackStack
 * @param {string} texturePath
 */
function decodeTextureFromPack(resourcePackStack, texturePath) {
	return packAssetStore.decodeTexturePreferLocal(texturePath, resourcePackStack, {
		placeholder: true
	});
}

export default class TextureAtlas {
	#blocksDotJsonPatches;
	#blocksToUseCarriedTextures;
	#transparentBlocks;
	#terrainTextureTints;
	
	blocksDotJson;
	terrainTexture;
	
	#flipbookTexturesAndSizes = new Map();
	/** @type {AtlasComposer} */
	#composer;
	
	/** @type {bedrockLayersPreviewConfig} */
	config;
	resourcePackStack;
	
	/**
	 * When makeAtlas() is called, this will contain UV coordinates and sizes for texture references passed as input, as well as cropping information.
	 * @type {ImageUv[]}
	 */
	uvs;
	
	/**
	 * Contains the actual texture atlas images: [textureName, imageBlob]
	 * @type {[string, Blob][]}
	 */
	imageBlobs;
	/** @type {number} */
	textureWidth;
	/** @type {number} */
	textureHeight;
	/** @type {number} */
	textureFillEfficiency; // how much of the texture atlas is filled with images
	/** Packed atlas pixels — skip PNG encode/decode on the viewer path. @type {ImageData|null} */
	atlasImageData = null;
	
	/**
	 * Creates a texture atlas for loading images from texture references and stitching them together.
	 * @param {bedrockLayersPreviewConfig} config
	 * @param {ResourcePackStack} resourcePackStack
	 * @param {object} blocksDotJson
	 * @param {object} terrainTexture
	 * @param {object} flipbookTextures
	 * @param {Data.TextureAtlasMappings} textureAtlasMappings
	 */
	constructor(config, resourcePackStack, blocksDotJson, terrainTexture, flipbookTextures, textureAtlasMappings) {
		this.config = config;
		this.resourcePackStack = resourcePackStack;
		this.blocksDotJson = blocksDotJson;
		this.terrainTexture = terrainTexture;
		
		this.#blocksDotJsonPatches = textureAtlasMappings["blocks_dot_json_patches"];
		this.#blocksToUseCarriedTextures = textureAtlasMappings["blocks_to_use_carried_textures"];
		this.#transparentBlocks = textureAtlasMappings["transparent_blocks"];
		this.#terrainTextureTints = textureAtlasMappings["terrain_texture_tints"];
		
		textureAtlasMappings["missing_flipbook_textures"].forEach(terrainTextureKey => {
			this.#flipbookTexturesAndSizes.set(terrainTextureKey, 1);
		});
		flipbookTextures.map(entry => {
			this.#flipbookTexturesAndSizes.set(entry["flipbook_texture"], entry["replicate"] ?? 1);
		});
		this.#composer = new AtlasComposer(this.#blocksDotJsonPatches, this.#blocksToUseCarriedTextures);
	}
	/**
	 * Makes a texture atlas from texture references and changes the textureUvs property to reflect UV coordinates and sizes for each reference.
	 * @param {TextureReference[]} textureRefs
	 */
	async makeAtlas(textureRefs) {
		this.checkerboardKeys = new Set();
		const packedKey = JSON.stringify({
			pack: VANILLA_SAMPLES_TAG,
			refs: [...textureRefs],
			outline: this.config.TEXTURE_OUTLINE_WIDTH,
			crop: !!this.config.SKIP_TEXTURE_CROP
		});
		const packedHit = packedAtlasCache.get(packedKey);
		if (packedHit) {
			this.uvs = packedHit.uvs;
			this.atlasImageData = packedHit.atlasImageData;
			this.imageBlobs = packedHit.imageBlobs;
			this.textureWidth = packedHit.textureWidth;
			this.textureHeight = packedHit.textureHeight;
			this.textureFillEfficiency = packedHit.textureFillEfficiency;
			this.checkerboardKeys = new Set(packedHit.checkerboardKeys ?? []);
			console.info("[bLayers] texture atlas cache hit");
			return;
		}
		
		let textureImageIndices = [];
		
		let allTextureFragments = new JSONSet();
		textureRefs.forEach(textureRef => {
			let texturePath;
			let tint = textureRef["tint"];
			let tintLikePng = false;
			let opacity = 1;
			if("texture_path_override" in textureRef) {
				texturePath = textureRef["texture_path_override"];
			} else {
				let terrainTextureKey = this.#composer.terrainKey(this.blocksDotJson, textureRef);
				let blockName = textureRef["block_name"];
				let variant = textureRef["variant"];
				if (terrainTextureKey === "missing") this.#noteCheckerboard(blockName || "missing");
				let texturePathAndTint = this.#composer.pathAndTint(this.terrainTexture, terrainTextureKey, variant);
				texturePath = texturePathAndTint["texturePath"];
				if(tint == undefined && "tint" in texturePathAndTint) {
					tint = hexColorToClampedTriplet(texturePathAndTint["tint"]);
				}
				if(!texturePath) {
					console.error(`No texture for block ${blockName} on side ${textureRef["texture_face"]}!`);
					this.#noteCheckerboard(terrainTextureKey === "missing" ? (blockName || "missing") : terrainTextureKey);
					texturePath = this.#composer.pathAndTint(this.terrainTexture, "missing", -1)["texturePath"];
				}
				
				if(tint == undefined && terrainTextureKey in this.#terrainTextureTints["terrain_texture_keys"]) {
					let tintColor = this.#terrainTextureTints["terrain_texture_keys"][terrainTextureKey];
					if(typeof tintColor == "object") {
						tintLikePng = tintColor["tint_like_png"];
						tintColor = tintColor["tint"];
					}
					if(tintColor.startsWith("#")) {
						tint = hexColorToClampedTriplet(tintColor);
					} else if(tintColor in this.#terrainTextureTints["colors"]) {
						tint = hexColorToClampedTriplet(this.#terrainTextureTints["colors"][tintColor]);
					} else {
						console.error(`No tint color ${tintColor}`);
					}
				}
				if(blockName in this.#transparentBlocks) {
					opacity = this.#transparentBlocks[blockName];
				}
			}
			let textureFragment = {
				"texturePath": texturePath,
				"tint": tint,
				"tint_like_png": tintLikePng,
				"opacity": opacity,
				"uv": textureRef["uv"],
				"uv_size": textureRef["uv_size"]
			};
			allTextureFragments.add(textureFragment);
			textureImageIndices.push(allTextureFragments.indexOf(textureFragment));
			// console.table({
			// 	"index": tintedTexturePaths.indexOf(pathAndTint),
			// 	"uv": textureRef["uv"],
			// 	"uv_size": textureRef["uv_size"]
			// })
		});
		
		let imageFragments = await this.#loadImages(allTextureFragments);
		const stitched = await this.#composer.stitch(imageFragments, this.config);
		this.textureWidth = stitched.textureWidth;
		this.textureHeight = stitched.textureHeight;
		this.textureFillEfficiency = stitched.textureFillEfficiency;
		this.atlasImageData = stitched.atlasImageData;
		this.imageBlobs = stitched.imageBlobs;
		let imageUvs = stitched.imageUvs;

		this.uvs = textureImageIndices.map(i => imageUvs[i]);
		packedAtlasCache.set(packedKey, {
			uvs: this.uvs,
			atlasImageData: this.atlasImageData,
			imageBlobs: this.imageBlobs,
			textureWidth: this.textureWidth,
			textureHeight: this.textureHeight,
			textureFillEfficiency: this.textureFillEfficiency,
			checkerboardKeys: [...this.checkerboardKeys]
		});
		if (packedAtlasCache.size > PACKED_ATLAS_CACHE_MAX) {
			packedAtlasCache.delete(packedAtlasCache.keys().next().value);
		}
	}
	
	/**
	 * @param {string} key block id when blocks.json has no row, otherwise the terrain key
	 */
	#noteCheckerboard(key) {
		this.checkerboardKeys.add(String(key));
	}

	/**
	 * Loads images from a set of tinted texture paths.
	 * @param {JSONSet<TextureFragment>} textureFragments
	 * @returns {Promise<ImageFragment[]>}
	 */
	async #loadImages(textureFragments) {
		const started = performance.now();
		let allTexturePathsWithDuplicates = Array.from(textureFragments).map(textureFragment => textureFragment.texturePath);
		let allTexturePaths = Array.from(new Set(allTexturePathsWithDuplicates));
		const loadStarted = performance.now();
		let allImageData = await Promise.all(allTexturePaths.map(texturePath => decodeTextureFromPack(this.resourcePackStack, texturePath)));
		const loaded = performance.now();
		let imageDataByTexturePath = new Map(allTexturePaths.map((texturePath, i) => [texturePath, allImageData[i]]));
		const fragments = await Promise.all(Array.from(textureFragments).map(async ({ texturePath, tint, tint_like_png: tintLikePng, opacity, uv: sourceUv, uv_size: uvSize }) => {
			let { imageData, imageIsTga, imageNotFound } = imageDataByTexturePath.get(texturePath);
			if(imageNotFound) {
				sourceUv = [0, 0];
				uvSize = [1, 1];
			}
			if(tint) {
				imageData = tintImageData(imageData, tint, imageIsTga && !tintLikePng); // with tinted TGA images, only full-opacity pixels are tinted, and transparent pixels are made opaque.
				// console.debug(`Tinted ${texturePath} with tint ${tint}!`);
			}
			if(opacity != 1) {
				imageData = setImageDataOpacity(imageData, opacity);
			}
			let { width: imageW, height: imageH } = imageData;
			
			if(this.#flipbookTexturesAndSizes.has(texturePath)) {
				let size = this.#flipbookTexturesAndSizes.get(texturePath);
				imageH = imageW = imageW / size; // animation would be a pain and totally overkill
				console.debug(`Using flipbook texture for ${texturePath}, ${imageW}x${imageH}`);
			}
			let u0 = sourceUv[0];
			let v0 = sourceUv[1];
			let uw = uvSize[0];
			let vh = uvSize[1];
			if(uw < 0) {
				u0 += uw;
				uw = -uw;
			}
			if(vh < 0) {
				v0 += vh;
				vh = -vh;
			}
			let sourceX = u0 * imageW;
			let sourceY = v0 * imageH;
			let w = uw * imageW;
			let h = vh * imageH;
			let crop = null;
			if(!this.config.SKIP_TEXTURE_CROP && Number.isInteger(sourceX) && Number.isInteger(sourceY) && Number.isInteger(w) && Number.isInteger(h)) { // textures with non-integral dimensions are wacky so I'm just going to say they can't be cropped... there aren't many blocks like this fortunately
				let old = { sourceX, sourceY, w, h };
				let extremePixels = findMostExtremePixels(imageData, sourceX, sourceY, w, h);
				sourceX = extremePixels["minX"];
				w = extremePixels["maxX"] - extremePixels["minX"] + 1;
				sourceY = extremePixels["minY"];
				h = extremePixels["maxY"] - extremePixels["minY"] + 1;
				crop = {
					"x": (sourceX - old.sourceX) / old.w,
					"y": (sourceY - old.sourceY) / old.h,
					"w": w / old.w,
					"h": h / old.h
				};
				if(crop["x"] != 0 || crop["y"] != 0 || crop["w"] != 1 || crop["h"] != 1) {
					console.debug(`Cropped part of image ${texturePath} to`, crop);
				} else {
					crop = null;
				}
			}
			let imageFragment = { imageData, sourceX, sourceY, w, h };
			if(crop) {
				imageFragment["crop"] = crop;
			}
			return imageFragment;
		}));
		const done = performance.now();
		const sec = (ms) => (ms / 1000).toFixed(2);
		console.info(
			`atlas images ${allTexturePaths.length} files, ${textureFragments.size} fragments, load ${sec(loaded - loadStarted)}s, crop ${sec(done - loaded)}s`
		);
		return fragments;
	}

	/**
	 * Pack-only. Writes hologram opacity PNGs from the stitched ImageData.
	 * The inspector never calls this. Opacity 1 keeps a null blob, matching the old pack zip.
	 * @returns {Promise<[string, Blob|null][]>}
	 */
	async exportPackTextures() {
		if (!this.atlasImageData) {
			this.imageBlobs = [];
			return this.imageBlobs;
		}
		const src = this.atlasImageData;
		const can = new OffscreenCanvas(src.width, src.height);
		can.getContext("2d").putImageData(src, 0, 0);
		const opacity = this.config.OPACITY ?? 1;
		if (this.config.MULTIPLE_OPACITIES) {
			const opacities = range(4, 10).map(x => x / 10);
			this.imageBlobs = await Promise.all(opacities.map(async faded => [`hologram_opacity_${faded}`, await setCanvasOpacity(can, faded).convertToBlob()], 42));
		} else if (opacity != 1) {
			this.imageBlobs = [["hologram", await setCanvasOpacity(can, opacity).convertToBlob()]];
		} else {
			this.imageBlobs = [["hologram", null]];
		}
		return this.imageBlobs;
	}
}

/** @import { TextureReference, TextureFragment, ImageFragment, bedrockLayersPreviewConfig, Vec3, Vec2, Rectangle, ImageUv } from "../../types.js" */
/** @import * as Data from "../../data/schemas" */
