/**
 * Rotation lookup for states the upgrade schema did not rewrite.
 * Compass words follow the comments in blockStateDefinitions.json.
 * Coral fan states are never changed. tweakBlockPalette does not pass coral
 * fans to applyUnrevisedBlockStates. That flattener owns leftover slab ids.
 */

/** weirdo_direction: 0 east, 1 west, 2 south, 3 north. */
const WEIRDO_TO_CARDINAL = ["east", "west", "south", "north"];
/** direction: 0 south, 1 west, 2 north, 3 east. */
const DIRECTION_TO_CARDINAL = ["south", "west", "north", "east"];

/**
 * @param {string} name
 */
function bareName(name) {
	return String(name ?? "").replace(/^minecraft:/, "");
}

/**
 * @param {{ name?: string, states?: object }|null|undefined} block
 */
export function isCoralFanBlock(block) {
	const name = bareName(block?.name);
	if (name === "coral_fan" || name.endsWith("_coral_fan") || name.endsWith("_coral_wall_fan")) return true;
	const states = block?.states;
	if (states && typeof states === "object") {
		if (Object.hasOwn(states, "coral_direction") || Object.hasOwn(states, "coral_fan_direction")) return true;
	}
	return false;
}

/**
 * @param {"weirdo_direction"|"direction"} stateName
 * @param {unknown} value
 * @returns {string|undefined}
 */
export function cardinalFromLegacy(stateName, value) {
	const table = stateName === "weirdo_direction"
		? WEIRDO_TO_CARDINAL
		: stateName === "direction"
			? DIRECTION_TO_CARDINAL
			: null;
	if (!table) return undefined;
	const n = Number(value);
	if (!Number.isInteger(n) || n < 0 || n >= table.length) return undefined;
	return table[n];
}

/**
 * The one old key this shape should read as minecraft:cardinal_direction.
 * Null when the shape does not ask, the file already has the cardinal name,
 * or the shape still rotates on the old key (doors keep their own direction table).
 * @param {{ name?: string, states?: Record<string, unknown> }} block
 * @param {Record<string, unknown>|null|undefined} specificRotations name and shape tables, name winning
 * @returns {"weirdo_direction"|"direction"|null}
 */
export function cardinalRotationSource(block, specificRotations) {
	const states = block?.states;
	if (!states || typeof states !== "object" || isCoralFanBlock(block)) return null;
	const specific = specificRotations && typeof specificRotations === "object" ? specificRotations : {};
	if (specific["minecraft:cardinal_direction"] == null) return null;
	if (Object.hasOwn(states, "minecraft:cardinal_direction")) return null;
	if (Object.hasOwn(states, "weirdo_direction") && specific.weirdo_direction == null) return "weirdo_direction";
	if (Object.hasOwn(states, "direction") && specific.direction == null) return "direction";
	return null;
}

/**
 * One rotation-table lookup. Does not copy or modify the block.
 * @param {{ name?: string, states?: Record<string, unknown> }} block
 * @param {Record<string, unknown>|null|undefined} specificRotations
 * @param {string} stateName
 * @param {unknown} stateValue
 * @returns {{ name: string, value: unknown }}
 */
export function rotationLookup(block, specificRotations, stateName, stateValue) {
	const source = cardinalRotationSource(block, specificRotations);
	if (source !== stateName) return { name: stateName, value: stateValue };
	const cardinal = cardinalFromLegacy(source, stateValue);
	if (cardinal == null) return { name: stateName, value: stateValue };
	return { name: "minecraft:cardinal_direction", value: cardinal };
}
