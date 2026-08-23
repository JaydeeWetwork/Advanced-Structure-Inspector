/**
 * Structure preview pipeline — PreviewRenderer only, never makePack / diagrams / HoloPrint.
 */

import * as NBT from "nbtify-readonly-typeless";

import BlockGeoMaker from "../BlockGeoMaker.js";
import TextureAtlas from "../TextureAtlas.js";
// Single PreviewRenderer (systems-based) — used by ASI and HoloPrint pack UI
import PreviewRenderer from "../PreviewRenderer.js?v=judo26";
import ResourcePackStack from "../ResourcePackStack.js";
import EntityGeoMaker from "../EntityGeoMaker.js";
import LilGui from "../components/LilGui.js";
import { awaitAllEntries, desparseArray, jsonc, UserError } from "../utils.js";
import { throwIfAborted, isAbortError } from "./abortUtil.js";
import {
	IGNORED_BLOCKS,
	mergeMultiplePalettesAndIndices,
	normalizeVec3,
	tweakBlockPalette
} from "./palette.js";
import { getCachedDataFile, getCachedFileBuild } from "./previewCache.js";
import { extractRenderableEntities } from "./entityExtract.js";
import { buildInspectIndex } from "./inspectStructure.js";

function ensureLilGuiDefined() {
	if (!customElements.get("lil-gui")) {
		customElements.define("lil-gui", LilGui);
	}
}

function defaultPreviewConfig(partial = {}) {
	return {
		IGNORED_BLOCKS: [...IGNORED_BLOCKS, ...(partial.IGNORED_BLOCKS ?? [])],
		SCALE: partial.SCALE ?? 0.95,
		OPACITY: partial.OPACITY ?? 0.9,
		MULTIPLE_OPACITIES: partial.MULTIPLE_OPACITIES ?? true,
		// No blue hologram trim on blocks — cleaner structure viewer look
		TEXTURE_OUTLINE_WIDTH: partial.TEXTURE_OUTLINE_WIDTH ?? 0,
		TEXTURE_OUTLINE_COLOR: partial.TEXTURE_OUTLINE_COLOR ?? "#00F",
		TEXTURE_OUTLINE_OPACITY: partial.TEXTURE_OUTLINE_OPACITY ?? 0.65,
		SHOW_PREVIEW_SKYBOX: partial.SHOW_PREVIEW_SKYBOX ?? false,
		SHOW_PREVIEW_WIDGETS: partial.SHOW_PREVIEW_WIDGETS ?? true,
		SHOW_ENTITIES: partial.SHOW_ENTITIES ?? true,
		PACK_NAME: partial.PACK_NAME
	};
}

/**
 * @param {File} structureFile
 * @param {AbortSignal|null|undefined} signal
 */
async function readStructureNBT(structureFile, signal) {
	throwIfAborted(signal);
	const arrayBuffer = await structureFile.arrayBuffer();
	throwIfAborted(signal);
	if (!structureFile.size || !arrayBuffer.byteLength) {
		throw new UserError(`"${structureFile.name}" is empty`);
	}
	let data;
	try {
		data = (await NBT.read(arrayBuffer, { endian: "little", strict: false })).data;
	} catch {
		data = (await NBT.read(arrayBuffer)).data;
	}
	if (data?.format_version != 1 || !data?.structure || !data?.size) {
		throw new UserError(`"${structureFile.name}" is not a valid .mcstructure`);
	}
	return data;
}

function loadDataFiles(fileNames, signal) {
	const res = Object.fromEntries(
		fileNames.map(fileName => [
			fileName,
			getCachedDataFile(fileName, () =>
				fetch(`data/${fileName}.json`).then(r => {
					if (!r.ok) throw new Error(`Failed to load data/${fileName}.json (${r.status})`);
					return jsonc(r);
				})
			).then(v => {
				throwIfAborted(signal);
				return v;
			})
		])
	);
	res.all = awaitAllEntries(res);
	return res;
}

/**
 * Build geometry inputs without attaching a renderer (cached per File).
 * @param {File} structureFile
 * @param {Record<string, any>} config
 * @param {ResourcePackStack} resourcePackStack
 * @param {AbortSignal|null|undefined} signal
 */
/**
 * @param {File} structureFile
 * @param {Record<string, any>} config
 * @param {ResourcePackStack} resourcePackStack
 * @param {AbortSignal|null|undefined} signal
 * @param {(msg: string) => void} [onProgress]
 */
async function buildPreviewAssets(structureFile, config, resourcePackStack, signal, onProgress) {
	const progress = msg => {
		try {
			onProgress?.(msg);
		} catch {
			/* ignore */
		}
		console.info(`[sdb] ${msg}`);
	};

	throwIfAborted(signal);
	progress("Parsing NBT…");
	const nbt = await readStructureNBT(structureFile, signal);
	const structureSize = normalizeVec3(nbt["size"]);
	const structure = nbt["structure"];
	const volume = structureSize[0] * structureSize[1] * structureSize[2];
	progress(
		`Size ${structureSize.join("×")} (${volume.toLocaleString()} cells) — loading pack data…`
	);

	const dataPromise = loadDataFiles(
		[
			"textureAtlasMappings",
			"blockShapes",
			"blockShapeGeos",
			"blockStateDefinitions",
			"blockEigenvariants"
		],
		signal
	);

	const resourcesPromise = Promise.all([
		resourcePackStack.fetchResource("blocks.json").then(r => jsonc(r)),
		resourcePackStack.fetchResource("textures/terrain_texture.json").then(r => jsonc(r)),
		resourcePackStack.fetchResource("textures/flipbook_textures.json").then(r => jsonc(r))
	]);

	const { palette: blockPalette, indices: structureIndices } = await tweakBlockPalette(
		structure,
		config.IGNORED_BLOCKS
	);
	throwIfAborted(signal);

	if (desparseArray(blockPalette).length === 0) {
		throw new UserError("Structure is empty! No blocks are inside the structure.");
	}

	// merge helper expects multi-structure; keep one entry
	const { palette: mergedPalette0, indices: allIndices0 } = mergeMultiplePalettesAndIndices([
		{ palette: blockPalette, indices: structureIndices }
	]);
	// Expand paired Bedrock chests (pairx/pairz) into dedicated half geos
	const { applyDoubleChestPalette } = await import("./doubleChest.js");
	const {
		palette: mergedPalette,
		indices: blockIndices
	} = applyDoubleChestPalette(nbt, mergedPalette0, allIndices0[0]);

	const data = await dataPromise.all;
	throwIfAborted(signal);
	const [blocksDotJson, vanillaTerrainTexture, flipbookTextures] = await resourcesPromise;
	throwIfAborted(signal);

	progress(`Building geometry for ${mergedPalette.length} palette entries…`);
	const entityGeoMaker = new EntityGeoMaker(resourcePackStack);
	const blockGeoMaker = new BlockGeoMaker(
		config,
		entityGeoMaker,
		data.blockShapes,
		data.blockShapeGeos,
		data.blockStateDefinitions,
		data.blockEigenvariants
	);
	const { templates: unresolvedPolyMeshTemplatePalette, centersOfMass } =
		await blockGeoMaker.makePolyMeshTemplates(mergedPalette);
	throwIfAborted(signal);

	const texRefs = blockGeoMaker.textureRefs;
	const texCount = texRefs?.size ?? texRefs?.length ?? 0;
	progress(`Packing texture atlas (${texCount} texture refs)…`);
	const textureAtlas = new TextureAtlas(
		config,
		resourcePackStack,
		blocksDotJson,
		vanillaTerrainTexture,
		flipbookTextures,
		data.textureAtlasMappings
	);
	await textureAtlas.makeAtlas(Array.from(blockGeoMaker.textureRefs));
	throwIfAborted(signal);

	const fullOpacityTextureBlob = textureAtlas.imageBlobs.at(-1)[1];
	const unscaled = unresolvedPolyMeshTemplatePalette.map(t =>
		BlockGeoMaker.resolveTemplateFaceUvs(t, textureAtlas)
	);
	const polyMeshTemplatePalette = blockGeoMaker.scalePolyMeshTemplates(unscaled, centersOfMass);

	const entities = config.SHOW_ENTITIES === false
		? []
		: extractRenderableEntities(nbt);
	console.info(`[sdb] structure entities: ${entities.length} renderable`,
		entities.map(e => e.identifier));

	// Sparse inspect index (block entities only — huge win on large volumes)
	progress("Indexing containers & entities…");
	const inspectIndex = buildInspectIndex(nbt);
	console.info(
		`[sdb] inspect index: ${inspectIndex.blocks.size} block-entities, ${inspectIndex.entities.length} entities`
		+ (inspectIndex.sparse ? " (sparse)" : "")
	);

	progress("Assets ready — creating WebGL preview…");
	return {
		structureSize,
		blockPalette: mergedPalette,
		polyMeshTemplatePalette,
		blockIndices,
		fullOpacityTextureBlob,
		entities,
		inspectIndex,
		resourcePackStack
	};
}

/**
 * @param {File | File[]} structureFiles
 * @param {Element} previewCont
 * @param {Record<string, any>} [partialConfig]
 * @param {ResourcePackStack} [resourcePackStack]
 * @param {{ signal?: AbortSignal }} [opts]
 * @returns {Promise<import("../PreviewRenderer.js").default[]>}
 */
export async function renderStructurePreview(
	structureFiles,
	previewCont,
	partialConfig = {},
	resourcePackStack = new ResourcePackStack(),
	opts = {}
) {
	const signal = opts.signal ?? null;
	/** @type {(msg: string) => void} */
	const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : () => {};
	ensureLilGuiDefined();
	const config = defaultPreviewConfig(partialConfig);
	const files = Array.isArray(structureFiles) ? structureFiles : [structureFiles];
	const name =
		config.PACK_NAME
		?? (files.map(f => f.name.replace(/\.mcstructure$/i, "")).join(", ") || "structure");

	console.info("[sdb] renderStructurePreview (no pack, no HoloPrint)");

	/** @type {import("../PreviewRenderer.js").default[]} */
	const previews = [];
	const hostParent = previewCont.parentNode;
	// v14: restore TGA textures (cactus etc.) + icon path maps
	const cacheKey = `v14|scale=${config.SCALE}|ign=${config.IGNORED_BLOCKS.length}|ent=${config.SHOW_ENTITIES !== false ? 1 : 0}|ol=${config.TEXTURE_OUTLINE_WIDTH}|sky=${config.SHOW_PREVIEW_SKYBOX ? 1 : 0}`;

	try {
		for (let structureI = 0; structureI < files.length; structureI++) {
			throwIfAborted(signal);
			const file = files[structureI];
			const assets = await getCachedFileBuild(file, cacheKey, () =>
				buildPreviewAssets(file, config, resourcePackStack, signal, onProgress)
			);
			throwIfAborted(signal);

			if (structureI > 0 && hostParent) {
				hostParent.appendChild(document.createElement("hr"));
			}
			const cont =
				structureI === 0
					? previewCont
					: hostParent
						? hostParent.appendChild(previewCont.cloneNode())
						: previewCont;
			const label =
				files.length === 1
					? name
					: file.name.replace(/\.mcstructure$/i, "");

			const entityList = assets.entities ?? [];
			console.info(`[sdb] creating preview with ${entityList.length} entities`);
			const preview = await PreviewRenderer.new(
				cont,
				label,
				assets.fullOpacityTextureBlob,
				assets.structureSize,
				assets.blockPalette,
				assets.polyMeshTemplatePalette,
				assets.blockIndices,
				{
					...PreviewRenderer.PERFORMANCE_OPTIONS,
					showSkybox: config.SHOW_PREVIEW_SKYBOX ?? PreviewRenderer.PERFORMANCE_OPTIONS.showSkybox,
					showFps: config.SHOW_PREVIEW_WIDGETS ?? true,
					showOptions: config.SHOW_PREVIEW_WIDGETS ?? true,
					showEntities: config.SHOW_ENTITIES !== false,
					entityResourcePackStack: assets.resourcePackStack,
					// init() meshes these — do not call attachEntities from outside
					entities: entityList,
					inspectIndex: assets.inspectIndex ?? null,
					// Abort mid-init when user switches structure
					abortSignal: signal ?? null
				}
			);
			// If aborted during init, dispose orphan WebGL
			if (signal?.aborted || preview.disposed) {
				try { preview.dispose?.(); } catch { /* ignore */ }
				throwIfAborted(signal);
			}
			throwIfAborted(signal);
			console.info(
				`[sdb] preview instance ok; previewEntities=${preview.previewEntities?.length ?? "n/a"}; ` +
				`hasAttach=${typeof preview.attachEntities}`
			);
			previews.push(preview);
		}
	} catch (e) {
		// Clean up any partial previews if aborted or failed
		previews.forEach(p => {
			try {
				p.dispose?.();
			} catch {
				/* ignore */
			}
		});
		if (isAbortError(e)) throw e;
		throw e;
	}

	console.info("[sdb] preview ready");
	return previews;
}

export { isAbortError };
