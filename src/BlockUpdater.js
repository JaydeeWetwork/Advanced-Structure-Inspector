// Updates a block from older MCBE versions, using schemas from pmmp/BedrockBlockUpgradeSchema. This code was made with reference to https://github.com/pmmp/PocketMine-MP/blob/5.21.0/src/data/bedrock/block/upgrade/BlockStateUpgrader.php and https://github.com/RaphiMC/ViaBedrock/blob/main/src/main/java/net/raphimc/viabedrock/api/chunk/blockstate/JsonBlockStateUpgradeSchema.java.

import fetchers from "./fetchers.js";
import {
	applyBlockUpdateSchema,
	packedSchemaVersion,
	schemaFilenamesToApply
} from "./viewer/blockUpgradeApply.js";

/** Shared across every BlockUpdater instance. */
/** @type {Record<string, BlockUpdateSchemaSkeleton[]>} */
const schemaIndex = {};
/** @type {Map<string, Promise<BlockUpdateSchema>>} */
const schemaLoads = new Map();
/** @type {Promise<void>|null} */
let indexPromise = null;

/**
 * Load the local schema filename index (no CDN). Safe to call at boot.
 * @returns {Promise<void>}
 */
async function ensureSchemaIndex() {
	if(Object.keys(schemaIndex).length) {
		return;
	}
	indexPromise ??= (async () => {
		const url = new URL("data/blockUpgradeSchemaList.json", location.href).href;
		const res = await fetch(url);
		if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
		/** @type {BlockUpdateSchemaSkeleton[]} */
		let schemaList = await res.json();
		if (!Array.isArray(schemaList)) schemaList = [];
		schemaList.forEach(schemaSkeleton => {
			let schemaVersion = packedSchemaVersion(schemaSkeleton);
			schemaIndex[schemaVersion] ??= [];
			schemaIndex[schemaVersion].push(schemaSkeleton);
		});
	})().catch(err => {
		indexPromise = null;
		throw err;
	});
	await indexPromise;
}

/**
 * @param {string} schemaFilename
 * @returns {Promise<BlockUpdateSchema>}
 */
function loadSchema(schemaFilename) {
	if(!schemaLoads.has(schemaFilename)) {
		schemaLoads.set(schemaFilename, fetchers.bedrockBlockUpgradeSchema(`nbt_upgrade_schema/${schemaFilename}`).then(res => res.json()).catch(err => {
			schemaLoads.delete(schemaFilename);
			throw err;
		}));
	}
	return schemaLoads.get(schemaFilename);
}

/** Updates older blocks to the latest MCBE version. */
export default class BlockUpdater {
	static LATEST_VERSION = 18168865; // 01 15 3C 21 = 1.21.60.33 (1.21.61)
	
	/**
	 * Checks if a block needs updating to the latest Minecraft version.
	 * @param {NBTBlock} block
	 * @returns {boolean}
	 */
	blockNeedsUpdating(block) {
		return block["version"] < BlockUpdater.LATEST_VERSION;
	}
	/**
	 * Load the local schema filename index (no CDN). Safe to call at boot.
	 * @returns {Promise<void>}
	 */
	ensureSchemaIndex() {
		return ensureSchemaIndex();
	}
	/**
	 * Upgrades a block from older Minecraft versions to the latest Minecraft version.
	 * @mutating
	 * @param {NBTBlock} block
	 * @returns {Promise<boolean>} Whether or not the block was updated. (The version number will always be updated.)
	 */
	async update(block) {
		let oldBlockStringified = BlockUpdater.stringifyBlock(block);
		await ensureSchemaIndex();
		let schemasToApply = schemaFilenamesToApply(schemaIndex, block["version"]);
		let schemas = await Promise.all(schemasToApply.map(loadSchema));
		let updated = false;
		schemas.forEach(schema => {
			if(applyBlockUpdateSchema(schema, block)) {
				updated = true;
			}
		});
		block["version"] = BlockUpdater.LATEST_VERSION;
		if(updated) {
			console.debug(`Updated ${oldBlockStringified} to ${BlockUpdater.stringifyBlock(block)}`);
		}
		return updated;
	}
	/**
	 * "Stringifies" a block with its name and states.
	 * @param {NBTBlock | Block} block
	 * @param {boolean} [includeVersion]
	 * @returns {string}
	 */
	static stringifyBlock(block, includeVersion = true) {
		let blockStates = Object.entries(block["states"] ?? {}).map(([name, value]) => `${name}=${value}`).join(",");
		let res = block["name"].replace(/^minecraft:/, "");
		if(blockStates.length) {
			res += `[${blockStates}]`;
		}
		if(includeVersion && "version" in block) {
			res += `@${BlockUpdater.parseBlockVersion(block["version"]).join(".")}`;
		}
		return res;
	}
	/**
	 * Expands the block version number found in structure NBT into an array.
	 * @param {number} blockVersion Block version number as found in structure NBT
	 * @returns {number[]}
	 */
	static parseBlockVersion(blockVersion) {
		return blockVersion.toString(16).padStart(8, "0").match(/.{2}/g).map(x => parseInt(x, 16));
	}
}

/** @import { NBTBlock, Block, BlockUpdateSchemaSkeleton, BlockUpdateSchema, TypedBlockStateProperty, BlockUpdateSchemaFlattenRule } from "./types.js" */
