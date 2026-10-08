import { PatternMap, ReplacingPatternMap } from "../utils/containers.js";

/**
 * @param {unknown} value
 * @returns {[number, string]}
 */
function multiplierPair(value) {
	if (typeof value == "number") return [value, ""];
	const row = /** @type {{ multiplier?: number, remove?: string }} */ (value ?? {});
	return [row.multiplier ?? 1, row.remove ?? ""];
}

/**
 * Ignored blocks, block-to-item names, count multipliers, and block-entity suffixes.
 * Multiplier keys split on commas. Liquid rules stay with the caller.
 * @param {object} mappings
 */
export function compileMaterialTables(mappings) {
	const ignored = new Set(mappings?.["ignored_blocks"] ?? []);
	const blockToItem = new ReplacingPatternMap(Object.entries(mappings?.["block_to_item_mappings"] ?? {}));
	const multiplierEntries = Object.entries(mappings?.["item_count_multipliers"] ?? {}).map(
		([key, value]) => /** @type {[string, [number, string]]} */ ([key, multiplierPair(value)])
	);
	const multipliers = new PatternMap(multiplierEntries, ",");
	const specialBlockEntityProperties = mappings?.["special_block_entity_properties"] ?? {};
	return { ignored, blockToItem, multipliers, specialBlockEntityProperties };
}

const missingEntityPropLogged = new Set();

/**
 * @param {ReturnType<typeof compileMaterialTables>} tables
 * @param {string|{ name?: string, block_entity_data?: Record<string, unknown> }} block
 * @param {number} [count]
 * @returns {{ itemName: string, count: number }|null}
 */
export function materialIdentity(tables, block, count = 1) {
	const blockName = typeof block == "string" ? block : block?.name;
	if (!blockName || tables.ignored.has(blockName)) return null;
	let itemName = tables.blockToItem.get(blockName) ?? blockName;
	const multiplierMatch = tables.multipliers.get(itemName);
	if (multiplierMatch) {
		const [multiplier, substringToRemove] = multiplierMatch;
		count *= multiplier;
		if (substringToRemove) itemName = itemName.replaceAll(substringToRemove, "");
	}
	if (
		typeof block != "string"
		&& Object.hasOwn(tables.specialBlockEntityProperties, itemName)
	) {
		const blockEntityProperty = tables.specialBlockEntityProperties[itemName]["prop"];
		const data = block["block_entity_data"];
		if (data && typeof data === "object" && Object.hasOwn(data, blockEntityProperty)) {
			itemName += `+${data[blockEntityProperty]}`;
		} else if (!missingEntityPropLogged.has(itemName)) {
			missingEntityPropLogged.add(itemName);
			console.error(`Cannot find block entity property ${blockEntityProperty} on block ${block["name"]}!`);
		}
	}
	return { itemName, count };
}
