import { createNumericEnum, functionToMolang, itemCriteriaToMolang, max, removeFalsies, tuple, getStructureIndexFromCoordinates, getGeoSpaceBlockPos } from "../utils.js";
import entityScripts from "./entityScripts.molang.js";
import { particleNameFor } from "./particleName.js";

export const HOLOGRAM_LAYER_MODES = createNumericEnum(["SINGLE", "ALL_BELOW"]);

export function makeLayerAnimations(config, structureSizes, entityManager, hologramAnimations, hologramAnimationControllers) {
	let layerAnimationStates = hologramAnimationControllers["animation_controllers"]["controller.animation.holoprint.hologram.layers"]["states"];
	let topLayer = max(...structureSizes.map(structureSize => structureSize[1])) - 1;
	layerAnimationStates["default"]["transitions"].push(
		{
			"l_0": `v.hologram.layer > -1 && v.hologram.layer != ${topLayer} && v.hologram.layer_mode == ${HOLOGRAM_LAYER_MODES.SINGLE}`
		},
		{
			[`l_${topLayer}`]: `v.hologram.layer == ${topLayer} && v.hologram.layer_mode == ${HOLOGRAM_LAYER_MODES.SINGLE}`
		}
	);
	if(topLayer > 0) {
		layerAnimationStates["default"]["transitions"].push(
			{
				"l_0-": `v.hologram.layer > -1 && v.hologram.layer != ${topLayer - 1} && v.hologram.layer_mode == ${HOLOGRAM_LAYER_MODES.ALL_BELOW}`
			},
			{
				[`l_${topLayer - 1}-`]: `v.hologram.layer == ${topLayer - 1} && v.hologram.layer_mode == ${HOLOGRAM_LAYER_MODES.ALL_BELOW}`
			}
		);
	}
	
	for(let y = 0; y <= topLayer; y++) {
		let layerName = `l_${y}`;
		layerAnimationStates[layerName] = {
			"animations": [`hologram.l_${y}`],
			"blend_transition": 0.1,
			"blend_via_shortest_path": true,
			"transitions": [
				{
					[y == topLayer? "default" : `${layerName}-`]: `v.hologram.layer_mode == ${HOLOGRAM_LAYER_MODES.ALL_BELOW}`
				},
				{
					[y == 0? "default" : `l_${y - 1}`]: `v.hologram.layer < ${y}${y == topLayer? " && v.hologram.layer != -1" : ""}`
				},
				(y == topLayer? {
					"default": "v.hologram.layer == -1"
				} : {
					[`l_${y + 1}`]: `v.hologram.layer > ${y}`
				})
			]
		};
		let layerAnimation = {
			"loop": "hold_on_last_frame",
			"bones": {}
		};
		for(let otherLayerY = 0; otherLayerY <= topLayer; otherLayerY++) {
			if(otherLayerY == y) {
				continue;
			}
			layerAnimation["bones"][`l_${otherLayerY}`] = {
				"scale": config.MINI_SCALE
			};
		}
		if(Object.entries(layerAnimation["bones"]).length == 0) {
			delete layerAnimation["bones"];
		}
		let animationFullName = `animation.holoprint.hologram.l_${y}`;
		hologramAnimations["animations"][animationFullName] = layerAnimation;
		entityManager.addAnimation(`hologram.l_${y}`, animationFullName);
		if(y < topLayer) { // top layer with all layers below is the default view, so the animation + animation controller state doesn't need to be made for it
			layerAnimationStates[`${layerName}-`] = {
				"animations": [`hologram.l_${y}-`],
				"blend_transition": 0.1,
				"blend_via_shortest_path": true,
				"transitions": [
					{
						[layerName]: `v.hologram.layer_mode == ${HOLOGRAM_LAYER_MODES.SINGLE}`
					},
					{
						[y == 0? "default" : `l_${y - 1}-`]: `v.hologram.layer < ${y}${y == topLayer - 1? " && v.hologram.layer != -1" : ""}`
					},
					(y >= topLayer - 1? {
						"default": "v.hologram.layer == -1"
					} : {
						[`l_${y + 1}-`]: `v.hologram.layer > ${y}`
					})
				]
			};
			let layerAnimationAllBelow = {
				"loop": "hold_on_last_frame",
				"bones": {}
			};
			for(let otherLayerY = 0; otherLayerY <= topLayer; otherLayerY++) {
				if(otherLayerY <= y) {
					continue;
				}
				layerAnimationAllBelow["bones"][`l_${otherLayerY}`] = {
					"scale": config.MINI_SCALE
				};
			}
			if(Object.entries(layerAnimationAllBelow["bones"]).length == 0) {
				delete layerAnimationAllBelow["bones"];
			}
			hologramAnimations["animations"][`animation.holoprint.hologram.l_${y}-`] = layerAnimationAllBelow;
			entityManager.addAnimation(`hologram.l_${y}-`, `animation.holoprint.hologram.l_${y}-`);
		}
	}
}
/**
 * Adds bounding box particles for a single structure to the hologram animation controllers in-place.
 * @param {Record<string, any>} hologramAnimationControllers
 * @param {number} structureI
 * @param {I32Vec3} structureSize
 */

export function addBoundingBoxParticles(hologramAnimationControllers, structureI, structureSize) {
	let outlineParticleSettings = [
		`v.size = ${structureSize[0] / 2}; v.dir = 0; v.r = 1; v.g = 0; v.b = 0;`,
		`v.size = ${structureSize[1] / 2}; v.dir = 1; v.r = 1 / 255; v.g = 1; v.b = 0;`,
		`v.size = ${structureSize[2] / 2}; v.dir = 2; v.r = 0; v.g = 162 / 255; v.b = 1;`,
		`v.size = ${structureSize[0] / 2}; v.dir = 0; v.y = ${structureSize[1]}; v.r = 1; v.g = 1; v.b = 1;`,
		`v.size = ${structureSize[0] / 2}; v.dir = 0; v.z = ${structureSize[2]}; v.r = 1; v.g = 1; v.b = 1;`,
		`v.size = ${structureSize[0] / 2}; v.dir = 0; v.y = ${structureSize[1]}; v.z = ${structureSize[2]}; v.r = 1; v.g = 1; v.b = 1;`,
		`v.size = ${structureSize[1] / 2}; v.dir = 1; v.x = ${structureSize[0]}; v.r = 1; v.g = 1; v.b = 1;`,
		`v.size = ${structureSize[1] / 2}; v.dir = 1; v.z = ${structureSize[2]}; v.r = 1; v.g = 1; v.b = 1;`,
		`v.size = ${structureSize[1] / 2}; v.dir = 1; v.x = ${structureSize[0]}; v.z = ${structureSize[2]}; v.r = 1; v.g = 1; v.b = 1;`,
		`v.size = ${structureSize[2] / 2}; v.dir = 2; v.x = ${structureSize[0]}; v.r = 1; v.g = 1; v.b = 1;`,
		`v.size = ${structureSize[2] / 2}; v.dir = 2; v.y = ${structureSize[1]}; v.r = 1; v.g = 1; v.b = 1;`,
		`v.size = ${structureSize[2] / 2}; v.dir = 2; v.x = ${structureSize[0]}; v.y = ${structureSize[1]}; v.r = 1; v.g = 1; v.b = 1;`
	];
	let boundingBoxAnimation = {
		"particle_effects": [],
		"transitions": [
			{
				"hidden": `!v.hologram.rendering || v.hologram.structure_index != ${structureI}`
			}
		]
	};
	outlineParticleSettings.forEach(particleMolang => {
		boundingBoxAnimation["particle_effects"].push({
			"effect": "bounding_box_outline",
			"locator": "hologram_root",
			"pre_effect_script": particleMolang.replaceAll(/\s/g, "")
		});
	});
	let animationStateName = `visible_${structureI}`;
	hologramAnimationControllers["animation_controllers"]["controller.animation.holoprint.hologram.bounding_box"]["states"][animationStateName] = boundingBoxAnimation;
	hologramAnimationControllers["animation_controllers"]["controller.animation.holoprint.hologram.bounding_box"]["states"]["hidden"]["transitions"].push({
		[animationStateName]: `v.hologram.rendering && v.hologram.structure_index == ${structureI}`
	});
}
/**
 * Handles everything to do with block validation except creating the particle files from the template: Finding all blocks to be validated, getting all the unique blocks to be validated (which need particle files), and counting all the blocks to be validated per structure and per layer per structure for the Molang validation stuff.
 * @param {HoloPrintConfig} config
 * @param {[Int32Array, Int32Array][]} allStructureIndicesByLayer
 * @param {I32Vec3[]} structureSizes
 * @param {Block[]} blockPalette
 * @param {object} hologramAnimationControllers
 * @param {(coords: Vec3, locatorName: string) => void} addLocator
 * @returns {{ uniqueBlocksToValidate: Set<string>, totalBlocksToValidateByStructure: number[], totalBlocksToValidateByStructureByLayer: number[][] }}
 */

export function handleBlockValidation(config, allStructureIndicesByLayer, structureSizes, blockPalette, hologramAnimationControllers, addLocator) {
	/** @type {number[]} */
	let totalBlocksToValidateByStructure = [];
	/** @type {number[][]} */
	let totalBlocksToValidateByStructureByLayer = [];
	/** @type {Set<string>} */
	let uniqueBlocksToValidate = new Set();
	
	allStructureIndicesByLayer.forEach((structureIndicesByLayer, structureI) => {
		let structureSize = structureSizes[structureI];
		// particle_expire_if_in_blocks only works on the first layer :(
		let blockPaletteIndices = structureIndicesByLayer[0];
		/** @type {BlockToValidate[]} */
		let blocksToValidate = [];
		let blocksToValidateByLayer = [];
		
		for(let y = 0; y < structureSize[1]; y++) {
			let blocksToValidateCurrentLayer = 0; // "layer" in here refers to y-coordinate, NOT structure layer
			for(let x = 0; x < structureSize[0]; x++) {
				for(let z = 0; z < structureSize[2]; z++) {
					let coords = tuple([x, y, z]);
					let blockI = getStructureIndexFromCoordinates(coords, structureSize);
					let paletteI = blockPaletteIndices[blockI];
					let block = blockPalette[paletteI];
					if(!block && !config.VALIDATE_AIR_BLOCKS) {
						continue;
					}
					
					let blockName = block?.["name"] ?? "air";
					let blockCoordinateLocatorName = `b_${x}_${y}_${z}`;
					blocksToValidate.push({
						"locator": blockCoordinateLocatorName,
						"block": blockName,
						"pos": coords
					});
					blocksToValidateCurrentLayer++;
					uniqueBlocksToValidate.add(blockName);
					
					addLocator(coords, blockCoordinateLocatorName);
				}
			}
			blocksToValidateByLayer.push(blocksToValidateCurrentLayer);
		}
		
		addBlockValidationParticles(hologramAnimationControllers, structureI, blocksToValidate, structureSize);
		totalBlocksToValidateByStructure.push(blocksToValidate.length);
		totalBlocksToValidateByStructureByLayer.push(blocksToValidateByLayer);
	});
	return { uniqueBlocksToValidate, totalBlocksToValidateByStructure, totalBlocksToValidateByStructureByLayer };
}
/**
 * Adds a locator at a position to the hologram geo for aligning validation particles.
 * @param {object} hologramGeo
 * @param {Vec3} coords
 * @param {string} locatorName
 */

export function addCoordinateLocatorToHologramGeo(hologramGeo, coords, locatorName) {
	let geoSpaceCoords = getGeoSpaceBlockPos(coords)
	hologramGeo["minecraft:geometry"][2]["bones"][1]["locators"][locatorName] ??= geoSpaceCoords.map(x => x + 8); // 2nd geometry is for particle alignment
}
/**
 * Adds block validation particles for a single structure to the hologram animation controllers in-place.
 * @param {Record<string, any>} hologramAnimationControllers
 * @param {number} structureI
 * @param {BlockToValidate[]} blocksToValidate
 * @param {I32Vec3} structureSize
 */

export function addBlockValidationParticles(hologramAnimationControllers, structureI, blocksToValidate, structureSize) {
	let validateAllState = {
		"particle_effects": [],
		"transitions": [
			{
				"default": "!v.hologram.validating" // when changing structure it will always stop validating, so there's no need to check v.hologram.structure_index
			}
		]
	};
	let validateAllStateName = `validate_${structureI}`;
	let validationStates = hologramAnimationControllers["animation_controllers"]["controller.animation.holoprint.hologram.block_validation"]["states"];
	validationStates[validateAllStateName] = validateAllState;
	let validateAllStateTransition = {
		[validateAllStateName]: `v.hologram.validating && v.hologram.structure_index == ${structureI} && v.hologram.layer == -1`
	};
	validationStates["default"]["transitions"].push(validateAllStateTransition);
	let layersWithBlocksToValidate = [];
	blocksToValidate.forEach(blockToValidate => {
		let [x, y, z] = blockToValidate["pos"];
		let animationStateName = `validate_${structureI}_l_${y}`;
		if(!(animationStateName in validationStates)) {
			let layerAnimationState = {
				"particle_effects": [],
				"transitions": [
					{
						"default": "!v.hologram.validating"
					},
					validateAllStateTransition
				]
			};
			layersWithBlocksToValidate.forEach(layerY => { // add transitions from this layer state to others
				layerAnimationState["transitions"].push({
					[`validate_${structureI}_l_${layerY}`]: `v.hologram.validating && v.hologram.structure_index == ${structureI} && v.hologram.layer == ${layerY}`
				});
			});
			Object.values(validationStates).forEach(state => { // add transitions from other layer states (+ default/all layers) to this layer
				state["transitions"].push({
					[animationStateName]: `v.hologram.validating && v.hologram.structure_index == ${structureI} && v.hologram.layer == ${y}`
				});
			});
			validationStates[animationStateName] = layerAnimationState;
			layersWithBlocksToValidate.push(y);
		}
		let particleEffect = {
			"effect": particleNameFor(blockToValidate["block"]),
			"locator": blockToValidate["locator"],
			"pre_effect_script": `
				v.x = ${x};
				v.y = ${y};
				v.z = ${z};
			`.replaceAll(/\s/g, "") // this is only used for setting the wrong block overlay position; the particle's position is set using the locator
		};
		validateAllState["particle_effects"].push(particleEffect);
		validationStates[animationStateName]["particle_effects"].push(particleEffect);
	});
	for(let y = 0; y < structureSize[1]; y++) { // layers with no blocks to validate don't have an animation controller state, so transitions to the default state need to be added for when it's on these empty layers
		if(!layersWithBlocksToValidate.includes(y)) {
			Object.entries(validationStates).forEach(([validationStateName, validationState]) => {
				if(validationStateName.startsWith(`validate_${structureI}`)) {
					validationState["transitions"][0]["default"] += ` || v.hologram.layer == ${y}`;
				}
			});
		}
	}
}

/**
 * Add player controls. These are done entirely in the render controller so character creator skins aren't disabled.
 * @param {HoloPrintConfig} config
 * @param {Record<string, any>} defaultPlayerRenderControllers
 * @returns {Record<string, any>}
 */

export function addPlayerControlsToRenderControllers(config, defaultPlayerRenderControllers) {
	let initVariables = functionToMolang(entityScripts.playerInitVariables);
	let renderingControls = functionToMolang(entityScripts.playerRenderingControls, {
		toggleRendering: itemCriteriaToMolang(config.CONTROLS.TOGGLE_RENDERING),
		changeOpacity: itemCriteriaToMolang(config.CONTROLS.CHANGE_OPACITY),
		toggleTint: itemCriteriaToMolang(config.CONTROLS.TOGGLE_TINT),
		toggleValidating: itemCriteriaToMolang(config.CONTROLS.TOGGLE_VALIDATING),
		changeLayer: itemCriteriaToMolang(config.CONTROLS.CHANGE_LAYER),
		decreaseLayer: itemCriteriaToMolang(config.CONTROLS.DECREASE_LAYER),
		changeLayerMode: itemCriteriaToMolang(config.CONTROLS.CHANGE_LAYER_MODE),
		moveHologram: itemCriteriaToMolang(config.CONTROLS.MOVE_HOLOGRAM),
		rotateHologram: itemCriteriaToMolang(config.CONTROLS.ROTATE_HOLOGRAM),
		changeStructure: itemCriteriaToMolang(config.CONTROLS.CHANGE_STRUCTURE),
		backupHologram: itemCriteriaToMolang(config.CONTROLS.BACKUP_HOLOGRAM),
		ACTIONS: entityScripts.ACTIONS
	});
	let broadcastActions = functionToMolang(entityScripts.playerBroadcastActions, {
		backupSlotCount: config.BACKUP_SLOT_COUNT
	});
	return patchRenderControllers(defaultPlayerRenderControllers, {
		"controller.render.player.first_person": functionToMolang(entityScripts.playerFirstPerson, { initVariables, renderingControls, broadcastActions }),
		"controller.render.player.third_person": functionToMolang(entityScripts.playerThirdPerson, { initVariables, renderingControls, broadcastActions })
	});
}
/**
 * Patches a set of render controllers with some extra Molang code. Returns a new set of render controllers.
 * @param {Record<string, any>} renderControllers
 * @param {Record<string, any>} patches
 * @returns {Record<string, any>}
 */

export function patchRenderControllers(renderControllers, patches) {
	return {
		"format_version": renderControllers["format_version"],
		"render_controllers": Object.fromEntries(removeFalsies(Object.entries(patches).map(([controllerId, patch]) => {
			let controller = renderControllers["render_controllers"][controllerId];
			if(!controller) {
				console.error(`No render controller ${controllerId} found!`, renderControllers);
				return;
			}
			let originalTexture0 = controller["textures"][0];
			patch = patch.replace(/\n|\t/g, "");
			if(originalTexture0.endsWith(";")) {
				patch += originalTexture0;
			} else {
				patch += `return ${originalTexture0};`;
			}
			return [controllerId, {
				...controller,
				"textures": [patch, ...controller["textures"].slice(1)]
			}];
		})))
	};
}

/** @import { Block, I32Vec3, Vec3 } from "../types.js" */
/** @import { BlockToValidate, HoloPrintConfig } from "./packTypes.js" */
