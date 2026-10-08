/**
 * Block mesh geometry helpers for PreviewRenderer:
 * face templates → BufferGeometry, translucency, instancing, structure scan.
 */

import { max, min, round } from "../../utils/math.js";
import { tuple } from "../../utils/meta.js";
import { JSONSet } from "../../utils/containers.js";
import * as vec2 from "../../utils/vec2.js";
import { facesToBufferGeometry } from "../polyMeshBufferGeo.js";
import { prefixOffsets } from "../cellCsr.js";

/**
 * Scan structure indices once: collect per-palette positions and optional point lights.
 * Positions are palette CSRs (`off` + `xyz`), filled y then x then z.
 * Equal-y cells in one palette are one contiguous run.
 *
 * @param {object} args
 * @param {[number,number,number]} args.structureSize
 * @param {[Int32Array|number[], Int32Array|number[]]} args.blockIndices
 * @param {any[]} args.blockFaceTemplates
 * @param {any[]} args.blockPalette
 * @param {Record<string, number|[number,number]>} [args.pointLightDefs]
 * @param {number} [args.defaultLightIntensity=75]
 * @param {boolean} [args.collectLights=false] skip when maxPointLights is 0
 * @param {(stringified: string, block: any) => boolean} [args.matchBlock]
 * @returns {{
 *   blockPositions: { off: Int32Array, xyz: Int32Array },
 *   waterlogPositions: { off: Int32Array, xyz: Int32Array },
 *   pointLights: { pos: number[], col: number, intensity: number }[]
 * }}
 */
export function scanStructureBlocks({
	structureSize,
	blockIndices,
	blockFaceTemplates,
	blockPalette,
	pointLightDefs = {},
	defaultLightIntensity = 75,
	collectLights = false,
	matchBlock = defaultMatchBlock
}) {
	/** @type {{ pos: number[], col: number, intensity: number }[]} */
	const pointLights = [];

	/** @type {(number|[number,number]|undefined)[]} */
	let palettePointLights = [];
	if (collectLights) {
		palettePointLights = blockPalette.map(block => {
			const name = block?.["name"];
			const direct = typeof name === "string" && Object.hasOwn(pointLightDefs, name)
				? pointLightDefs[name]
				: undefined;
			return direct ?? Object.entries(pointLightDefs).find(([key]) => matchBlock(key, block))?.[1];
		});
	}

	const [sx, sy, sz] = structureSize;
	const slotCount = blockFaceTemplates.length;
	const blockCounts = new Int32Array(slotCount);
	const waterCounts = new Int32Array(slotCount);
	const accept = (paletteI) =>
		paletteI >= 0 && paletteI < slotCount && (paletteI in blockFaceTemplates);

	for (let y = 0; y < sy; y++) {
		for (let x = 0; x < sx; x++) {
			for (let z = 0; z < sz; z++) {
				const blockI = (x * sy + y) * sz + z;
				for (let layerI = 0; layerI < 2; layerI++) {
					const layer = blockIndices[layerI];
					if (!layer) continue;
					const paletteI = layer[blockI];
					if (!accept(paletteI)) continue;
					const water = layerI === 1 && isWaterlogLiquid(blockPalette[paletteI]);
					(water ? waterCounts : blockCounts)[paletteI]++;
				}
			}
		}
	}

	const blocks = prefixOffsets(blockCounts);
	const waters = prefixOffsets(waterCounts);
	const blockXyz = new Int32Array(blocks.total * 3);
	const waterXyz = new Int32Array(waters.total * 3);

	for (let y = 0; y < sy; y++) {
		for (let x = 0; x < sx; x++) {
			for (let z = 0; z < sz; z++) {
				const blockI = (x * sy + y) * sz + z;
				for (let layerI = 0; layerI < 2; layerI++) {
					const layer = blockIndices[layerI];
					if (!layer) continue;
					const paletteI = layer[blockI];
					if (!accept(paletteI)) continue;
					const water = layerI === 1 && isWaterlogLiquid(blockPalette[paletteI]);
					const cursor = water ? waters.cursor : blocks.cursor;
					const dest = water ? waterXyz : blockXyz;
					const o = cursor[paletteI]++ * 3;
					dest[o] = x;
					dest[o + 1] = y;
					dest[o + 2] = z;

					if (!collectLights) continue;
					const lightInfo = palettePointLights[paletteI];
					if (!lightInfo) continue;
					const [col, intensity] = Array.isArray(lightInfo)
						? lightInfo
						: [lightInfo, defaultLightIntensity];
					pointLights.push({
						pos: [-16 * x - 8, 16 * y + 8, -16 * z - 8],
						col,
						intensity
					});
				}
			}
		}
	}

	return {
		blockPositions: { off: blocks.off, xyz: blockXyz },
		waterlogPositions: { off: waters.off, xyz: waterXyz },
		pointLights
	};
}

/**
 * Layer-1 water and lava share the cell with stairs and slabs. Their outer
 * faces sit on the same planes, so pull shell vertices inward. Interior
 * heights (a source top at 14) stay put.
 */
export const WATERLOG_FACE_INSET = 0.08;

/**
 * @param {any[]|null|undefined} faces
 * @param {number} [inset]
 * @returns {any[]|null|undefined}
 */
export function insetCellShellFaces(faces, inset = WATERLOG_FACE_INSET) {
	if (!faces?.length || !(inset > 0)) return faces;
	return faces.map(face => {
		if (!face?.vertices) return face;
		return {
			...face,
			vertices: face.vertices.map(vertex => {
				const src = vertex?.pos;
				if (!src || src.length < 3) return vertex;
				const pos = [Number(src[0]) || 0, Number(src[1]) || 0, Number(src[2]) || 0];
				for (let i = 0; i < 3; i++) {
					const c = pos[i];
					if (c <= 0.001) pos[i] = inset;
					else if (c >= 16 - 0.001) pos[i] = 16 - inset;
				}
				return { ...vertex, pos };
			})
		};
	});
}

/**
 * @param {any} block
 * @returns {boolean}
 */
function isWaterlogLiquid(block) {
	if (!block) return false;
	if (block.bLayers_block_shape === "liquid") return true;
	const name = String(block.name ?? "").replace(/^minecraft:/, "");
	return name === "water" || name === "flowing_water" || name === "lava" || name === "flowing_lava";
}

/**
 * @param {string} stringifiedBlock
 * @param {any} block
 */
export function defaultMatchBlock(stringifiedBlock, block) {
	const blockName = stringifiedBlock.includes("[")
		? stringifiedBlock.slice(0, stringifiedBlock.indexOf("["))
		: stringifiedBlock;
	if (blockName != block["name"]) return false;
	const allBlockStates = stringifiedBlock.match(/\[(.+)\]/)?.[1];
	if (allBlockStates) {
		const blockStates = allBlockStates.split(",").map(s => s.split("="));
		if (!blockStates.every(([name, value]) => block["states"]?.[name] == value)) {
			return false;
		}
	}
	return true;
}

/**
 * Early-exit atlas alpha walk. `pred(alpha)` true stops and returns true.
 * @param {ImageData|null|undefined} imageBlobData
 * @param {any[]|null|undefined} polyMeshTemplate
 * @param {(alpha: number) => boolean} pred
 */
function atlasAlphaMatches(imageBlobData, polyMeshTemplate, pred) {
	if (!imageBlobData || !polyMeshTemplate?.length) return false;
	const allUvs = polyMeshTemplate.map(face => {
		const uvCoords = face["vertices"].map(v => v["uv"]);
		const xs = uvCoords.map(([x]) => round(x * imageBlobData.width));
		const ys = uvCoords.map(([, y]) => round((1 - y) * imageBlobData.height));
		const minUvCoords = tuple([min(...xs), min(...ys)]);
		const maxUvCoords = tuple([max(...xs), max(...ys)]);
		const unscaledUvSize = vec2.sub(maxUvCoords, minUvCoords);
		return {
			uv: [minUvCoords[0], minUvCoords[1]],
			uvSize: [unscaledUvSize[0], unscaledUvSize[1]]
		};
	});
	const uvs = Array.from(new JSONSet(allUvs));
	const w = imageBlobData.width;
	const h = imageBlobData.height;
	const data = imageBlobData.data;
	for (const { uv, uvSize } of uvs) {
		for (let x = uv[0]; x < uv[0] + uvSize[0]; x++) {
			for (let y = uv[1]; y < uv[1] + uvSize[1]; y++) {
				if (x < 0 || y < 0 || x >= w || y >= h) continue;
				const alpha = data[(y * w + x) * 4 + 3];
				if (pred(alpha)) return true;
			}
		}
	}
	return false;
}

/**
 * Split 0-thickness card faces from volumetric faces. Preview instances each
 * group with its own material (FrontSide volume, DoubleSide cards).
 * @param {any[]|null|undefined} faces
 * @returns {{ volume: any[], cards: any[] }}
 */
export function partitionTemplateFaces(faces) {
	const volume = [];
	const cards = [];
	for (const face of faces || []) {
		if (face?.doubleSide) cards.push(face);
		else volume.push(face);
	}
	return { volume, cards };
}

export default class BlockGeoSystem {
	/**
	 * @param {import("./PreviewContext.js").default} ctx
	 */
	constructor(ctx) {
		this.ctx = ctx;
		/** Reused dummy for instancing matrices */
		this.#dummy = null;
	}

	/** @type {import("three").Object3D|null} */
	#dummy;

	/**
	 * Volume geo (FrontSide) and card geo (0-thickness, DoubleSide) for one palette entry.
	 * @param {number} faceTemplateI
	 * @returns {{ volume: import("three").BufferGeometry|null, cards: import("three").BufferGeometry|null }}
	 */
	faceTemplateToBufferGeos(faceTemplateI) {
		const { volume, cards } = partitionTemplateFaces(
			this.ctx.blockFaceTemplates?.[faceTemplateI]
		);
		return {
			volume: facesToBufferGeometry(this.ctx.THREE, volume),
			cards: facesToBufferGeometry(this.ctx.THREE, cards)
		};
	}

	/**
	 * Pixel-scan atlas for translucent faces in a template (blend: 0 < a < 255).
	 * @param {any[]} faceTemplate
	 * @returns {boolean}
	 */
	isFaceTemplateTranslucent(faceTemplate) {
		return atlasAlphaMatches(this.ctx.imageBlobData, faceTemplate, a => a > 0 && a < 255);
	}

	/**
	 * True only if the template has atlas coverage and every sampled texel is a === 255.
	 * Cutout (a === 0) and blend fail. Empty templates do not occlude.
	 * @param {any[]} faceTemplate
	 * @returns {boolean}
	 */
	isFaceTemplateFullyOpaque(faceTemplate) {
		const image = this.ctx.imageBlobData;
		if (!image || !faceTemplate?.length) return false;
		let saw = false;
		const leak = atlasAlphaMatches(image, faceTemplate, a => {
			saw = true;
			return a < 255;
		});
		return saw && !leak;
	}

	/**
	 * Write instance matrices from a CSR triple range. Structure (x,y,z) becomes
	 * Three position (-16x-16, 16y, -16z-16).
	 * @param {import("three").BufferGeometry} bufferGeo
	 * @param {Int32Array} xyz
	 * @param {number} tripleStart
	 * @param {number} tripleEnd
	 * @param {import("three").Material} material
	 * @param {{ mirrorX?: boolean, mirrorZ?: boolean }} [opts]
	 * @returns {import("three").InstancedMesh}
	 */
	instanceBufferGeoAtXyz(bufferGeo, xyz, tripleStart, tripleEnd, material, opts = {}) {
		const THREE = this.ctx.THREE;
		const count = Math.max(0, tripleEnd - tripleStart);
		const instancedMesh = new THREE.InstancedMesh(bufferGeo, material, count);
		if (!this.#dummy) this.#dummy = new THREE.Object3D();
		const dummy = this.#dummy;
		const mirrorX = !!opts.mirrorX;
		const mirrorZ = !!opts.mirrorZ;
		for (let i = 0; i < count; i++) {
			const o = (tripleStart + i) * 3;
			const px = -16 * xyz[o] - 16;
			const py = 16 * xyz[o + 1];
			const pz = -16 * xyz[o + 2] - 16;
			dummy.position.set(
				mirrorX ? px + 16 : px,
				py,
				mirrorZ ? pz + 16 : pz
			);
			dummy.scale.set(mirrorX ? -1 : 1, 1, mirrorZ ? -1 : 1);
			dummy.updateMatrix();
			instancedMesh.setMatrixAt(i, dummy.matrix);
		}
		return instancedMesh;
	}

	/**
	 * Expand InstancedMesh instances for GLB export.
	 * @param {import("three").Scene} sourceScene
	 * @returns {import("three").Scene}
	 */
	expandInstancedMeshes(sourceScene) {
		const THREE = this.ctx.THREE;
		const scene = new THREE.Scene();
		sourceScene.traverse(obj => {
			if (obj.userData.includeInGlbExport) {
				scene.add(obj.clone());
				return;
			}
			if (!(obj instanceof THREE.InstancedMesh)) return;
			const dummy = new THREE.Object3D();
			for (let i = 0; i < obj.count; i++) {
				const mesh = new THREE.Mesh(obj.geometry, obj.material);
				obj.getMatrixAt(i, dummy.matrix);
				dummy.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
				scene.add(mesh);
			}
		});
		return scene;
	}

	/**
	 * @param {ImageData} imageBlobData
	 * @returns {import("three").DataTexture}
	 */
	createAtlasTexture(imageBlobData) {
		const THREE = this.ctx.THREE;
		const texture = new THREE.DataTexture(
			imageBlobData.data,
			imageBlobData.width,
			imageBlobData.height,
			THREE.RGBAFormat
		);
		texture.colorSpace = THREE.SRGBColorSpace;
		texture.minFilter = THREE.NearestFilter;
		texture.magFilter = THREE.NearestFilter;
		texture.generateMipmaps = false;
		texture.needsUpdate = true;
		return texture;
	}
}
