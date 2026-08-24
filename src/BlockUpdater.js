// Updates a block from older MCBE versions, using schemas from pmmp/BedrockBlockUpgradeSchema. This code was made with reference to https://github.com/pmmp/PocketMine-MP/blob/5.21.0/src/data/bedrock/block/upgrade/BlockStateUpgrader.php and https://github.com/RaphiMC/ViaBedrock/blob/main/src/main/java/net/raphimc/viabedrock/api/chunk/blockstate/JsonBlockStateUpgradeSchema.java.

import fetchers from "./fetchers.js";
import {
	applyBlockUpdateSchema,
	packedSchemaVersion,
	schemaFilenamesToApply
} from "./viewer/blockUpgradeApply.js";

const SCHEMA_LIST_URL = new URL("./data/blockUpgradeSchemaList.json", import.meta.url);

/** Updates older blocks to the latest MCBE version. */
export default class BlockUpdater {
	static LATEST_VERSION = 18168865; // 01 15 3C 21 = 1.21.60.33 (1.21.61)
	
	/** @type {Record<string, BlockUpdateSchemaSkeleton[]>} */
	#schemaIndex = {};
	/** @type {Map<string, BlockUpdateSchema>} */
	#schemas = new Map();
	
	/**
	 * Checks if a block needs updating to the latest Minecraft version.
	 * @param {NBTBlock} block
	 * @returns {boolean}
	 */
	blockNeedsUpdating(block) {
		return block["version"] < BlockUpdater.LATEST_VERSION;
	}
	/**
	 * Upgrades a block from older Minecraft versions to the latest Minecraft version.
	 * @mutating
	 * @param {NBTBlock} block
	 * @returns {Promise<boolean>} Whether or not the block was updated. (The version number will always be updated.)
	 */
	async update(block) {
		let oldBlockStringified = BlockUpdater.stringifyBlock(block);
		if(Object.keys(this.#schemaIndex).length == 0) {
			/** @type {BlockUpdateSchemaSkeleton[]} */
			let schemaList = await fetch(SCHEMA_LIST_URL).then(res => res.json());
			schemaList.forEach(schemaSkeleton => {
				let schemaVersion = packedSchemaVersion(schemaSkeleton);
				this.#schemaIndex[schemaVersion] ??= [];
				this.#schemaIndex[schemaVersion].push(schemaSkeleton);
			});
		}
		let schemasToApply = schemaFilenamesToApply(this.#schemaIndex, block["version"]);
		await Promise.all(schemasToApply.map(async schemaFilename => {
			if(!this.#schemas.has(schemaFilename)) {
				this.#schemas.set(schemaFilename, await fetchers.bedrockBlockUpgradeSchema(`nbt_upgrade_schema/${schemaFilename}`).then(res => res.json()));
			}
		}));
		let updated = false;
		schemasToApply.forEach(schemaFileName => {
			let schema = this.#schemas.get(schemaFileName);
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