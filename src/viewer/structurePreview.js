/**
 * Structure preview pipeline. PreviewRenderer only. Does not build a pack.
 */

import BlockGeoMaker from "./engine/BlockGeoMaker.js";
import TextureAtlas from "./engine/TextureAtlas.js";
import { BUILD_ID } from "../buildId.js";
import PreviewRenderer from "./engine/PreviewRenderer.js";
import ResourcePackStack from "./engine/ResourcePackStack.js";
import EntityGeoMaker from "./engine/EntityGeoMaker.js";
import { awaitAllEntries, desparseArray, jsonc, UserError } from "../utils.js";
import { throwIfAborted, isAbortError } from "./abortUtil.js";
import {
	dedupePalette,
	IGNORED_BLOCKS,
	normalizeVec3,
	stripPaletteVersions,
	tweakBlockPalette
} from "./palette.js";
import { getCachedDataFile, getCachedFileBuild } from "./previewCache.js";
import { splitRenderableEntities } from "./entityExtract.js";
import { buildInspectIndex } from "./inspectStructure.js";
import { cargoPaletteEntries } from "./entityCargo.js";
import { countNewerBlocks, formatAppearanceLog, formatVersionGapNote } from "./appearanceFallback.js";
import { applyNeighborConnections } from "./fenceConnections.js";
import { VANILLA_SAMPLES_TAG } from "../data/packPins.js";
import { McstructureCodecError, readMcstructure } from "./api/structure.js";
import { loadItemUpgradeSchemas } from "./itemUpgrade.js";
import fetchers from "./engine/fetchers.js";

async function ensureLilGuiDefined() {
	if (customElements.get("lil-gui")) return;
	const { default: LilGui } = await import("../components/LilGui.js");
	customElements.define("lil-gui", LilGui);
}

function defaultPreviewConfig(partial = {}) {
	return {
		IGNORED_BLOCKS: [...IGNORED_BLOCKS, ...(partial.IGNORED_BLOCKS ?? [])],
		// Full cell size. Pack compile still defaults to 0.95 so in-game ghosts stay inset.
		SCALE: partial.SCALE ?? 1,
		OPACITY: partial.OPACITY ?? 1,
		MULTIPLE_OPACITIES: partial.MULTIPLE_OPACITIES ?? false,
		SKIP_TEXTURE_CROP: partial.SKIP_TEXTURE_CROP ?? true,
		// No blue hologram trim on blocks — cleaner structure viewer look
		TEXTURE_OUTLINE_WIDTH: partial.TEXTURE_OUTLINE_WIDTH ?? 0,
		TEXTURE_OUTLINE_COLOR: partial.TEXTURE_OUTLINE_COLOR ?? "#00F",
		TEXTURE_OUTLINE_OPACITY: partial.TEXTURE_OUTLINE_OPACITY ?? 0.65,
		SHOW_PREVIEW_SKYBOX: partial.SHOW_PREVIEW_SKYBOX ?? false,
		SHOW_PREVIEW_WIDGETS: partial.SHOW_PREVIEW_WIDGETS ?? false,
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
	try {
		if (structureFile && structureFile.size === 0) {
			throw new McstructureCodecError(
				"STRUCTURE_EMPTY",
				"empty buffer"
			);
		}
		const { nbt } = await readMcstructure(structureFile);
		return nbt;
	} catch (e) {
		if (e instanceof McstructureCodecError) {
			throw e.toError(structureFile?.name, UserError);
		}
		const name = structureFile?.name || "structure";
		throw new UserError(`"${name}" is not a valid .mcstructure`);
	}
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
 * @param {(msg: string, fraction?: number) => void} [onProgress]
 */
async function buildPreviewAssets(structureFile, config, resourcePackStack, signal, onProgress) {
	const started = performance.now();
	let marked = started;
	/** Wall time for the phase that just finished, plus time since this build started. */
	const phase = (name) => {
		const now = performance.now();
		const step = ((now - marked) / 1000).toFixed(2);
		const total = ((now - started) / 1000).toFixed(2);
		marked = now;
		console.info(`[bLayers] ${name} ${step}s (total ${total}s)`);
	};
	const progress = (msg, fraction) => {
		try {
			onProgress?.(msg, fraction);
		} catch {
			/* ignore */
		}
		console.info(`[bLayers] ${msg}`);
	};

	throwIfAborted(signal);
	const itemSchemasPromise = loadItemUpgradeSchemas(fetchers).catch(e => {
		console.warn("[bLayers] item upgrade schemas skipped:", e);
		return [];
	});
	// Kick pack JSON + block-shape tables before NBT parse so CDN/cache overlap.
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
	progress("Parsing NBT…", 0.08);
	const nbt = await readStructureNBT(structureFile, signal);
	phase("parse");
	const structureSize = normalizeVec3(nbt["size"]);
	const structure = nbt["structure"];
	const volume = structureSize[0] * structureSize[1] * structureSize[2];
	progress(
		`Size ${structureSize.join("×")} (${volume.toLocaleString()} cells) — loading pack data…`,
		0.22
	);

	const {
		palette: blockPalette,
		indices: structureIndices
	} = await tweakBlockPalette(
		structure,
		config.IGNORED_BLOCKS
	);
	throwIfAborted(signal);

	if (desparseArray(blockPalette).length === 0) {
		throw new UserError("Structure is empty! No blocks are inside the structure.");
	}

	const {
		palette: mergedPalette0,
		indices: blockIndices0
	} = dedupePalette(blockPalette, structureIndices);
	// Expand paired Bedrock chests (pairx/pairz) into dedicated half geos
	const { applyDoubleChestPalette } = await import("./doubleChest.js");
	let {
		palette: mergedPalette,
		indices: blockIndices
	} = applyDoubleChestPalette(nbt, mergedPalette0, blockIndices0);
	phase("palette");

	const data = await dataPromise.all;
	throwIfAborted(signal);
	const linked = applyNeighborConnections(
		structureSize,
		mergedPalette,
		blockIndices,
		data.blockShapes
	);
	mergedPalette = linked.palette;
	blockIndices = linked.indices;
	const [blocksDotJson, vanillaTerrainTexture, flipbookTextures] = await resourcesPromise;
	throwIfAborted(signal);
	phase("pack data");

	const splitEntities = config.SHOW_ENTITIES === false
		? { kept: [], outside: [] }
		: splitRenderableEntities(nbt);
	const entities = splitEntities.kept;
	if (splitEntities.outside.length) {
		console.info(
			`[bLayers] skipped ${splitEntities.outside.length} entities outside the structure`,
			splitEntities.outside.slice(0, 8).map(e =>
				`${e.identifier}@${e.pos.map(n => Number(n).toFixed(2)).join(",")}`
			)
		);
	}
	const cargoEntries = config.SHOW_ENTITIES === false ? [] : cargoPaletteEntries(entities);

	progress(`Building geometry for ${mergedPalette.length} palette entries…`, 0.42);
	const entityGeoMaker = new EntityGeoMaker(resourcePackStack);
	const blockGeoMaker = new BlockGeoMaker(
		config,
		entityGeoMaker,
		data.blockShapes,
		data.blockShapeGeos,
		data.blockStateDefinitions,
		data.blockEigenvariants
	);
	const { templates: unresolvedFaceTemplates, centersOfMass, shapes: shapeByPalette } =
		await blockGeoMaker.makePolyMeshTemplates(mergedPalette);
	throwIfAborted(signal);

	let unresolvedCargoTemplates = [];
	if (cargoEntries.length) {
		const cargoResult = await blockGeoMaker.makePolyMeshTemplates(
			cargoEntries.map(e => e.block)
		);
		unresolvedCargoTemplates = cargoResult.templates;
		throwIfAborted(signal);
	}
	phase("geometry");

	const texRefs = blockGeoMaker.textureRefs;
	const texCount = texRefs?.size ?? texRefs?.length ?? 0;
	progress(`Packing texture atlas (${texCount} texture refs)…`, 0.68);
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
	phase("atlas");
	const missingGeo = [...blockGeoMaker.unmappedBlockNames];
	const checkerboard = [...textureAtlas.checkerboardKeys];
	const defaultCubeCount = blockGeoMaker.defaultCubeNames?.size ?? 0;
	if (defaultCubeCount || missingGeo.length || checkerboard.length) {
		console.info(formatAppearanceLog({ defaultCubeCount, missingGeo, checkerboard }));
	}
	const versionGapReport = countNewerBlocks({
		palette: mergedPalette,
		indices: blockIndices,
		unmappedNames: blockGeoMaker.unmappedBlockNames
	});
	stripPaletteVersions(mergedPalette);
	const versionGapNote = formatVersionGapNote(versionGapReport);
	if (versionGapNote) console.info(`[bLayers] ${versionGapNote}`);

	const fullOpacityTextureBlob = textureAtlas.atlasImageData;
	const unscaled = unresolvedFaceTemplates.map(t =>
		BlockGeoMaker.resolveTemplateFaceUvs(t, textureAtlas)
	);
	const blockFaceTemplates = blockGeoMaker.scaleFaceTemplates(
		unscaled,
		centersOfMass,
		shapeByPalette
	);

	/** @type {Record<string, any[]>} */
	const cargoTemplates = {};
	cargoEntries.forEach((entry, i) => {
		const faces = unresolvedCargoTemplates[i];
		if (!faces?.length) return;
		cargoTemplates[entry.kind] = BlockGeoMaker.resolveTemplateFaceUvs(faces, textureAtlas);
	});
	phase("uv");
	console.info(`[bLayers] structure entities: ${entities.length} renderable`,
		entities.map(e => e.identifier));

	// Sparse inspect index (block entities only — huge win on large volumes)
	progress("Indexing containers & entities…", 0.82);
	const itemSchemas = await itemSchemasPromise;
	phase("item schemas");
	const inspectIndex = buildInspectIndex(nbt, { itemSchemas });
	console.info(
		`[bLayers] inspect index: ${inspectIndex.blocks.size} block-entities, ${inspectIndex.entities.length} entities`
		+ (inspectIndex.sparse ? " (sparse)" : "")
	);
	phase("inspect");

	progress("Assets ready — creating WebGL preview…", 0.92);
	return {
		structureSize,
		blockPalette: mergedPalette,
		blockFaceTemplates,
		blockIndices,
		fullOpacityTextureBlob,
		entities,
		inspectIndex,
		resourcePackStack,
		cargoTemplates,
		shapeByPalette,
		versionGapNote
	};
}

/**
 * @param {File | File[]} structureFiles
 * @param {Element} previewCont
 * @param {Record<string, any>} [partialConfig]
 * @param {ResourcePackStack} [resourcePackStack]
 * @param {{ signal?: AbortSignal, onProgress?: (msg: string, fraction?: number) => void }} [opts]
 * @returns {Promise<import("./engine/PreviewRenderer.js").default[]>}
 */
export async function renderStructurePreview(
	structureFiles,
	previewCont,
	partialConfig = {},
	resourcePackStack = new ResourcePackStack(),
	opts = {}
) {
	const signal = opts.signal ?? null;
	/** @type {(msg: string, fraction?: number) => void} */
	const onProgress = typeof opts.onProgress === "function" ? opts.onProgress : () => {};
	const config = defaultPreviewConfig(partialConfig);
	if (config.SHOW_PREVIEW_WIDGETS) await ensureLilGuiDefined();
	const files = Array.isArray(structureFiles) ? structureFiles : [structureFiles];
	const name =
		config.PACK_NAME
		?? (files.map(f => f.name.replace(/\.mcstructure$/i, "")).join(", ") || "structure");

	console.info("[bLayers] renderStructurePreview");
	const previewStarted = performance.now();

	/** @type {import("./engine/PreviewRenderer.js").default[]} */
	const previews = [];
	const hostParent = previewCont.parentNode;
	// v14: restore TGA textures (cactus etc.) + icon path maps
	const ign = [...config.IGNORED_BLOCKS].sort().join(",");
	const cacheKey = [
		BUILD_ID,
		`pack=${VANILLA_SAMPLES_TAG}`,
		`scale=${config.SCALE}`,
		`ign=${ign}`,
		`ent=${config.SHOW_ENTITIES !== false ? 1 : 0}`,
		`ol=${config.TEXTURE_OUTLINE_WIDTH}`,
		`sky=${config.SHOW_PREVIEW_SKYBOX ? 1 : 0}`,
		`crop=${config.SKIP_TEXTURE_CROP ? 1 : 0}`,
		`op=${config.OPACITY}`,
		`multi=${config.MULTIPLE_OPACITIES ? 1 : 0}`
	].join("|");

	try {
		for (let structureI = 0; structureI < files.length; structureI++) {
			throwIfAborted(signal);
			const file = files[structureI];
			const assetStarted = performance.now();
			const assets = await getCachedFileBuild(file, cacheKey, () =>
				buildPreviewAssets(file, config, resourcePackStack, null, onProgress)
			);
			console.info(
				`[bLayers] preview assets ${((performance.now() - assetStarted) / 1000).toFixed(2)}s`
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
			console.info(`[bLayers] creating preview with ${entityList.length} entities`);
			const preview = await PreviewRenderer.new(
				cont,
				label,
				assets.fullOpacityTextureBlob,
				assets.structureSize,
				assets.blockPalette,
				assets.blockFaceTemplates,
				assets.blockIndices,
				{
					...PreviewRenderer.PERFORMANCE_OPTIONS,
					showSkybox: config.SHOW_PREVIEW_SKYBOX ?? PreviewRenderer.PERFORMANCE_OPTIONS.showSkybox,
					showFps: !!config.SHOW_PREVIEW_WIDGETS,
					showOptions: !!config.SHOW_PREVIEW_WIDGETS,
					showEntities: config.SHOW_ENTITIES !== false,
					entityResourcePackStack: assets.resourcePackStack,
					// init() meshes these — do not call attachEntities from outside
					entities: entityList,
					cargoTemplates: assets.cargoTemplates ?? {},
					inspectIndex: assets.inspectIndex ?? null,
					shapeByPalette: assets.shapeByPalette ?? null,
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
				`[bLayers] preview instance ok; previewEntities=${preview.previewEntities?.length ?? "n/a"}; ` +
				`hasAttach=${typeof preview.attachEntities}`
			);
			preview.versionGapNote = assets.versionGapNote || "";
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

	console.info(
		`[bLayers] preview ready ${((performance.now() - previewStarted) / 1000).toFixed(2)}s`
	);
	return previews;
}

export { isAbortError };
