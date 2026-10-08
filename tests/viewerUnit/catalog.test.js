/**
 * Unit tests for Bedrock Layers (Node --test).
 * Pure logic + lightweight mocks — no browser / WebGL required.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../..");

// Minimal DOMException for Node if missing
if (typeof globalThis.DOMException === "undefined") {
	globalThis.DOMException = class DOMException extends Error {
		constructor(message, name = "Error") {
			super(message);
			this.name = name;
		}
	};
}

const { throwIfAborted, isAbortError } = await import("../../src/viewer/abortUtil.js");
const {
	cloneBlockIndices,
	normalizeVec3,
	mergeMultiplePalettesAndIndices,
	IGNORED_BLOCKS
} = await import("../../src/viewer/paletteCore.js");
const {
	getCachedDataFile,
	clearDataFileCache,
	getCachedFileBuild,
	clearAllPreviewCaches
} = await import("../../src/viewer/previewCache.js");
const { countStructureEntities } = await import("../../src/viewer/entityCount.js");
const StructureCatalog = (await import("../../src/viewer/catalog.js")).default;

// ---- abortUtil -----------------------------------------------------------

describe("catalogRegistry", async () => {
	const {
		loadRegistry,
		DEFAULT_CATALOG_ID,
		DEFAULT_DB_NAME,
		addCatalogRecord,
		renameCatalog,
		setRegistryStorage
	} = await import("../../src/viewer/catalogRegistry.js");
	const mem = {
		_d: new Map(),
		getItem(k) {
			return this._d.has(k) ? this._d.get(k) : null;
		},
		setItem(k, v) {
			this._d.set(k, String(v));
		},
		removeItem(k) {
			this._d.delete(k);
		}
	};
	setRegistryStorage(mem);

	it("has a default named catalog", () => {
		const r = loadRegistry();
		assert.ok(r.items.length >= 1);
		assert.ok(r.items.some(i => i.id === DEFAULT_CATALOG_ID));
		assert.equal(typeof r.items[0].name, "string");
		assert.equal(DEFAULT_DB_NAME, "bedrockLayers-db-viewer");
		assert.equal(r.items.find(i => i.id === DEFAULT_CATALOG_ID).dbName, DEFAULT_DB_NAME);
	});

	it("adds and renames records in isolated storage", () => {
		const rec = addCatalogRecord("Temp farms");
		assert.equal(rec.name, "Temp farms");
		assert.match(rec.dbName, /^bLayers-catalog-/);
		const renamed = renameCatalog(rec.id, "Farm pack");
		assert.equal(renamed.name, "Farm pack");
	});
});

describe("default IndexedDB rename", async () => {
	const {
		DEFAULT_DB_NAME,
		LEGACY_DEFAULT_DB_NAME,
		PREVIOUS_DEFAULT_DB_NAME,
		canonicalCatalogDbName
	} = await import("../../src/viewer/db.js");
	const { DEFAULT_RENAME_SOURCES, planDbRename, planRenameSequence } = await import("../../src/viewer/dbMigrate.js");

	it("maps the old default names to bedrockLayers-db-viewer", () => {
		assert.equal(DEFAULT_DB_NAME, "bedrockLayers-db-viewer");
		assert.equal(LEGACY_DEFAULT_DB_NAME, "structure-db-viewer");
		assert.equal(PREVIOUS_DEFAULT_DB_NAME, "asi-db-viewer");
		assert.deepEqual(DEFAULT_RENAME_SOURCES, [PREVIOUS_DEFAULT_DB_NAME, LEGACY_DEFAULT_DB_NAME]);
		assert.equal(canonicalCatalogDbName(LEGACY_DEFAULT_DB_NAME), DEFAULT_DB_NAME);
		assert.equal(canonicalCatalogDbName(PREVIOUS_DEFAULT_DB_NAME), DEFAULT_DB_NAME);
		assert.equal(canonicalCatalogDbName("bLayers-catalog-x"), "bLayers-catalog-x");
		assert.equal(canonicalCatalogDbName("basi-catalog-x"), "bLayers-catalog-x");
	});

	it("clones only into an empty dest, and leaves a source that still has rows", () => {
		assert.deepEqual(planDbRename({ destCount: 0, sourceCount: 3 }), { clone: true, retarget: true });
		assert.deepEqual(planDbRename({ destCount: 5, sourceCount: 3 }), { clone: false, retarget: false });
		assert.deepEqual(planDbRename({ destCount: 0, sourceCount: 0 }), { clone: false, retarget: true });
		assert.deepEqual(planDbRename({ destCount: 5, sourceCount: 0 }), { clone: false, retarget: true });
	});

	it("lets the earlier default fill the shared destination", () => {
		assert.deepEqual(
			planRenameSequence(0, [
				{ name: PREVIOUS_DEFAULT_DB_NAME, count: 3 },
				{ name: LEGACY_DEFAULT_DB_NAME, count: 2 }
			]),
			[
				{ name: PREVIOUS_DEFAULT_DB_NAME, clone: true, retarget: true },
				{ name: LEGACY_DEFAULT_DB_NAME, clone: false, retarget: false }
			]
		);
		assert.deepEqual(
			planRenameSequence(4, [
				{ name: PREVIOUS_DEFAULT_DB_NAME, count: 0 },
				{ name: LEGACY_DEFAULT_DB_NAME, count: 2 }
			]),
			[
				{ name: PREVIOUS_DEFAULT_DB_NAME, clone: false, retarget: true },
				{ name: LEGACY_DEFAULT_DB_NAME, clone: false, retarget: false }
			]
		);
	});
});

describe("StructureCatalog", () => {
	it("adds, searches, and removes entries", async () => {
		const cat = new StructureCatalog();
		cat.setPersistEnabled(false);
		const file = new File([new Uint8Array([0])], "house.mcstructure");
		const e = await cat.add({
			name: "house",
			sourceName: "house.mcstructure",
			sourceKind: "mcstructure",
			size: [3, 4, 5],
			worldOrigin: null,
			paletteSize: 2,
			blockCount: 10,
			blockNames: ["stone", "dirt"],
			entityCount: 2,
			file
		});
		assert.ok(e.id);
		assert.equal(e.entryId, null);
		assert.deepEqual(e.featureIds, []);
		assert.equal(cat.list().length, 1);
		assert.equal(cat.search({ query: "stone" }).length, 1);
		assert.equal(cat.search({ query: "minecart" }).length, 0);
		assert.equal(cat.search({ query: "2" }).length, 1); // entityCount
		await cat.remove(e.id);
		assert.equal(cat.list().length, 0);
	});

	function stubFile(name) {
		return new File([new Uint8Array([0])], name);
	}

	function stubStructure(name, extra = {}) {
		return {
			name,
			sourceName: `${name}.mcstructure`,
			sourceKind: "mcstructure",
			size: [1, 1, 1],
			worldOrigin: null,
			paletteSize: 1,
			blockCount: 1,
			blockNames: ["stone"],
			entityCount: 0,
			file: stubFile(`${name}.mcstructure`),
			...extra
		};
	}

	it("supports categories: create, move, reorder, collapse, delete", async () => {
		const cat = new StructureCatalog();
		cat.setPersistEnabled(false);
		const e1 = await cat.add(stubStructure("alpha"));
		const e2 = await cat.add(stubStructure("beta", { blockNames: ["dirt"] }));

		const c1 = await cat.addCategory("Farms");
		const c2 = await cat.addCategory("Redstone");
		assert.equal(cat.listCategories().length, 2);
		assert.equal(cat.listCategories()[0].name, "Farms");
		assert.ok(c1.color);
		assert.equal(c1.description, "");

		const clocks = await cat.addCatalogEntry({ categoryId: c1.id, name: "Clocks" });
		await cat.setStructureEntry(e1.id, clocks.id);
		assert.equal(cat.get(e1.id).entryId, clocks.id);
		assert.equal(cat.get(e2.id).entryId, null);

		await cat.reorderCategory(c2.id, -1);
		assert.equal(cat.listCategories()[0].id, c2.id);
		await cat.moveCategoryTo(c2.id, c1.id, "after");
		assert.equal(cat.listCategories()[0].id, c1.id);
		assert.equal(cat.listCategories()[1].id, c2.id);

		await cat.setCategoryCollapsed(c1.id, true);
		assert.equal(cat.getCategory(c1.id).collapsed, true);

		const tree = cat.listTree();
		assert.equal(tree.uncategorized.structures.some(x => x.id === e2.id), true);
		const farm = tree.categories.find(g => g.category.id === c1.id);
		assert.ok(farm);
		assert.equal(farm.entries.length, 1);
		assert.equal(farm.entries[0].structures[0].id, e1.id);
		assert.equal(farm.category.collapsed, true);

		await cat.removeCategory(c1.id);
		assert.equal(cat.get(e1.id).entryId, null);
		assert.equal(cat.listCategories().length, 1);
		assert.equal(cat.listCatalogEntries().length, 0);
	});

	it("seeds default taxonomy and features idempotently", async () => {
		const cat = new StructureCatalog();
		cat.setPersistEnabled(false);
		const first = await cat.ensureSeedTaxonomy();
		assert.ok(first.categories >= 12);
		assert.ok(first.entries >= 70);
		assert.equal(first.features, 11);
		const circuitry = cat.listCategories().find(c => c.slug === "circuitry");
		assert.ok(circuitry);
		assert.equal(circuitry.name, "Circuitry");
		const clocks = cat.listCatalogEntries(circuitry.id).find(e => e.slug === "clocks");
		assert.ok(clocks);
		assert.equal(clocks.name, "Clocks");
		const silent = cat.listFeatures().find(f => f.slug === "silent");
		assert.ok(silent);
		assert.match(silent.description, /doesn't make noise/);
		assert.ok(silent.categoryIds.includes(circuitry.id));
		const second = await cat.ensureSeedTaxonomy();
		assert.deepEqual(second, { categories: 0, entries: 0, features: 0 });
		assert.equal(cat.listCategories().filter(c => c.slug === "circuitry").length, 1);
		assert.equal(cat.listFeatures().filter(f => f.slug === "silent").length, 1);
	});

	it("assigns features, searches by entry/feature, and cascades deletes", async () => {
		const cat = new StructureCatalog();
		cat.setPersistEnabled(false);
		await cat.ensureSeedTaxonomy();
		const circuitry = cat.listCategories().find(c => c.slug === "circuitry");
		const clocks = cat.listCatalogEntries(circuitry.id).find(e => e.slug === "clocks");
		const silent = cat.listFeatures().find(f => f.slug === "silent");
		const tileable = cat.listFeatures().find(f => f.slug === "tileable");
		const s = await cat.add(stubStructure("hopper-clock"));
		await cat.setStructureEntry(s.id, clocks.id);
		await cat.setStructureFeatures(s.id, [silent.id, tileable.id]);
		assert.equal(cat.get(s.id).featureIds.length, 2);
		assert.equal(cat.search({ query: "clocks" }).length, 1);
		assert.equal(cat.search({ query: "silent" }).length, 1);
		assert.equal(cat.getCategoryForStructure(s.id).id, circuitry.id);

		await cat.removeFeature(silent.id);
		assert.equal(cat.get(s.id).featureIds.includes(silent.id), false);
		assert.equal(cat.get(s.id).featureIds.includes(tileable.id), true);

		await cat.removeCatalogEntry(clocks.id);
		assert.equal(cat.get(s.id).entryId, null);

		const filters = cat.listCategories().find(c => c.slug === "filters");
		await cat.patchFeature(tileable.id, { categoryIds: [circuitry.id, filters.id] });
		assert.equal(cat.getFeature(tileable.id).categoryIds.length, 2);
	});

	it("treats structures without entryId as uncategorized", async () => {
		const cat = new StructureCatalog();
		cat.setPersistEnabled(false);
		await cat.ensureSeedTaxonomy();
		const s = await cat.add(stubStructure("legacy"));
		const tree = cat.listTree();
		assert.equal(tree.uncategorized.structures.some(x => x.id === s.id), true);
	});

	it("persists acquiredMaterials, defaultCameraPreset, defaultCameraZoom, userDetails, creator meta via patch", async () => {
		const cat = new StructureCatalog();
		cat.setPersistEnabled(false);
		const file = new File([new Uint8Array([0])], "x.mcstructure");
		const e = await cat.add({
			name: "x",
			sourceName: "x.mcstructure",
			sourceKind: "mcstructure",
			size: [1, 1, 1],
			worldOrigin: null,
			paletteSize: 1,
			blockCount: 1,
			blockNames: ["stone"],
			entityCount: 0,
			materials: [
				{ id: "stone", label: "Stone", count: 10 },
				{ id: "dirt", label: "Dirt", count: 5 }
			],
			file
		});
		assert.deepEqual(e.acquiredMaterials, []);
		assert.equal(e.defaultCameraPreset, "iso-north");
		assert.equal(e.defaultCameraZoom, 1);
		assert.deepEqual(e.userDetails, []);
		assert.equal(e.creator, "");
		assert.equal(e.credits, "");
		assert.equal(e.sourceLink, "");
		await cat.patch(e.id, {
			acquiredMaterials: ["stone"],
			defaultCameraPreset: "iso-east",
			defaultCameraZoom: 1.5,
			userDetails: [{ id: "n1", text: "needs hopper" }],
			creator: "Jay",
			credits: "Team",
			sourceLink: "https://example.com/build"
		});
		const u = cat.get(e.id);
		assert.deepEqual(u.acquiredMaterials, ["stone"]);
		assert.equal(u.defaultCameraPreset, "iso-east");
		assert.equal(u.defaultCameraZoom, 1.5);
		await cat.patch(e.id, { defaultCameraZoom: 3 });
		assert.equal(cat.get(e.id).defaultCameraZoom, 2);
		await cat.patch(e.id, { defaultCameraZoom: 0 });
		assert.equal(cat.get(e.id).defaultCameraZoom, 0.5);
		assert.equal(u.userDetails.length, 1);
		assert.equal(u.userDetails[0].text, "needs hopper");
		assert.equal(u.creator, "Jay");
		assert.equal(u.credits, "Team");
		assert.equal(u.sourceLink, "https://example.com/build");
	});
});
