/**
 * Shared JSDoc types for Bedrock ASI preview/geo.
 * Pack-only types live in src/holoprint/packTypes.js.
 */

/** @import * as Data from "./data/schemas" */

/**
 * Config BlockGeoMaker / TextureAtlas actually read for inspector preview.
 * @typedef {object} AsiPreviewConfig
 * @property {string[]} IGNORED_BLOCKS
 * @property {number} SCALE
 * @property {number} OPACITY
 * @property {boolean} MULTIPLE_OPACITIES
 * @property {boolean} [SKIP_TEXTURE_CROP]
 * @property {number} TEXTURE_OUTLINE_WIDTH
 * @property {string} TEXTURE_OUTLINE_COLOR
 * @property {number} TEXTURE_OUTLINE_OPACITY
 * @property {boolean} [SHOW_PREVIEW_SKYBOX]
 * @property {boolean} [SHOW_PREVIEW_WIDGETS]
 * @property {boolean} [SHOW_ENTITIES]
 * @property {string} [PACK_NAME]
 */
/**
 * @typedef {object} ItemCriteria Stores item names and tags for checking items. Leaving everything empty will check for nothing being held.
 * @property {string[]} names Item names the matching item could have. The `minecraft:` namespace will be used if no namespace is specified.
 * @property {string[]} tags Item tags the matching item could have. The `minecraft:` namespace will be used if no namespace is specified.
 */
/**
 * @typedef {object} NBTBlock A block as stored in NBT.
 * @property {string} name The block's ID
 * @property {Record<string, number | string>} states Block states
 * @property {number} version
 */
/**
 * @typedef {object} Block A block palette entry, similar to how it appears in the NBT, as used in HoloPrint.
 * @property {string} name The block's ID
 * @property {Record<string, number | string>} [states] Block states
 * @property {object} [block_entity_data] Block entity data
 */
/**
 * @typedef {Record<Data.CardinalDirection, { uv: Vec2, uv_size: Vec2 }>} CubeUv
 */
/**
 * @typedef {object} PolyMesh A `poly_mesh` object as in geometry files.
 * @property {boolean} [normalized_uvs]
 * @property {Vec3[]} normals
 * @property {Vec2[]} uvs
 * @property {Vec3[]} positions
 * @property {PolyMeshFace[]} polys
 */
/**
 * @typedef {[Vec3, Vec3, Vec3, Vec3]} PolyMeshFace A square face.
 */
/**
 * @typedef {object} PolyMeshTemplateFace
 * @property {Vec3} normal
 * @property {number} textureRefI
 * @property {[PolyMeshTemplateVertex, PolyMeshTemplateVertex, PolyMeshTemplateVertex, PolyMeshTemplateVertex]} vertices
 */
/**
 * @typedef {object} PolyMeshTemplateVertex
 * @property {Vec3} pos
 * @property {number} corner 0: top left, 1: top right, 2: bottom left, 3: bottom right
 */
/**
 * @typedef {object} PolyMeshTemplateFaceWithUvs
 * @property {Vec3} normal
 * @property {number} transparency Average transparency per texture pixel. 255 = fully transparent, 0 = fully opaque
 * @property {[PolyMeshTemplateVertexWithUv, PolyMeshTemplateVertexWithUv, PolyMeshTemplateVertexWithUv, PolyMeshTemplateVertexWithUv]} vertices
 */
/**
 * @typedef {object} PolyMeshTemplateVertexWithUv
 * @property {Vec3} pos
 * @property {Vec2} uv
 */
/**
 * @typedef {object} TextureReference A texture reference, made in BlockGeoMaker.js and turned into a texture in TextureAtlas.js.
 * @property {Vec2} uv UV coordinates
 * @property {Vec2} uv_size	UV size
 * @property {string} block_name Block ID to get the texture from
 * @property {string} texture_face Which face's texture to use
 * @property {number} variant Which terrain_texture.json variant to use
 * @property {string} [texture_path_override] An overriding texture file path to look at
 * @property {string} [terrain_texture_override] A terrain texture key override; will override block_name and texture_face
 * @property {Vec3} [tint] A tint override
 */
/**
 * @typedef {object} TextureFragment An unresolved texture fragment containing an image path, tint, and UV position and size.
 * @property {string} texturePath
 * @property {Vec3} [tint]
 * @property {boolean} [tint_like_png]
 * @property {number} opacity
 * @property {Vec2} uv
 * @property {Vec2} uv_size
 */
/**
 * @typedef {object} ImageFragment An image fragment containing image data, UV position, and UV size.
 * @property {ImageData} imageData
 * @property {number} w Width
 * @property {number} h Height
 * @property {number} sourceX
 * @property {number} sourceY
 * @property {Rectangle} [crop]
 */
/**
 * @typedef {object} ImageUv
 * @property {Vec2} uv
 * @property {Vec2} uv_size
 * @property {number} transparency
 * @property {Rectangle} [crop]
 */
/**
 * @typedef {object} PreviewPointLight A point light in the structure preview.
 * @property {Vec3} pos Position in Three.js space
 * @property {import("three").Color} col As a hex number, e.g. 0xFF0000
 * @property {number} intensity
 */
/**
 * @typedef {object} MCStructure The parsed NBT of a `.mcstructure` file.
 * @property {number} format_version Format version, should be always set to 1.
 * @property {I32Vec3} size Size of the structure in blocks.
 * @property {object} structure
 * @property {[Int32Array, Int32Array]} structure.block_indices Block indices for the structure.
 * @property {EntityNBTCompound[]} structure.entities List of entities stored as NBT.
 * @property {object} structure.palette
 * @property {object} structure.palette.default
 * @property {NBTBlock[]} structure.palette.default.block_palette List of ordered block entries that the indices refer to.
 * @property {Record<number, BlockPositionData>} [structure.palette.default.block_position_data] Additional data for individual blocks in the structure.
 * @property {I32Vec3} structure_world_origin The original world position where the structure was saved.
 */
/**
 * @typedef {Record<string, any>} EntityNBTCompound Represents an entity NBT compound structure (placeholder).
 */
/**
 * @typedef {object} BlockPositionData Additional data for individual blocks.
 * @property {EntityNBTCompound} [block_entity_data] Block entity data.
 * @property {TickQueueData[]} [tick_queue_data] Scheduled tick information for blocks that need updates.
 */
/**
 * @typedef {object} TickQueueData Represents a scheduled pending tick update. Used in observers.
 * @property {number} tick_delay Number of ticks remaining before update.
 */
/**
 * @typedef {object} TypedBlockStateProperty
 * @property {number} [int] - An integer property.
 * @property {string} [string] - A string property.
 * @property {number} [byte] - A byte property.
 */
/**
 * @typedef {object} BlockUpdateSchemaFlattenRule
 * @property {string} prefix - The prefix for the flattened property.
 * @property {string} flattenedProperty - The name of the flattened property.
 * @property {"int" | "string" | "byte"} [flattenedPropertyType] - The type of the flattened property.
 * @property {string} suffix - The suffix for the flattened property.
 * @property {Record<string, string>} [flattenedValueRemaps] - A mapping of flattened values.
 */
/**
 * @typedef {object} BlockUpdateSchemaRemappedState
 * @property {Record<string, TypedBlockStateProperty> | null} oldState - The property values before the remapping.
 * @property {string} [newName] - An optional new name for the block.
 * @property {BlockUpdateSchemaFlattenRule} [newFlattenedName] - An optional flattened property rule providing a new name.
 * @property {Record<string, TypedBlockStateProperty> | null} newState - The new property values after the remapping.
 * @property {string[]} [copiedState] - Optional list of property names to copy from the old state.
 */
/**
 * @typedef {object} BlockUpdateSchemaSkeleton
 * @property {string} filename
 * @property {number} maxVersionMajor - The major version (must be >= 0).
 * @property {number} maxVersionMinor - The minor version (must be >= 0).
 * @property {number} maxVersionPatch - The patch version (must be >= 0).
 * @property {number} maxVersionRevision - The revision version (must be >= 0).
 */
/**
 * @typedef {object} BlockUpdateSchema
 * @property {number} maxVersionMajor - The major version (must be >= 0).
 * @property {number} maxVersionMinor - The minor version (must be >= 0).
 * @property {number} maxVersionPatch - The patch version (must be >= 0).
 * @property {number} maxVersionRevision - The revision version (must be >= 0).
 * @property {Record<string, string>} [renamedIds] - Mapping of renamed IDs.
 * @property {Record<string, Record<string, TypedBlockStateProperty>>} [addedProperties] - Mapping of added properties.
 * @property {Record<string, Record<string, string>>} [renamedProperties] - Mapping of renamed properties.
 * @property {Record<string, string[]>} [removedProperties] - Mapping of removed properties.
 * @property {Record<string, Record<string, string>>} [remappedPropertyValues] - Mapping of remapped property values.
 * @property {Record<string, { old: TypedBlockStateProperty, new: TypedBlockStateProperty }[]>} [remappedPropertyValuesIndex] - Index of remapped property values.
 * @property {Record<string, BlockUpdateSchemaFlattenRule>} [flattenedProperties] - Mapping of flattened properties.
 * @property {Record<string, BlockUpdateSchemaRemappedState[]>} [remappedStates] - Mapping of remapped states.
 */
/**
 * @typedef {object} Rectangle
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 */
/**
 * @typedef {[number, number]} Vec2 2D vector.
 */
/**
 * @typedef {[number, number, number]} Vec3 3D vector.
 */
/**
 * @typedef {[number, number, number, number]} Vec4 4D vector.
 */
/**
 * @template T
 * @template {number} N
 * @template {T[]} [R=[]]
 * @typedef {number extends N? T[] : R["length"] extends N? R : Tuple<T, N, [T, ...R]>} Tuple
 */
/**
 * @template {number} R
 * @template {number} C
 * @template [T=number]
 * @typedef {R extends R? C extends C? (T[] & { length: C })[] & { length: R } : never : never} Matrix
 */
/**
 * @template {number} R
 * @template {number} C
 * @template [T=number]
 * @typedef {R extends R? C extends C? Tuple<Tuple<T, C>, R> : never : never} TupleMatrix
 */
/**
 * @typedef {[Vec4, Vec4, Vec4, Vec4]} Mat4 4x4 matrix.
 */
/**
 * @typedef {Int32Array & { length: 3 }} I32Vec3
 */
/**
 * @typedef {Float32Array & { length: 8 }} F32Vec8
 */
