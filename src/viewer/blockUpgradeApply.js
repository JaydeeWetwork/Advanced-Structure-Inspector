/**
 * Apply one pmmp/BedrockBlockUpgradeSchema JSON file to a palette block.
 * Kept free of fetchers so unit tests do not hit the network.
 */

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
 * Which schema filenames to run for a palette `version`.
 * Multiple files sharing one packed maxVersion are Mojang "forgot to bump"
 * steps — all must apply even when block.version already equals that number.
 *
 * @param {Record<string, { filename: string }[]>} schemaIndex packedVersion → skeletons
 * @param {number} blockVersion
 * @returns {string[]}
 */
export function schemaFilenamesToApply(schemaIndex, blockVersion) {
	const out = [];
	for (const [version, schemaSkeletons] of Object.entries(schemaIndex)) {
		if (blockVersion > +version) continue;
		if (schemaSkeletons.length === 1 && blockVersion === +version) continue;
		out.push(...schemaSkeletons.map(s => s.filename));
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
 * @param {object} flattenRule
 * @param {{ name: string, states: Record<string, unknown> }} block
 */
export function applyFlattenedProperty(flattenRule, block) {
	const blockStateName = flattenRule.flattenedProperty;
	if (!(blockStateName in block.states)) return false;
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
	if (block.name in (schema.flattenedProperties ?? {}) && block.name in (schema.renamedIds ?? {})) {
		return false;
	}

	if (schema.remappedStates?.[block.name]?.some(remappedState => {
		const statesToMatch = remappedState.oldState;
		if (statesToMatch != null) {
			if (Object.keys(statesToMatch).length > Object.keys(block.states).length) return false;
			for (const [blockStateName, blockStateValueProperty] of Object.entries(statesToMatch)) {
				if (!(blockStateName in block.states)) return false;
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
			if (n in block.states) newStates[n] = block.states[n];
		});
		block.states = newStates;
		return true;
	})) {
		block.version = schemaVersion;
		return true;
	}

	let hasBeenUpdated = false;
	Object.entries(schema.addedProperties?.[block.name] ?? {}).forEach(([n, p]) => {
		if (n in block.states) return;
		block.states[n] = readBlockStateProperty(p);
		hasBeenUpdated = true;
	});
	schema.removedProperties?.[block.name]?.forEach(n => {
		if (!(n in block.states)) return;
		delete block.states[n];
		hasBeenUpdated = true;
	});
	Object.entries(schema.remappedPropertyValues?.[block.name] ?? {}).forEach(([blockStateName, remappingName]) => {
		if (!(blockStateName in block.states)) return;
		const remappings = schema.remappedPropertyValuesIndex?.[remappingName];
		if (!remappings) return;
		const current = block.states[blockStateName];
		const remapping = remappings.find(r => current == readBlockStateProperty(r.old));
		if (!remapping) return;
		block.states[blockStateName] = readBlockStateProperty(remapping.new);
		hasBeenUpdated = true;
	});
	Object.entries(schema.renamedProperties?.[block.name] ?? {}).forEach(([oldName, newName]) => {
		if (!(oldName in block.states)) return;
		block.states[newName] = block.states[oldName];
		delete block.states[oldName];
		hasBeenUpdated = true;
	});
	if (block.name in (schema.flattenedProperties ?? {})) {
		if (applyFlattenedProperty(schema.flattenedProperties[block.name], block)) {
			hasBeenUpdated = true;
		}
	}
	if (block.name in (schema.renamedIds ?? {})) {
		block.name = schema.renamedIds[block.name];
		hasBeenUpdated = true;
	}
	block.version = schemaVersion;
	return hasBeenUpdated;
}
