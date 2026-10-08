import { ZipWriter, TextReader, BlobWriter, BlobReader } from "@zip.js/zip.js";

import BlockGeoMaker from "../viewer/engine/BlockGeoMaker.js";
import TextureAtlas from "../viewer/engine/TextureAtlas.js";
import MaterialList from "./MaterialList.js";
import PreviewRenderer from "../viewer/engine/PreviewRenderer.js";

import entityScripts from "./entityScripts.molang.js";
import { array2DToMolang, arrayToMolang, awaitAllEntries, concatenateFiles, desparseArray, functionToMolang, hexColorToClampedTriplet, itemCriteriaToMolang, max, onEvent, removeFalsies, setImageOpacity, toBlob, toImage, transposeMatrix, tuple, UserError, getStructureIndexFromCoordinates, getGeoSpaceBlockPos, loadTranslationLanguage } from "../utils.js";
import ResourcePackStack from "../viewer/engine/ResourcePackStack.js";
import SpawnAnimationMaker from "./SpawnAnimationMaker.js";
import PolyMeshMaker from "./PolyMeshMaker.js";
import fetchers from "../viewer/engine/fetchers.js";
import EntityGeoMaker from "../viewer/engine/EntityGeoMaker.js";
import EntityManager from "./EntityManager.js";
import { applyNeighborConnections } from "../viewer/fenceConnections.js";
import { mergeMultiplePalettesAndIndices, stripPaletteVersions, tweakBlockPalette } from "../viewer/palette.js";
import {
	addDefaultConfig,
	DEFAULT_PLAYER_CONTROLS,
	findLinksInDescription,
	getDefaultPackName,
	readStructureNBT,
	VERSION
} from "./packConfig.js";
import { loadBedrockMetadataFiles, loadDataFiles, loadPackTemplate, loadResources } from "./packLoad.js";
import {
	HOLOGRAM_LAYER_MODES,
	addBoundingBoxParticles,
	addCoordinateLocatorToHologramGeo,
	addPlayerControlsToRenderControllers,
	handleBlockValidation,
	makeLayerAnimations
} from "./hologramMotion.js";
import {
	addInfoScreenUIPages,
	addMaterialListUI,
	getLayerDiagramTextureName,
	makeLangFiles,
	makeMaterialListsForEachStructureAndEachLayer,
	translateControlItems
} from "./packPages.js";
import { makePackIcon, retextureControlItems } from "./packRetexture.js";
import { assertSafePackEntryName, particleNameFor, resetParticleNames } from "./particleName.js";

function packDataFileNames(retexture) {
	const names = ["textureAtlasMappings", "blockShapes", "blockShapeGeos", "blockStateDefinitions", "blockEigenvariants", "materialListMappings"];
	if (retexture) names.push("itemIcons");
	return names;
}

/**
 * Makes a HoloPrint resource pack from a structure file.
 * @param {File | File[]} structureFiles
 * @param {Partial<HoloPrintConfig>} [partialConfig]
 * @param {ResourcePackStack} [resourcePackStack]
 * @param {Element} [previewCont]
 * @returns {Promise<{ pack: File, materialList: MaterialList, previews?: Promise<PreviewRenderer[]> }>}
 */
export async function makePack(structureFiles, partialConfig, resourcePackStack = new ResourcePackStack(), previewCont) {
	const loaded = await loadPackInputs(structureFiles, partialConfig, resourcePackStack);
	const geometry = await buildPackGeometry(loaded);
	const hologram = await buildHologramEntities(geometry);
	const described = await describePack(hologram);
	return zipPack(described, previewCont);
}

async function loadPackInputs(structureFiles, partialConfig, resourcePackStack) {
	console.info(`Running HoloPrint ${VERSION}`);
	let startTime = performance.now();
	
	let config = addDefaultConfig(partialConfig ?? {});
	if(!Array.isArray(structureFiles)) {
		structureFiles = [structureFiles];
	}
	let nbts = await Promise.all(structureFiles.map(structureFile => readStructureNBT(structureFile)));
	console.info("Finished reading structure NBTs!");
	console.log("NBTs:", nbts);
	let structureSizes = nbts.map(nbt => nbt["size"]);
	let packName = config.PACK_NAME ?? getDefaultPackName(structureFiles);
	
	let packTemplatePromise = loadPackTemplate({
		manifest: "manifest.json",
		hologramRenderControllers: "render_controllers/holoprint.hologram.render_controllers.json",
		hologramGeo: "models/entity/holoprint.hologram.geo.json", // this is where we put all the ghost blocks
		entity: "materials/entity.material",
		hologramAnimationControllers: "animation_controllers/holoprint.hologram.animation_controllers.json",
		hologramAnimations: "animations/holoprint.hologram.animation.json",
		bounding_box_outline: "particles/bounding_box_outline.json",
		blockValidationParticle: "particles/block_validation.json",
		saving_backup: "particles/saving_backup.json",
		singleWhitePixelTexture: "textures/holoprint/particle/single_white_pixel.png",
		_exclamation_mark: "textures/holoprint/particle/exclamation_mark.png",
		_save_icon: "textures/holoprint/particle/save_icon.png",
		itemTexture: config.RETEXTURE_CONTROL_ITEMS? "textures/item_texture.json" : undefined,
		terrainTexture: config.RETEXTURE_CONTROL_ITEMS? "textures/terrain_texture.json" : undefined,
		...(config.UI_CONTROLS_ENABLED? {
			_toggle_rendering: "textures/holoprint/icons/toggle_rendering.png",
			_change_opacity: "textures/holoprint/icons/change_opacity.png",
			_increase_opacity: "textures/holoprint/icons/increase_opacity.png",
			_toggle_tint: "textures/holoprint/icons/toggle_tint.png",
			_toggle_validating: "textures/holoprint/icons/toggle_validating.png",
			_change_layer: "textures/holoprint/icons/change_layer.png",
			_increase_layer: "textures/holoprint/icons/increase_layer.png",
			_decrease_layer: "textures/holoprint/icons/decrease_layer.png",
			_change_layer_mode: "textures/holoprint/icons/change_layer_mode.png",
			_move_hologram_x: "textures/holoprint/icons/move_hologram_x.png",
			_move_hologram_y: "textures/holoprint/icons/move_hologram_y.png",
			_move_hologram_z: "textures/holoprint/icons/move_hologram_z.png",
			_rotate_hologram: "textures/holoprint/icons/rotate_hologram.png",
			_change_structure: "textures/holoprint/icons/change_structure.png",
			_backup_hologram: "textures/holoprint/icons/backup_hologram.png",
			_menu_sliders_icon: "textures/holoprint/ui/menu_sliders_icon.png",
			_menu_button_unpressed: "textures/holoprint/ui/menu_button_unpressed.png",
			_menu_button_pressed: "textures/holoprint/ui/menu_button_pressed.png",
			_material_list_button_unpressed: "textures/holoprint/ui/material_list_button_unpressed.png",
			_material_list_button_pressed: "textures/holoprint/ui/material_list_button_pressed.png",
			_quick_input_keyboard_hints: "textures/holoprint/ui/quick_input_keyboard_hints.png",
			hud_screen: "ui/hud_screen.json",
			holoprint_keybinds: "ui/holoprint_keybinds.json",
			holoprint_touch_buttons: "ui/holoprint_touch_buttons.json"
		} : {}),
		_white_circle: "textures/holoprint/ui/white_circle.png",
		white_circle: "textures/holoprint/ui/white_circle.json",
		materialListUI: "ui/holoprint_material_list.json",
		f_ui_defs: "ui/_ui_defs.json",
		f_global_variables: "ui/_global_variables.json",
		holoprint_common: "ui/holoprint_common.json",
		infoScreenUI: "ui/holoprint_info_screen.json",
		pause_screen: "ui/pause_screen.json",
		start_screen: "ui/start_screen.json",
		tabbed_upsell_screen: "ui/tabbed_upsell_screen.json",
		win10_trial_conversion_screen: "ui/win10_trial_conversion_screen.json",
		_logo_192: "textures/holoprint/ui/logo_192.png",
		_banner: "textures/holoprint/ui/banner.png",
		_glyph_E2: "font/glyph_E2.png",
		languagesDotJson: "texts/languages.json"
	});
	let resourcesPromise = loadResources({
		armorStandEntityFile: "entity/armor_stand.entity.json",
		leashKnotEntityFile: "entity/leash_knot.entity.json",
		blocksDotJson: "blocks.json",
		vanillaTerrainTexture: "textures/terrain_texture.json",
		flipbookTextures: "textures/flipbook_textures.json",
		defaultPlayerRenderControllers: config.PLAYER_CONTROLS_ENABLED? "render_controllers/player.render_controllers.json" : undefined,
		resourceItemTexture: config.RETEXTURE_CONTROL_ITEMS? "textures/item_texture.json" : undefined
	}, resourcePackStack);
	
	let controlsHaveBeenCustomised = JSON.stringify(config.CONTROLS) != JSON.stringify(DEFAULT_PLAYER_CONTROLS);
	let itemTagsPromise;
	if(controlsHaveBeenCustomised || config.RENAME_CONTROL_ITEMS || config.RETEXTURE_CONTROL_ITEMS) {
		itemTagsPromise = fetchers.bedrockData("item_tags.json").then(res => res.json());
	}
	
	let dataPromise = loadDataFiles(packDataFileNames(config.RETEXTURE_CONTROL_ITEMS));
	let { languagesDotJson, bedrockMetadata } = await awaitAllEntries({
		languagesDotJson: /** @type {Promise<string[]>} */ (packTemplatePromise.languagesDotJson),
		bedrockMetadata: loadBedrockMetadataFiles({
			blocks: "vanilladata_modules/mojang-blocks.json",
			items: "vanilladata_modules/mojang-items.json"
		})
	});
	let resourceLangFilesPromise = loadResources(Object.fromEntries(languagesDotJson.map(language => [language, `texts/${language}.lang`])), resourcePackStack);
	let packTemplateLangFilesPromise = loadPackTemplate(Object.fromEntries(languagesDotJson.map(language => [language, `texts/${language}.lang`]))).allValues;
	let translationLanguagesLoadingPromise = Promise.all(languagesDotJson.map(language => loadTranslationLanguage(language, "../translations")));
	/** @type {Promise<{ controlItemTextures: [string, Blob][], hasModifiedTerrainTexture: boolean }>} */
	let retexturingControlItemsPromise = Promise.resolve({
		controlItemTextures: [],
		hasModifiedTerrainTexture: false
	});
	if(config.RETEXTURE_CONTROL_ITEMS) {
		retexturingControlItemsPromise = itemTagsPromise.then(async itemTags => {
			return retextureControlItems(config, await dataPromise.itemIcons, itemTags, await resourcesPromise.resourceItemTexture, await resourcesPromise.blocksDotJson, await resourcesPromise.vanillaTerrainTexture, resourcePackStack, await packTemplatePromise.itemTexture, await packTemplatePromise.terrainTexture);
		});
	}
	let packIcon = config.PACK_ICON_BLOB ?? await makePackIcon(concatenateFiles(structureFiles));
	
	let structures = nbts.map(nbt => nbt["structure"]);
	
	return { structureFiles, resourcePackStack, startTime, config, nbts, structureSizes, packName, packTemplatePromise, resourcesPromise, controlsHaveBeenCustomised, itemTagsPromise, dataPromise, languagesDotJson, bedrockMetadata, resourceLangFilesPromise, packTemplateLangFilesPromise, translationLanguagesLoadingPromise, retexturingControlItemsPromise, packIcon, structures };
}

async function buildPackGeometry(state) {
	const { resourcePackStack, config, nbts, structureSizes, dataPromise, resourcesPromise, packTemplatePromise, structures } = state;
	let palettesAndIndices = await Promise.all(structures.map(structure => tweakBlockPalette(structure, config.IGNORED_BLOCKS)));
	for (const entry of palettesAndIndices) stripPaletteVersions(entry.palette);
	let data = await dataPromise.all;
	palettesAndIndices = palettesAndIndices.map((entry, i) => {
		const size = [Number(nbts[i]?.["size"]?.[0] ?? 0), Number(nbts[i]?.["size"]?.[1] ?? 0), Number(nbts[i]?.["size"]?.[2] ?? 0)];
		return applyNeighborConnections(size, entry.palette, entry.indices, data.blockShapes);
	});
	let { palette: blockPalette, indices: allStructureIndicesByLayer } = mergeMultiplePalettesAndIndices(palettesAndIndices);
	if(desparseArray(blockPalette).length == 0) {
		throw new UserError(`Structure is empty! No blocks are inside the structure.`);
	}
	console.log("combined palette: ", blockPalette);
	console.log("remapped indices: ", allStructureIndicesByLayer);
	
	let entityGeoMaker = new EntityGeoMaker(resourcePackStack);
	let blockGeoMaker = new BlockGeoMaker(config, entityGeoMaker, data.blockShapes, data.blockShapeGeos, data.blockStateDefinitions, data.blockEigenvariants);
	// makePolyMeshTemplates() is an impure function and adds texture references to the textureRefs set property.
	// this is done as a struct of arrays rather than an array of structs, because the UVs are resolved later and carrying the centers of mass along would be a bit awkward.
	let { templates: unresolvedPolyMeshTemplatePalette, centersOfMass, shapes: shapeByPalette } = await blockGeoMaker.makePolyMeshTemplates(blockPalette);
	console.info("Finished making block geometry templates!");
	console.log("Block geo maker:", blockGeoMaker);
	console.log("Poly mesh template palette:", structuredClone(unresolvedPolyMeshTemplatePalette));
	
	let { armorStandEntityFile, leashKnotEntityFile, defaultPlayerRenderControllers, blocksDotJson, vanillaTerrainTexture, flipbookTextures } = await resourcesPromise.allValues;
	let textureAtlas = new TextureAtlas(config, resourcePackStack, blocksDotJson, vanillaTerrainTexture, flipbookTextures, data.textureAtlasMappings);
	let textureRefs = Array.from(blockGeoMaker.textureRefs);
	await textureAtlas.makeAtlas(textureRefs); // each texture reference will get added to the textureUvs array property
	await textureAtlas.exportPackTextures();
	let textureBlobs = textureAtlas.imageBlobs;
	let fullOpacityTextureBlob = textureBlobs.at(-1)[1];
	let defaultTextureIndex = max(textureBlobs.length - 3, 0); // default to 80% opacity
	
	console.log("Texture UVs:", textureAtlas.uvs);
	let unscaledPolyMeshTemplatePalette = unresolvedPolyMeshTemplatePalette.map(polyMeshTemplate => BlockGeoMaker.resolveTemplateFaceUvs(polyMeshTemplate, textureAtlas));
	let polyMeshTemplatePalette = blockGeoMaker.scaleFaceTemplates(unscaledPolyMeshTemplatePalette, centersOfMass, shapeByPalette);
	console.log("Poly mesh template palette with resolved UVs:", polyMeshTemplatePalette);
	
	let structureDiagramsAndIndices = await makeStructureDiagrams(config, fullOpacityTextureBlob, unscaledPolyMeshTemplatePalette, allStructureIndicesByLayer, structureSizes);
	
	let { manifest, hologramRenderControllers, hologramGeo, hologramAnimationControllers, hologramAnimations, blockValidationParticle, singleWhitePixelTexture, materialListUI, infoScreenUI } = await packTemplatePromise.allValues;
	
	const next = {
		...state,
		data,
		blockPalette,
		allStructureIndicesByLayer,
		shapeByPalette,
		armorStandEntityFile,
		leashKnotEntityFile,
		defaultPlayerRenderControllers,
		textureAtlas,
		textureBlobs,
		fullOpacityTextureBlob,
		defaultTextureIndex,
		polyMeshTemplatePalette,
		structureDiagramsAndIndices,
		manifest,
		hologramRenderControllers,
		hologramGeo,
		hologramAnimationControllers,
		hologramAnimations,
		blockValidationParticle,
		singleWhitePixelTexture,
		materialListUI,
		infoScreenUI
	};
	delete next.nbts;
	delete next.structures;
	delete next.resourcePackStack;
	delete next.resourcesPromise;
	delete next.dataPromise;
	return next;
}

async function buildHologramEntities(state) {
	const {
		structureFiles, config, structureSizes, bedrockMetadata, data, blockPalette, allStructureIndicesByLayer,
		armorStandEntityFile, leashKnotEntityFile, defaultPlayerRenderControllers,
		textureAtlas, textureBlobs, defaultTextureIndex, polyMeshTemplatePalette,
		hologramRenderControllers, hologramGeo, hologramAnimationControllers, hologramAnimations,
		singleWhitePixelTexture
	} = state;
	let structureGeoTemplate = hologramGeo["minecraft:geometry"][0];
	hologramGeo["minecraft:geometry"].splice(0, 1);
	
	structureGeoTemplate["description"]["texture_width"] = textureAtlas.textureWidth;
	structureGeoTemplate["description"]["texture_height"] = textureAtlas.textureHeight;
	
	let leashKnotModeArmorStandEntityFile = structuredClone(armorStandEntityFile);
	let entityManager = new EntityManager({ armorStandEntityFile, leashKnotEntityFile });
	
	let totalBlockCount = 0;
	let maxHeight = max(...structureSizes.map(structureSize => structureSize[1]));
	let layerIsEmpty = (new Array(maxHeight)).fill(true);
	
	let polyMeshMaker = new PolyMeshMaker(polyMeshTemplatePalette);
	let materialList = new MaterialList(bedrockMetadata.blocks, bedrockMetadata.items, data.materialListMappings);
	allStructureIndicesByLayer.forEach((structureIndicesByLayer, structureI) => {
		let structureSize = structureSizes[structureI];
		let geoShortName = `hologram_${structureI}`;
		let geoIdentifier = `geometry.holoprint.hologram_${structureI}`;
		let geo = structuredClone(structureGeoTemplate);
		geo["description"]["identifier"] = geoIdentifier;
		entityManager.addGeometry(geoShortName, geoIdentifier);
		hologramRenderControllers["render_controllers"]["controller.render.holoprint.hologram"]["arrays"]["geometries"]["Array.geometries"].push(`Geometry.${geoShortName}`);
		
		for(let y = 0; y < structureSize[1]; y++) {
			for(let x = 0; x < structureSize[0]; x++) {
				for(let z = 0; z < structureSize[2]; z++) {
					let coords = tuple([x, y, z]);
					let blockI = getStructureIndexFromCoordinates(coords, structureSize);
					for(let layerI = 0; layerI < 2; layerI++) {
						let blockPaletteIndices = structureIndicesByLayer[layerI];
						let paletteI = blockPaletteIndices[blockI];
						if(!(paletteI in polyMeshTemplatePalette)) {
							if(paletteI in blockPalette) {
								console.error(`A poly mesh template wasn't made for blockPalette[${paletteI}] = ${blockPalette[paletteI]["name"]}!`);
							}
							continue;
						}
						
						let geoSpaceBlockPos = getGeoSpaceBlockPos(coords);
						polyMeshMaker.add(paletteI, geoSpaceBlockPos, layerI);
						
						let block = blockPalette[paletteI];
						if(!config.IGNORED_MATERIAL_LIST_BLOCKS.includes(block["name"])) {
							materialList.add(block);
						}
						totalBlockCount++;
						layerIsEmpty[y] = false;
					}
				}
			}
			let layerName = `l_${y}`;
			let layerBone = {
				"name": layerName,
				"parent": "hologram_offset_wrapper",
				"pivot": [8, 0, -8],
				"poly_mesh": polyMeshMaker.export()
			};
			geo["bones"].push(layerBone);
			polyMeshMaker.clear();
		}
		hologramGeo["minecraft:geometry"].push(geo);
		
		addBoundingBoxParticles(hologramAnimationControllers, structureI, structureSize);
	});

	// One name map for the animation effects and the particle files registered below.
	resetParticleNames();
	let { uniqueBlocksToValidate, totalBlocksToValidateByStructure, totalBlocksToValidateByStructureByLayer } = handleBlockValidation(config, allStructureIndicesByLayer, structureSizes, blockPalette, hologramAnimationControllers, (coords, locatorName) => addCoordinateLocatorToHologramGeo(hologramGeo, coords, locatorName));
	
	makeLayerAnimations(config, structureSizes, entityManager, hologramAnimations, hologramAnimationControllers);
	if(config.SPAWN_ANIMATION_ENABLED) {
		let spawnAnimationMaker = new SpawnAnimationMaker(config, [1, maxHeight, 1]);
		for(let y = 0; y < maxHeight; y++) {
			if(!layerIsEmpty[y]) {
				let layerName = `l_${y}`;
				spawnAnimationMaker.addBone(layerName, [0, y, 0]);
			}
		}
		hologramAnimations["animations"]["animation.holoprint.hologram.spawn"] = spawnAnimationMaker.makeAnimation();
	}
	
	let structureSizesMolang = [
		arrayToMolang(structureSizes.map(structureSize => structureSize[0]), "v.hologram.structure_index"),
		arrayToMolang(structureSizes.map(structureSize => structureSize[1]), "v.hologram.structure_index"),
		arrayToMolang(structureSizes.map(structureSize => structureSize[2]), "v.hologram.structure_index")
	];
	let coordinateLockAxes = config.COORDINATE_LOCK && transposeMatrix(config.COORDINATE_LOCK);
	let coordinateLockCoordsMolang = config.COORDINATE_LOCK? coordinateLockAxes.slice(0, 3).map(axis => arrayToMolang(axis, "v.hologram.structure_index")) : ["0", "0", "0"];
	
	entityManager.addMaterial("hologram", "holoprint_hologram");
	entityManager.addMaterial("hologram.wrong_block_overlay", "holoprint_hologram.wrong_block_overlay");
	entityManager.addTexture("hologram.overlay", "textures/holoprint/entity/overlay");
	entityManager.addTexture("hologram.save_icon", "textures/holoprint/particle/save_icon");
	entityManager.addAnimation("hologram.align", "animation.holoprint.hologram.align");
	if(config.COORDINATE_LOCK) {
		entityManager.addAnimation("hologram.coordinate_lock", "animation.holoprint.hologram.coordinate_lock");
		let coordinateLockRotsMolang = arrayToMolang(coordinateLockAxes[3], "v.hologram.structure_index");
		hologramAnimations["animations"]["animation.holoprint.hologram.coordinate_lock"]["bones"]["hologram_offset_wrapper"]["rotation"][1] = coordinateLockRotsMolang;
		delete hologramAnimations["animations"]["animation.holoprint.hologram.offset"];
	} else {
		entityManager.addAnimation("hologram.offset", "animation.holoprint.hologram.offset");
		delete hologramAnimations["animations"]["animation.holoprint.hologram.coordinate_lock"];
	}
	entityManager.addAnimation("hologram.spawn", "animation.holoprint.hologram.spawn");
	entityManager.addAnimation("hologram.wrong_block_overlay", "animation.holoprint.hologram.wrong_block_overlay");
	entityManager.addAnimation("controller.hologram.spawn_animation", "controller.animation.holoprint.hologram.spawn_animation");
	entityManager.addAnimation("controller.hologram.layers", "controller.animation.holoprint.hologram.layers");
	entityManager.addAnimation("controller.hologram.bounding_box", "controller.animation.holoprint.hologram.bounding_box");
	entityManager.addAnimation("controller.hologram.block_validation", "controller.animation.holoprint.hologram.block_validation");
	entityManager.addAnimation("controller.hologram.saving_backup_particles", "controller.animation.holoprint.hologram.saving_backup_particles");
	entityManager.addAnimateScript("hologram.align", config.COORDINATE_LOCK? "hologram.coordinate_lock" : "hologram.offset", "hologram.wrong_block_overlay", "controller.hologram.spawn_animation", "controller.hologram.layers", "controller.hologram.bounding_box", "controller.hologram.block_validation", "controller.hologram.saving_backup_particles");
	entityManager.setShouldUpdateBonesAndEffectsOffscreen(true); // makes backups work when offscreen (from my testing it helps a bit). this also makes it render when you're facing away, removing the need for visible_bounds_width/visible_bounds_height in the geometry file. (when should_update_effects_offscreen is set, it renders when facing away, but doesn't seem to have access to v. variables.)
	
	let initializeScriptBaseConstants = {
		structureSize: structureSizes[0],
		initialOffset: config.INITIAL_OFFSET,
		defaultTextureIndex,
		singleLayerMode: HOLOGRAM_LAYER_MODES.SINGLE,
		structureCount: structureFiles.length
	};
	let preAnimationScriptBaseConstants = {
		textureBlobsCount: textureBlobs.length,
		totalBlocksToValidate: arrayToMolang(totalBlocksToValidateByStructure, "v.hologram.structure_index"),
		totalBlocksToValidateByLayer: array2DToMolang(totalBlocksToValidateByStructureByLayer, "v.hologram.structure_index", "v.hologram.layer"),
		backupSlotCount: config.BACKUP_SLOT_COUNT,
		structureSizesMolang,
		coordinateLockEnabled: !!config.COORDINATE_LOCK,
		coordinateLockCoordsMolang,
		toggleRendering: itemCriteriaToMolang(config.CONTROLS.TOGGLE_RENDERING),
		changeOpacity: itemCriteriaToMolang(config.CONTROLS.CHANGE_OPACITY),
		toggleTint: itemCriteriaToMolang(config.CONTROLS.TOGGLE_TINT),
		toggleValidating: itemCriteriaToMolang(config.CONTROLS.TOGGLE_VALIDATING),
		changeLayer: itemCriteriaToMolang(config.CONTROLS.CHANGE_LAYER),
		decreaseLayer: itemCriteriaToMolang(config.CONTROLS.DECREASE_LAYER),
		changeLayerMode: itemCriteriaToMolang(config.CONTROLS.CHANGE_LAYER_MODE),
		rotateHologram: itemCriteriaToMolang(config.CONTROLS.ROTATE_HOLOGRAM),
		disablePlayerControls: itemCriteriaToMolang(config.CONTROLS.DISABLE_PLAYER_CONTROLS),
		backupHologram: itemCriteriaToMolang(config.CONTROLS.BACKUP_HOLOGRAM),
		singleLayerMode: HOLOGRAM_LAYER_MODES.SINGLE,
		ACTIONS: entityScripts.ACTIONS
	};
	/** @param {object} entityFile @param {boolean} isArmorStand @param {boolean} hasHologram */
	const addScriptsToEntity = (entityFile, isArmorStand, hasHologram) => {
		let entityDescription = entityFile["minecraft:client_entity"]["description"];
		entityDescription["scripts"] ??= {};
		entityDescription["scripts"]["initialize"] ??= [];
		entityDescription["scripts"]["initialize"].push(functionToMolang(entityScripts.initialize, {
			...initializeScriptBaseConstants,
			isArmorStand,
			hasHologram
		}));
		entityDescription["scripts"]["pre_animation"] ??= [];
		entityDescription["scripts"]["pre_animation"].push(functionToMolang(entityScripts.preAnimation, {
			...preAnimationScriptBaseConstants,
			isArmorStand,
			hasHologram
		}));
	};
	addScriptsToEntity(armorStandEntityFile, true, true);
	addScriptsToEntity(leashKnotEntityFile, false, true);
	addScriptsToEntity(leashKnotModeArmorStandEntityFile, true, false);
	
	
	entityManager.addGeometry("hologram.wrong_block_overlay", "geometry.holoprint.hologram.wrong_block_overlay");
	entityManager.addGeometry("hologram.valid_structure_overlay", "geometry.holoprint.hologram.valid_structure_overlay");
	entityManager.addGeometry("hologram.particle_alignment", "geometry.holoprint.hologram.particle_alignment");
	entityManager.addRenderController({
		"controller.render.holoprint.hologram": "v.hologram.rendering"
	}, {
		"controller.render.holoprint.hologram.wrong_block_overlay": "v.hologram.show_wrong_block_overlay"
	}, {
		"controller.render.holoprint.hologram.valid_structure_overlay": "v.hologram.validating && v.wrong_blocks == 0"
	}, "controller.render.holoprint.hologram.particle_alignment");
	entityManager.addParticleEffect("bounding_box_outline", "holoprint:bounding_box_outline");
	entityManager.addParticleEffect("saving_backup", "holoprint:saving_backup");
	
	textureBlobs.forEach(([textureName]) => {
		entityManager.addTexture(textureName, `textures/holoprint/entity/${textureName}`);
		hologramRenderControllers["render_controllers"]["controller.render.holoprint.hologram"]["arrays"]["textures"]["Array.textures"].push(`Texture.${textureName}`);
	});
	
	let tintColorChannels = hexColorToClampedTriplet(config.TINT_COLOR);
	hologramRenderControllers["render_controllers"]["controller.render.holoprint.hologram"]["overlay_color"] = {
		"r": +tintColorChannels[0].toFixed(4),
		"g": +tintColorChannels[1].toFixed(4),
		"b": +tintColorChannels[2].toFixed(4),
		"a": `v.hologram.show_tint? ${config.TINT_OPACITY} : 0`
	};
	
	let overlayTexture = await setImageOpacity(singleWhitePixelTexture, config.WRONG_BLOCK_OVERLAY_COLOR[3]);
	
	// Same ids handleBlockValidation already stored on the animation controller.
	uniqueBlocksToValidate.forEach(blockName => {
		let particleName = particleNameFor(blockName);
		entityManager.addParticleEffect(particleName, `holoprint:${particleName}`);
	});
	
	let playerRenderControllers = defaultPlayerRenderControllers && addPlayerControlsToRenderControllers(config, defaultPlayerRenderControllers);
	
	return {
		...state,
		leashKnotModeArmorStandEntityFile,
		totalBlockCount,
		materialList,
		uniqueBlocksToValidate,
		overlayTexture,
		playerRenderControllers
	};
}

async function describePack(state) {
	const {
		config, structureSizes, packName, controlsHaveBeenCustomised, itemTagsPromise, languagesDotJson,
		bedrockMetadata, resourceLangFilesPromise, packTemplateLangFilesPromise, translationLanguagesLoadingPromise,
		retexturingControlItemsPromise, data, blockPalette, allStructureIndicesByLayer,
		structureDiagramsAndIndices, manifest, materialListUI, infoScreenUI, materialList
	} = state;
	console.log("Block counts map:", materialList.materials);
	let resourceLangFiles = await resourceLangFilesPromise.allValues;
	let exportedMaterialLists = Object.fromEntries(languagesDotJson.map(language => {
		materialList.setLanguage(resourceLangFiles[language]); // we could make the material list export to multiple languages simultaneously, but I'm assuming here that there could be gaps between language files so they have to be done separately (for whatever reason... maybe international relations deteriorate and they refuse to translate the new update to Chinese... idk)
		return [language, materialList.export()];
	}));
	let exportedMaterialListEnglish = exportedMaterialLists["en_US"]; // all languages have the same translation keys, which are used in the material list UI. the translated item names (which are different for every language) are used in the pack description only.
	console.log("Exported material list:", exportedMaterialListEnglish);
	
	// console.log(partitionedBlockCounts);
	let highestItemCount;
	if(config.UI_CONTROLS_ENABLED) {
		addMaterialListUI(exportedMaterialListEnglish, materialListUI);
		highestItemCount = max(...exportedMaterialListEnglish.map(({ count }) => count));
	}
	
	let materialListsByLayerByStructure = makeMaterialListsForEachStructureAndEachLayer(config, allStructureIndicesByLayer, structureSizes, blockPalette, bedrockMetadata.blocks, bedrockMetadata.items, data.materialListMappings, resourceLangFiles["en_US"]);
	addInfoScreenUIPages(infoScreenUI, structureSizes, structureDiagramsAndIndices, materialListsByLayerByStructure);
	
	manifest["header"]["name"] = packName;
	manifest["header"]["uuid"] = crypto.randomUUID();
	let packVersion = VERSION.match(/^v(\d+)\.(\d+)\.(\d+)$/)?.slice(1)?.map(x => +x) ?? [1, 0, 0];
	manifest["header"]["version"] = packVersion;
	manifest["modules"][0]["uuid"] = crypto.randomUUID();
	manifest["modules"][0]["version"] = packVersion;
	manifest["metadata"]["generated_with"]["holoprint"] = [packVersion.join(".")];
	if(config.AUTHORS.length) {
		manifest["metadata"]["authors"].push(...config.AUTHORS);
	}
	if(config.DESCRIPTION) {
		let labelsAndLinks = findLinksInDescription(config.DESCRIPTION);
		labelsAndLinks.forEach(([label, link], i) => {
			manifest["settings"].push({
				"type": "input",
				"text": label,
				"default": link,
				"name": `link_${i}`
			});
		});
	}
	
	let itemTags = await itemTagsPromise;
	let inGameControls, controlItemTranslations;
	if(controlsHaveBeenCustomised || config.RENAME_CONTROL_ITEMS) {
		await translationLanguagesLoadingPromise;
		({ inGameControls, controlItemTranslations } = translateControlItems(config, bedrockMetadata.blocks, bedrockMetadata.items, data.materialListMappings, resourceLangFiles, itemTags));
	}
	
	let packTemplateLangFiles = await packTemplateLangFilesPromise;
	let langFiles = makeLangFiles(config, packTemplateLangFiles, packName, materialList, exportedMaterialLists, controlsHaveBeenCustomised, inGameControls, controlItemTranslations, structureSizes);
	
	const { controlItemTextures, hasModifiedTerrainTexture } = await retexturingControlItemsPromise;
	
	return {
		...state,
		controlItemTextures,
		hasModifiedTerrainTexture,
		highestItemCount,
		langFiles
	};
}

async function zipPack(state, previewCont) {
	const { structureFiles, startTime, config, structureSizes, packName, packTemplatePromise, controlItemTextures, hasModifiedTerrainTexture, packIcon, blockPalette, allStructureIndicesByLayer, shapeByPalette, armorStandEntityFile, leashKnotEntityFile, textureBlobs, fullOpacityTextureBlob, polyMeshTemplatePalette, structureDiagramsAndIndices, blockValidationParticle, leashKnotModeArmorStandEntityFile, totalBlockCount, materialList, uniqueBlocksToValidate, overlayTexture, playerRenderControllers, highestItemCount, langFiles } = state;
	console.info("Finished making all pack files!");
	
	const zipComment = Symbol("add comment to file entries");
	let packFiles = await packTemplatePromise.allEntries;
	if(structureFiles.length == 1) {
		structureFiles[0][zipComment] = structureFiles[0].name;
		packFiles[".mcstructure"] = structureFiles[0];
	} else {
		structureFiles.forEach((structureFile, i) => {
			structureFile[zipComment] = structureFile.name;
			packFiles[`${i}.mcstructure`] = structureFile;
		});
	}
	packFiles["pack_icon.png"] = packIcon;
	let regularArmorStandEntityJson = JSON.stringify(armorStandEntityFile);
	packFiles["subpacks/default/entity/armor_stand.entity.json"] = regularArmorStandEntityJson.replaceAll("HOLOGRAM_INITIAL_ACTIVATION", "true");
	packFiles["subpacks/punch_to_activate/entity/armor_stand.entity.json"] = regularArmorStandEntityJson.replaceAll("HOLOGRAM_INITIAL_ACTIVATION", "false");
	let leashKnotEntityJson = JSON.stringify(leashKnotEntityFile).replaceAll("HOLOGRAM_INITIAL_ACTIVATION", "true");
	packFiles["subpacks/leash_knot_mode/entity/leash_knot.entity.json"] = leashKnotEntityJson;
	let leashKnotModeArmorStandEntityJson = JSON.stringify(leashKnotModeArmorStandEntityFile);
	packFiles["subpacks/leash_knot_mode/entity/armor_stand.entity.json"] = leashKnotModeArmorStandEntityJson;
	if(config.PLAYER_CONTROLS_ENABLED) {
		packFiles["render_controllers/player.render_controllers.json"] = playerRenderControllers;
	}
	delete packFiles["particles/block_validation.json"]; // this one is only a template, used below
	uniqueBlocksToValidate.forEach(blockName => {
		let particleName = particleNameFor(blockName); // file names can't have : in them
		let particle = structuredClone(blockValidationParticle);
		particle["particle_effect"]["description"]["identifier"] = `holoprint:${particleName}`;
		particle["particle_effect"]["components"]["minecraft:particle_expire_if_in_blocks"] = [blockName.includes(":")? blockName : `minecraft:${blockName}`]; // add back minecraft: namespace if it's missing
		packFiles[`particles/${particleName}.json`] = particle;
	});
	packFiles["textures/holoprint/entity/overlay.png"] = overlayTexture;
	textureBlobs.forEach(([textureName, blob]) => {
		packFiles[`textures/holoprint/entity/${textureName}.png`] = blob;
	});
	structureDiagramsAndIndices.diagrams.forEach((diagramBlob, diagramIndex) => {
		packFiles[`${getLayerDiagramTextureName(diagramIndex)}.png`] = diagramBlob;
	});
	if(config.RETEXTURE_CONTROL_ITEMS) {
		if(!hasModifiedTerrainTexture) {
			delete packFiles["textures/terrain_texture.json"];
		}
		controlItemTextures.forEach(([fileName, imageBlob]) => {
			packFiles[fileName] = imageBlob;
		});
	}
	if(config.UI_CONTROLS_ENABLED && highestItemCount < 1728) {
		delete packFiles["font/glyph_E2.png"];
	}
	langFiles.forEach(([language, langFile]) => {
		packFiles[`texts/${language}.lang`] = langFile;
	});
	
	let packFileWriter = new BlobWriter();
	let zipWriter = new ZipWriter(packFileWriter);
	await Promise.all(Object.entries(packFiles).map(async ([fileName, fileContents]) => {
		assertSafePackEntryName(fileName);
		let comment = fileContents[zipComment];
		/** @type {ZipWriterAddDataOptions} */
		let options = {
			comment,
			level: config.COMPRESSION_LEVEL
		};
		if(fileContents instanceof HTMLImageElement) {
			fileContents = await toBlob(fileContents);
		}
		if(fileContents instanceof Blob) {
			return zipWriter.add(fileName, new BlobReader(fileContents), options);
		}
		if(typeof fileContents == "object") {
			fileContents = JSON.stringify(fileContents)
		}
		return zipWriter.add(fileName, new TextReader(fileContents), options);
	}));
	let zippedPack = await zipWriter.close();
	
	console.info(`Finished creating pack in ${+(performance.now() - startTime).toFixed(0) / 1000}s!`);
	
	let pack = new File([zippedPack], `${packName}.holoprint.mcpack`, {
		type: "application/mcpack"
	});
	let res = {
		pack,
		materialList
	};
	
	if(previewCont) {
		let showPreview = () => {
			res.previews = Promise.all(structureSizes.map(async (structureSize, structureI) => {
				if(structureI > 0) {
					previewCont.parentNode.appendChild(document.createElement("hr"));
				}
				let cont = structureI == 0? previewCont : previewCont.parentNode.appendChild(previewCont.cloneNode());
				let name = structureSizes.length == 1? packName : getDefaultPackName([structureFiles[structureI]]);
				return await PreviewRenderer.new(cont, name, fullOpacityTextureBlob, structureSize, blockPalette, polyMeshTemplatePalette, allStructureIndicesByLayer[structureI], {
					showSkybox: config.SHOW_PREVIEW_SKYBOX,
					showFps: config.SHOW_PREVIEW_WIDGETS,
					showOptions: config.SHOW_PREVIEW_WIDGETS,
					shapeByPalette
				});
			}));
		};
		if(totalBlockCount < config.PREVIEW_BLOCK_LIMIT && removeFalsies(blockPalette).length < 250) {
			showPreview();
		} else {
			let message = document.createElement("div");
			message.classList.add("previewMessage", "clickToView");
			let p = document.createElement("p");
			p.dataset.translationSubTotalBlockCount = totalBlockCount.toString();
			if(structureFiles.length == 1) {
				p.dataset.translate = "preview.click_to_view";
			} else {
				p.dataset.translate = "preview.click_to_view_multiple";
			}
			message.appendChild(p);
			message[onEvent]("click", () => {
				message.remove();
				showPreview();
			});
			previewCont.appendChild(message);
		}
	}
	
	return res;
}

/**
 * @typedef {object} StructureDiagramsAndIndices
 * @property {Blob[]} diagrams
 * @property {number[][]} indices
 */
/**
 * Makes the layer-by-layer diagrams and the isometric diagram for structures.
 * @param {HoloPrintConfig} config
 * @param {Blob} textureBlob
 * @param {PolyMeshTemplateFaceWithUvs[][]} polyMeshTemplatePalette
 * @param {[Int32Array, Int32Array][]} allStructureIndicesByLayer
 * @param {I32Vec3[]} structureSizes
 * @returns {Promise<StructureDiagramsAndIndices>}
 */
async function makeStructureDiagrams(config, textureBlob, polyMeshTemplatePalette, allStructureIndicesByLayer, structureSizes) {
	let { default: StructureDiagramMaker } = await import("./StructureDiagramMaker.js");
	let structureDiagramMaker = new StructureDiagramMaker(config, await toImage(textureBlob));
	let diagramsAndIndices = await structureDiagramMaker.makeDiagramsForStructures(polyMeshTemplatePalette, allStructureIndicesByLayer, structureSizes);
	structureDiagramMaker.dispose();
	return diagramsAndIndices;
}

/** @import { ZipWriterAddDataOptions } from "@zip.js/zip.js" */
/** @import { I32Vec3, PolyMeshTemplateFaceWithUvs } from "../types.js" */
/** @import { HoloPrintConfig } from "./packTypes.js" */