/**
 * Never-fail block appearance: unknown ids still resolve to the unit cube.
 */

/**
 * @param {string} blockName un-namespaced
 * @param {Record<string, string>} individualBlocks
 * @param {[RegExp, string][]} patterns
 * @returns {{ shape: string, fallback: boolean }}
 */
export function resolveBlockShapeName(blockName, individualBlocks, patterns) {
	const individual = individualBlocks?.[blockName];
	if (individual) return { shape: individual, fallback: false };
	const matching = patterns.find(([pattern]) => pattern.test(blockName))?.[1];
	if (matching) return { shape: matching, fallback: false };
	return { shape: "block", fallback: true };
}
