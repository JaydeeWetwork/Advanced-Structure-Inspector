import { BlobWriter, BlobReader, ZipReader } from "@zip.js/zip.js";
import { makePack } from "./makePackStages.js";
import { UserError } from "../utils.js";
import { createItemCriteria } from "./itemCriteria.js";
import { IGNORED_BLOCKS } from "../viewer/palette.js";
import {
	addDefaultConfig,
	DEFAULT_PLAYER_CONTROLS,
	findLinksInDescription,
	getDefaultPackName,
	PLAYER_CONTROL_NAMES,
	readStructureNBT,
	VERSION
} from "./packConfig.js";

export {
	createItemCriteria,
	IGNORED_BLOCKS,
	makePack,
	addDefaultConfig,
	DEFAULT_PLAYER_CONTROLS,
	findLinksInDescription,
	getDefaultPackName,
	PLAYER_CONTROL_NAMES,
	readStructureNBT,
	VERSION
};

/**
 * Retrieves the structure files from a completed HoloPrint resource pack.
 * @param {File} resourcePack HoloPrint resource pack (`*.mcpack`)
 * @returns {Promise<File[]>}
 */
export async function extractStructureFilesFromPack(resourcePack) {
	let packFileReader = new BlobReader(resourcePack);
	let packFolder = new ZipReader(packFileReader);
	/** @type {FileEntry[]} */
	// @ts-ignore
	let structureFileEntries = (await packFolder.getEntries()).filter(entry => entry.filename.endsWith(".mcstructure"));
	packFolder.close();
	let structureBlobs = await Promise.all(structureFileEntries.map(entry => entry.getData(new BlobWriter())));
	let packName = resourcePack.name.slice(0, resourcePack.name.indexOf("."));
	return structureBlobs.map((structureBlob, i) => new File([structureBlob], structureFileEntries[i].comment || `${packName}${structureBlobs.length > 1? `_${i}` : ""}.mcstructure`, {
		type: "application/mcstructure"
	}));
}

/**
 * Updates a HoloPrint resource pack by remaking it.
 * @param {File} resourcePack HoloPrint resource pack to update (`*.mcpack`)
 * @param {HoloPrintConfig} [config]
 * @param {import("../viewer/engine/ResourcePackStack.js").default} [resourcePackStack]
 * @param {HTMLElement} [previewCont]
 * @returns {Promise<{ pack: File, materialList: import("./MaterialList.js").default, previews?: Promise<import("../viewer/engine/PreviewRenderer.js").default[]> }>}
 */
export async function updatePack(resourcePack, config, resourcePackStack, previewCont) {
	let structureFiles = await extractStructureFilesFromPack(resourcePack);
	if(!structureFiles.length) {
		throw new UserError(`No structure files found inside resource pack ${resourcePack.name}; cannot update pack!`);
	}
	return await makePack(structureFiles, config, resourcePackStack, previewCont);
}

/** @import { FileEntry } from "@zip.js/zip.js" */
/** @import { HoloPrintConfig } from "./packTypes.js" */
