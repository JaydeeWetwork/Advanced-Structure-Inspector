import { max, removeFalsies, translate, tuple, getStructureIndexFromCoordinates } from "../utils.js";
import MaterialList from "./MaterialList.js";
import { PLAYER_CONTROL_NAMES } from "./packConfig.js";

/**
 * @typedef {object} StructureDiagramsAndIndices
 * @property {Blob[]} diagrams
 * @property {number[][]} indices
 */

export function getLayerDiagramTextureName(index) {
	return `textures/holoprint/ui/layer_diagram_${index}`;
}

/**
 * Makes material lists for each structure and layer. Returns a 2d array of material lists, indexed by structure then layer, where layer 0 is the full structure, and subsequent layers are the actual layers (1-indexed).
 * @param {HoloPrintConfig} config
 * @param {[Int32Array, Int32Array][]} allStructureIndicesByLayer
 * @param {I32Vec3[]} structureSizes
 * @param {Block[]} blockPalette
 * @param {object} blockMetadata
 * @param {object} itemMetadata
 * @param {Data.MaterialListMappings} materialListMappings
 * @param {string} langFile
 * @returns {MaterialList[][]}
 */
export function makeMaterialListsForEachStructureAndEachLayer(config, allStructureIndicesByLayer, structureSizes, blockPalette, blockMetadata, itemMetadata, materialListMappings, langFile) {
	return allStructureIndicesByLayer.map((structureIndicesByLayer, structureI) => {
		let structureSize = structureSizes[structureI];
		let materialListsForThisStructure = (new Array(structureSize[1] + 1)).fill(undefined).map(() => new MaterialList(blockMetadata, itemMetadata, materialListMappings, langFile));
		for(let y = 0; y < structureSize[1]; y++) {
			for(let x = 0; x < structureSize[0]; x++) {
				for(let z = 0; z < structureSize[2]; z++) {
					for(let layerI = 0; layerI < 2; layerI++) { // WHY is this so verbose?!?!?!?!?
						let blockPaletteIndices = structureIndicesByLayer[layerI];
						let coords = tuple([x, y, z]);
						let blockI = getStructureIndexFromCoordinates(coords, structureSize);
						let paletteI = blockPaletteIndices[blockI];
						let block = blockPalette[paletteI];
						if(!block || config.IGNORED_MATERIAL_LIST_BLOCKS.includes(block["name"])) {
							continue;
						}
						materialListsForThisStructure[0].add(block);
						materialListsForThisStructure[y + 1].add(block);
					}
				}
			}
		}
		return materialListsForThisStructure;
	});
}
/**
 * Adds the material list to the `holoprint_material_list.json` UI file.
 * @param {MaterialListEntry[]} finalisedMaterialList
 * @param {object} materialListUI
 */

export function addMaterialListUI(finalisedMaterialList, materialListUI) {
	let fullPackMaterialList = getUIElementFromPath(materialListUI, "full_pack_material_list");
	// TODO: make this use missing item aux id properly, which requires decoupling translations from material list exporting
	let exportedJsonUi = MaterialList.convertEntriesToJsonUi(finalisedMaterialList);
	fullPackMaterialList["$entries"] = exportedJsonUi.entries;
	if(exportedJsonUi.longestItemNameLength + exportedJsonUi.longestCountLength >= 43) {
		fullPackMaterialList["$size"][0] = "50%"; // up from 40%
		fullPackMaterialList["$max_size"][0] = "50%";
	}
	fullPackMaterialList["$size"][1] = exportedJsonUi.visibleHeight;
	fullPackMaterialList["$item_name_column_size"] = exportedJsonUi.itemNameColumnSize;
}
/**
 * @param {number} structureI
 * @returns {string}
 */

export function getInfoScreenSectionHeadingTranslationKey(structureI) {
	// this MUST be formatted this way because how_to_play_common:section_toggle_button uses this
	// don't think I can use . because that would be interpreted as a namespace
	return `howtoplay.holoprint_structure_${structureI}`;
}
/**
 * 
 * @param {object} infoScreenUI
 * @param {I32Vec3[]} structureSizes
 * @param {StructureDiagramsAndIndices} structureDiagrams
 * @param {MaterialList[][]} materialListsByLayerByStructure
 */

export function addInfoScreenUIPages(infoScreenUI, structureSizes, structureDiagrams, materialListsByLayerByStructure) {
	let tabSelector = getUIElementFromPath(infoScreenUI, "tab_stack_panel", "selector_pane");
	let sectionContentPanels = getUIElementFromPath(infoScreenUI, "section_content_panels", "sections");
	structureSizes.forEach((structureSize, structureI) => {
		let structureName = `structure_${structureI}`;
		let pageContentElementName = `${structureName}_section_content`;
		let headingTranslationKey = getInfoScreenSectionHeadingTranslationKey(structureI);
		
		tabSelector["controls"].splice(-1, 0, {
			[`${structureName}_tab_button@how_to_play_common.section_toggle_button`]: {
				"$toggle_group_forced_index": structureI,
				"$section_topic": `holoprint_${structureName}`
			}
		});
		sectionContentPanels["controls"].splice(0, -1, {
			[`${structureName}_section@section`]: {
				// this MUST end with _button_toggle because how_to_play_common:section_toggle_button uses this
				// I could make my own version of section_toggle_button to circumvent this, but it's not too inconvenient
				"$tab_button_name": `holoprint_${structureName}_button_toggle`,
				"$content": `holoprint:info_screen.${pageContentElementName}`
			}
		});
		let structureDiagramIndices = structureDiagrams.indices[structureI];
		let structureDiagramTextureBindings = structureDiagramIndices.map((diagramIndex, layerI) => [`#layer_${layerI}`, getLayerDiagramTextureName(diagramIndex)]);
		let materialListsByLayer = materialListsByLayerByStructure[structureI];
		let materialListsExportedToJsonUi = materialListsByLayer.map(materialList => materialList.exportToJsonUi());
		let materialListsByLayerElements = materialListsExportedToJsonUi.map((exportedJsonUi, layerI) => ({
			[`layer_${layerI}@structure_layer_material_list`]: {
				"$layer": layerI,
				"$entries": exportedJsonUi.entries,
				"$size": ["100%", exportedJsonUi.visibleHeight],
				"$item_name_column_size": exportedJsonUi.itemNameColumnSize
			}
		}));
		infoScreenUI[`${pageContentElementName}@structure_section_content_base`] = {
			"$heading": headingTranslationKey,
			"$structure_height_plus_1": structureSize[1] + 1, // I'm adding the 1 here rather than inside the JSON UI for +0.000001 fps
			"$diagram_property_bag": Object.fromEntries(structureDiagramTextureBindings),
			"$layer_slider_name": `${structureName}_layer_slider`,
			"$structure_index": structureI,
			"$material_lists": materialListsByLayerElements,
			"$tallest_material_list_size": ["100%", max(...materialListsExportedToJsonUi.map(exportedJsonUi => exportedJsonUi.visibleHeight))]
		};
	});
	
	getUIElementFromPath(infoScreenUI, "tab_stack_panel", "selector_pane", "about_section")["$toggle_group_forced_index"] = structureSizes.length;
}
/**
 * Gets the element at a specified path from a JSON UI object.
 * @param {Record<string, any>} rootUiObject
 * @param {...string} elementPath
 * @returns {any}
 */

export function getUIElementFromPath(rootUiObject, ...elementPath) {
	/** @type {any} */
	let el = rootUiObject;
	elementPath.forEach((childName, i) => {
		if(i == 0) {
			el = Object.entries(el).find(([key]) => key.split("@")[0] == childName)?.[1];
		} else {
			let childObj = el?.["controls"]?.find(elObj => Object.keys(elObj)[0].split("@")[0] == childName);
			if(childObj) {
				el = Object.values(childObj)[0];
			} else {
				el = undefined;
			}
		}
	});
	return el;
}
/**
 * Translates control items by making a fake material list.
 * @param {HoloPrintConfig} config
 * @param {Record<string, any>} blockMetadata
 * @param {Record<string, any>} itemMetadata
 * @param {Data.MaterialListMappings} materialListMappings
 * @param {Record<string, string>} resourceLangFiles
 * @param {Record<string, string[]>} itemTags
 * @returns {{ inGameControls: Record<string, string>, controlItemTranslations: Record<string, string> }}
 */

export function translateControlItems(config, blockMetadata, itemMetadata, materialListMappings, resourceLangFiles, itemTags) {
	// make a fake material list for the in-game control items (just to translate them lol)
	let controlsMaterialList = new MaterialList(blockMetadata, itemMetadata, materialListMappings);
	/** @type {Record<string, string>} */
	let inGameControls = {};
	/** @type {Record<string, string>} */
	let controlItemTranslations = {};
	Object.entries(resourceLangFiles).forEach(([language, resourceLangFile]) => {
		inGameControls[language] = "";
		let translatedControlNames = {};
		let translatedControlItems = {};
		/** @type {Record<string, Set<string>>} */
		let controlItemTranslationKeys = {};
		controlsMaterialList.setLanguage(resourceLangFile);
		Object.entries(config.CONTROLS).forEach(([control, itemCriteria]) => {
			controlsMaterialList.clear();
			itemCriteria["names"].forEach(itemName => controlsMaterialList.addItem(itemName));
			
			let itemInfo = controlsMaterialList.export();
			let translatedControlName = translate(PLAYER_CONTROL_NAMES[control], language);
			translatedControlNames[control] = translatedControlName;
			inGameControls[language] += `\n${translatedControlName}: ${removeFalsies([itemInfo.map(item => `§3${item.translatedName}§r`).join(", "), itemCriteria.tags.map(tag => `§p${tag}§r`).join(", ")]).join("; ")}`;
			
			let itemsInTags = removeFalsies(itemCriteria.tags.filter(tag => !tag.includes(":")).map(tag => itemTags[`minecraft:${tag}`])).flat().map(itemName => itemName.replace(/^minecraft:/, ""));
			itemsInTags.forEach(itemName => controlsMaterialList.addItem(itemName));
			controlItemTranslationKeys[control] = new Set();
			controlsMaterialList.export().forEach(({ translationKey, translatedName }) => {
				controlItemTranslationKeys[control].add(translationKey);
				translatedControlItems[translationKey] = translatedName;
			}); // these items will be renamed, and includes all the items in the tags specified. e.g. if "planks" is added as a tag for a control, then all plank types need to be renamed.
		});
		controlItemTranslations[language] = "";
		Object.entries(controlItemTranslationKeys).forEach(([control, itemTranslationKeys]) => {
			itemTranslationKeys.forEach(itemTranslationKey => {
				controlItemTranslations[language] += `\n${itemTranslationKey}=${translatedControlItems[itemTranslationKey]}\\n§u${translatedControlNames[control]}§r`; // don't question, it works
			});
		});
	});
	return { inGameControls, controlItemTranslations };
}
/**
 * Makes the `.lang` files for each language.
 * @param {HoloPrintConfig} config
 * @param {Record<string, string>} packTemplateLangFiles
 * @param {string} packName
 * @param {MaterialList} materialList
 * @param {Record<string, MaterialListEntry[]>} exportedMaterialLists
 * @param {boolean} controlsHaveBeenCustomised
 * @param {Record<string, string>} inGameControls
 * @param {Record<string, string>} controlItemTranslations
 * @param {I32Vec3[]} structureSizes
 * @returns {[string, string][]}
 */

export function makeLangFiles(config, packTemplateLangFiles, packName, materialList, exportedMaterialLists, controlsHaveBeenCustomised, inGameControls, controlItemTranslations, structureSizes) {
	const disabledFeatureTranslations = { // these look at the .lang RP files
		"SPAWN_ANIMATION_ENABLED": "spawn_animation_disabled",
		"PLAYER_CONTROLS_ENABLED": "player_controls_disabled",
		"UI_CONTROLS_ENABLED": "ui_controls_disabled",
		"RETEXTURE_CONTROL_ITEMS": "retextured_control_items_disabled",
		"RENAME_CONTROL_ITEMS": "renamed_control_items_disabled"
	};
	let packGenerationTime = (new Date()).toLocaleString();
	let totalMaterialCount = materialList.totalMaterialCount;
	return Object.entries(packTemplateLangFiles).map(([language, langFile]) => {
		langFile = langFile.replaceAll("\r\n", "\n"); // I hate windows sometimes (actually quite often now because of windows 11)
		langFile = langFile.replaceAll("{PACK_NAME}", packName);
		langFile = langFile.replaceAll("{PACK_GENERATION_TIME}", packGenerationTime);
		langFile = langFile.replaceAll("{TOTAL_MATERIAL_COUNT}", totalMaterialCount.toString());
		langFile = langFile.replaceAll("{MATERIAL_LIST}", exportedMaterialLists[language].map(({ translatedName, count }) => `${count} ${translatedName}`).join(", "));
		
		// now substitute in the extra bits into the main description if needed
		if(config.AUTHORS.length) {
			langFile = langFile.replaceAll(/\{STRUCTURE_AUTHORS\[([^)]+)\]\}/g, (_, delimiter) => config.AUTHORS.join(delimiter));
			langFile = langFile.replaceAll("{AUTHORS_SECTION}", langFile.match(/pack\.description\.authors=([^\t#\n]+)/)[1]);
		} else {
			langFile = langFile.replaceAll("{AUTHORS_SECTION}", "");
		}
		if(config.DESCRIPTION) {
			langFile = langFile.replaceAll("{DESCRIPTION}", config.DESCRIPTION.replaceAll("\n", "\\n"));
			langFile = langFile.replaceAll("{DESCRIPTION_SECTION}", langFile.match(/pack\.description\.description=([^\t#\n]+)/)[1]);
		} else {
			langFile = langFile.replaceAll("{DESCRIPTION_SECTION}", "");
		}
		let translatedDisabledFeatures = Object.entries(disabledFeatureTranslations).filter(([feature]) => !config[feature]).map(([_, translationKey]) => langFile.match(new RegExp(`pack\\.description\\.${translationKey}=([^\\t#\\n]+)`))[1]).join("\\n");
		if(translatedDisabledFeatures) {
			langFile = langFile.replaceAll("{DISABLED_FEATURES}", translatedDisabledFeatures);
			langFile = langFile.replaceAll("{DISABLED_FEATURES_SECTION}", langFile.match(/pack\.description\.disabled_features=([^\t#\n]+)/)[1]);
		} else {
			langFile = langFile.replaceAll("{DISABLED_FEATURES_SECTION}", "");
		}
		if(controlsHaveBeenCustomised) {
			langFile = langFile.replaceAll("{CONTROLS}", inGameControls[language].replaceAll("\n", "\\n"));
			langFile = langFile.replaceAll("{CONTROLS_SECTION}", langFile.match(/pack\.description\.controls=([^\t#\n]+)/)[1]);
		} else {
			langFile = langFile.replaceAll("{CONTROLS_SECTION}", "");
		}
		
		langFile = langFile.replaceAll(/pack\.description\..+\s*/g, ""); // remove all the description template sections
		langFile = langFile.replaceAll(/\t*#.+/g, ""); // remove comments
		
		// add the control name translations for the keyboard UI
		["toggle_rendering", "change_opacity", "toggle_tint", "change_layer", "decrease_layer", "change_layer_mode", "toggle_validating", "rotate_hologram", "change_structure", "backup_hologram"].forEach(actionName => {
			langFile += `\nholoprint.controls.${actionName}=${translate(`player_controls.${actionName}`, language)}`;
		});
		
		if(config.RENAME_CONTROL_ITEMS) {
			langFile += controlItemTranslations[language];
		}
		
		structureSizes.forEach((structureSize, structureI) => {
			// TODO: fix translations. just fix it entirely. throw all this garbage out
			let structureName = `Structure ${structureI + 1}`; // todo: use file names?
			let sectionHeadingTranslationKey = getInfoScreenSectionHeadingTranslationKey(structureI);
			langFile += `\n${sectionHeadingTranslationKey}=${structureName}`;
			const barSeparator = " §8|§r ";
			let sizeInfo = `Size: ${structureSize.join("x")}${barSeparator}`;
			langFile += `\nholoprint.info_screen.structure_${structureI}_layer_0=${sizeInfo}Full structure`;
			langFile += `\nholoprint.material_list.structure_${structureI}_layer_0=Material list${barSeparator}${structureName}`;
			for(let layer = 1; layer < structureSize[1] + 1; layer++) {
				langFile += `\nholoprint.info_screen.structure_${structureI}_layer_${layer}=${sizeInfo}Layer ${layer}`; // AHHHH IK THIS CAUSES DUPLICATED. I NEED TO GET THIS UPDATE OUT TONIGHTTTTT
				langFile += `\nholoprint.material_list.structure_${structureI}_layer_${layer}=Material list${barSeparator}${structureName}${barSeparator}Layer ${layer}`;
			}
		});
		
		return [language, langFile];
	});
}

/** @import * as Data from "../data/schemas" */
/** @import { Block, I32Vec3 } from "../types.js" */
/** @import { HoloPrintConfig, MaterialListEntry } from "./packTypes.js" */
