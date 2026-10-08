// this looks interesting: https://github.com/PrismarineJS/minecraft-data/blob/master/data/bedrock/1.20.71/blockCollisionShapes.json (Object.fromEntries(Object.entries(d.blocks).map(([name, indices])=>[name,indices.map(i=>d.shapes[i])])))
// READ: this also looks pretty comprehensive: https://github.com/MCBE-Development-Wiki/mcbe-dev-home/blob/main/docs/misc/enums/block_shape.md
// https://github.com/bricktea/MCStructure/blob/main/docs/1.16.201/enums/B.md
import { JSONSet, tuple, vec3, PatternMap } from "../../utils.js";
import { applyFaceCropping, quadWinding, reverseQuad } from "./blockFaceUv.js";
import { resolveBlockShapeName } from "../appearanceFallback.js";
import { rotationLookup } from "../legacyStateAlias.js";
import { emitFacesFromCubes, expandShapeCubes } from "./polyMeshTemplateFaces.js";
import {
	addEasyPropertyAccessors,
	applyEulerRotation,
	calculateCenterOfMass,
	calculateUv,
	getBlockStatesAndEntityDataEntries,
	getSurfaceNormal,
	getVertices,
	optimizeGeometry,
	scaleFaces
} from "./blockCubeGeometry.js";
const BED_COLOR_NAMES = [
	"white", "orange", "magenta", "light_blue", "yellow", "lime", "pink", "gray",
	"silver", "cyan", "purple", "blue", "brown", "green", "red", "black"
];
/**
 * Terrain-texture array index for a block-state value. Out-of-range growth
 * (e.g. torchflower 2) clamps to the last stage instead of logging.
 * @param {unknown} blockStateVariants
 * @param {unknown} blockStateValue
 * @returns {number|undefined}
 */
export function pickTextureVariantIndex(blockStateVariants, blockStateValue) {
	if(blockStateVariants == null) return undefined;
	if(blockStateValue in /** @type {object} */ (blockStateVariants)) {
		return /** @type {any} */ (blockStateVariants)[/** @type {any} */ (blockStateValue)];
	}
	if(!Array.isArray(blockStateVariants) || !blockStateVariants.length) return undefined;
	const n = Number(blockStateValue);
	const i = Number.isFinite(n)
		? Math.max(0, Math.min(blockStateVariants.length - 1, Math.trunc(n)))
		: 0;
	return blockStateVariants[i];
}
/** Joined two-cell models stay unscaled so the seam stays flush. */
export function skipSeamScale(shape) {
	const s = String(shape ?? "");
	return s.startsWith("chest_large") || s.startsWith("chest_double") || s === "straw_bed";
}
/** Pack-era name for {@link skipSeamScale}. */
export const skipHologramScale = skipSeamScale;
/**
 * Bedrock omits default-0 integer states from NBT.
 * String `if`s (`vertical_half == bottom`) have no numeric default.
 * @param {string} expectedBlockState
 * @returns {0|undefined}
 */
export function omittedStateDefault(expectedBlockState) {
	return /^-?\d+$/.test(String(expectedBlockState)) ? 0 : undefined;
}
/**
 * Vanilla `bed` NBT color, or flattened `red_bed` / `light_gray_bed` ids.
 * Default is red (legacy `bed`).
 * @param {{ name?: string }} block
 * @param {string[]} [array]
 */
export function bedColorIndex(block, array = BED_COLOR_NAMES) {
	const n = String(block?.name || "").replace(/^minecraft:/, "");
	if (n.endsWith("_bed") && n !== "bed" && n !== "straw_bed") {
		let c = n.slice(0, -4);
		if (c === "light_gray") c = "silver";
		const i = array.indexOf(c);
		return i >= 0 ? i : 14;
	}
	return 14;
}
// https://wiki.bedrock.dev/visuals/material-creations.html#overlay-color-in-render-controllers
// https://wiki.bedrock.dev/documentation/materials.html#entity-alphatest
export default class BlockGeoMaker {
	config;
	textureRefs = new JSONSet();
	
	#entityGeoMaker;
	
	#individualBlockShapes;
	#blockShapePatterns;
	#blockShapeGeos;
	#eigenvariants;
	
	#globalBlockStateRotations;
	#blockShapeBlockStateRotations = new Map();
	#blockNameBlockStateRotations = new Map();
	/** @type {Map<string, { when_state: string, when_values: unknown[], drop: string, else_drop: string }>} */
	#rotationExclusions = new Map();
	
	#globalBlockStateTextureVariants;
	#blockShapeBlockStateTextureVariants = new Map();
	#blockNameBlockStateTextureVariants;
	
	#cachedBlockShapes = new Map();
	/** @type {Set<string>} ids whose named shape is missing from blockShapeGeos */
	unmappedBlockNames = new Set();
	/** @type {Set<string>} vanilla-style solids that use the default 16³ cube */
	defaultCubeNames = new Set();
	/** @type {Map<string, { faces: PolyMeshTemplateFace[], centerOfMass: Vec3 }>} */
	/** @type {Map<string, { faces: PolyMeshTemplateFace[], centerOfMass: Vec3, shape: string }>} */
	#templateMemo = new Map();
	
	/**
	 * @param {bedrockLayersPreviewConfig} config
	 * @param {EntityGeoMaker} entityGeoMaker
	 * @param {Data.BlockShapes} blockShapes
	 * @param {Data.BlockShapeGeos} blockShapeGeos
	 * @param {Data.BlockStateDefinitions} blockStateDefs
	 * @param {Data.BlockEigenvariants} eigenvariants
	 */
	constructor(config, entityGeoMaker, blockShapes, blockShapeGeos, blockStateDefs, eigenvariants) {
		this.config = config;
		this.#entityGeoMaker = entityGeoMaker;
		this.unmappedBlockNames = new Set();
		this.defaultCubeNames = new Set();
		
		this.#individualBlockShapes = blockShapes["individual_blocks"];
		this.#blockShapePatterns = Object.entries(blockShapes["patterns"]).map(([rule, blockShape]) => [new RegExp(rule), blockShape]); // store regular expressions from the start to avoid recompiling them every time
		this.#blockShapeGeos = blockShapeGeos;
		this.#eigenvariants = eigenvariants;
		
		// console.log(this.#blockShapeGeos)
		
		// block-state-driven rotations/texture variants can either be global, based on block shape, based on specific block names, or based on regular expressions for block names, hence the many variables.
		this.#globalBlockStateRotations = blockStateDefs["rotations"]["*"];
		Object.entries(blockStateDefs["rotations"]["block_shapes"] ?? {}).forEach(([blockShapes, rotationDefs]) => {
			blockShapes.split(",").forEach(blockShape => {
				this.#blockShapeBlockStateRotations.set(blockShape, rotationDefs);
			});
		});
		Object.entries(blockStateDefs["rotations"]["block_names"] ?? {}).forEach(([blockNames, rotationDefs]) => {
			blockNames.split(",").forEach(blockName => {
				this.#blockNameBlockStateRotations.set(blockName, rotationDefs);
			});
		});
		this.#rotationExclusions = new Map(Object.entries(blockStateDefs["rotation_exclusions"] ?? {}));
		
		this.#globalBlockStateTextureVariants = blockStateDefs["texture_variants"]["*"];
		Object.entries(blockStateDefs["texture_variants"]["block_shapes"] ?? {}).forEach(([blockShapes, textureVariantDefs]) => {
			blockShapes.split(",").forEach(blockShape => {
				this.#blockShapeBlockStateTextureVariants.set(blockShape, textureVariantDefs);
			});
		});
		this.#blockNameBlockStateTextureVariants = new PatternMap(Object.entries(blockStateDefs["texture_variants"]["block_names"] ?? {}), ",");
	}
	/**
	 * Makes face templates (unscaled) and their centers of mass from a block palette.
	 * @param {Block[]} blockPalette
	 * @returns {Promise<{ templates: PolyMeshTemplateFace[][], centersOfMass: Vec3[], shapes: string[] }>}
	 */
	async makePolyMeshTemplates(blockPalette) {
		const results = [];
		const batch = 24;
		for (let i = 0; i < blockPalette.length; i += batch) {
			const slice = blockPalette.slice(i, i + batch);
			results.push(...await Promise.all(slice.map(block => this.#makePolyMeshTemplate(block))));
			if (i + batch < blockPalette.length) {
				await new Promise(r => setTimeout(r, 0));
			}
		}
		return {
			templates: results.map(result => result.faces),
			centersOfMass: results.map(result => result.centerOfMass),
			shapes: results.map(result => result.shape)
		};
	}
	/**
	 * Scales face templates (with resolved UVs) towards their center of mass.
	 * Joined pairs (double chests, straw beds) stay unscaled so the seam stays flush.
	 * SCALE 1 returns the same arrays.
	 * @template {PolyMeshTemplateFace | PolyMeshTemplateFaceWithUvs} T
	 * @param {T[][]} faceTemplates
	 * @param {Vec3[]} centersOfMass
	 * @param {string[]} [shapes] from makePolyMeshTemplates (not palette NBT)
	 * @returns {T[][]}
	 */
	scaleFaceTemplates(faceTemplates, centersOfMass, shapes) {
		if (this.config.SCALE === 1) {
			return faceTemplates;
		}
		return faceTemplates.map((faces, i) => {
			if (skipSeamScale(shapes?.[i])) return faces;
			return this.#scaleFaces(structuredClone(faces), centersOfMass[i]);
		});
	}
	/**
	 * Makes a poly mesh template (i.e. an array of poly mesh template faces) from a block. Texture UVs are unresolved, and are indices for the textureRefs property.
	 * @param {Block} block
	 * @returns {Promise<{ faces: PolyMeshTemplateFace[], centerOfMass: Vec3, shape: string }>}
	 */
	async #makePolyMeshTemplate(block) {
		const blockName = typeof block?.["name"] === "string" ? block["name"] : "";
		const storedShape = block?.["bLayers_block_shape"];
		const blockShape = typeof storedShape === "string" && storedShape
			? storedShape
			: this.#getBlockShape(blockName);
		const memoKey = `${blockName}|${blockShape}|${JSON.stringify(block["states"] ?? {})}`;
		const hit = this.#templateMemo.get(memoKey);
		if (hit) {
			return {
				faces: structuredClone(hit.faces),
				centerOfMass: /** @type {Vec3} */ ([...hit.centerOfMass]),
				shape: hit.shape
			};
		}
		const made = await this.#makePolyMeshTemplateUncached(block, blockShape);
		this.#templateMemo.set(memoKey, {
			faces: structuredClone(made.faces),
			centerOfMass: /** @type {Vec3} */ ([...made.centerOfMass]),
			shape: made.shape
		});
		return made;
	}
	/**
	 * @param {Block} block
	 * @param {string} blockShape
	 * @returns {Promise<{ faces: PolyMeshTemplateFace[], centerOfMass: Vec3, shape: string }>}
	 */
	async #makePolyMeshTemplateUncached(block, blockShape) {
		let blockName = block["name"];
		let { faces, centerOfMass } = await this.#makePolyMeshTemplateFaces(block, blockShape);
		if(!faces) {
			console.debug(`No faces are being rendered for block ${blockName}`);
			return { faces: [], centerOfMass: [-1, -1, -1], shape: blockShape };
		}
		if(blockShape.includes("<")) {
			blockShape = blockShape.slice(0, blockShape.indexOf("<"));
		}
		let rotation = this.#getBlockRotation(block, blockShape);
		if(rotation) {
			faces.forEach(face => {
				face["normal"] = applyEulerRotation(face["normal"], rotation, [0, 0, 0]);
				face["vertices"].forEach(vertex => {
					vertex["pos"] = applyEulerRotation(vertex["pos"], rotation, [8, 8, 8]); // (8, 8, 8) is the block center and the pivot for all block-wide rotations
				});
			});
			centerOfMass = applyEulerRotation(centerOfMass, rotation, [8, 8, 8]);
		}
		faces.forEach(face => {
			if(face["fullbright"]) {
				face["normal"] = [0, 1, 0];
			} else {
				face["normal"] = vec3.toFixed(face["normal"], 4);
			}
			delete face["fullbright"];
		});
		return { faces, centerOfMass, shape: blockShape };
	}
	/**
	 * Gets the block shape for a specific block.
	 * @param {string} blockName
	 * @returns {string}
	 */
	#getBlockShape(blockName) {
		if(this.#cachedBlockShapes.has(blockName)) {
			return this.#cachedBlockShapes.get(blockName);
		}
		let { shape, fallback } = resolveBlockShapeName(
			blockName,
			this.#individualBlockShapes,
			this.#blockShapePatterns
		);
		if(fallback) {
			this.defaultCubeNames.add(blockName);
		}
		this.#cachedBlockShapes.set(blockName, shape);
		return shape;
	}
	/**
	 * Makes the poly mesh faces for a block.
	 * @param {Block} block
	 * @param {string} blockShape
	 * @returns {Promise<{ faces?: (PolyMeshTemplateFace & { fullbright?: boolean })[], centerOfMass?: Vec3 }>}
	 */
	async #makePolyMeshTemplateFaces(block, blockShape) {
		if (typeof blockShape !== "string") blockShape = "block";
		let specialTexture;
		if(blockShape.includes("<")) {
			const matched = blockShape.match(/^(\w+)<([\w\/]*)>$/);
			if (matched) [, blockShape, specialTexture] = matched;
		}
		const host = {
			geos: this.#blockShapeGeos,
			unmappedBlockNames: this.unmappedBlockNames,
			ignoredBlocks: this.config.IGNORED_BLOCKS,
			entityGeoMaker: this.#entityGeoMaker,
			textureRefs: this.textureRefs,
			interpolate: (b, expression, cube, tex) => this.#interpolateInBlockValues(b, expression, cube, tex),
			conditional: (b, expression) => this.#checkBlockStateConditional(b, expression),
			shapeOf: name => this.#getBlockShape(name),
			facesFor: (b, shape) => this.#makePolyMeshTemplateFaces(b, shape),
			addEasy: addEasyPropertyAccessors,
			optimize: optimizeGeometry,
			textureVariant: (b, ignore) => this.#getTextureVariant(b, ignore),
			calculateUv: calculateUv,
			vertices: getVertices,
			rotate: applyEulerRotation,
			surfaceNormal: getSurfaceNormal,
			centerOfMass: calculateCenterOfMass
		};
		const { filteredCubes, allFaces } = await expandShapeCubes(host, block, blockShape, specialTexture);
		if(filteredCubes.length == 0) {
			return {};
		}
		return emitFacesFromCubes(host, block, blockShape, specialTexture, filteredCubes, allFaces);
	}
	/**
	 * Gets the block rotation for an entire block based on block states.
	 * @param {Block} block
	 * @param {string} blockShape
	 * @returns {Vec3 | null}
	 */
	#getBlockRotation(block, blockShape) {
		let blockName = block["name"];
		let blockShapeSpecificRotations = this.#blockShapeBlockStateRotations.get(blockShape);
		let blockNameSpecificRotations = this.#blockNameBlockStateRotations.get(blockName);
		const specificRotations = {
			...(blockShapeSpecificRotations ?? {}),
			...(blockNameSpecificRotations ?? {})
		};
		let statesAndBlockEntityData = getBlockStatesAndEntityDataEntries(block);
		const exclusion = this.#rotationExclusions.get(blockShape);
		if(exclusion) {
			// Both states are stored. The shape data says which one wins, so the board is not turned twice.
			const raw = block["states"]?.[exclusion["when_state"]];
			const drop = exclusion["when_values"].some(value => value === raw) ? exclusion["drop"] : exclusion["else_drop"];
			statesAndBlockEntityData = statesAndBlockEntityData.filter(([name]) => name !== drop);
		}
		let rotation = null;
		statesAndBlockEntityData.forEach(([blockStateName, blockStateValue]) => {
			const lookup = rotationLookup(block, specificRotations, blockStateName, blockStateValue);
			let rotations = blockNameSpecificRotations?.[lookup.name] ?? blockShapeSpecificRotations?.[lookup.name] ?? this.#globalBlockStateRotations[lookup.name]; // order: block name (exact match), block shape, global
			if(!rotations) {
				return; // this block state doesn't control rotation
			}
			
			if(!(lookup.value in rotations)) {
				console.error(`Block state value ${lookup.value} for rotation block state ${lookup.name} not found on ${blockName}...`, block);
				return;
			}
			if(rotation) {
				console.debug(`Multiple rotation block states for block ${block["name"]}; adding them all together!`);
				rotation = vec3.add(rotation, rotations[lookup.value]);
			} else {
				rotation = rotations[lookup.value];
			}
		});
		return rotation;
	}
	#scaleFaces(faces, centerOfMass) {
		return scaleFaces(faces, centerOfMass, this.config.SCALE);
	}
	/**
	 * Gets the index of the variant to use in terrain_texture.json for a block.
	 * @param {Block} block
	 * @param {boolean} [ignoreEigenvariant]
	 * @returns {number}
	 */
	#getTextureVariant(block, ignoreEigenvariant = false) {	
		let blockName = typeof block?.["name"] === "string" ? block["name"] : "";
		let eigenvariantExists = Object.hasOwn(this.#eigenvariants, blockName);
		if(!ignoreEigenvariant && eigenvariantExists) {
			let variant = this.#eigenvariants[blockName];
			if (typeof variant !== "number") eigenvariantExists = false;
			else {
				console.debug(`Using eigenvariant ${variant} for block ${blockName}`);
				return variant;
			}
		}
		if(ignoreEigenvariant && !eigenvariantExists) {
			console.warn(`Cannot ignore eigenvariant of ${blockName} as it doesn't exist!`);
		}
		
		if(!("states" in block || "block_entity_data" in block)) {
			return -1;
		}
		let blockShape = this.#getBlockShape(blockName); // In copied block shapes, we want to look at the original block shape's texture variants, not the copied's. E.g. With candle_cake, we don't want the cake that is copied to look at the texture variants for cake (which includes bite_counter).
		let statesAndBlockEntityData = getBlockStatesAndEntityDataEntries(block);
		let blockShapeSpecificVariants = this.#blockShapeBlockStateTextureVariants.get(blockShape);
		if(blockShapeSpecificVariants?.["#exclusive_add"]) {
			let variant = 0;
			statesAndBlockEntityData.forEach(([blockStateName, blockStateValue]) => {
				if(blockStateName in blockShapeSpecificVariants) {
					let blockStateVariants = blockShapeSpecificVariants[blockStateName];
					const add = pickTextureVariantIndex(blockStateVariants, blockStateValue);
					if(add == undefined) return;
					variant += add;
				}
			});
			return variant;
		}
		let blockNameSpecificVariants = this.#blockNameBlockStateTextureVariants.get(blockName);
		if(blockNameSpecificVariants?.["#exclusive_add"]) {
			let variant = 0;
			statesAndBlockEntityData.forEach(([blockStateName, blockStateValue]) => {
				if(blockStateName in blockNameSpecificVariants) {
					let blockStateVariants = blockNameSpecificVariants[blockStateName];
					const add = pickTextureVariantIndex(blockStateVariants, blockStateValue);
					if(add == undefined) return;
					variant += add;
				}
			});
			return variant;
		}
		let variant = -1;
		statesAndBlockEntityData.forEach(([blockStateName, blockStateValue]) => {
			let blockStateVariants = blockNameSpecificVariants?.[blockStateName] ?? blockShapeSpecificVariants?.[blockStateName] ?? this.#globalBlockStateTextureVariants[blockStateName];
			if(blockStateVariants == undefined) {
				return;
			}
			
			let newVariant = pickTextureVariantIndex(blockStateVariants, blockStateValue);
			if(newVariant == undefined) {
				return;
			}
			if(variant != -1) {
				console.warn(`Multiple texture-variating block states for block ${block["name"]}; using ${blockStateName}`);
			}
			variant = newVariant;
		});
		return variant;
	}
	/**
	 * Checks if a block matches an `if` condition.
	 * @param {Block} block
	 * @param {string} conditional
	 * @returns {boolean}
	 */
	#checkBlockStateConditional(block, conditional) {
		let trimmedConditional = conditional.replaceAll(/\s/g, "");
		let booleanOperations = trimmedConditional.match(/&&|\|\|/g) ?? []; // can have multiple separated by ?? or ||
		let booleanValues = trimmedConditional.split(/&&|\|\|/).map(booleanExpression => {
			if(booleanExpression == "#copied_via_copy_block") {
				return block["#copied_via_copy_block"] === true;
			} else if(booleanExpression == "!#copied_via_copy_block") {
				return block["#copied_via_copy_block"] !== true;
			}
			let match = booleanExpression.match(/^((?:entity\.)?[\w:&-?]+)(==|>|<|>=|<=|!=)(-?\w+)$/); // Despite the Minecraft Wiki and Microsoft creator documentation saying there can be boolean block states, they're stored as bytes in NBT
			if(!match) {
				console.error(`Incorrectly formatted block state expression "${booleanExpression}" from conditional "${conditional}"\n(Match: ${JSON.stringify(match)})`);
				return true; // If we miss the error message more geometry will draw more attention to it :D
			}
			let [, blockStateTerm, comparisonOperator, expectedBlockState] = match;
			let blockStateOperation = blockStateTerm.match(/^(entity\.)?([\w:]+)(?:(\?\?|&)(-?\d+))?$/);
			if(!blockStateOperation) {
				console.error(`Incorrectly formed block state term: ${blockStateTerm}`);
				return true;
			}
			let [, usingBlockEntityData, blockStateName, blockStateOperator, blockStateOperandString] = blockStateOperation;
			let dataObjectName = usingBlockEntityData? "block_entity_data" : "states";
			let dataObject = block[dataObjectName];
			let actualBlockState;
			if(!dataObject) {
				if(blockStateOperator == "??") {
					actualBlockState = undefined;
				} else if(usingBlockEntityData) {
					return false;
				} else {
					actualBlockState = omittedStateDefault(expectedBlockState);
				}
			} else if(blockStateOperator != "??" && !(blockStateName in dataObject)) {
				if(blockStateName.startsWith("bLayers_") || blockStateName.startsWith("sdb_")) {
					return false;
				}
				if(usingBlockEntityData) {
					return false;
				}
				actualBlockState = omittedStateDefault(expectedBlockState);
			} else {
				actualBlockState = dataObject[blockStateName];
			}
			if(actualBlockState != null && typeof actualBlockState == "object" && "value" in actualBlockState) {
				actualBlockState = actualBlockState.value;
			}
			
			if(blockStateOperator) {
				let blockStateOperand = Number(blockStateOperandString);
				if(Number.isNaN(blockStateOperand)) {
					console.error(`${dataObjectName} operand ${blockStateOperand} is not a number!`);
					return true;
				}
				actualBlockState = function() {
					switch(blockStateOperator) {
						case "&": return actualBlockState & blockStateOperand;
						case "??": return actualBlockState ?? blockStateOperand;
					}
					console.error(`Unknown ${dataObjectName} operator ${blockStateOperator} in term ${blockStateTerm}!`);
					return actualBlockState;
				}();
			}
			
			switch(comparisonOperator) {
				case "==": return actualBlockState == expectedBlockState;
				case ">": return actualBlockState > expectedBlockState;
				case "<": return actualBlockState < expectedBlockState;
				case ">=": return actualBlockState >= expectedBlockState;
				case "<=": return actualBlockState <= expectedBlockState;
				case "!=": return actualBlockState != expectedBlockState;
			}
			console.error(`Unknown ${dataObjectName} comparison operator ${comparisonOperator} in expression ${booleanExpression}`);
			return true;
		});
		
		// do && before || to match JS operator precedence
		let andRes = [booleanValues[0]];
		booleanOperations.forEach((booleanOperation, i) => {
			if(booleanOperation == "&&") {
				andRes[andRes.length - 1] &&= booleanValues[i + 1];
			} else {
				andRes.push(booleanValues[i + 1])
			}
		});
		let orRes = andRes.some(x => x); // only || operations remain
		return orRes;
	}
	/**
	 * Substitutes values from a block into a particular expression.
	 * @param {Block} block
	 * @param {string} fullExpression
	 * @param {Data.Cube} cube
	 * @param {string} specialTexture
	 * @returns {string}
	 */
	#interpolateInBlockValues(block, fullExpression, cube, specialTexture) {
		let wholeStringValue;
		let substitutedExpression = fullExpression.replaceAll(/\${([^}]+)}/g, (bracketedExpression, expression) => {
			if(wholeStringValue != undefined) return;
			if(/^Array\.\w+\[[^\[]+\]$/.test(expression)) {
				let [, arrayName, arrayIndexVar] = expression.match(/^Array\.(\w+)\[([^\[]+)\]$/);
				let array = cube["arrays"]?.[arrayName];
				if(!array) {
					console.error(`Couldn't find array ${arrayName} in cube:`, cube);
					return "";
				}
				let arrayIndex;
				if(arrayIndexVar.startsWith("entity.")) {
					let blockEntityProperty = arrayIndexVar.slice(7);
					if(!("block_entity_data" in block) || !(blockEntityProperty in block["block_entity_data"])) {
						if(arrayName === "colors") {
							arrayIndex = bedColorIndex(block, array);
						} else {
							console.error(`Cannot find block entity property ${blockEntityProperty} in ${block["name"]}:`, block);
							return "";
						}
					} else {
						arrayIndex = block["block_entity_data"][blockEntityProperty];
					}
				} else {
					if(!("states" in block) || !(arrayIndexVar in block["states"])) {
						console.error(`Cannot find block state ${arrayIndexVar} in ${block["name"]}:`, block);
						return "";
					}
					arrayIndex = block["states"][arrayIndexVar];
				}
				if(arrayIndex != null && typeof arrayIndex == "object" && "value" in arrayIndex) {
					arrayIndex = arrayIndex.value;
				}
				if(!(arrayIndex in array)) {
					console.error(`Array index out of bounds: ${JSON.stringify(array)}[${arrayIndex}]`);
					return "";
				}
				return array[arrayIndex];
			}
			let match = expression.replaceAll(/\s/g, "").match(/^(#block_name|#block_states|#block_entity_data|#tex)((?:\.\w+|\[-?\d+\])*)(\[(-?\d+):(-?\d*)\]|\[:(-?\d+)\])?(?:\?\?(.+))?$/);
			if(!match) {
				console.error(`Wrongly formatted expression: ${bracketedExpression}`);
				return "";
			}
			let [, specialVar, propertyChain, ...slicingAndDefault] = match;
			let value = function() {
				switch(specialVar) {
					case "#block_name": return block["name"];
					case "#block_states": return block["states"];
					case "#block_entity_data": return block["block_entity_data"];
					case "#tex": {
						if(specialTexture == undefined) {
							console.error(`No #tex for block ${block["name"]}!`);
						}
						return specialTexture;
					}
				}
				console.error(`Unknown special variable: ${specialVar}`);
			}();
			propertyChain.match(/\.\w+|\[-?\d+\]/g)?.forEach(property => {
				let keys = property.match(/^\.(\w+)|\[(\d+)\]$/);
				value = value?.[keys[1] ?? keys[2]];
			});
			if(slicingAndDefault[0] != undefined) {
				value = value?.slice(slicingAndDefault[1], slicingAndDefault[3] ?? (slicingAndDefault[2] == ""? undefined : slicingAndDefault[2]));
			}
			if(value == undefined || value === "") {
				if(slicingAndDefault[4] != undefined) {
					let defaultValue = slicingAndDefault[4];
					if(/SET_WHOLE_STRING\([^)]+\)/.test(defaultValue)) {
						wholeStringValue = defaultValue.match(/\(([^)]+)\)/)[1];
						return;
					} else {
						value = defaultValue;
					}
				} else {
					console.error(`Nothing for ${specialVar}${propertyChain} in block:`, block);
					return "";
				}
			}
			// console.debug(`Changed ${bracketedExpression} to ${value}!`, block);
			return value;
		});
		return wholeStringValue ?? substitutedExpression;
	}
	
	/**
	 * Resolves UVs in template faces.
	 * @param {PolyMeshTemplateFace[]} faces
	 * @param {TextureAtlas} textureAtlas
	 * @returns {PolyMeshTemplateFaceWithUvs[]}
	 */
	static resolveTemplateFaceUvs(faces, textureAtlas) {
		return faces.map(face => {
			let imageUv = textureAtlas.uvs[face["textureRefI"]];
			// Corner-sort for UVs can reverse spatial winding (UV flips, 180° block
			// rotations). FrontSide preview then culls those faces — droppers facing
			// up/down and observers' flipped east face were the obvious cases.
			const origWinding = quadWinding(face["vertices"]);
			face["vertices"].sort((a, b) => a["corner"] - b["corner"]);
			if("crop" in imageUv) {
				applyFaceCropping(face, imageUv["crop"]);
			}
			let vertices = tuple([face["vertices"][0], face["vertices"][1], face["vertices"][3], face["vertices"][2]]); // go around in a square
			const windingFlipped = vec3.dot(quadWinding(vertices), origWinding) < 0;
			if(windingFlipped !== Boolean(face["flipWinding"])) {
				vertices = reverseQuad(vertices);
			}
			const uw = Math.abs(imageUv["uv_size"][0]);
			const vh = Math.abs(imageUv["uv_size"][1]);
			const inset = Math.min(0.5, 0.25 * Math.min(uw, vh, 16));
			const u0 = imageUv["uv"][0] + inset;
			const v0 = imageUv["uv"][1] + inset;
			const uSize = Math.max(uw - inset * 2, 0.01);
			const vSize = Math.max(vh - inset * 2, 0.01);
			return {
				"normal": face["normal"],
				"transparency": imageUv["transparency"],
				"doubleSide": !!face["doubleSide"],
				"vertices": vertices.map(vertex => ({
					"pos": vertex["pos"],
					"uv": tuple([
						+((u0 + uSize * (vertex["corner"] & 1)) / textureAtlas.textureWidth).toFixed(4),
						+(1 - (v0 + vSize * (vertex["corner"] >> 1)) / textureAtlas.textureHeight).toFixed(4)
					])
				}))
			};
		});
	}
}
/**
 * @typedef {Data.Cube & Record<"x" | "y" | "z" | "w" | "h" | "d", number>} CubeWithEasyProperties
 */
/** @import { Vec3, Block, bedrockLayersPreviewConfig, PolyMeshTemplateFaceWithUvs, PolyMeshTemplateFace, Rectangle, PolyMeshTemplateVertex, CubeUv } from "../../types.js" */
/** @import TextureAtlas from "./TextureAtlas.js" */
/** @import EntityGeoMaker from "./EntityGeoMaker.js" */
/** @import * as Data from "../../data/schemas" */
