import { weaklyCacheUnaryFunc, removeFileExtension, tuple, UserError, clonePromise } from "../utils.js";
import { createItemCriteria } from "./itemCriteria.js";
import {
	McstructureCodecError,
	readMcstructure
} from "../viewer/api/structure.js";
import { IGNORED_BLOCKS } from "../viewer/palette.js";

export const VERSION = "dev";

export const PLAYER_CONTROL_NAMES = {
	TOGGLE_RENDERING: "player_controls.toggle_rendering",
	CHANGE_OPACITY: "player_controls.change_opacity",
	TOGGLE_TINT: "player_controls.toggle_tint",
	TOGGLE_VALIDATING: "player_controls.toggle_validating",
	CHANGE_LAYER: "player_controls.change_layer",
	DECREASE_LAYER: "player_controls.decrease_layer",
	CHANGE_LAYER_MODE: "player_controls.change_layer_mode",
	MOVE_HOLOGRAM: "player_controls.move_hologram",
	ROTATE_HOLOGRAM: "player_controls.rotate_hologram",
	CHANGE_STRUCTURE: "player_controls.change_structure",
	DISABLE_PLAYER_CONTROLS: "player_controls.disable_player_controls",
	BACKUP_HOLOGRAM: "player_controls.backup_hologram"
};

export const DEFAULT_PLAYER_CONTROLS = {
	TOGGLE_RENDERING: createItemCriteria("brick"),
	CHANGE_OPACITY: createItemCriteria("amethyst_shard"),
	TOGGLE_TINT: createItemCriteria("white_dye"),
	TOGGLE_VALIDATING: createItemCriteria("iron_ingot"),
	CHANGE_LAYER: createItemCriteria("leather"),
	DECREASE_LAYER: createItemCriteria("feather"),
	CHANGE_LAYER_MODE: createItemCriteria("flint"),
	MOVE_HOLOGRAM: createItemCriteria("stick"),
	ROTATE_HOLOGRAM: createItemCriteria("copper_ingot"),
	CHANGE_STRUCTURE: createItemCriteria("arrow"),
	DISABLE_PLAYER_CONTROLS: createItemCriteria("bone"),
	BACKUP_HOLOGRAM: createItemCriteria("paper")
};

/**
 * Returns the default pack name that would be used if no pack name is specified.
 * @param {File[]} structureFiles
 * @returns {string}
 */
export function getDefaultPackName(structureFiles) {
	let defaultName = structureFiles.map(structureFile => structureFile.name.replace(/(\.holoprint)?\.[^.]+$/, "")).join(", ");
	if(defaultName.length > 40) {
		defaultName = `${defaultName.slice(0, 19)}...${defaultName.slice(-19)}`;
	}
	if(defaultName.trim() == "") {
		defaultName = "hologram";
	}
	return defaultName;
}

/**
 * Finds all labels and links in a description section that will be put in the settings links section.
 * @param {string} description
 * @returns {[string, string][]}
 */
export function findLinksInDescription(description) {
	let links = [];
	Array.from(description.matchAll(/(.*?)\n?\s*(https?:\/\/[^\s]+)/g)).forEach(match => {
		let label = match[1].trim();
		let url = match[2].trim();
		links.push([label, url]);
	});
	return links;
}

/**
 * Adds default config options to a potentially incomplete config object.
 * @param {Partial<HoloPrintConfig>} config
 * @returns {HoloPrintConfig}
 */
export function addDefaultConfig(config) {
	return Object.freeze({
		...{
			IGNORED_BLOCKS: [],
			IGNORED_MATERIAL_LIST_BLOCKS: [],
			SCALE: 0.95,
			OPACITY: 0.9,
			MULTIPLE_OPACITIES: true,
			TINT_COLOR: "#579EFA",
			TINT_OPACITY: 0.2,
			MINI_SCALE: 0.125,
			TEXTURE_OUTLINE_WIDTH: 0.25,
			TEXTURE_OUTLINE_COLOR: "#00F",
			TEXTURE_OUTLINE_OPACITY: 0.65,
			SPAWN_ANIMATION_ENABLED: true,
			SPAWN_ANIMATION_LENGTH: 0.4,
			PLAYER_CONTROLS_ENABLED: true,
			CONTROLS: {},
			UI_CONTROLS_ENABLED: true,
			RETEXTURE_CONTROL_ITEMS: true,
			CONTROL_ITEM_TEXTURE_SCALE: 1,
			RENAME_CONTROL_ITEMS: true,
			WRONG_BLOCK_OVERLAY_COLOR: tuple([1, 0, 0, 0.3]),
			INITIAL_OFFSET: tuple([0, 0, 0]),
			COORDINATE_LOCK: undefined,
			BACKUP_SLOT_COUNT: 10,
			VALIDATE_AIR_BLOCKS: false,
			LAYER_BY_LAYER_DIAGRAM_BLOCK_RESOLUTION: 64,
			PACK_NAME: undefined,
			PACK_ICON_BLOB: undefined,
			AUTHORS: [],
			DESCRIPTION: undefined,
			COMPRESSION_LEVEL: 5,
			PREVIEW_BLOCK_LIMIT: 2500,
			SHOW_PREVIEW_SKYBOX: true,
			SHOW_PREVIEW_WIDGETS: true
		},
		...config,
		...{
			IGNORED_BLOCKS: IGNORED_BLOCKS.concat(config.IGNORED_BLOCKS ?? []),
			CONTROLS: {
				...DEFAULT_PLAYER_CONTROLS,
				...config.CONTROLS
			}
		}
	});
}

export const readStructureNBT = weaklyCacheUnaryFunc(
	/**
	 * Reads the NBT of a structure file, returning a JSON object.
	 * @param {File} structureFile `*.mcstructure`
	 * @returns {Promise<MCStructure>}
	 */
	async structureFile => {
		try {
			const { nbt } = await readMcstructure(structureFile);
			return nbt;
		} catch (e) {
			if (e instanceof McstructureCodecError) {
				if (e.code === "STRUCTURE_EMPTY") {
					throw new UserError(`"${structureFile.name}" is an empty file! Please try exporting your structure again.\nIf you play on a version below 1.20.50, exporting to OneDrive will cause your structure file to be empty.`);
				}
				if (e.code === "STRUCTURE_NBT_REJECTED" || e.code === "JAVA_NBT_DETECTED") {
					throw new UserError(getInvalidMcstructureErrorMessage(structureFile, e.extra?.nbt ?? {}, e.message));
				}
				throw e.toError(structureFile.name, UserError);
			}
			throw e;
		}
	},
	clonePromise
);

/**
 * Gets the error message for a NBT file that isn't .mcstructures.
 * @param {File} structureFile
 * @param {object} nbt
 * @param {string} [reason] Which codec check failed
 * @returns {string}
 */
function getInvalidMcstructureErrorMessage(structureFile, nbt, reason) {
	let offendingStructureName = removeFileExtension(structureFile.name);
	let errorMessage = `Structure ${offendingStructureName} is not a valid .mcstructure file!`;
	if (reason) {
		errorMessage += ` (${reason})`;
	}
	const otherNBTFileTypes = {
		"MinecraftDataVersion": "litematic",
		"TileEntities": "schematic",
		"Metadata": "schem",
		"DataVersion": "nbt"
	};
	let probableSourceFileExtension = Object.entries(otherNBTFileTypes).find(([key]) => key in nbt)?.[1];
	if(probableSourceFileExtension) {
		errorMessage += `\nNote: Renaming .${probableSourceFileExtension} to .mcstructure doesn't work, you must create the structure file from inside Minecraft Bedrock! Minecraft Java structures aren't the same as Minecraft Bedrock structures!`;
	}
	return errorMessage;
}

/** @import { MCStructure } from "../types.js" */
/** @import { HoloPrintConfig } from "./packTypes.js" */
