import { hexColorToClampedTriplet, mulMat4, vec3 } from "../../utils.js";
import { GEO_SPACE_BLOCK, loadPackGeometryCubes } from "./geoToEngineCubes.js";

/** @import { PolyMeshTemplateFace } from "../../types.js" */

/**
 * Expands a shape's cubes: state filters, copies, copied blocks, and pack geometry.
 * Cube faces are built separately by {@link emitFacesFromCubes}.
 * @param {any} host BlockGeoMaker callbacks and fields used while expanding cubes
 * @param {object} block
 * @param {string} blockShape
 * @param {string} [specialTexture]
 */
export async function expandShapeCubes(host, block, blockShape, specialTexture) {
		let unfilteredCubes = structuredClone(host.geos[blockShape]);
		if(!unfilteredCubes) {
			host.unmappedBlockNames.add(block["name"]);
			console.warn(`[bLayers] no geo for shape ${blockShape} (${block["name"]}); unit cube`);
			unfilteredCubes = structuredClone(host.geos["block"]);
		}
		let filteredCubes = [];
		let allFaces = [];
		while(unfilteredCubes.length) {
			// For each unfiltered cube, we add it to filteredCubes if we've checked the "if" flag. If there are copies, we then add them back to unfilteredCubes.
			let cube = unfilteredCubes.shift();
			if("block_states" in cube) {
				let blockOverride = structuredClone(block);
				for(let blockStateName in cube["block_states"]) {
					if(typeof cube["block_states"][blockStateName] == "string") {
						cube["block_states"][blockStateName] = host.interpolate(block, cube["block_states"][blockStateName], cube, specialTexture);
					}
				}
				blockOverride["states"] = { ...blockOverride["states"], ...cube["block_states"] };
				cube["block_override"] = blockOverride;
				delete cube["block_states"];
			}
			if("if" in cube) {
				if(!host.conditional(cube["block_override"] ?? block, cube["if"])) {
					continue;
				}
				delete cube["if"];
			}
			if("terrain_texture" in cube) {
				cube["terrain_texture"] = host.interpolate(cube["block_override"] ?? block, cube["terrain_texture"], cube, specialTexture);
			}
			if("copy" in cube) {
				if(cube["copy"] == blockShape) { // prevent recursion (sometimes)
					console.error(`Cannot copy the same block shape: ${blockShape}`);
					continue;
				}
				let copiedCubes = structuredClone(host.geos[cube["copy"]]);
				if(!copiedCubes) {
					console.error(`Could not find geometry for block shape ${blockShape}; defaulting to "block"`);
					copiedCubes = structuredClone(host.geos["block"]);
				}
				let fieldsToCopy = Object.keys(cube).filter(field => !["copy", "rot", "pivot", "translate"].includes(field));
				copiedCubes.forEach(copiedCube => {
					if("translate" in cube) {
						copiedCube["translate"] = vec3.add(copiedCube["translate"] ?? [0, 0, 0], cube["translate"]);
					}
					fieldsToCopy.forEach(field => { // copy all fields from this cube onto the new ones
						if(field == "flip_textures_horizontally" || field == "flip_textures_vertically") { // these ones are arrays but are supposed to represent sets, so we take the XOR/symmetric difference (ik there's a native method but it's very new)
							let facesInCopiedCube = new Set(copiedCube[field] ?? []);
							cube[field].forEach(face => {
								if(facesInCopiedCube.has(face)) {
									facesInCopiedCube.delete(face);
								} else {
									facesInCopiedCube.add(face);
								}
							});
							copiedCube[field] = Array.from(facesInCopiedCube);
						} else if(typeof copiedCube[field] == "object") {
							copiedCube[field] = { ...cube[field], ...copiedCube[field] }; // fields on the copied cubes still take priority over the "parent" cube (the one that's copying it)
						} else {
							copiedCube[field] ??= structuredClone(cube[field]);
						}
					});
					if("rot" in cube) {
						if("rot" in copiedCube) {
							// maths for combining both rotations is hard so we handle it differently and create a list of extra rotations.
							copiedCube["extra_rots"] ??= [];
							copiedCube["extra_rots"].unshift({
								"rot": cube["rot"],
								"pivot": cube["pivot"] ?? [8, 8, 8]
							});
						} else {
							copiedCube["rot"] = cube["rot"];
							copiedCube["pivot"] = cube["pivot"] ?? copiedCube["pivot"];
						}
					}
				});
				unfilteredCubes.push(...copiedCubes);
			} else if("copy_block" in cube) {
				let match = cube["copy_block"].match(/^entity\.(.+)$/);
				if(!match) {
					console.error(`Incorrect formatted copy_block property: ${match}`);
					continue;
				}
				let blockEntityProperty = match[1];
				let blockToCopy = block["block_entity_data"]?.[blockEntityProperty];
				if(!blockToCopy) {
					console.error(`Cannot find block entity property ${blockEntityProperty} on block ${block["name"]}:`, block);
					continue;
				}
				blockToCopy["name"] = blockToCopy["name"].replace(/^minecraft:/, "");
				if(host.ignoredBlocks.includes(blockToCopy["name"])) {
					continue;
				}
				blockToCopy["#copied_via_copy_block"] = true; // I will learn rust if mojang adds this to the structure NBT
				let newBlockShape = host.shapeOf(blockToCopy["name"]);
				let { faces: newFaces } = await host.facesFor(blockToCopy, newBlockShape);
				if("translate" in cube) {
					newFaces.forEach(face => {
						for(let i = 0; i < 4; i++) {
							face["vertices"][i]["pos"] = vec3.add(face["vertices"][i]["pos"], cube["translate"]);
						}
					});
				}
				allFaces.push(...newFaces);
			} else if("copy_geometry" in cube) {
				unfilteredCubes.push(...await loadPackGeometryCubes(
					host.entityGeoMaker.resourcePackStack,
					cube["copy_geometry"],
					GEO_SPACE_BLOCK
				));
			} else if("copy_entity_model" in cube) {
				unfilteredCubes.push(...await host.entityGeoMaker.entityModelToCubes(cube["copy_entity_model"]));
			} else {
				filteredCubes.push(cube);
			}
		}
	return { filteredCubes, allFaces };
}

/**
 * Turns expanded cubes into poly-mesh faces. An empty cube list is the caller's job.
 * @param {any} host BlockGeoMaker callbacks and fields used while emitting faces
 * @param {object} block
 * @param {string} blockShape
 * @param {string | undefined} specialTexture
 * @param {object[]} filteredCubes
 * @param {object[]} allFaces
 */
export function emitFacesFromCubes(host, block, blockShape, specialTexture, filteredCubes, allFaces) {
		let filteredCubesWithEasyProperties = filteredCubes.map(cube => host.addEasy(cube));
		let cubes = host.optimize(filteredCubesWithEasyProperties);
		cubes.sort((a, b) => a.w * a.h * a.d - b.w * b.h * b.d); // make larger cubes be rendered later. this helps for blocks like slime and honey where the inner cube has to be rendered before the outer cube
		
		let blockName = block["name"];
		let variant = host.textureVariant(block);
		let variantWithoutEigenvariant;
		
		let allCubesAreFlat = true;
		cubes.forEach(cube => {
			let uv = host.calculateUv(cube);
			
			// 0-size in an axis: keep one face and tag it doubleSide. The pack
			// generator stays single-faced (DoubleSide materials). Preview compiles
			// those faces into a separate card geo so volumetric faces stay FrontSide.
			if(cube.w == 0) {
				["east", "down", "up", "north", "south"].forEach(faceName => delete uv[faceName]);
			}
			if(cube.h == 0) {
				["west", "east", "down", "north", "south"].forEach(faceName => delete uv[faceName]);
			}
			if(cube.d == 0) {
				["west", "east", "down", "up", "south"].forEach(faceName => delete uv[faceName]);
			}
			
			let cubeVariant;
			if("variant" in cube) {
				cubeVariant = cube["variant"];
			} else if(cube["ignore_eigenvariant"]) {
				if("block_override" in cube) {
					cubeVariant = host.textureVariant(cube["block_override"], true);
				} else {
					if(variantWithoutEigenvariant == undefined) {
						variantWithoutEigenvariant = host.textureVariant(block, true);
					}
					cubeVariant = variantWithoutEigenvariant;
				}
			} else if("block_override" in cube) {
				cubeVariant = host.textureVariant(cube["block_override"]);
			} else {
				cubeVariant = variant; // default variant for this block
			}
			
			/** @type {(PolyMeshTemplateFace & { fullbright: boolean })[]} */
			let faces = [];
			let textureSize = cube["texture_size"] ?? [16, 16];
			const paperThin = cube.w == 0 || cube.h == 0 || cube.d == 0;
			// add generic keys to all faces, and convert texture references into indices
			Object.entries(uv).forEach(([faceName, face]) => {
				let isSideFace = ["west", "east", "north", "south"].includes(faceName);
				let textureFace = cube["textures"]?.[faceName] ?? (isSideFace? cube["textures"]?.["side"] : undefined) ?? cube["textures"]?.["*"] ?? faceName;
				if(textureFace == "none") {
					return;
				}
				textureFace = host.interpolate(cube["block_override"] ?? block, textureFace, cube, specialTexture);
				let textureRef = {
					"uv": face["uv"].map((x, i) => x / textureSize[i]),
					"uv_size": face["uv_size"].map((x, i) => x / textureSize[i]),
					"block_name": blockName,
					"texture_face": textureFace,
					"variant": cubeVariant
				};
				if(textureFace == "#tex") {
					if(specialTexture) {
						textureRef["texture_path_override"] = specialTexture;
					} else {
						console.error(`No #tex for block ${blockName} and blockshape ${blockShape}!`);
					}
				} else if(/^textures\/.+[^/]$/.test(textureFace)) { // file path
					textureRef["texture_path_override"] = textureFace;
				} else {
					let terrainTextureOverride = cube["terrain_texture"];
					if(terrainTextureOverride) {
						delete textureRef["block_name"];
						delete textureRef["texture_face"];
						textureRef["terrain_texture_override"] = terrainTextureOverride;
					}
				}
				if("texture_path_override" in textureRef) {
					delete textureRef["block_name"];
					delete textureRef["texture_face"];
					delete textureRef["variant"];
				}
				if("tint" in cube) {
					let tint = cube["tint"];
					tint = host.interpolate(cube["block_override"] ?? block, tint, cube, specialTexture);
					if(tint[0] == "#") {
						textureRef["tint"] = hexColorToClampedTriplet(tint);
					} else {
						// this is from cauldrons; colour is a 32-bit ARGB colour
						let colorCode = 2 ** 32 + Number(tint);
						textureRef["tint"] = [colorCode >> 16 & 0xFF, colorCode >> 8 & 0xFF, colorCode & 0xFF].map(x => x / 255);
					}
				}
				
				host.textureRefs.add(textureRef);
				let vertices = host.vertices(cube, faceName);
				let uvRot = cube["uv_rot"]?.[faceName] ?? (isSideFace? cube["uv_rot"]?.["side"] : undefined) ?? cube["uv_rot"]?.["*"];
				if(uvRot) {
					while(uvRot >= 90) {
						[vertices[0]["corner"], vertices[1]["corner"], vertices[3]["corner"], vertices[2]["corner"]] = [vertices[2]["corner"], vertices[0]["corner"], vertices[1]["corner"], vertices[3]["corner"]];
						uvRot -= 90;
					}
					while(uvRot <= -90) {
						[vertices[2]["corner"], vertices[0]["corner"], vertices[1]["corner"], vertices[3]["corner"]] = [vertices[0]["corner"], vertices[1]["corner"], vertices[3]["corner"], vertices[2]["corner"]];
						uvRot += 90;
					}
				}
				let flipTextureHorizontally = cube["flip_textures_horizontally"]?.includes(faceName) ^ (isSideFace && cube["flip_textures_horizontally"]?.includes("side")) ^ cube["flip_textures_horizontally"]?.includes("*");
				let flipTextureVertically = cube["flip_textures_vertically"]?.includes(faceName) ^ (isSideFace && cube["flip_textures_vertically"]?.includes("side")) ^ cube["flip_textures_vertically"]?.includes("*");
				if("box_uv" in cube) { // box uv does some flipping automatically
					flipTextureHorizontally ^= +(faceName != "north" && faceName != "south");
					flipTextureVertically ^= +(faceName == "up");
				}
				if(+(faceName == "down" || faceName == "up") ^ flipTextureHorizontally) { // in MC the down/up faces are rotated 180 degrees compared to how they are in geometry; this can be faked by flipping both axes.
					[vertices[0]["corner"], vertices[1]["corner"]] = [vertices[1]["corner"], vertices[0]["corner"]];
					[vertices[2]["corner"], vertices[3]["corner"]] = [vertices[3]["corner"], vertices[2]["corner"]];
				}
				if(+(faceName == "down" || faceName == "up") ^ flipTextureVertically) {
					[vertices[0]["corner"], vertices[2]["corner"]] = [vertices[2]["corner"], vertices[0]["corner"]];
					[vertices[1]["corner"], vertices[3]["corner"]] = [vertices[3]["corner"], vertices[1]["corner"]];
				}
				for(let i = 0; i < 4; i++) {
					let vertex = vertices[i];
					if("rot" in cube) {
						vertex["pos"] = host.rotate(vertex["pos"], cube["rot"], cube["pivot"] ?? [8, 8, 8]);
					}
					cube["extra_rots"]?.slice()?.reverse()?.forEach(extraRot => {
						vertex["pos"] = host.rotate(vertex["pos"], extraRot["rot"], extraRot["pivot"]);
					});
					if("translate" in cube) {
						vertex["pos"] = vec3.add(vertex["pos"], cube["translate"]);
					}
					if("transform" in cube) {
						let transformed = mulMat4(cube["transform"], vertex["pos"]);
						let newPos = vec3.mul([transformed[0], transformed[1], transformed[2]], 1 / transformed[3]);
						vertex["pos"] = newPos;
					}
				}
				faces.push({
					"normal": host.surfaceNormal(vertices),
					"textureRefI": host.textureRefs.indexOf(textureRef),
					"vertices": vertices,
					"fullbright": Boolean(cube["fullbright"]),
					"doubleSide": paperThin
				});
			});
			if(faces.length == 1 && !("culled_faces" in cube)) {
				if(faces[0]["normal"][1] < 0) {
					faces[0]["normal"] = vec3.mul(faces[0]["normal"], -1);
					faces[0]["flipWinding"] = true;
				}
			} else {
				allCubesAreFlat = false;
			}
			
			allFaces.push(...faces);
		});
		if(allCubesAreFlat) {
			allFaces.forEach(face => {
				face["fullbright"] = true; // blocks with only flat textures always appear at maximum brightness. source: me
			});
			// console.debug(`Making ${blockName} full bright!`);
		}
		let centerOfMass = host.centerOfMass(cubes);
		return {
			faces: allFaces,
			centerOfMass
		};
}
