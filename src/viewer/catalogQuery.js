/**
 * Catalog search + tree grouping (pure).
 */

export function contrastText(hex) {
	const h = String(hex || "").replace("#", "");
	if (h.length !== 3 && h.length !== 6) return "#0f0f0f";
	const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
	const r = parseInt(full.slice(0, 2), 16);
	const g = parseInt(full.slice(2, 4), 16);
	const b = parseInt(full.slice(4, 6), 16);
	if (![r, g, b].every(n => Number.isFinite(n))) return "#0f0f0f";
	const yiq = (r * 299 + g * 587 + b * 114) / 1000;
	return yiq >= 160 ? "#0f0f0f" : "#ffffff";
}

/**
 * @param {{
 *   structures: object[],
 *   categories: object[],
 *   entriesByCategory: (categoryId: string) => object[],
 *   catalogEntries: Map<string, object>,
 *   matchedIds: Set<string>,
 *   query: string
 * }} opts
 */
export function buildCatalogTree(opts) {
	const q = opts.query.trim().toLowerCase();
	const matched = opts.matchedIds;
	const byEntry = new Map();
	const uncategorized = [];
	for (const s of opts.structures) {
		const fn = s.entryId ? opts.catalogEntries.get(s.entryId) : null;
		if (!fn) {
			if (!q || matched.has(s.id)) uncategorized.push(s);
			continue;
		}
		if (!byEntry.has(fn.id)) byEntry.set(fn.id, []);
		byEntry.get(fn.id).push(s);
	}
	const categories = [];
	for (const category of opts.categories) {
		const catHit = q && category.name.toLowerCase().includes(q);
		const entries = [];
		for (const entry of opts.entriesByCategory(category.id)) {
			const entryHit = q && (
				entry.name.toLowerCase().includes(q)
				|| (entry.description || "").toLowerCase().includes(q)
			);
			const raw = byEntry.get(entry.id) || [];
			const structures = q && !catHit && !entryHit
				? raw.filter(s => matched.has(s.id))
				: raw;
			if (q && !catHit && !entryHit && !structures.length) continue;
			entries.push({ entry, structures });
		}
		if (q && !catHit && !entries.length) continue;
		const structureCount = entries.reduce((n, e) => n + e.structures.length, 0);
		categories.push({ category, structureCount, entries });
	}
	return {
		uncategorized: { collapsed: false, structures: uncategorized },
		categories
	};
}

export function filterFeatureIds(ids, featureMap) {
	if (!Array.isArray(ids)) return [];
	return [...new Set(ids.filter(id => featureMap.has(id)))];
}

export function fillHydratedMaps({ rows, cats, ents, feats, entries, categories, catalogEntries, features }) {
	categories.clear();
	for (const c of cats) {
		if (!c.slug) continue;
		categories.set(c.id, {
			id: c.id,
			slug: c.slug,
			name: c.name,
			description: c.description || "",
			color: c.color || "#64748b",
			sortOrder: c.sortOrder,
			collapsed: c.collapsed,
			isDefault: !!c.isDefault
		});
	}
	catalogEntries.clear();
	for (const e of ents) {
		if (!categories.has(e.categoryId)) continue;
		catalogEntries.set(e.id, {
			id: e.id,
			slug: e.slug || "",
			categoryId: e.categoryId,
			name: e.name,
			description: e.description || "",
			sortOrder: e.sortOrder,
			collapsed: e.collapsed,
			isDefault: !!e.isDefault
		});
	}
	features.clear();
	for (const f of feats) {
		features.set(f.id, {
			id: f.id,
			slug: f.slug || "",
			name: f.name,
			description: f.description || "",
			useCases: f.useCases || "",
			color: f.color || "#64748b",
			categoryIds: Array.isArray(f.categoryIds)
				? f.categoryIds.filter(id => categories.has(id))
				: [],
			sortOrder: f.sortOrder,
			isDefault: !!f.isDefault
		});
	}
	entries.clear();
	for (const row of rows) {
		const entryId =
			row.entryId && catalogEntries.has(row.entryId) ? row.entryId : null;
		entries.set(row.id, {
			id: row.id,
			name: row.name,
			sourceName: row.sourceName,
			sourceKind: row.sourceKind,
			size: row.size,
			worldOrigin: row.worldOrigin,
			paletteSize: row.paletteSize,
			blockCount: row.blockCount,
			blockNames: row.blockNames ?? [],
			entityCount: row.entityCount ?? 0,
			materials: row.materials ?? [],
			hopperStats: row.hopperStats ?? null,
			entryId,
			featureIds: filterFeatureIds(row.featureIds, features),
			acquiredMaterials: Array.isArray(row.acquiredMaterials)
				? [...row.acquiredMaterials]
				: [],
			defaultCameraPreset: row.defaultCameraPreset || "iso-north",
			userDetails: Array.isArray(row.userDetails)
				? row.userDetails.map(d => ({ ...d }))
				: [],
			creator: typeof row.creator === "string" ? row.creator : "",
			credits: typeof row.credits === "string" ? row.credits : "",
			sourceLink: typeof row.sourceLink === "string" ? row.sourceLink : "",
			addedAt: row.addedAt,
			file: row.file,
			parseError: row.parseError
		});
	}
}
