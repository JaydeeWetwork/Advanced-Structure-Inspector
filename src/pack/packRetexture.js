import { addPaddingToImage, lcm, min, overlaySquareImages, removeFalsies, resizeImageToBlob, sha256, toImage, ReplacingPatternMap, pi } from "../utils.js";
import fetchers from "../viewer/engine/fetchers.js";
import { packAssetStore } from "../viewer/appearance/PackAssetStore.js";
import { fetchPackTemplateFile } from "./packLoad.js";

/**
 * Retextures the control items. Modifies `itemTexture` and `terrainTexture`.
 * @param {HoloPrintConfig} config
 * @param {Data.ItemIcons} itemIcons
 * @param {Record<string, string[]>} itemTags
 * @param {object} resourceItemTexture `RP/textures/item_texture.json`
 * @param {object} blocksDotJson
 * @param {object} vanillaTerrainTexture
 * @param {import("../viewer/engine/ResourcePackStack.js").default} resourcePackStack
 * @param {object} itemTexture
 * @param {object} terrainTexture
 * @returns {Promise<{ controlItemTextures: [string, Blob][], hasModifiedTerrainTexture: boolean }>}
 */
export async function retextureControlItems(config, itemIcons, itemTags, resourceItemTexture, blocksDotJson, vanillaTerrainTexture, resourcePackStack, itemTexture, terrainTexture) {
	let controlItemTextures = [];
	let hasModifiedTerrainTexture = false;
	let legacyItemMappings;
	let loadingLegacyItemMappingsPromise;
	let itemIconsMap = new ReplacingPatternMap(Object.entries(itemIcons));
	const controlTextureBasePath = "textures/holoprint/icons";
	await Promise.all(Object.entries(config.CONTROLS).map(async ([control, itemCriteria]) => {
		let controlTexturePromise = fetchPackTemplateFile(`${controlTextureBasePath}/${control.toLowerCase()}.png`).then(res => toImage(res));
		let paddedTexturePromise = controlTexturePromise.then(controlTexture => addPaddingToImage(controlTexture, { // make it small in the top-left corner
			right: 16,
			bottom: 16
		}));
		let controlTexturePath = `${controlTextureBasePath}/~${control.toLowerCase()}`; // because texture compositing works alphabetically not in array order, the ~ forces the control texture to always go on top of the actual item texture
		let controlItemTextureSizes = new Set();
		let allItems = expandItemCriteria(itemCriteria, itemTags);
		await Promise.all(allItems.map(async itemName => {
			itemName = itemIconsMap.get(itemName) ?? itemName;
			let variant = -1;
			if(itemName.includes(".")) {
				let dotIndex = itemName.indexOf(".");
				variant = +itemName.slice(dotIndex + 1);
				itemName = itemName.slice(0, dotIndex);
			}
			let usingTerrainAtlas = false;
			let originalTexturePath = resourceItemTexture["texture_data"][itemName]?.["textures"];
			if(originalTexturePath) {
				if(Array.isArray(originalTexturePath)) {
					if(originalTexturePath.length == 1) {
						variant = 0;
					}
				}
			} else if(itemName in blocksDotJson) {
				if(typeof blocksDotJson[itemName]["carried_textures"] == "string" && vanillaTerrainTexture["texture_data"][blocksDotJson[itemName]["carried_textures"]]["textures"].startsWith?.("textures/items/")) {
					hasModifiedTerrainTexture = true;
					usingTerrainAtlas = true;
					originalTexturePath = vanillaTerrainTexture["texture_data"][blocksDotJson[itemName]["carried_textures"]]["textures"];
					itemName = blocksDotJson[itemName]["carried_textures"];
				} else {
					console.warn(`Cannot retexture control item "${itemName}" because it is a block, and retexturing block items is currently unsupported.`);
					return;
				}
			} else {
				loadingLegacyItemMappingsPromise ??= fetchers.bedrockData("r16_to_current_item_map.json").then(res => res.json()).then(updateMappings => {
					// these mappings are from the old ids to the new ids. we want to go the other way, because bugrock still uses some old ids in item_texture.json
					legacyItemMappings = new Map();
					Object.entries(updateMappings["simple"]).forEach(([oldName, newName]) => {
						legacyItemMappings.set(newName.slice(10), [oldName.slice(10), -1]); // first 10 characters are "minecraft:"
					});
					Object.entries(updateMappings["complex"]).forEach(([oldName, newNames]) => { // complex mappings have indices, used in boats among others
						Object.entries(newNames).forEach(([index, newName]) => {
							legacyItemMappings.set(newName.slice(10), [oldName.slice(10), index]);
						});
					});
				});
				try {
					await loadingLegacyItemMappingsPromise;
				} catch(e) {
					console.error("Somehow failed loading legacy item mappings. Please report this on GitHub!", e);
					return;
				}
				if(!legacyItemMappings.has(itemName)) {
					console.warn(`Can't find control item texture for ${itemName}`);
					return;
				}
				let [oldItemName, legacyVariant] = legacyItemMappings.get(itemName);
				variant = legacyVariant;
				originalTexturePath = resourceItemTexture["texture_data"][oldItemName]?.["textures"];
				if(!originalTexturePath) {
					console.warn(`Can't find control item texture for ${itemName} (${oldItemName})`);
					return;
				}
				itemName = oldItemName; // if the legacy item id has a single item_texture.json texture, we're fine here - just use the old name
			}
			
			if(Array.isArray(originalTexturePath)) { // if it's an array (like boats), we need to load the item texture and manually edit it here.
				if(variant == -1) {
					console.warn(`Don't know which texture to use for control item texture for ${itemName}: [${originalTexturePath}]`);
					return;
				}
				if(!(variant in originalTexturePath)) {
					console.error(`Item texture variant ${variant} for ${itemName} does not exist!`);
					return;
				}
				itemTexture["texture_data"][itemName] ??= {
					"textures": Array.from(originalTexturePath) // clone the whole thing here. this is so we can edit it directly, which means that if we're modifying multiple textures in the same array all can be applied.
				};
				let specificOriginalTexturePath = itemTexture["texture_data"][itemName]["textures"][variant];
				let originalImage;
				try {
					originalImage = await packAssetStore.loadColorImage(specificOriginalTexturePath, resourcePackStack);
					if(!originalImage) throw new Error("missing texture");
				} catch(e) {
					console.warn(`Failed to load texture ${specificOriginalTexturePath} for control item retexturing!`);
					return;
				}
				let overlayedImageBlob = await overlaySquareImages(originalImage, await paddedTexturePromise);
				let newTexturePath = `${specificOriginalTexturePath}_${control.toLowerCase()}.png`;
				controlItemTextures.push([newTexturePath, overlayedImageBlob]);
				itemTexture["texture_data"][itemName]["textures"][variant] = newTexturePath.slice(0, -4);
				console.debug(`Overlayed control texture for ${control} onto ${specificOriginalTexturePath}`);
			} else {
				let itemTextureSize = 16;
				if(resourcePackStack.hasResourcePacks) {
					try {
						let originalImage = await packAssetStore.loadColorImage(originalTexturePath, resourcePackStack);
						if(!originalImage) throw new Error("missing texture");
						itemTextureSize = originalImage.width;
					} catch(e) {
						console.warn(`Could not load item texture ${originalTexturePath} for overlay texture scaling calculations!`, e);
					}
				}
				let safeSize = lcm((await paddedTexturePromise).width, itemTextureSize) * config.CONTROL_ITEM_TEXTURE_SCALE; // When compositing textures, MCBE scales all textures to the maximum, so the size of the overlay control texture has to be the LCM of itself and in-game items. Hence, if in-game items have a higher resolution than expected, they will probably be scaled wrong. The control item texture scale setting will scale them more (but they get reaaaaally big and make the item texture atlas huuuge)
				controlItemTextureSizes.add(safeSize);
				(usingTerrainAtlas? terrainTexture : itemTexture)["texture_data"][itemName] = {
					"textures": [originalTexturePath, `${controlTexturePath}_${safeSize}`],
					"additive": true // texture compositing means resource packs that change the item textures will still work
				};
			}
		}));
		await Promise.all(Array.from(controlItemTextureSizes).map(async size => {
			let resizedImagePath = `${controlTexturePath}_${size}.png`;
			let resizedTextureBlob = await resizeImageToBlob(await paddedTexturePromise, size);
			controlItemTextures.push([resizedImagePath, resizedTextureBlob]);
		}));
	}));
	return { controlItemTextures, hasModifiedTerrainTexture };
}
/**
 * Makes a blob for pack_icon.png based on a structure file's SHA256 hash
 * @param {File} structureFile
 * @returns {Promise<Blob>}
 */

export async function makePackIcon(structureFile) {
	let fileHashBytes = Array.from(await sha256(structureFile));
	let fileHashBits = fileHashBytes.map(byte => [7, 6, 5, 4, 3, 2, 1, 0].map(bitI => byte >> bitI & 0x1)).flat();
	
	const ICON_RESOLUTION = [4, 6][fileHashBytes[1] % 2]; // either 4x4 or 6x6 large tiles
	const ICON_TILE_SIZE = 200 / ICON_RESOLUTION;
	const MORE_TILE_TYPES = false; // adds circles and crosses
	
	let can = new OffscreenCanvas(256, 256);
	// let can = document.createElement("canvas"); can.width = can.height = 256; document.body.appendChild(can);
	let ctx = can.getContext("2d");
	
	ctx.lineWidth = 8;
	ctx.lineCap = "round";
	
	let padding = (can.width - ICON_RESOLUTION * ICON_TILE_SIZE) / 2;
	let drawArc = (x, y, startAngle, endAngle) => {
		ctx.beginPath();
		ctx.arc(x * ICON_TILE_SIZE + padding, y * ICON_TILE_SIZE + padding, ICON_TILE_SIZE / 2, startAngle, endAngle);
		ctx.stroke();
	};
	let drawLine = (x, y, w, h) => {
		ctx.beginPath();
		ctx.moveTo(x * ICON_TILE_SIZE + padding, y * ICON_TILE_SIZE + padding);
		ctx.lineTo((x + w) * ICON_TILE_SIZE + padding, (y + h) * ICON_TILE_SIZE + padding);
		ctx.stroke();
	};
	
	// Truchet pattern
	for(let x = 0; x < ICON_RESOLUTION; x++) {
		for(let y = 0; y < ICON_RESOLUTION; y++) {
			let i = min(x, ICON_RESOLUTION - 1 - x) * ICON_RESOLUTION + y; // x is reflected
			i *= 4;
			let bit = fileHashBits[i];
			if(MORE_TILE_TYPES) {
				if(fileHashBits[i] && fileHashBits[i + 1] && fileHashBits[i + 2] && fileHashBits[i + 3]) {
					drawArc(x + 0.5, y + 0.5, 0, pi * 2);
					continue;
				}
				if(!fileHashBits[i] && !fileHashBits[i + 1] && !fileHashBits[i + 2] && !fileHashBits[i + 3]) {
					drawLine(x, y + 0.5, 1, 0);
					drawLine(x + 0.5, y, 0, 1);
					continue;
				}
			}
			if(bit == +(x >= ICON_RESOLUTION / 2)) {
				drawArc(x, y, 0, pi / 2);
				drawArc(x + 1, y + 1, pi, pi * 3 / 2);
			} else {
				drawArc(x + 1, y, pi / 2, pi);
				drawArc(x, y + 1, pi * 3 / 2, pi * 2);
			}
		}
	}
	
	let hue = fileHashBytes[0] / 256 * 360;
	let grad = ctx.createRadialGradient(can.width / 2, can.height / 2, 0, can.width / 2, can.height / 2, ICON_RESOLUTION * ICON_TILE_SIZE / 2 * Math.SQRT2);
	grad.addColorStop(0, `hsl(${hue}deg, 70%, 50%)`);
	grad.addColorStop(1, `hsl(${hue + 20}deg, 60%, 60%)`);
	ctx.globalCompositeOperation = "source-in"; // draw only where the truchet is
	ctx.fillStyle = grad;
	ctx.fillRect(0, 0, can.width, can.height);
	
	ctx.globalCompositeOperation = "destination-over"; // draw the background underneath
	ctx.fillStyle = `hsl(${hue}deg, 40%, 85%)`;
	ctx.fillRect(0, 0, can.width, can.height);
	
	return await can.convertToBlob();
}
/**
 * Expands item criteria into an array of item names by expanding all item tags.
 * @param {ItemCriteria} itemCriteria
 * @param {Record<string, string[]>} itemTags
 * @returns {string[]}
 */

function expandItemCriteria(itemCriteria, itemTags) {
	let minecraftTags = itemCriteria["tags"].filter(tag => !tag.includes(":")); // we can't find which items are used in custom tags
	let namespacedItemsFromTags = removeFalsies(minecraftTags.map(tag => itemTags[`minecraft:${tag}`]).flat());
	return [...itemCriteria["names"], ...namespacedItemsFromTags.map(itemName => itemName.replace(/^minecraft:/, ""))];
}

/** @import * as Data from "../data/schemas" */
/** @import { ItemCriteria } from "../types.js" */
/** @import { HoloPrintConfig } from "./packTypes.js" */
