/**
 * Count entity entries in structure NBT (minecarts, armor stands, etc.).
 * Kept free of NBT library imports for easy unit testing.
 * @param {any} data root NBT
 * @returns {number}
 */
export function countStructureEntities(data) {
	const entities = data?.structure?.entities;
	if (!entities) return 0;
	if (Array.isArray(entities) || ArrayBuffer.isView(entities)) {
		return entities.length;
	}
	if (typeof entities === "object" && Array.isArray(entities.value)) {
		return entities.value.length;
	}
	return 0;
}
