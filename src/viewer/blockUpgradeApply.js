/**
 * Apply one pmmp/BedrockBlockUpgradeSchema JSON file to a palette block.
 * Kept free of fetchers so unit tests do not hit the network.
 */

/** stone_slab_type values the schema chain never rewrote, and the id stem they become. */
const LEGACY_SLAB_REMAPS = {
	smooth_stone: "smooth_stone",
	sandstone: "sandstone",
	wood: "oak",
	cobblestone: "cobblestone",
	brick: "brick",
	stone_brick: "stone_brick",
	quartz: "quartz",
	nether_brick: "nether_brick"
};

/** Unflattened slab ids to the suffix applyFlattenedProperty appends. */
const LEGACY_SLAB_SUFFIX = {
	stone_slab: "_slab",
	stone_block_slab: "_slab",
	normal_stone_slab: "_slab",
	double_stone_slab: "_double_slab",
	double_stone_block_slab: "_double_slab"
};

/**
 * Packed NBT block version: (major<<24)|(minor<<16)|(patch<<8)|revision
 * @param {{ maxVersionMajor: number, maxVersionMinor: number, maxVersionPatch: number, maxVersionRevision: number }} schema
 */
export function packedSchemaVersion(schema) {
	return (schema.maxVersionMajor << 24)
		| (schema.maxVersionMinor << 16)
		| (schema.maxVersionPatch << 8)
		| schema.maxVersionRevision;
}

/**
 * CDN path inside a schema repo. `path` wins when a file sits outside `folder`.
 * Block schemas use `nbt_upgrade_schema`. Item schemas use `id_meta_upgrade_schema`.
 * @param {{ filename: string, path?: string }} skeleton
 * @param {string} [folder]
 */
export function schemaCdnPath(skeleton, folder = "nbt_upgrade_schema") {
	return skeleton.path ?? `${folder}/${skeleton.filename}`;
}

/**
 * Which schema skeletons to run for a palette `version`.
 * Multiple files sharing one packed maxVersion are Mojang "forgot to bump"
 * steps — all must apply even when block.version already equals that number.
 * The returned objects are the index entries, so `path` is still there for the CDN fetch.
 *
 * @param {Record<string, { filename: string, path?: string }[]>} schemaIndex packedVersion → skeletons
 * @param {number} blockVersion
 * @returns {{ filename: string, path?: string }[]}
 */
export function schemaSkeletonsToApply(schemaIndex, blockVersion) {
	const out = [];
	for (const [version, schemaSkeletons] of Object.entries(schemaIndex)) {
		if (blockVersion > +version) continue;
		if (schemaSkeletons.length === 1 && blockVersion === +version) continue;
		out.push(...schemaSkeletons);
	}
	return out;
}

/**
 * @param {Record<string, number|string>} blockStateProperty
 */
function readBlockStateProperty(blockStateProperty) {
	return Object.values(blockStateProperty)[0];
}

/**
 * Own property only. Inherited names such as constructor are not table hits.
 * @param {object|null|undefined} table
 * @param {unknown} key
 */
function hasOwnKey(table, key) {
	if (table == null || typeof table !== "object") return false;
	if (typeof key !== "string" && typeof key !== "number") return false;
	return Object.hasOwn(table, key);
}

/**
 * @param {object} flattenRule
 * @param {{ name: string, states: Record<string, unknown> }} block
 */
export function applyFlattenedProperty(flattenRule, block) {
	const blockStateName = flattenRule.flattenedProperty;
	if (!hasOwnKey(block.states, blockStateName)) return false;
	const blockStateValue = block.states[blockStateName];
	const embedValue = flattenRule.flattenedValueRemaps?.[blockStateValue] ?? blockStateValue;
	block.name = flattenRule.prefix + embedValue + flattenRule.suffix;
	delete block.states[blockStateName];
	return true;
}

/**
 * @param {object} schema
 * @param {{ name: string, states?: Record<string, unknown>, version: number }} block
 * @returns {boolean}
 */
export function applyBlockUpdateSchema(schema, block) {
	block.states ??= {};
	const schemaVersion = packedSchemaVersion(schema);
	if (block.version > schemaVersion) return false;
	if (hasOwnKey(schema.flattenedProperties, block.name) && hasOwnKey(schema.renamedIds, block.name)) {
		return false;
	}

	const remappedStates = hasOwnKey(schema.remappedStates, block.name)
		? schema.remappedStates[block.name]
		: undefined;
	if (remappedStates?.some(remappedState => {
		const statesToMatch = remappedState.oldState;
		if (statesToMatch != null) {
			if (Object.keys(statesToMatch).length > Object.keys(block.states).length) return false;
			for (const [blockStateName, blockStateValueProperty] of Object.entries(statesToMatch)) {
				if (!hasOwnKey(block.states, blockStateName)) return false;
				if (readBlockStateProperty(blockStateValueProperty) != block.states[blockStateName]) return false;
			}
		}
		if ("newName" in remappedState) {
			block.name = remappedState.newName;
		} else {
			applyFlattenedProperty(remappedState.newFlattenedName, block);
		}
		const newStates = Object.fromEntries(
			Object.entries(remappedState.newState ?? {}).map(([n, p]) => [n, readBlockStateProperty(p)])
		);
		remappedState.copiedState?.forEach(n => {
			if (hasOwnKey(block.states, n)) newStates[n] = block.states[n];
		});
		block.states = newStates;
		return true;
	})) {
		block.version = schemaVersion;
		return true;
	}

	let hasBeenUpdated = false;
	const addedProperties = hasOwnKey(schema.addedProperties, block.name)
		? schema.addedProperties[block.name]
		: {};
	Object.entries(addedProperties ?? {}).forEach(([n, p]) => {
		if (hasOwnKey(block.states, n)) return;
		block.states[n] = readBlockStateProperty(p);
		hasBeenUpdated = true;
	});
	const removedProperties = hasOwnKey(schema.removedProperties, block.name)
		? schema.removedProperties[block.name]
		: undefined;
	removedProperties?.forEach(n => {
		if (!hasOwnKey(block.states, n)) return;
		delete block.states[n];
		hasBeenUpdated = true;
	});
	const remappedPropertyValues = hasOwnKey(schema.remappedPropertyValues, block.name)
		? schema.remappedPropertyValues[block.name]
		: {};
	Object.entries(remappedPropertyValues ?? {}).forEach(([blockStateName, remappingName]) => {
		if (!hasOwnKey(block.states, blockStateName)) return;
		const remappings = schema.remappedPropertyValuesIndex?.[remappingName];
		if (!remappings) return;
		const current = block.states[blockStateName];
		const remapping = remappings.find(r => current == readBlockStateProperty(r.old));
		if (!remapping) return;
		block.states[blockStateName] = readBlockStateProperty(remapping.new);
		hasBeenUpdated = true;
	});
	const renamedProperties = hasOwnKey(schema.renamedProperties, block.name)
		? schema.renamedProperties[block.name]
		: {};
	Object.entries(renamedProperties ?? {}).forEach(([oldName, newName]) => {
		if (!hasOwnKey(block.states, oldName)) return;
		block.states[newName] = block.states[oldName];
		delete block.states[oldName];
		hasBeenUpdated = true;
	});
	if (hasOwnKey(schema.flattenedProperties, block.name)) {
		if (applyFlattenedProperty(schema.flattenedProperties[block.name], block)) {
			hasBeenUpdated = true;
		}
	}
	if (hasOwnKey(schema.renamedIds, block.name)) {
		block.name = schema.renamedIds[block.name];
		hasBeenUpdated = true;
	}
	block.version = schemaVersion;
	return hasBeenUpdated;
}

/**
 * Preview palette only. Copies a bare vertical_half, and flattens a leftover
 * stone_slab_type through applyFlattenedProperty.
 * @param {{ name?: string, states?: Record<string, unknown> }} block
 * @returns {boolean}
 */
export function applyUnrevisedBlockStates(block) {
	if (!block || typeof block !== "object") return false;
	const states = block.states;
	if (!states || typeof states !== "object") return false;
	let changed = false;
	if (!Object.hasOwn(states, "minecraft:vertical_half") && Object.hasOwn(states, "vertical_half")) {
		states["minecraft:vertical_half"] = states.vertical_half;
		delete states.vertical_half;
		changed = true;
	}
	if (!Object.hasOwn(states, "stone_slab_type")) return changed;
	const material = LEGACY_SLAB_REMAPS[String(states.stone_slab_type)];
	const name = String(block.name ?? "").replace(/^minecraft:/, "");
	const suffix = LEGACY_SLAB_SUFFIX[name];
	if (material && suffix) {
		applyFlattenedProperty({
			prefix: "",
			suffix,
			flattenedProperty: "stone_slab_type",
			flattenedValueRemaps: LEGACY_SLAB_REMAPS
		}, block);
		changed = true;
	}
	if (!Object.hasOwn(states, "minecraft:vertical_half")) {
		const bit = states.top_slot_bit;
		const top = bit === 1 || bit === true || bit === "1" || bit === "true";
		states["minecraft:vertical_half"] = top ? "top" : "bottom";
		changed = true;
	}
	return changed;
}
