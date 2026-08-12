/**
 * Block mesh geometry helpers for PreviewRenderer:
 * poly → BufferGeometry, translucency, instancing, structure scan.
 */

import { max, min, round } from "../../utils/math.js";
import { tuple } from "../../utils/meta.js";
import { JSONSet } from "../../utils/containers.js";
import * as vec2 from "../../utils/vec2.js";

/**
 * Scan structure indices once: collect per-palette positions and optional point lights.
 *
 * @param {object} args
 * @param {[number,number,number]} args.structureSize
 * @param {[Int32Array|number[], Int32Array|number[]]} args.blockIndices
 * @param {any[]} args.polyMeshTemplatePalette
 * @param {any[]} args.blockPalette
 * @param {Record<string, number|[number,number]>} [args.pointLightDefs]
 * @param {number} [args.defaultLightIntensity=75]
 * @param {boolean} [args.collectLights=false] skip when maxPointLights is 0
 * @param {(stringified: string, block: any) => boolean} [args.matchBlock]
 * @returns {{
 *   blockPositions: [number,number,number][][],
 *   pointLights: { pos: number[], col: number, intensity: number }[]
 * }}
 */
export function scanStructureBlocks({
	structureSize,
	blockIndices,
	polyMeshTemplatePalette,
	blockPalette,
	pointLightDefs = {},
	defaultLightIntensity = 75,
	collectLights = false,
	matchBlock = defaultMatchBlock
}) {
	/** @type {[number,number,number][][]} */
	const blockPositions = [];
	/** @type {{ pos: number[], col: number, intensity: number }[]} */
	const pointLights = [];

	/** @type {(number|[number,number]|undefined)[]} */
	let palettePointLights = [];
	if (collectLights) {
		palettePointLights = blockPalette.map(
			block =>
				pointLightDefs[block["name"]]
				?? Object.entries(pointLightDefs).find(([key]) => matchBlock(key, block))?.[1]
		);
	}

	const [sx, sy, sz] = structureSize;
	for (let x = 0; x < sx; x++) {
		for (let y = 0; y < sy; y++) {
			for (let z = 0; z < sz; z++) {
				const blockI = (x * sy + y) * sz + z;
				for (let layerI = 0; layerI < 2; layerI++) {
					const paletteI = blockIndices[layerI][blockI];
					if (!(paletteI in polyMeshTemplatePalette)) continue;

					blockPositions[paletteI] ??= [];
					blockPositions[paletteI].push([x, y, z]);

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

	return { blockPositions, pointLights };
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
	 * @param {number} polyMeshTemplatePaletteI
	 * @returns {import("three").BufferGeometry}
	 */
	polyMeshTemplateToBufferGeo(polyMeshTemplatePaletteI) {
		const THREE = this.ctx.THREE;
		const maker = this.ctx.polyMeshMaker;
		maker.add(polyMeshTemplatePaletteI);
		const polyMesh = maker.export();
		maker.clear();
		let i = 0;
		const positions = [], normals = [], uvs = [], indices = [];
		polyMesh["polys"].forEach(face => {
			face.forEach(([posIndex, normalIndex, uvIndex]) => {
				const pos = polyMesh.positions[posIndex];
				positions.push(pos[0], pos[1], 16 - pos[2]);
				normals.push(...polyMesh.normals[normalIndex]);
				uvs.push(polyMesh.uvs[uvIndex][0], 1 - polyMesh.uvs[uvIndex][1]);
			});
			indices.push(i + 2, i + 1, i, i + 2, i, i + 3);
			i += face.length;
		});
		const geo = new THREE.BufferGeometry();
		geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
		geo.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(normals), 3));
		geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uvs), 2));
		geo.setIndex(indices);
		geo.computeVertexNormals();
		return geo;
	}

	/**
	 * Pixel-scan atlas for translucent faces in a template.
	 * @param {any[]} polyMeshTemplate
	 * @returns {boolean}
	 */
	isPolyMeshTemplateTranslucent(polyMeshTemplate) {
		const imageBlobData = this.ctx.imageBlobData;
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
		return uvs.some(({ uv, uvSize }) => {
			for (let x = uv[0]; x < uv[0] + uvSize[0]; x++) {
				for (let y = uv[1]; y < uv[1] + uvSize[1]; y++) {
					const i = (y * imageBlobData.width + x) * 4;
					const alpha = imageBlobData.data[i + 3];
					if (alpha > 0 && alpha < 255) return true;
				}
			}
			return false;
		});
	}

	/**
	 * @param {import("three").BufferGeometry} bufferGeo
	 * @param {[number,number,number][]} positions
	 * @param {import("three").Material} material
	 * @returns {import("three").InstancedMesh}
	 */
	instanceBufferGeoAtPositions(bufferGeo, positions, material) {
		const THREE = this.ctx.THREE;
		const instancedMesh = new THREE.InstancedMesh(bufferGeo, material, positions.length);
		if (!this.#dummy) this.#dummy = new THREE.Object3D();
		const dummy = this.#dummy;
		for (let i = 0; i < positions.length; i++) {
			dummy.position.set(positions[i][0], positions[i][1], positions[i][2]);
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
