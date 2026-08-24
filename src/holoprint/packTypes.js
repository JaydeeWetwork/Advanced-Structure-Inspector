/**
 * Pack-only JSDoc types. Inspector geo uses src/types.js (AsiPreviewConfig).
 */

/** @import { ItemCriteria, Vec3, Vec4, I32Vec3, PolyMeshTemplateFaceWithUvs } from "../types.js" */

/**
 * @typedef {object} HoloPrintConfig Pack-generation + hologram options.
 * @property {string[]} IGNORED_BLOCKS
 * @property {string[]} IGNORED_MATERIAL_LIST_BLOCKS
 * @property {number} SCALE
 * @property {number} OPACITY
 * @property {boolean} MULTIPLE_OPACITIES
 * @property {string} TINT_COLOR
 * @property {number} TINT_OPACITY
 * @property {number} MINI_SCALE
 * @property {number} TEXTURE_OUTLINE_WIDTH
 * @property {string} TEXTURE_OUTLINE_COLOR
 * @property {number} TEXTURE_OUTLINE_OPACITY
 * @property {boolean} SPAWN_ANIMATION_ENABLED
 * @property {number} SPAWN_ANIMATION_LENGTH
 * @property {boolean} PLAYER_CONTROLS_ENABLED
 * @property {HoloPrintControlsConfig} CONTROLS
 * @property {boolean} UI_CONTROLS_ENABLED
 * @property {boolean} RETEXTURE_CONTROL_ITEMS
 * @property {number} CONTROL_ITEM_TEXTURE_SCALE
 * @property {boolean} RENAME_CONTROL_ITEMS
 * @property {Vec4} WRONG_BLOCK_OVERLAY_COLOR
 * @property {Vec3} INITIAL_OFFSET
 * @property {Vec4[] | undefined} COORDINATE_LOCK
 * @property {number} BACKUP_SLOT_COUNT
 * @property {boolean} VALIDATE_AIR_BLOCKS
 * @property {number} LAYER_BY_LAYER_DIAGRAM_BLOCK_RESOLUTION
 * @property {string | undefined} PACK_NAME
 * @property {Blob} PACK_ICON_BLOB
 * @property {string[]} AUTHORS
 * @property {string | undefined} DESCRIPTION
 * @property {number} COMPRESSION_LEVEL
 * @property {number} PREVIEW_BLOCK_LIMIT
 * @property {boolean} SHOW_PREVIEW_SKYBOX
 * @property {boolean} SHOW_PREVIEW_WIDGETS
 */
/**
 * @typedef {object} HoloPrintControlsConfig
 * @property {ItemCriteria} TOGGLE_RENDERING
 * @property {ItemCriteria} CHANGE_OPACITY
 * @property {ItemCriteria} TOGGLE_TINT
 * @property {ItemCriteria} TOGGLE_VALIDATING
 * @property {ItemCriteria} CHANGE_LAYER
 * @property {ItemCriteria} DECREASE_LAYER
 * @property {ItemCriteria} CHANGE_LAYER_MODE
 * @property {ItemCriteria} MOVE_HOLOGRAM
 * @property {ItemCriteria} ROTATE_HOLOGRAM
 * @property {ItemCriteria} CHANGE_STRUCTURE
 * @property {ItemCriteria} DISABLE_PLAYER_CONTROLS
 * @property {ItemCriteria} BACKUP_HOLOGRAM
 */
/**
 * @typedef {object} BlockToValidate
 * @property {string} locator
 * @property {string} block
 * @property {Vec3} pos
 */
/**
 * @typedef {object} MaterialListEntry
 * @property {string} itemName
 * @property {string} translationKey
 * @property {string} translatedName
 * @property {number} count
 * @property {string} partitionedCount
 * @property {string} partitionedCountWithoutTotal
 * @property {number | undefined} auxId
 */
/**
 * @typedef {object} ExportedMaterialListJsonUi
 * @property {Record<string, object>[]} entries
 * @property {number} visibleHeight
 * @property {number} longestItemNameLength
 * @property {number} longestCountLength
 * @property {[string | number, string | number]} itemNameColumnSize
 */
/**
 * @typedef {object} SpawnAnimationBone
 * @property {string} boneName
 * @property {Vec3} blockPos
 */
/**
 * @typedef {object} MinecraftAnimation
 * @property {number} [animation_length]
 * @property {Record<string, object>} [bones]
 */

export {};
