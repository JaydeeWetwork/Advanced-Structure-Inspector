/**
 * Idempotent seed of default categories / entries / features into in-memory maps.
 */

import { buildSeedTaxonomy } from "../data/taxonomy.js";

/**
 * @param {{
 *   categories: Map<string, object>,
 *   catalogEntries: Map<string, object>,
 *   features: Map<string, object>,
 *   applied: Set<string>,
 *   skipApplied: boolean
 * }} ctx
 * @returns {{ categories: object[], entries: object[], features: object[], applied: Set<string> }}
 */
export function applySeedTaxonomy(ctx) {
	const seed = buildSeedTaxonomy();
	const applied = ctx.applied;
	const skipApplied = ctx.skipApplied;
	const newCats = [];
	const newEntries = [];
	const newFeats = [];
	const catBySlug = new Map([...ctx.categories.values()].map(c => [c.slug, c]));

	for (const cat of seed.categories) {
		const key = `cat:${cat.slug}`;
		if (catBySlug.has(cat.slug) || ctx.categories.has(cat.id)) {
			applied.add(key);
			continue;
		}
		if (skipApplied && applied.has(key)) continue;
		ctx.categories.set(cat.id, { ...cat });
		newCats.push(cat);
		applied.add(key);
	}

	for (const ent of seed.entries) {
		const parent = ctx.categories.get(ent.categoryId);
		const key = parent ? `ent:${parent.slug}/${ent.slug}` : `ent:${ent.slug}`;
		const exists =
			ctx.catalogEntries.has(ent.id)
			|| [...ctx.catalogEntries.values()].some(
				e => e.slug === ent.slug && e.categoryId === ent.categoryId
			);
		if (exists) {
			applied.add(key);
			continue;
		}
		if (skipApplied && applied.has(key)) continue;
		if (!ctx.categories.has(ent.categoryId)) continue;
		ctx.catalogEntries.set(ent.id, { ...ent });
		newEntries.push(ent);
		applied.add(key);
	}

	for (const feat of seed.features) {
		const key = `feat:${feat.slug}`;
		const exists =
			ctx.features.has(feat.id)
			|| [...ctx.features.values()].some(f => f.slug === feat.slug);
		if (exists) {
			applied.add(key);
			continue;
		}
		if (skipApplied && applied.has(key)) continue;
		const row = {
			...feat,
			categoryIds: feat.categoryIds.filter(id => ctx.categories.has(id))
		};
		ctx.features.set(feat.id, row);
		newFeats.push(row);
		applied.add(key);
	}

	return { categories: newCats, entries: newEntries, features: newFeats, applied };
}

/**
 * Reorder a category list in place (sortOrder 0..n).
 * @param {object[]} ordered
 * @param {string} id
 * @param {string} targetId
 * @param {"before"|"after"} place
 * @returns {boolean}
 */
export function moveCategoryInList(ordered, id, targetId, place) {
	if (!id || id === targetId) return false;
	const from = ordered.findIndex(c => c.id === id);
	const to = ordered.findIndex(c => c.id === targetId);
	if (from < 0 || to < 0) return false;
	const [item] = ordered.splice(from, 1);
	let insert = ordered.findIndex(c => c.id === targetId);
	if (insert < 0) return false;
	if (place === "after") insert += 1;
	ordered.splice(insert, 0, item);
	ordered.forEach((c, i) => {
		c.sortOrder = i;
	});
	return true;
}
