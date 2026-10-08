/**
 * Item name/tag matcher for pack-generator controls and ItemCriteriaInput.
 * Lives under pack/ so the inspector does not load makePack.
 *
 * @param {string | string[]} names
 * @param {string | string[]} [tags]
 * @returns {{ names: string[], tags: string[] }}
 */
export function createItemCriteria(names, tags = []) {
	if (!Array.isArray(names)) names = [names];
	if (!Array.isArray(tags)) tags = [tags];
	return { names, tags };
}
