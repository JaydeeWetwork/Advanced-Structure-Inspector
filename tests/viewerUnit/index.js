/**
 * Unit tests for Bedrock ASI (Node --test).
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

describe("abortUtil", () => {
	it("throwIfAborted is no-op when signal is null", () => {
		assert.doesNotThrow(() => throwIfAborted(null));
		assert.doesNotThrow(() => throwIfAborted(undefined));
	});

	it("throwIfAborted throws AbortError when aborted", () => {
		const c = new AbortController();
		c.abort();
		assert.throws(() => throwIfAborted(c.signal), (e) => isAbortError(e));
	});

	it("isAbortError detects AbortError name", () => {
		assert.equal(isAbortError(new DOMException("x", "AbortError")), true);
		assert.equal(isAbortError(new Error("nope")), false);
		assert.equal(isAbortError({ name: "AbortError" }), true);
	});
});

// ---- palette / indices clone ---------------------------------------------

describe("palette.cloneBlockIndices", () => {
	it("returns independent copies of both layers", () => {
		const layer0 = new Int32Array([1, 2, 3]);
		const layer1 = new Int32Array([-1, -1, 0]);
		const [a, b] = cloneBlockIndices([layer0, layer1]);
		assert.deepEqual([...a], [1, 2, 3]);
		assert.deepEqual([...b], [-1, -1, 0]);
		a[0] = 99;
		assert.equal(layer0[0], 1, "original layer0 must not mutate");
	});

	it("handles missing indices", () => {
		const [a, b] = cloneBlockIndices(null);
		assert.equal(a.length, 0);
		assert.equal(b.length, 0);
	});
});

describe("palette.normalizeVec3", () => {
	it("normalizes Int32Array and arrays", () => {
		assert.deepEqual(normalizeVec3(new Int32Array([4, 1, 12])), [4, 1, 12]);
		assert.deepEqual(normalizeVec3([2, 3, 4]), [2, 3, 4]);
		assert.deepEqual(normalizeVec3(null), [0, 0, 0]);
	});
});

describe("palette.mergeMultiplePalettesAndIndices", () => {
	it("merges palettes and remaps indices without sharing arrays", () => {
		const p1 = {
			palette: [{ name: "stone" }, { name: "dirt" }],
			indices: [new Int32Array([0, 1, 0]), new Int32Array([-1, -1, -1])]
		};
		const p2 = {
			palette: [{ name: "dirt" }, { name: "glass" }],
			indices: [new Int32Array([0, 1]), new Int32Array([-1, -1])]
		};
		const { palette, indices } = mergeMultiplePalettesAndIndices([p1, p2]);
		assert.equal(palette.length, 3);
		const names = palette.map(b => b.name).sort();
		assert.deepEqual(names, ["dirt", "glass", "stone"]);
		// dirt in p2 should map to same merged index as dirt in p1
		const dirtI = palette.findIndex(b => b.name === "dirt");
		assert.equal(indices[0][0][1], dirtI);
		assert.equal(indices[1][0][0], dirtI);
		// mutation isolation
		indices[0][0][0] = 999;
		assert.equal(p1.indices[0][0], 0);
	});
});

describe("palette.clone used by tweak path guarantees isolation", () => {
	it("cloneBlockIndices is used so callers can mutate safely", () => {
		// Contract: tweakBlockPalette must call cloneBlockIndices (source inspection)
		const src = readFileSync(join(root, "src/viewer/palette.js"), "utf8");
		assert.match(src, /cloneBlockIndices\s*\(/);
		assert.match(src, /structuredClone/);
		assert.ok(IGNORED_BLOCKS.includes("air"));
	});
});

// ---- previewCache --------------------------------------------------------

describe("previewCache", () => {
	it("caches data file loaders (single loader call)", async () => {
		clearDataFileCache();
		let calls = 0;
		const loader = async () => {
			calls++;
			return { ok: true };
		};
		const a = await getCachedDataFile("unit-test-data", loader);
		const b = await getCachedDataFile("unit-test-data", loader);
		assert.deepEqual(a, { ok: true });
		assert.deepEqual(b, { ok: true });
		assert.equal(calls, 1);
		clearDataFileCache();
	});

	it("caches file builds by File + key", async () => {
		clearAllPreviewCaches();
		const file = new File([new Uint8Array([1, 2, 3])], "x.mcstructure");
		let calls = 0;
		const build = async () => {
			calls++;
			return { mesh: calls };
		};
		const r1 = await getCachedFileBuild(file, "k1", build);
		const r2 = await getCachedFileBuild(file, "k1", build);
		assert.equal(r1.mesh, 1);
		assert.equal(r2.mesh, 1);
		assert.equal(calls, 1);
		const r3 = await getCachedFileBuild(file, "k2", build);
		assert.equal(r3.mesh, 2);
		assert.equal(calls, 2);
	});
});

// ---- entity count --------------------------------------------------------

describe("countStructureEntities", () => {
	it("counts array entities", () => {
		assert.equal(countStructureEntities({ structure: { entities: [{}, {}, {}] } }), 3);
		assert.equal(countStructureEntities({ structure: { entities: [] } }), 0);
		assert.equal(countStructureEntities({}), 0);
	});

	it("counts NBT list wrapper { value: [...] }", () => {
		assert.equal(
			countStructureEntities({ structure: { entities: { value: [{ id: "minecart" }] } } }),
			1
		);
	});
});

// ---- catalog (in-memory, persist off) ------------------------------------

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
		assert.equal(DEFAULT_DB_NAME, "asi-db-viewer");
		assert.equal(r.items.find(i => i.id === DEFAULT_CATALOG_ID).dbName, DEFAULT_DB_NAME);
	});

	it("adds and renames records in isolated storage", () => {
		const rec = addCatalogRecord("Temp farms");
		assert.equal(rec.name, "Temp farms");
		assert.match(rec.dbName, /^basi-catalog-/);
		const renamed = renameCatalog(rec.id, "Farm pack");
		assert.equal(renamed.name, "Farm pack");
	});
});

describe("default IndexedDB rename", async () => {
	const { DEFAULT_DB_NAME, LEGACY_DEFAULT_DB_NAME } = await import("../../src/viewer/db.js");
	const {
		canonicalDefaultDbName,
		decideDefaultCatalogMigration
	} = await import("../../src/viewer/dbMigrate.js");
	const {
		DEFAULT_CATALOG_ID,
		loadRegistry,
		remapLegacyDefaultDbNames,
		saveRegistry,
		setRegistryStorage
	} = await import("../../src/viewer/catalogRegistry.js");

	it("maps the legacy default name to asi-db-viewer", () => {
		assert.equal(DEFAULT_DB_NAME, "asi-db-viewer");
		assert.equal(LEGACY_DEFAULT_DB_NAME, "structure-db-viewer");
		assert.equal(canonicalDefaultDbName(LEGACY_DEFAULT_DB_NAME), DEFAULT_DB_NAME);
		assert.equal(canonicalDefaultDbName("basi-catalog-x"), "basi-catalog-x");
	});

	it("clones only when dest is empty and source has rows; never deletes an uncloned source", () => {
		assert.deepEqual(
			decideDefaultCatalogMigration({ destCount: 0, sourceCount: 3 }),
			{ clone: true, remap: false, writeFlag: false }
		);
		assert.deepEqual(
			decideDefaultCatalogMigration({ destCount: 5, sourceCount: 3 }),
			{ clone: false, remap: false, writeFlag: false }
		);
		assert.deepEqual(
			decideDefaultCatalogMigration({ destCount: 0, sourceCount: 0 }),
			{ clone: false, remap: true, writeFlag: true }
		);
		assert.deepEqual(
			decideDefaultCatalogMigration({ destCount: 0, sourceCount: 0, legacyKnownMissing: true }),
			{ clone: false, remap: true, writeFlag: true }
		);
	});

	it("remaps registry dbName from the legacy default", () => {
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
		saveRegistry({
			activeId: DEFAULT_CATALOG_ID,
			items: [
				{
					id: DEFAULT_CATALOG_ID,
					name: "Database",
					dbName: LEGACY_DEFAULT_DB_NAME,
					updatedAt: 1
				}
			]
		});
		remapLegacyDefaultDbNames();
		assert.equal(loadRegistry().items[0].dbName, DEFAULT_DB_NAME);
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

	it("persists acquiredMaterials, defaultCameraPreset, userDetails, creator meta via patch", async () => {
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
		assert.deepEqual(e.userDetails, []);
		assert.equal(e.creator, "");
		assert.equal(e.credits, "");
		assert.equal(e.sourceLink, "");
		await cat.patch(e.id, {
			acquiredMaterials: ["stone"],
			defaultCameraPreset: "iso-east",
			userDetails: [{ id: "n1", text: "needs hopper" }],
			creator: "Jay",
			credits: "Team",
			sourceLink: "https://example.com/build"
		});
		const u = cat.get(e.id);
		assert.deepEqual(u.acquiredMaterials, ["stone"]);
		assert.equal(u.defaultCameraPreset, "iso-east");
		assert.equal(u.userDetails.length, 1);
		assert.equal(u.userDetails[0].text, "needs hopper");
		assert.equal(u.creator, "Jay");
		assert.equal(u.credits, "Team");
		assert.equal(u.sourceLink, "https://example.com/build");
	});
});

// ---- sample structure smoke (NBT parse if nbtify available) --------------

describe("sample structure parse (optional nbtify)", () => {
	const samplePath = join(root, "tests/sampleStructures/hoppers.mcstructure");

	it("parses hoppers.mcstructure NBT and counts entities", async (t) => {
		let NBT;
		try {
			// Resolved from tests/viewerUnit/node_modules when run with cwd=viewerUnit
			NBT = await import("nbtify-readonly-typeless");
		} catch {
			t.skip("nbtify-readonly-typeless not installed in this environment");
			return;
		}
		const buf = readFileSync(samplePath);
		const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
		const data = (await NBT.read(ab, { endian: "little", strict: false })).data;
		const size = normalizeVec3(data.size);
		assert.ok(size.some(n => n > 0), "structure size should be non-zero");
		assert.ok(data.structure?.palette?.default?.block_palette?.length > 0);
		const entityCount = countStructureEntities(data);
		assert.equal(typeof entityCount, "number");
		assert.ok(entityCount >= 0);
	});
});

// ---- PreviewRenderer dispose shape (static options exist) ----------------

describe("PreviewRenderer performance API", () => {
	it("exposes PERFORMANCE_OPTIONS used by viewer", async () => {
		// Cannot fully construct without three.js/DOM; verify shell + viewport contracts
		const src = readFileSync(join(root, "src/PreviewRenderer.js"), "utf8");
		assert.match(src, /static PERFORMANCE_OPTIONS/);
		assert.match(src, /dispose\s*\(/);
		assert.match(src, /PreviewContext/);
		assert.match(src, /attachEntities/);
		assert.match(src, /showEntities/);
		assert.match(src, /enterLayerMode|stayInLayerMode|leaveLayerMode/);
		assert.match(src, /ViewportSystem/);
		const vp = readFileSync(join(root, "src/viewer/systems/ViewportSystem.js"), "utf8");
		assert.match(vp, /cancelAnimationFrame/);
		assert.match(vp, /requestRender/);
	});
});

// ---- entity extract / minecart support ------------------------------------

describe("entityMeshes coordinates", async () => {
	const { structurePosToThree } = await import("../../src/viewer/entityMeshes.js");

	it("maps integer cell corners like block placement", () => {
		// Block at (4,0,5) corner translation in PreviewRenderer
		assert.deepEqual(structurePosToThree(4, 0, 5), [-16 * 4 - 16, 0, -16 * 5]);
		// Wait Z: with flip formula three_z = -16*lz, at integer 5 → -80
		// Block corner is (-80, 0, -96) for (4,0,5)... 
		// At exact integer corner, fractional uz=0, Z flip: -16*fz-16+16*(1-0) = -16*fz
		// = -16*5 = -80, NOT -96.
		// So integer corners for entities at exact integers don't match block corners due to Z flip!
		// Entity at center of block (4.5, 0, 5.5):
		const c = structurePosToThree(4.5, 0, 5.5);
		// x: -16*4 - 16 + 16*0.5 = -80 + 8 = -72  (block center X)
		// z: -16*5.5 = -88  (block center Z with flip)
		assert.equal(c[0], -72);
		assert.equal(c[1], 0);
		assert.equal(c[2], -88);
	});

	it("places fractional rail minecart near block center", () => {
		// cart local ~ (4.791, 0.35, 5.5) from rails sample
		const p = structurePosToThree(4.7914581298828125, 0.34999847412109375, 5.5);
		// Should be near (-72-ish adjusted, ~5.6, -88)
		assert.ok(Math.abs(p[0] - (-67.34)) < 0.5, `x=${p[0]}`);
		assert.ok(Math.abs(p[1] - 5.6) < 0.1, `y=${p[1]}`);
		assert.ok(Math.abs(p[2] - (-88)) < 0.1, `z=${p[2]}`);
	});

	it("sits flat carts on the rail plane, not NBT Y=0.35", async () => {
		const { minecartWorldY, RAIL_PLANE_Y, HULL_FLOOR_BOTTOM, HULL_SIT_LIFT } =
			await import("../../src/viewer/entityMeshes.js");
		const cellY = 1;
		const want = 16 * cellY + RAIL_PLANE_Y - HULL_FLOOR_BOTTOM + HULL_SIT_LIFT;
		assert.equal(minecartWorldY(1.35, 0), want);
		assert.equal(minecartWorldY(1.35, 1), want);
		assert.equal(want, 16 + 1);
		const nbtY = 16 * 1.35;
		assert.ok(want < nbtY - 4, `should drop ~5 units off NBT (${nbtY} → ${want})`);
	});

	it("keeps slope NBT Y so pitched carts follow the climb", async () => {
		const { minecartWorldY, HULL_FLOOR_BOTTOM, HULL_SIT_LIFT } = await import(
			"../../src/viewer/entityMeshes.js"
		);
		const ly = 1.55;
		assert.equal(
			minecartWorldY(ly, 5),
			16 * ly - HULL_FLOOR_BOTTOM + HULL_SIT_LIFT
		);
	});

	it("pick volume covers the hull tub including cargo", async () => {
		const { MINECART_PICK_SIZE, MINECART_PICK_CENTER } = await import(
			"../../src/viewer/entityMeshes.js"
		);
		assert.deepEqual(MINECART_PICK_SIZE, [20, 15, 16]);
		const y0 = MINECART_PICK_CENTER[1] - MINECART_PICK_SIZE[1] / 2;
		const y1 = MINECART_PICK_CENTER[1] + MINECART_PICK_SIZE[1] / 2;
		assert.ok(y0 <= 0.5, `pick bottom ${y0} should include floor`);
		assert.ok(y1 >= 14, `pick top ${y1} should include cargo`);
	});
});

describe("inspect pick (first classified hit)", async () => {
	const inspectMod = await import("../../src/viewer/systems/InspectRaycaster.js");
	const InspectRaycaster = inspectMod.default;

	it("does not export slack / chooseInspectHit", () => {
		assert.equal(inspectMod.chooseInspectHit, undefined);
		assert.equal(inspectMod.ENTITY_PICK_SLACK, undefined);
	});

	it("returns miss when the raycaster is not initialized", () => {
		const picker = new InspectRaycaster({
			canvas: null,
			camera: null,
			scene: null,
			layers: null,
			selectedLayer: null,
			inspectIndex: null,
			blockPalette: null
		});
		assert.deepEqual(picker.pickAtClient(0, 0), { kind: "miss" });
	});
});

describe("partitionTemplateFaces", async () => {
	const { partitionTemplateFaces } = await import("../../src/viewer/systems/BlockGeoSystem.js");

	it("splits doubleSide cards from volumetric faces", () => {
		const faces = [
			{ normal: [0, 1, 0] },
			{ normal: [1, 0, 0], doubleSide: true },
			{ normal: [0, 0, 1], doubleSide: false }
		];
		const { volume, cards } = partitionTemplateFaces(faces);
		assert.equal(volume.length, 2);
		assert.equal(cards.length, 1);
		assert.equal(cards[0].normal[0], 1);
	});

	it("treats empty/missing templates as no geos", () => {
		assert.deepEqual(partitionTemplateFaces(null), { volume: [], cards: [] });
		assert.deepEqual(partitionTemplateFaces([]), { volume: [], cards: [] });
	});
});

describe("scanStructureBlocks", async () => {
	const { scanStructureBlocks } = await import("../../src/viewer/systems/BlockGeoSystem.js");

	it("collects positions and skips lights when collectLights is false", () => {
		const size = [2, 1, 1];
		const indices = [new Int32Array([0, 0]), new Int32Array([-1, -1])];
		const palette = [{ name: "stone" }, { name: "air" }];
		const templates = [[{}], null];
		const { blockPositions, pointLights } = scanStructureBlocks({
			structureSize: size,
			blockIndices: indices,
			polyMeshTemplatePalette: templates,
			blockPalette: palette,
			collectLights: false,
			pointLightDefs: { torch: 0xffaa00 }
		});
		assert.equal(blockPositions[0]?.length, 2);
		assert.equal(pointLights.length, 0);
	});

	it("collects point lights when enabled", () => {
		const size = [1, 1, 1];
		const indices = [new Int32Array([0]), new Int32Array([-1])];
		const palette = [{ name: "torch" }];
		const templates = [[{}]];
		const { pointLights } = scanStructureBlocks({
			structureSize: size,
			blockIndices: indices,
			polyMeshTemplatePalette: templates,
			blockPalette: palette,
			collectLights: true,
			pointLightDefs: { torch: 0xffaa00 },
			defaultLightIntensity: 50
		});
		assert.equal(pointLights.length, 1);
		assert.equal(pointLights[0].intensity, 50);
		assert.equal(pointLights[0].col, 0xffaa00);
	});
});

describe("layerVisibility", async () => {
	const { isOnActiveLayer, allowedLayerYs } = await import("../../src/viewer/layerVisibility.js");

	it("treats null selected as all layers visible", () => {
		assert.equal(isOnActiveLayer(0, null), true);
		assert.equal(isOnActiveLayer(99, null), true);
		assert.equal(allowedLayerYs(null), null);
	});

	it("includes selected and floor Y-1 when selected > 0", () => {
		assert.equal(isOnActiveLayer(3, 3), true);
		assert.equal(isOnActiveLayer(2, 3), true);
		assert.equal(isOnActiveLayer(1, 3), false);
		assert.equal(isOnActiveLayer(0, 0), true);
		assert.equal(isOnActiveLayer(-1, 0), false);
		const ys = allowedLayerYs(3);
		assert.ok(ys.has(3) && ys.has(2) && ys.size === 2);
	});
});

describe("preview systems", async () => {
	const {
		disposeObject3D,
		clearChildren,
		PreviewResourcePool,
		entityStructureLayer,
		PreviewContext,
		FlyController
	} = await import("../../src/viewer/systems/index.js");
	const { PreviewSessionManager } = await import("../../src/viewer/api/previewSession.js");

	it("entityStructureLayer floors continuous Y", () => {
		assert.equal(entityStructureLayer([0, 3.35, 0]), 3);
		assert.equal(entityStructureLayer([0, 0, 0]), 0);
		assert.equal(entityStructureLayer(null), 0);
	});

	it("PreviewContext + FlyController construct without host getters", () => {
		const ctx = new PreviewContext();
		assert.equal(ctx.isDisposed(), false);
		ctx.markDisposed();
		assert.equal(ctx.isDisposed(), true);
		const fly = new FlyController(new PreviewContext());
		assert.equal(fly.isActive, false);
		assert.equal(typeof fly.tick, "function");
	});

	it("PreviewResourcePool marks own mats/maps shared", () => {
		const pool = new PreviewResourcePool();
		const fakeMat = { id: "reg" };
		const fakeMap = { id: "atlas" };
		pool.regularMat = fakeMat;
		pool.atlasTexture = fakeMap;
		assert.equal(pool.isSharedMaterial(fakeMat), true);
		assert.equal(pool.isSharedMap(fakeMap), true);
		assert.equal(pool.isSharedMaterial({}), false);
		const policy = pool.disposePolicy();
		assert.equal(policy.isSharedMaterial(fakeMat), true);
	});

	it("PreviewResourcePool caches volume and card geos separately", () => {
		const pool = new PreviewResourcePool();
		const volume = { id: "vol" };
		const cards = { id: "cards" };
		const other = { id: "other" };
		const geos = pool.getOrCreateGeos(3, () => ({ volume, cards }));
		assert.equal(pool.getOrCreateGeos(3, () => ({ volume: other, cards: other })), geos);
		assert.equal(pool.isSharedGeometry(volume), true);
		assert.equal(pool.isSharedGeometry(cards), true);
		assert.equal(pool.isSharedGeometry(other), false);
	});

	it("PreviewSessionManager parks and restores order", () => {
		// Minimal DOM stubs (node unit tests have no document)
		const makeEl = (tag = "div") => {
			const children = [];
			const attrs = {};
			const el = {
				tagName: tag.toUpperCase(),
				className: "",
				hidden: false,
				dataset: {},
				children,
				style: {},
				classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
				setAttribute(k, v) {
					attrs[k] = v;
				},
				getAttribute(k) {
					return attrs[k] ?? null;
				},
				querySelector(sel) {
					if (sel === ".previewCont") {
						return children.find(c => c.className === "previewCont") || null;
					}
					if (sel === "lil-gui") return null;
					return null;
				},
				querySelectorAll(sel) {
					const one = this.querySelector(sel);
					return one ? [one] : [];
				},
				appendChild(c) {
					children.push(c);
					c._parent = el;
					return c;
				},
				removeChild(c) {
					const i = children.indexOf(c);
					if (i >= 0) children.splice(i, 1);
				},
				replaceChildren(...nodes) {
					children.length = 0;
					for (const n of nodes) {
						children.push(n);
						n._parent = el;
					}
				},
				remove() {
					if (el._parent) el._parent.removeChild(el);
				},
				get parentNode() {
					return el._parent || null;
				}
			};
			Object.defineProperty(el, "firstElementChild", {
				get() {
					return children[0] || null;
				}
			});
			return el;
		};

		const body = makeEl("body");
		const host = makeEl("div");
		host.id = "previewHost";
		body.appendChild(host);

		// Patch document for ensureStash
		const prevDoc = globalThis.document;
		globalThis.document = {
			body,
			createElement: t => makeEl(t),
			getElementById: () => null
		};

		try {
			const sm = new PreviewSessionManager({
				maxParked: 2,
				getPreviewHost: () => host,
				log: () => {}
			});
			const cont = makeEl("div");
			cont.className = "previewCont";
			host.appendChild(cont);
			const fakePreview = {
				dispose() {
					this.disposed = true;
				},
				requestRedraw() {}
			};
			sm.activePreviews = [fakePreview];
			sm.selectedId = "a";
			sm.parkCurrent("a");
			assert.equal(sm.activePreviews.length, 0);
			assert.equal(sm.cache.has("a"), true);
			assert.equal(sm.restore("a"), true);
			assert.equal(sm.activePreviews.length, 1);
			assert.equal(sm.cache.has("a"), false);
			sm.clearEverything({ resetIcons: false });
		} finally {
			if (prevDoc === undefined) delete globalThis.document;
			else globalThis.document = prevDoc;
		}
	});

	it("disposeObject3D no-ops on null", () => {
		disposeObject3D(null);
		clearChildren(null);
	});
});

describe("itemIconLoader buckets", async () => {
	// Unit-level: pure helpers via re-import of path resolution pieces.
	// Full CDN resolve needs browser Image; here we only check itemIcons map.
	const text = await import("fs").then(fs =>
		fs.readFileSync(new URL("../../src/data/itemIcons.json", import.meta.url), "utf8")
	);
	const map = JSON.parse(
		text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
	);

	it("maps filled buckets to item_texture bucket variants", () => {
		assert.equal(map.water_bucket, "bucket.2");
		assert.equal(map.lava_bucket, "bucket.3");
		assert.equal(map.powder_snow_bucket, "bucket.8");
		assert.equal(map.milk_bucket, "bucket.1");
		assert.equal(map.bucket, "bucket.0");
		assert.equal(map.tropical_fish_bucket, "bucket.6");
		assert.equal(map.axolotl_bucket, "bucket.9");
	});
});

describe("signPlacement", async () => {
	const {
		kindOfSign,
		eulerOfSign,
		placeSignFace,
		SIGN_BOARD,
		woodKind
	} = await import("../../src/viewer/signPlacement.js");

	it("classifies wall / standing / hanging from name", () => {
		assert.equal(kindOfSign("oak_wall_sign", {}), "wall");
		assert.equal(kindOfSign("minecraft:standing_sign", {}), "standing");
		assert.equal(kindOfSign("oak_hanging_sign", { facing_direction: 2 }), "hanging");
		assert.equal(woodKind("darkoak_wall_sign"), "darkoak");
		assert.equal(woodKind("oak_hanging_sign"), "oak");
	});

	it("uses hanging board at cell center, not wall plate z=15", () => {
		assert.equal(SIGN_BOARD.hanging.cz, 8);
		assert.equal(SIGN_BOARD.wall.cz, 15);
		const h = placeSignFace(
			{ x: 0, y: 0, z: 0, states: { facing_direction: 2, attached_bit: 0 } },
			"oak_hanging_sign",
			false
		);
		assert.equal(h.kind, "hanging");
		assert.ok(Math.abs(h.board.cy - 5) < 0.01, `hanging cy=${h.board.cy}`);
	});

	it("hanging attached_bit uses ground_sign_direction yaw", () => {
		const e = eulerOfSign("hanging", {
			attached_bit: 1,
			facing_direction: 0,
			ground_sign_direction: 4
		});
		assert.deepEqual(e, [0, 90, 0]);
		const wallLike = eulerOfSign("hanging", {
			attached_bit: 0,
			facing_direction: 3,
			ground_sign_direction: 0
		});
		assert.deepEqual(wallLike, [0, 180, 0]);
	});

	it("describeSignPlacement reports F/B and footer", async () => {
		const { describeSignPlacement, signDebugFooter } = await import("../../src/viewer/signPlacement.js");
		const d = describeSignPlacement(
			{ x: 2, y: 0, z: 0, states: { facing_direction: 4 } },
			"oak_wall_sign"
		);
		assert.equal(d.kind, "wall");
		assert.equal(d.facing.includes("fd=4"), true);
		assert.equal(d.front.side, -1);
		assert.equal(d.back.side, 1);
		assert.match(signDebugFooter(d, false), /^F wall fd=4/);
	});

	it("standing gsd=15 board sits between F and B", async () => {
		const { describeSignPlacement } = await import("../../src/viewer/signPlacement.js");
		const d = describeSignPlacement(
			{ x: 5, y: 0, z: 0, states: { ground_sign_direction: 15 } },
			"standing_sign"
		);
		assert.equal(d.kind, "standing");
		assert.equal(d.eulerDeg[1], 337.5);
		const [fx, , fz] = d.front.three;
		const [bx, , bz] = d.back.three;
		const [ox, , oz] = d.boardThree;
		assert.ok(ox > Math.min(fx, bx) && ox < Math.max(fx, bx), `board x ${ox} not between ${fx} ${bx}`);
		assert.ok(oz > Math.min(fz, bz) && oz < Math.max(fz, bz), `board z ${oz} not between ${fz} ${bz}`);
	});

	it("sign text matches Z-flipped block geo (16 - z)", async () => {
		const { geoPointToThree, blockVertexToThree } = await import("../../src/viewer/previewSpace.js");
		const { placeSignFace } = await import("../../src/viewer/signPlacement.js");
		const p = placeSignFace(
			{ x: 0, y: 0, z: 0, states: { facing_direction: 2 } },
			"oak_wall_sign",
			false
		);
		const flipped = geoPointToThree(0, 0, 0, 8, 8.125, p.localZ);
		const unflipped = blockVertexToThree(0, 0, 0, 8, 8.125, p.localZ);
		assert.deepEqual([p.tx, p.ty, p.tz], flipped);
		assert.notEqual(p.tz, unflipped[2]);
	});

	it("wall front is geo -Z (side -1) not isBack", async () => {
		const { SIGN_BOARD, signFaceLocalOffset } = await import("../../src/viewer/signPlacement.js");
		const f = signFaceLocalOffset(SIGN_BOARD.wall, false);
		const b = signFaceLocalOffset(SIGN_BOARD.wall, true);
		assert.equal(f.side, -1);
		assert.equal(b.side, 1);
		assert.ok(f.z < SIGN_BOARD.wall.cz - 8, "wall F is on the room side of the plate");
		assert.ok(b.z > SIGN_BOARD.wall.cz - 8, "wall B is on the wall side of the plate");
	});

	it("standing face offsets sit outside plaque thickness", async () => {
		const { SIGN_BOARD, signFaceLocalOffset, signFaceLift } = await import("../../src/viewer/signPlacement.js");
		const board = SIGN_BOARD.standing;
		const f = signFaceLocalOffset(board, false);
		const bk = signFaceLocalOffset(board, true);
		const lift = signFaceLift(board);
		assert.ok(lift > board.halfT * 0.9, `lift ${lift} should clear scaled plaque`);
		assert.ok(Math.abs(f.z) > board.halfT * 0.9, `front |z| ${f.z}`);
		assert.ok(Math.abs(bk.z) > board.halfT * 0.9, `back |z| ${bk.z}`);
		assert.equal(Math.sign(f.z), 1);
		assert.equal(Math.sign(bk.z), -1);
	});

	it("at 45° three.js outward is not Ry(+45) +Z (Z-flip)", async () => {
		const { placeSignFace, boardCenterThree } = await import("../../src/viewer/signPlacement.js");
		const block = { x: 0, y: 0, z: 0, states: { ground_sign_direction: 2 } };
		const f = placeSignFace(block, "standing_sign", false);
		const mid = boardCenterThree(block, "standing_sign");
		const ox = f.tx - mid.x, oy = f.ty - mid.y, oz = f.tz - mid.z;
		const len = Math.hypot(ox, oy, oz);
		const nx = ox / len, nz = oz / len;
		const ryZx = Math.sin(45 * Math.PI / 180);
		const ryZz = Math.cos(45 * Math.PI / 180);
		const dot = nx * ryZx + nz * ryZz;
		assert.ok(Math.abs(dot) < 0.2, `outward should not match Ry(45)+Z, dot=${dot}`);
		assert.ok(Math.abs(nx + nz) < 0.05, `45° Z-flip outward ~ (a,0,-a), got ${nx},${nz}`);
	});

	it("gsd=2 cell 8,0,0 dump uses Z-flipped F/B (not plaque-plane sandwich)", async () => {
		const { describeSignPlacement, signFaceBasis } = await import("../../src/viewer/signPlacement.js");
		const d = describeSignPlacement(
			{ x: 8, y: 0, z: 0, states: { ground_sign_direction: 2 } },
			"oak_standing_sign"
		);
		assert.deepEqual(d.boardThree, [-136, 12.125, -8]);
		const [fdx, , fdz] = d.front.dBoard;
		const [bdx, , bdz] = d.back.dBoard;
		assert.ok(Math.abs(fdx + fdz) < 0.05, `F d should be (a,0,-a), got ${d.front.dBoard}`);
		assert.ok(Math.abs(bdx + bdz) < 0.05, `B d should be (-a,0,a), got ${d.back.dBoard}`);
		assert.ok(fdx > 0 && fdz < 0, `F d ${d.front.dBoard}`);
		assert.ok(bdx < 0 && bdz > 0, `B d ${d.back.dBoard}`);
		const f = signFaceBasis(
			{ tx: d.front.three[0], ty: d.front.three[1], tz: d.front.three[2] },
			{ x: d.boardThree[0], y: d.boardThree[1], z: d.boardThree[2] }
		);
		const b = signFaceBasis(
			{ tx: d.back.three[0], ty: d.back.three[1], tz: d.back.three[2] },
			{ x: d.boardThree[0], y: d.boardThree[1], z: d.boardThree[2] }
		);
		const sandwich = f.z[0] * b.z[0] + f.z[1] * b.z[1] + f.z[2] * b.z[2];
		assert.ok(sandwich < -0.99, `F/B +Z must be opposite, dot=${sandwich}`);
		assert.ok(Math.abs(f.y[1] - 1) < 0.05, `standing text up should be +Y, y=${f.y}`);
		const ryDot = f.z[0] * Math.sin(Math.PI / 4) + f.z[2] * Math.cos(Math.PI / 4);
		assert.ok(Math.abs(ryDot) < 0.2, `plane +Z must not be Ry(45)+Z, dot=${ryDot}`);
	});

	it("bakes 45° plane verts onto instance origin (not mesh quaternion)", async () => {
		const { signPlaneInstanceVerts, instanceOriginThree } = await import("../../src/viewer/signPlacement.js");
		const block = { x: 8, y: 0, z: 0, states: { ground_sign_direction: 2 } };
		const baked = signPlaneInstanceVerts(block, "oak_standing_sign", false);
		assert.deepEqual(baked.origin, instanceOriginThree(8, 0, 0));
		const [o0, o1, o2] = baked.origin;
		const world = baked.verts.map(v => [v[0] + o0, v[1] + o1, v[2] + o2]);
		const cx = (world[0][0] + world[1][0] + world[2][0] + world[3][0]) / 4;
		const cy = (world[0][1] + world[1][1] + world[2][1] + world[3][1]) / 4;
		const cz = (world[0][2] + world[1][2] + world[2][2] + world[3][2]) / 4;
		assert.ok(Math.abs(cx - baked.placed.tx) < 1e-6, `center x ${cx} vs ${baked.placed.tx}`);
		assert.ok(Math.abs(cy - baked.placed.ty) < 1e-6, `center y ${cy}`);
		assert.ok(Math.abs(cz - baked.placed.tz) < 1e-6, `center z ${cz}`);
		// width edges must follow 45° Z-flip (not world +X)
		const e0x = world[1][0] - world[0][0];
		const e0z = world[1][2] - world[0][2];
		const elen = Math.hypot(e0x, e0z);
		const ex = e0x / elen, ez = e0z / elen;
		assert.ok(Math.abs(Math.abs(ex) - Math.abs(ez)) < 0.05, `45° width along diagonal, edge=${ex},${ez}`);
		assert.ok(Math.abs(ex) > 0.5, "width must not be axis-aligned");
	});

	it("wall fd=2 instance verts sit on the Z-flipped plate, not 1 block out", async () => {
		const { signPlaneInstanceVerts, boardCenterThree } = await import("../../src/viewer/signPlacement.js");
		const block = { x: 11, y: 0, z: 5, states: { facing_direction: 2 } };
		const baked = signPlaneInstanceVerts(block, "warped_wall_sign", false);
		const mid = boardCenterThree(block, "warped_wall_sign");
		const [o0, o1, o2] = baked.origin;
		const cz = baked.verts.reduce((s, v) => s + v[2], 0) / 4 + o2;
		assert.ok(Math.abs(cz - baked.placed.tz) < 1e-6);
		assert.ok(Math.abs(baked.placed.tz - mid.z) < 2, `F should be ~1 geo from board, Δz=${baked.placed.tz - mid.z}`);
		assert.ok(baked.placed.tz > mid.z, "wall F is toward room (+Z after flip)");
		const unflippedZ = -16 * 5 - 16 + baked.placed.localZ;
		assert.ok(Math.abs(baked.placed.tz - unflippedZ) > 8, "must not use unflipped instance Z");
	});

	it("sign tweaks lift along outward and yaw spins basis", async () => {
		const { signPlaneInstanceVerts } = await import("../../src/viewer/signPlacement.js");
		const {
			applySignTweaks,
			DEFAULT_SIGN_TWEAKS,
			formatSignTweakRecipe,
			tweaksAreIdentity
		} = await import("../../src/viewer/signDebug.js");
		const block = { x: 0, y: 0, z: 0, states: { ground_sign_direction: 0 } };
		const base = signPlaneInstanceVerts(block, "standing_sign", false);
		assert.equal(tweaksAreIdentity(DEFAULT_SIGN_TWEAKS), true);
		const lifted = applySignTweaks(base, { ...DEFAULT_SIGN_TWEAKS, liftAdd: 2 });
		const dx = lifted.placed.tx - base.placed.tx;
		const dy = lifted.placed.ty - base.placed.ty;
		const dz = lifted.placed.tz - base.placed.tz;
		const dot = dx * base.basis.z[0] + dy * base.basis.z[1] + dz * base.basis.z[2];
		assert.ok(Math.abs(dot - 2) < 1e-6, `lift should move along +Z, dot=${dot}`);
		const yawed = applySignTweaks(base, { ...DEFAULT_SIGN_TWEAKS, yawDeg: 90 });
		const z = yawed.basis.z;
		assert.ok(Math.abs(z[1]) < 1e-6, "yaw keeps Z horizontal");
		assert.ok(Math.abs(Math.hypot(z[0], z[2]) - 1) < 1e-6);
		const recipe = formatSignTweakRecipe({
			tweaks: { ...DEFAULT_SIGN_TWEAKS, yawDeg: -45, note: "test" }
		});
		assert.match(recipe, /---SIGN_TWEAK---/);
		assert.match(recipe, /yawDeg: -45/);
		assert.match(recipe, /note: test/);
		const { tweaksAffectSign, setSignDebugFocus } = await import("../../src/viewer/signDebug.js");
		const wall = { x: 1, y: 0, z: 2, states: { facing_direction: 2 } };
		const oak = { x: 8, y: 0, z: 0, states: { ground_sign_direction: 2 } };
		setSignDebugFocus(null);
		assert.equal(tweaksAffectSign(oak, "oak_standing_sign", { ...DEFAULT_SIGN_TWEAKS, applyTo: "this" }), false);
		setSignDebugFocus(oak, "oak_standing_sign");
		assert.equal(tweaksAffectSign(oak, "oak_standing_sign", { ...DEFAULT_SIGN_TWEAKS, applyTo: "this" }), true);
		assert.equal(tweaksAffectSign(wall, "warped_wall_sign", { ...DEFAULT_SIGN_TWEAKS, applyTo: "this" }), false);
		assert.equal(tweaksAffectSign(wall, "warped_wall_sign", { ...DEFAULT_SIGN_TWEAKS, applyTo: "wall" }), true);
		const { subscribeSignTweaks, notifySignTweaksChanged, signTweaks } =
			await import("../../src/viewer/signDebug.js");
		let hits = 0;
		const off = subscribeSignTweaks(() => {
			hits++;
		});
		signTweaks.liftAdd = 1.25;
		notifySignTweaksChanged();
		assert.equal(hits >= 1, true, "overlay must hear slider notify");
		off();
		signTweaks.liftAdd = 0;
	});

	it("F minus B is along baked board +Z for gsd=15", async () => {
		const { placeSignFace, boardCenterThree, signBoardAxes, eulerOfSign } =
			await import("../../src/viewer/signPlacement.js");
		const block = { x: 0, y: 0, z: 0, states: { ground_sign_direction: 15 } };
		const f = placeSignFace(block, "standing_sign", false);
		const mid = boardCenterThree(block, "standing_sign");
		const axes = signBoardAxes(eulerOfSign("standing", block.states));
		const dx = f.tx - mid.x, dy = f.ty - mid.y, dz = f.tz - mid.z;
		const len = Math.hypot(dx, dy, dz);
		const nx = dx / len, ny = dy / len, nz = dz / len;
		// Block geo buffer uses z' = 16 - z, so world direction Z is negated
		assert.ok(Math.abs(nx - axes.z[0]) < 1e-6, `nx ${nx} vs ${axes.z[0]}`);
		assert.ok(Math.abs(ny - axes.z[1]) < 1e-6, `ny ${ny}`);
		assert.ok(Math.abs(nz - -axes.z[2]) < 1e-6, `nz ${nz} vs ${-axes.z[2]}`);
	});
});

describe("vanilla entity models", async () => {
	const {
		VANILLA_ENTITY_MODELS,
		vanillaModelDefFor,
		pickGeometry,
		flattenEntityCubes,
		boxUvLayout,
		cubeRotationPivot,
		transformEntityPoint
	} = await import("../../src/viewer/entityModels.js");

	const SAMPLE_GEO = {
		"minecraft:geometry": [
			{
				description: { identifier: "geometry.minecart.v1.8", texture_width: 64, texture_height: 32 },
				bones: [
					{
						name: "bottom",
						pivot: [0, 6, 0],
						cubes: [{ origin: [-10, -6.5, -1], size: [20, 16, 2], rotation: [90, 0, 0], uv: [0, 10] }]
					},
					{
						name: "left",
						parent: "bottom",
						pivot: [0, 0, 0],
						cubes: [{ origin: [-8, 2.5, 6], size: [16, 8, 2], uv: [0, 0] }]
					}
				]
			}
		]
	};

	it("maps all minecart kinds to Mojang resource_pack paths", () => {
		for (const kind of [
			"minecart",
			"hopper_minecart",
			"chest_minecart",
			"tnt_minecart",
			"command_block_minecart"
		]) {
			const d = VANILLA_ENTITY_MODELS[kind];
			assert.ok(d, kind);
			assert.match(d.entityFile, /^entity\/.*minecart/);
			assert.equal(d.geoFile, "models/entity/minecart.geo.json");
			assert.equal(d.texture, "textures/entity/minecart");
		}
		assert.equal(vanillaModelDefFor("minecraft:hopper_minecart")?.cargo, "hopper");
		assert.equal(vanillaModelDefFor("armor_stand"), null);
	});

	it("picks geometry.minecart.v1.8 when client asks for geometry.minecart", () => {
		const g = pickGeometry(SAMPLE_GEO, ["geometry.minecart", "geometry.minecart.v1.8"]);
		assert.equal(g.description.identifier, "geometry.minecart.v1.8");
	});

	it("flattens bones to cubes using box center when cube has no pivot", () => {
		const g = pickGeometry(SAMPLE_GEO, "geometry.minecart.v1.8");
		const cubes = flattenEntityCubes(g);
		assert.equal(cubes.length, 2);
		assert.deepEqual(cubes[0].size, [20, 16, 2]);
		// origin [-10,-6.5,-1] + size/2 → [0, 1.5, 0]  (NOT bone pivot [0,6,0])
		assert.deepEqual(cubes[0].pivot, [0, 1.5, 0]);
		assert.deepEqual(cubes[0].rotation, [90, 0, 0]);
		assert.deepEqual(cubes[1].uv, [0, 0]);
		assert.deepEqual(cubeRotationPivot([-10, -6.5, -1], [20, 16, 2], null), [0, 1.5, 0]);
		assert.deepEqual(cubeRotationPivot([0, 0, 0], [2, 2, 2], [1, 0, 0]), [1, 0, 0]);
	});

	it("rotates minecart floor 90° X around box center into a 20×16 tub bottom", () => {
		const g = pickGeometry(SAMPLE_GEO, "geometry.minecart.v1.8");
		const floor = flattenEntityCubes(g)[0];
		const [x, y, z] = floor.origin;
		const [w, h, d] = floor.size;
		const corners = [
			[x, y, z],
			[x + w, y, z],
			[x, y + h, z],
			[x + w, y + h, z],
			[x, y, z + d],
			[x + w, y, z + d],
			[x, y + h, z + d],
			[x + w, y + h, z + d]
		].map(p => transformEntityPoint(p, floor));
		const xs = corners.map(p => p[0]);
		const ys = corners.map(p => p[1]);
		const zs = corners.map(p => p[2]);
		assert.ok(Math.min(...xs) > -10.01 && Math.max(...xs) < 10.01, `x ${Math.min(...xs)}..${Math.max(...xs)}`);
		assert.ok(Math.min(...ys) > 0.49 && Math.max(...ys) < 2.51, `y ${Math.min(...ys)}..${Math.max(...ys)}`);
		assert.ok(Math.min(...zs) > -8.01 && Math.max(...zs) < 8.01, `z ${Math.min(...zs)}..${Math.max(...zs)}`);
	});

	it("rotates minecart back wall 270° Y around box center onto x=-10..-8", () => {
		const origin = [-17, 2.5, -1];
		const size = [16, 8, 2];
		const cube = {
			origin,
			size,
			rotation: [0, 270, 0],
			pivot: cubeRotationPivot(origin, size, null),
			boneChain: []
		};
		const [x, y, z] = origin;
		const [w, h, d] = size;
		const corners = [
			[x, y, z], [x + w, y, z], [x, y + h, z], [x + w, y + h, z],
			[x, y, z + d], [x + w, y, z + d], [x, y + h, z + d], [x + w, y + h, z + d]
		].map(p => transformEntityPoint(p, cube));
		const xs = corners.map(p => p[0]);
		const ys = corners.map(p => p[1]);
		const zs = corners.map(p => p[2]);
		assert.ok(Math.min(...xs) > -10.01 && Math.max(...xs) < -7.99, `x ${Math.min(...xs)}..${Math.max(...xs)}`);
		assert.ok(Math.min(...ys) > 2.49 && Math.max(...ys) < 10.51, `y ${Math.min(...ys)}..${Math.max(...ys)}`);
		assert.ok(Math.min(...zs) > -8.01 && Math.max(...zs) < 8.01, `z ${Math.min(...zs)}..${Math.max(...zs)}`);
	});

	it("box UV layout has six faces in texture pixels", () => {
		const uv = boxUvLayout([20, 8, 2], true);
		assert.deepEqual(uv.north.uv_size, [20, 8]);
		assert.deepEqual(uv.up.uv_size, [20, 2]);
		assert.ok(uv.west.uv[0] > 0);
	});
});

describe("minecart cargo blocks", async () => {
	const {
		CARGO_BLOCKS,
		CARGO_SCALE,
		CARGO_FLOOR_Y,
		cargoKindsNeeded,
		cargoPaletteEntries,
		placeCargoMesh,
		polyMeshTemplateToGeometry
	} = await import("../../src/viewer/entityCargo.js");

	it("maps subtypes to official palette blocks", () => {
		assert.equal(CARGO_BLOCKS.chest.name, "chest");
		assert.equal(CARGO_BLOCKS.hopper.name, "hopper");
		assert.equal(CARGO_BLOCKS.hopper.states.facing_direction, 0);
		assert.equal(CARGO_BLOCKS.tnt.name, "tnt");
		assert.equal(CARGO_BLOCKS.command.name, "command_block");
		assert.equal(CARGO_SCALE, 0.75);
		for (const b of Object.values(CARGO_BLOCKS)) {
			assert.equal(b.name.includes(":"), false, `${b.name} must be un-namespaced for blocks.json`);
		}
	});

	it("collects cargo kinds from entity identifiers", () => {
		const kinds = cargoKindsNeeded([
			{ identifier: "minecart" },
			{ identifier: "minecraft:hopper_minecart" },
			{ identifier: "chest_minecart" },
			{ identifier: "armor_stand" }
		]);
		assert.deepEqual([...kinds].sort(), ["chest", "hopper"]);
		const entries = cargoPaletteEntries([{ identifier: "tnt_minecart" }]);
		assert.equal(entries.length, 1);
		assert.equal(entries[0].kind, "tnt");
		assert.equal(entries[0].block.name, "tnt");
	});

	it("sits cargo on the hull floor at 0.75 scale", () => {
		const mesh = {
			scale: { setScalar(s) { this._s = s; } },
			position: { set(x, y, z) { this._p = [x, y, z]; } },
			frustumCulled: true
		};
		placeCargoMesh(mesh);
		assert.equal(mesh.scale._s, CARGO_SCALE);
		assert.equal(mesh.position._p[1], CARGO_FLOOR_Y);
		assert.equal(mesh.position._p[0], -8 * CARGO_SCALE);
		assert.equal(mesh.frustumCulled, false);
	});

	it("polyMeshTemplateToGeometry returns null without faces", () => {
		assert.equal(polyMeshTemplateToGeometry({}, []), null);
		assert.equal(polyMeshTemplateToGeometry({}, null), null);
	});
});

describe("itemFrameItems", async () => {
	const {
		extractItemFramePlacements,
		frameOutwardNormal,
		frameFacingEulerDeg
	} = await import("../../src/viewer/itemFrameItems.js");

	it("extracts Item from ItemFrame / GlowItemFrame block entities", () => {
		const blocks = new Map();
		blocks.set("1,0,2", {
			x: 1, y: 0, z: 2,
			name: "frame",
			states: { facing_direction: 3 },
			blockEntityId: "ItemFrame",
			itemRotation: 90,
			items: [{ name: "diamond", count: 1, slot: null, damage: 0 }]
		});
		blocks.set("0,1,0", {
			x: 0, y: 1, z: 0,
			name: "glow_frame",
			states: { facing_direction: 2 },
			blockEntityId: "GlowItemFrame",
			itemRotation: 0,
			items: [{ name: "apple", count: 1, slot: null, damage: 0 }]
		});
		blocks.set("2,0,0", {
			x: 2, y: 0, z: 0,
			name: "frame",
			states: { facing_direction: 2 },
			blockEntityId: "ItemFrame",
			itemRotation: 0,
			items: []
		});
		const pl = extractItemFramePlacements({ blocks, entities: [] });
		assert.equal(pl.length, 2);
		const d = pl.find(p => p.itemName === "diamond");
		assert.ok(d);
		assert.equal(d.facing, 3);
		assert.equal(d.itemRotationDeg, 90);
		assert.equal(d.glow, false);
		const a = pl.find(p => p.itemName === "apple");
		assert.ok(a);
		assert.equal(a.glow, true);
	});

	it("maps facing_direction to frame eulers and outward normals", () => {
		assert.deepEqual(frameFacingEulerDeg(2), [0, 0, 0]);
		assert.deepEqual(frameFacingEulerDeg(3), [0, 180, 0]);
		// Default north: local +Z stays +Z (BlockGeoMaker identity)
		const n2 = frameOutwardNormal(2);
		assert.ok(Math.abs(n2[2] - 1) < 1e-6, `north normal z=${n2[2]}`);
		// South: local +Z rotated 180 Y → -Z
		const n3 = frameOutwardNormal(3);
		assert.ok(Math.abs(n3[2] + 1) < 1e-6, `south normal z=${n3[2]}`);
		// Up: BlockGeoMaker [-90,0,0] → plate local +Z goes to -Y (geo)
		const n1 = frameOutwardNormal(1);
		assert.ok(Math.abs(n1[1] + 1) < 1e-6, `up normal y=${n1[1]}`);
		// Down: [90,0,0] → +Y
		const n0 = frameOutwardNormal(0);
		assert.ok(Math.abs(n0[1] - 1) < 1e-6, `down normal y=${n0[1]}`);
	});

	it("maps plate through structurePosToThree (Z-flip) so icon is not ~1 block out", async () => {
		const { structurePosToThree } = await import("../../src/viewer/entityMeshes.js");
		// Default north frame: plate at high geo Z, then mesh z' = 16 - geoZ ≈ 0.65
		const bx = 1, by = 0, bz = 2;
		const geoZ = 15.5 - 0.15;
		const [, , tz] = structurePosToThree(bx + 0.5, by + 0.5, bz + geoZ / 16);
		const cornerZ = -16 * bz - 16;
		const meshLocalZ = tz - cornerZ;
		assert.ok(meshLocalZ > 0 && meshLocalZ < 2,
			`north plate mesh-local Z should be near 0 after flip, got ${meshLocalZ}`);
		// Without Z-flip we'd land near mesh-local Z ≈ 15.35 (one block off)
		assert.ok(Math.abs(meshLocalZ - (16 - geoZ)) < 1e-6);
	});

	it("places up-facing plate near block floor (not ceiling / 1 block high)", async () => {
		const { framePlateLocalGeo } = await import("../../src/viewer/itemFrameItems.js");
		const [ux, uy, uz] = framePlateLocalGeo(1);
		// BlockGeoMaker up: plate at low Y (~0.65), not high Y (~15.35)
		assert.ok(uy < 2, `up plate geo Y should be near floor, got ${uy}`);
		assert.ok(uy > 0, `up plate geo Y should be positive, got ${uy}`);
		assert.ok(Math.abs(ux - 8) < 0.01 && Math.abs(uz - 8) < 0.01);
		const [, dy] = framePlateLocalGeo(0);
		assert.ok(dy > 14, `down plate geo Y should be near ceiling, got ${dy}`);
	});
});

describe("containerUi composter + brewing", async () => {
	const {
		resolveContainerKind,
		layoutForKind,
		readComposterFillLevel
	} = await import("../../src/viewer/containerUi.js");

	it("resolves composter and brewing kinds", () => {
		assert.equal(resolveContainerKind({ name: "composter" }), "composter");
		assert.equal(resolveContainerKind({ name: "minecraft:composter" }), "composter");
		assert.equal(resolveContainerKind({ name: "brewing_stand" }), "brewing");
		assert.equal(resolveContainerKind({ blockEntityId: "BrewingStand" }), "brewing");
		assert.equal(layoutForKind("composter").layout, "composter");
		assert.equal(layoutForKind("brewing").slotCount, 5);
	});

	it("reads Bedrock composter_fill_level 0–8", () => {
		assert.equal(readComposterFillLevel({ composter_fill_level: 0 }), 0);
		assert.equal(readComposterFillLevel({ composter_fill_level: 5 }), 5);
		assert.equal(readComposterFillLevel({ composter_fill_level: 8 }), 8);
		assert.equal(readComposterFillLevel({ level: 3 }), 3);
		assert.equal(readComposterFillLevel({}), null);
		assert.equal(readComposterFillLevel({ composter_fill_level: 99 }), 8);
	});

	it("resolves sign, lectern, redstone_wire kinds", () => {
		assert.equal(resolveContainerKind({ name: "oak_sign", blockEntityId: "Sign" }), "sign");
		assert.equal(resolveContainerKind({ name: "lectern", blockEntityId: "Lectern" }), "lectern");
		assert.equal(resolveContainerKind({ name: "redstone_wire" }), "redstone_wire");
		assert.equal(layoutForKind("sign").layout, "sign");
		assert.equal(layoutForKind("lectern").layout, "lectern");
		assert.equal(layoutForKind("redstone_wire").layout, "redstone");
	});

	it("uses 54-slot large chest layout when the pick is a paired half", async () => {
		assert.equal(
			resolveContainerKind({ name: "chest", doubleChest: { half: "left", partnerKey: "1,0,0" } }),
			"double_chest"
		);
		const lay = layoutForKind("double_chest");
		assert.equal(lay.slotCount, 54);
		assert.equal(lay.rows, 6);
		assert.equal(lay.cols, 9);
		assert.equal(lay.layout, "double_chest");
		const { fillSlots } = await import("../../src/viewer/containerUi.js");
		const slots = fillSlots(
			[
				{ name: "dirt", count: 1, slot: 0 },
				{ name: "diamond", count: 2, slot: 27 }
			],
			54
		);
		assert.equal(slots.length, 54);
		assert.equal(slots[0]?.name, "dirt");
		assert.equal(slots[27]?.name, "diamond");
		assert.equal(slots[1], null);
	});
});

describe("sign / lectern / redstone extract", async () => {
	const {
		extractSignText,
		extractLecternBook,
		extractBookPages,
		parseSignTextLines,
		readRedstoneSignal
	} = await import("../../src/viewer/inspectStructure.js");

	it("parses sign FrontText / BackText", () => {
		const sign = extractSignText({
			id: "Sign",
			FrontText: { Text: "Hello\nWorld\n\n", SignTextColor: -1 },
			BackText: { Text: "Back" },
			IsWaxed: 1
		});
		assert.ok(sign);
		assert.deepEqual(sign.front.lines, ["Hello", "World"]);
		assert.deepEqual(sign.back.lines, ["Back"]);
		assert.equal(sign.waxed, true);
	});

	it("strips section codes from sign text", () => {
		assert.deepEqual(parseSignTextLines("§cRed§r line"), ["Red line"]);
	});

	it("reads lectern book + pages", () => {
		const lec = extractLecternBook({
			id: "Lectern",
			hasBook: 1,
			page: 1,
			book: {
				Name: "minecraft:written_book",
				tag: {
					title: "Notes",
					author: "Mapmaker",
					pages: ["Page A", "Page B text"]
				}
			}
		});
		assert.equal(lec.hasBook, true);
		assert.equal(lec.page, 1);
		assert.equal(lec.book.title, "Notes");
		assert.equal(lec.book.author, "Mapmaker");
		assert.equal(lec.book.pages[1], "Page B text");
	});

	it("extractBookPages handles empty writable book", () => {
		const b = extractBookPages({ Name: "minecraft:writable_book", Count: 1 });
		assert.equal(b.itemName, "writable_book");
		assert.equal(b.pages.length, 0);
	});

	it("readRedstoneSignal clamps 0–15", () => {
		assert.equal(readRedstoneSignal({ redstone_signal: 12 }), 12);
		assert.equal(readRedstoneSignal({ redstone_signal: 0 }), 0);
		assert.equal(readRedstoneSignal({ power: 99 }), 15);
		assert.equal(readRedstoneSignal(null), null);
	});
});

describe("doubleChest", async () => {
	const {
		classifyChestPair,
		chestFacing,
		isChestBlockName
	} = await import("../../src/viewer/doubleChest.js");

	it("identifies chest block names", () => {
		assert.equal(isChestBlockName("minecraft:chest"), true);
		assert.equal(isChestBlockName("trapped_chest"), true);
		assert.equal(isChestBlockName("ender_chest"), false);
	});

	it("classifies pair offset vs facing", () => {
		const c = classifyChestPair("north", 1, 0); // pair east of north-facing → this is left
		assert.ok(c);
		assert.equal(c.half, "left");
		assert.equal(classifyChestPair("north", -1, 0).half, "right");
		assert.equal(classifyChestPair("south", -1, 0).half, "left");
		assert.equal(classifyChestPair("east", 0, 1).half, "left");
		assert.equal(classifyChestPair("west", 0, -1).half, "left");
		assert.equal(chestFacing({ "minecraft:cardinal_direction": "west" }), "west");
	});

	it("N/S double chests need preview instance X-mirror; E/W do not", async () => {
		const { doubleChestNeedsPreviewXMirror } = await import(
			"../../src/viewer/doubleChest.js"
		);
		assert.equal(
			doubleChestNeedsPreviewXMirror({
				basi_block_shape: "chest_large<textures/entity/chest/double_normal>",
				states: { "minecraft:cardinal_direction": "north" }
			}),
			true
		);
		assert.equal(
			doubleChestNeedsPreviewXMirror({
				basi_block_shape: "chest_large<textures/entity/chest/double_normal>",
				states: { "minecraft:cardinal_direction": "east" }
			}),
			false
		);
	});

	it("nbtNumber unwraps typed values", async () => {
		const { nbtNumber } = await import("../../src/viewer/doubleChest.js");
		assert.equal(nbtNumber(11), 11);
		assert.equal(nbtNumber({ value: 11 }), 11);
		assert.ok(Number.isNaN(nbtNumber(null)));
	});

	it("palette lead uses chest_large; partner is skipped", () => {
		const js = readFileSync(join(root, "src/viewer/doubleChest.js"), "utf8");
		const geo = readFileSync(join(root, "src/data/blockShapeGeos.json"), "utf8");
		assert.match(js, /chest_large</);
		assert.match(js, /chest_double_skip/);
		assert.match(js, /double_normal/);
		assert.match(geo, /"chest_large"/);
		assert.match(geo, /"box_uv"/);
		assert.match(geo, /128, 64/);
		assert.match(geo, /"size": \[30, 10, 14\]/);
		assert.doesNotMatch(geo, /sdb_chest_latch/);
		assert.doesNotMatch(js, /basi_pair_yaw/);
	});

	it("merges half inventories into 54 slots (left 0–26, right 27–53)", async () => {
		const { mergeDoubleChestInventories, largeChestTitle } = await import(
			"../../src/viewer/doubleChest.js"
		);
		const merged = mergeDoubleChestInventories(
			[{ name: "dirt", count: 1, slot: 0 }],
			[{ name: "diamond", count: 2, slot: 0 }]
		);
		assert.equal(merged.length, 2);
		assert.equal(merged.find(i => i.name === "dirt")?.slot, 0);
		assert.equal(merged.find(i => i.name === "diamond")?.slot, 27);
		const already = mergeDoubleChestInventories(
			[{ name: "stone", count: 1, slot: 40 }],
			[]
		);
		assert.equal(already[0].slot, 40);
		assert.equal(largeChestTitle("trapped_chest"), "Large Trapped Chest");
		assert.equal(largeChestTitle("minecraft:chest"), "Large Chest");
		assert.equal(largeChestTitle("oxidized_copper_chest"), "Large Oxidized Copper Chest");
	});

	it("applyDoubleChestPalette remaps pairx/pairz to left/right geos", async () => {
		const { applyDoubleChestPalette } = await import("../../src/viewer/doubleChest.js");
		const nbt = {
			size: [2, 1, 1],
			structure_world_origin: [0, 0, 0],
			structure: {
				palette: {
					default: {
						block_position_data: {
							0: { block_entity_data: { id: "Chest", x: 0, y: 0, z: 0, pairx: 1, pairz: 0 } },
							1: { block_entity_data: { id: "Chest", x: 1, y: 0, z: 0, pairx: 0, pairz: 0 } }
						}
					}
				}
			}
		};
		const palette = [{ name: "minecraft:chest", states: { "minecraft:cardinal_direction": "north" } }];
		const indices = [new Int32Array([0, 0]), new Int32Array([-1, -1])];
		const r = applyDoubleChestPalette(nbt, palette, indices);
		assert.equal(r.pairedCount, 2);
		assert.equal(r.palette[r.indices[0][0]].states.basi_chest_half, "left");
		assert.equal(r.palette[r.indices[0][1]].states.basi_chest_half, "right");
		assert.match(r.palette[r.indices[0][0]].basi_block_shape, /chest_large</);
		assert.equal(r.palette[r.indices[0][1]].basi_block_shape, "chest_double_skip");
	});
});

describe("minecart pitch", async () => {
	const { pitchFromRailDirection, structurePosToThree } = await import(
		"../../src/viewer/entityMeshes.js"
	);

	it("maps structure pos", () => {
		const c = structurePosToThree(4.5, 0, 5.5);
		assert.equal(c[0], -72);
		assert.equal(c[2], -88);
	});

	it("pitches on ascending rails", () => {
		assert.notEqual(pitchFromRailDirection(2, 0), 0);
		assert.equal(pitchFromRailDirection(0, 0), 0);
	});
});

describe("inventory extract (minecarts / nbtify shapes)", async () => {
	const {
		extractInventoryItems,
		normalizeItemStack,
		asList
	} = await import("../../src/viewer/inspectStructure.js");

	it("links paired chests and merges 54-slot items on the inspect index", async () => {
		const { buildInspectIndex } = await import("../../src/viewer/inspectStructure.js");
		const data = {
			size: [2, 1, 1],
			structure_world_origin: [10, 64, 20],
			structure: {
				block_indices: [new Int32Array([0, 0]), new Int32Array([-1, -1])],
				palette: {
					default: {
						block_palette: [
							{ name: "minecraft:chest", states: { "minecraft:cardinal_direction": "north" } }
						],
						block_position_data: {
							0: {
								block_entity_data: {
									id: "Chest",
									x: 10,
									y: 64,
									z: 20,
									pairx: 11,
									pairz: 20,
									Items: [{ Name: "minecraft:dirt", Count: 1, Slot: 0 }]
								}
							},
							1: {
								block_entity_data: {
									id: "Chest",
									x: 11,
									y: 64,
									z: 20,
									pairx: 10,
									pairz: 20,
									Items: [{ Name: "minecraft:diamond", Count: 2, Slot: 0 }]
								}
							}
						}
					}
				},
				entities: []
			}
		};
		const idx = buildInspectIndex(data);
		const left = idx.blocks.get("0,0,0");
		const right = idx.blocks.get("1,0,0");
		assert.equal(left.doubleChest.half, "left");
		assert.equal(right.doubleChest.half, "right");
		assert.equal(left.doubleItems.find(i => i.name === "dirt")?.slot, 0);
		assert.equal(left.doubleItems.find(i => i.name === "diamond")?.slot, 27);
		assert.equal(right.doubleItems.find(i => i.name === "diamond")?.slot, 27);
		assert.equal(left.blockEntity, undefined);
		assert.equal("raw" in left, false);
	});

	it("asList handles arrays, value wrappers, and numeric-key maps", () => {
		assert.equal(asList([{ Name: "a" }]).length, 1);
		assert.equal(asList({ value: [{ Name: "a" }, { Name: "b" }] }).length, 2);
		assert.equal(asList({ 0: { Name: "dirt" }, 1: { Name: "stone" } }).length, 2);
		assert.equal(asList({ value: { 0: { Name: "x" } } }).length, 1);
	});

	it("normalizeItemStack reads nested Item and string Name", () => {
		const a = normalizeItemStack({
			Slot: 2,
			Name: "minecraft:diamond",
			Count: 16n
		});
		assert.equal(a.name, "diamond");
		assert.equal(a.count, 16);
		assert.equal(a.slot, 2);

		const b = normalizeItemStack({
			Slot: 0,
			Item: { Name: "minecraft:hopper", Count: 1 }
		});
		assert.equal(b.name, "hopper");
		assert.equal(b.slot, 0);

		// Numeric id alone is not a valid item name
		assert.equal(normalizeItemStack({ id: 3, Count: 1 }), null);
	});

	it("extracts hopper_minecart Items (array form)", () => {
		const items = extractInventoryItems({
			identifier: "minecraft:hopper_minecart",
			Items: [
				{ Slot: 0, Name: "minecraft:iron_ingot", Count: 32 },
				{ Slot: 3, Name: "minecraft:undyed_shulker_box", Count: 1 }
			]
		});
		assert.equal(items.length, 2);
		assert.equal(items[0].name, "iron_ingot");
		assert.equal(items[0].slot, 0);
		assert.equal(items[1].name, "undyed_shulker_box");
	});

	it("extracts chest_minecart Items (numeric-key map form)", () => {
		const items = extractInventoryItems({
			identifier: "minecraft:chest_minecart",
			Items: {
				0: { Slot: 0, Name: "minecraft:cobblestone", Count: 64 },
				5: { Slot: 5, name: "minecraft:chest", Count: 2 }
			}
		});
		assert.equal(items.length, 2);
		assert.equal(items[0].name, "cobblestone");
		assert.equal(items[1].slot, 5);
	});

	it("extracts nested Item wrapper stacks", () => {
		const items = extractInventoryItems({
			Items: [
				{ Slot: 1, Item: { Name: "minecraft:arrow", Count: 8 } }
			]
		});
		assert.equal(items.length, 1);
		assert.equal(items[0].name, "arrow");
		assert.equal(items[0].count, 8);
		assert.equal(items[0].slot, 1);
	});
});

describe("entityExtract", async () => {
	const {
		extractPreviewEntities,
		extractRenderableEntities,
		entityMeshKind,
		normalizeEntityId
	} = await import("../../src/viewer/entityExtract.js");

	it("normalizes identifiers and mesh kinds", () => {
		assert.equal(normalizeEntityId("minecraft:hopper_minecart"), "hopper_minecart");
		assert.equal(entityMeshKind("minecraft:minecart"), "minecart");
		assert.equal(entityMeshKind("hopper_minecart"), "hopper_minecart");
		assert.equal(entityMeshKind("chest_minecart"), "chest_minecart");
		assert.equal(entityMeshKind("tropicalfish"), null);
	});

	it("reads Items from hopper_minecart entities", () => {
		const data = {
			structure_world_origin: [0, 0, 0],
			structure: {
				entities: [
					{
						identifier: "minecraft:hopper_minecart",
						Pos: [1.5, 0.35, 2.5],
						Rotation: [0, 0],
						Items: [
							{ Slot: 0, Name: "minecraft:gold_ingot", Count: 5 },
							{ Slot: 4, Name: "minecraft:undyed_shulker_box", Count: 1 }
						]
					}
				]
			}
		};
		const ents = extractPreviewEntities(data);
		assert.equal(ents.length, 1);
		assert.equal(ents[0].items.length, 2);
		assert.equal(ents[0].items[0].name, "gold_ingot");
		assert.equal(ents[0].items[1].name, "undyed_shulker_box");
	});

	it("converts world Pos to structure-local using origin", () => {
		const data = {
			structure_world_origin: new Int32Array([-74, -60, -108]),
			structure: {
				entities: [
					{
						identifier: "minecraft:minecart",
						Pos: { 0: -67.5, 1: -59.65, 2: -102.5 },
						Rotation: { 0: 90, 1: 0 }
					},
					{
						identifier: "minecraft:item",
						Pos: { 0: 0, 1: 0, 2: 0 },
						Rotation: { 0: 0, 1: 0 }
					}
				]
			}
		};
		const all = extractPreviewEntities(data);
		assert.equal(all.length, 2);
		const cart = all[0];
		assert.equal(cart.identifier, "minecart");
		assert.ok(Math.abs(cart.pos[0] - 6.5) < 0.01);
		assert.ok(Math.abs(cart.pos[1] - 0.35) < 0.01);
		assert.ok(Math.abs(cart.pos[2] - 5.5) < 0.01);
		assert.equal(cart.yawDeg, 90);

		const renderable = extractRenderableEntities(data);
		assert.equal(renderable.length, 1);
		assert.equal(renderable[0].identifier, "minecart");
	});

	it("reads Float32Array Pos from nbtify-style entities", () => {
		const data = {
			structure_world_origin: new Int32Array([0, 0, 0]),
			structure: {
				entities: [
					{
						identifier: "minecraft:hopper_minecart",
						Pos: new Float32Array([1.5, 0.5, 2.5]),
						Rotation: new Float32Array([45, 0])
					}
				]
			}
		};
		const [ent] = extractRenderableEntities(data);
		assert.ok(ent);
		assert.equal(ent.identifier, "hopper_minecart");
		assert.deepEqual(ent.pos.map(n => +n.toFixed(2)), [1.5, 0.5, 2.5]);
		assert.equal(ent.yawDeg, 45);
	});

	it("finds all subtypes on NSEW + sloped rails in minecarts.mcstructure", async (t) => {
		let NBT;
		try {
			NBT = await import("nbtify-readonly-typeless");
		} catch {
			t.skip("nbtify not available");
			return;
		}
		const p = join(root, "tests/sampleStructures/minecarts.mcstructure");
		if (!existsSync(p)) {
			t.skip("minecarts.mcstructure not generated");
			return;
		}
		const buf = readFileSync(p);
		const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
		const data = (await NBT.read(ab, { endian: "little", strict: false })).data;
		const carts = extractRenderableEntities(data);
		const byKind = {};
		for (const c of carts) {
			byKind[c.identifier] = (byKind[c.identifier] || 0) + 1;
		}
		for (const kind of [
			"minecart",
			"chest_minecart",
			"hopper_minecart",
			"tnt_minecart",
			"command_block_minecart"
		]) {
			assert.ok((byKind[kind] || 0) >= 2, `need ≥2 ${kind}, got ${byKind[kind] || 0}`);
		}
		const yaws = new Set(carts.map(c => ((c.yawDeg % 360) + 360) % 360));
		assert.ok(yaws.has(0), "south yaw 0");
		assert.ok(yaws.has(90), "west yaw 90");
		assert.ok(yaws.has(180), "north yaw 180");
		assert.ok(yaws.has(270), "east yaw -90 → 270");

		const pal = data.structure.palette.default.block_palette;
		const dirs = new Set();
		for (const b of pal) {
			const n = String(b.name || "").replace(/^minecraft:/, "");
			if (!n.includes("rail")) continue;
			const d = b.states?.rail_direction;
			if (d != null) dirs.add(Number(d));
		}
		for (let d = 0; d <= 5; d++) {
			assert.ok(dirs.has(d), `missing rail_direction ${d}`);
		}

		const hopper = carts.find(c => c.identifier === "hopper_minecart" && (c.items?.length || 0) > 0);
		assert.ok(hopper, "hopper minecart should carry items for inspect");
	});

	it("finds minecarts in rails.mcstructure sample", async (t) => {
		let NBT;
		try {
			NBT = await import("nbtify-readonly-typeless");
		} catch {
			t.skip("nbtify not available");
			return;
		}
		const buf = readFileSync(join(root, "tests/sampleStructures/rails.mcstructure"));
		const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
		const data = (await NBT.read(ab, { endian: "little", strict: false })).data;
		const carts = extractRenderableEntities(data);
		assert.ok(carts.length >= 1, "expected minecarts in rails sample");
		assert.ok(carts.every(c => c.identifier === "minecart"));
		const size = [...data.size];
		for (const c of carts) {
			assert.ok(c.pos[0] > -1 && c.pos[0] < size[0] + 1);
			assert.ok(c.pos[2] > -1 && c.pos[2] < size[2] + 1);
		}
	});
});

// ---- material list grouping ----------------------------------------------

describe("materialList grouping", async () => {
	const {
		blockToMaterial,
		buildMaterialListFromNbt,
		formatMaterialLabel,
		getStackSize,
		partitionCount,
		formatPartition
	} = await import("../../src/viewer/materialList.js");

	it("groups powered/unpowered repeater and comparator", () => {
		assert.equal(blockToMaterial("unpowered_repeater")?.material, "repeater");
		assert.equal(blockToMaterial("powered_repeater")?.material, "repeater");
		assert.equal(blockToMaterial("unpowered_comparator")?.material, "comparator");
		assert.equal(blockToMaterial("powered_comparator")?.material, "comparator");
	});

	it("groups lit/unlit redstone torch", () => {
		assert.equal(blockToMaterial("unlit_redstone_torch")?.material, "redstone_torch");
		assert.equal(blockToMaterial("lit_redstone_torch")?.material, "redstone_torch");
		assert.equal(blockToMaterial("redstone_torch")?.material, "redstone_torch");
	});

	it("groups lit furnaces and redstone ore", () => {
		assert.equal(blockToMaterial("lit_furnace")?.material, "furnace");
		assert.equal(blockToMaterial("lit_redstone_ore")?.material, "redstone_ore");
	});

	it("counts only source water, not flowing or waterlogged layer", async () => {
		const { isCountableLiquid, blockToMaterial, buildMaterialListFromNbt } =
			await import("../../src/viewer/materialList.js");
		assert.equal(isCountableLiquid("flowing_water", { name: "flowing_water" }, 0), false);
		assert.equal(isCountableLiquid("water", { states: { liquid_depth: 0 } }, 0), true);
		assert.equal(isCountableLiquid("water", { states: { liquid_depth: 7 } }, 0), false);
		assert.equal(isCountableLiquid("water", { states: { liquid_depth: 0 } }, 1), false);
		assert.equal(blockToMaterial("water", { states: { liquid_depth: 3 } }, 0), null);
		assert.equal(blockToMaterial("water", { states: { liquid_depth: 0 } }, 0)?.material, "water_bucket");

		const data = {
			structure: {
				palette: {
					default: {
						block_palette: [
							{ name: "minecraft:water", states: { liquid_depth: 0 } },
							{ name: "minecraft:water", states: { liquid_depth: 5 } },
							{ name: "minecraft:flowing_water", states: {} },
							{ name: "minecraft:stone", states: {} }
						]
					}
				},
				block_indices: [
					// layer0: source, flowing-level, flowing id, stone
					new Int32Array([0, 1, 2, 3]),
					// layer1 waterlog-style source — must NOT count
					new Int32Array([0, -1, -1, -1])
				]
			}
		};
		const list = buildMaterialListFromNbt(data);
		const water = list.find(r => r.id === "water_bucket");
		const stone = list.find(r => r.id === "stone");
		assert.equal(water?.count, 1, "only one source water");
		assert.equal(stone?.count, 1);
	});

	it("uses correct max stack sizes", () => {
		assert.equal(getStackSize("stone"), 64);
		assert.equal(getStackSize("ender_pearl"), 16);
		assert.equal(getStackSize("oak_sign"), 16);
		assert.equal(getStackSize("diamond_sword"), 1);
		assert.equal(getStackSize("water_bucket"), 1);
		assert.equal(getStackSize("bucket"), 16);
		assert.equal(getStackSize("minecart"), 1);
		assert.equal(getStackSize("white_bed"), 1);
	});

	it("partitions 64-stack into shulkers + stacks + loose", () => {
		// 1728 = 1 full shulker of 64s
		assert.deepEqual(partitionCount(1728, 64), {
			stackSize: 64, shulkers: 1, stacks: 0, loose: 0, total: 1728
		});
		// 100 = 1 stack + 36
		assert.deepEqual(partitionCount(100, 64), {
			stackSize: 64, shulkers: 0, stacks: 1, loose: 36, total: 100
		});
		// 27*64 + 5 = 1 shulker + 5 loose
		assert.deepEqual(partitionCount(27 * 64 + 5, 64), {
			stackSize: 64, shulkers: 1, stacks: 0, loose: 5, total: 27 * 64 + 5
		});
		// 28*64 = 1 shulker + 1 stack
		assert.deepEqual(partitionCount(28 * 64, 64), {
			stackSize: 64, shulkers: 1, stacks: 1, loose: 0, total: 28 * 64
		});
	});

	it("partitions 16-stack and unstackable for shulkers", () => {
		// 27 * 16 = 1 shulker of ender pearls
		assert.deepEqual(partitionCount(27 * 16, 16), {
			stackSize: 16, shulkers: 1, stacks: 0, loose: 0, total: 432
		});
		// 30 pearls = 1 stack + 14
		assert.deepEqual(partitionCount(30, 16), {
			stackSize: 16, shulkers: 0, stacks: 1, loose: 14, total: 30
		});
		// 30 swords = 1 shulker + 3 loose (stack size 1)
		assert.deepEqual(partitionCount(30, 1), {
			stackSize: 1, shulkers: 1, stacks: 0, loose: 3, total: 30
		});
	});

	it("formats partitions", () => {
		assert.equal(formatPartition(partitionCount(36, 64)), "36");
		assert.equal(formatPartition(partitionCount(100, 64)), "1 stack + 36");
		assert.equal(formatPartition(partitionCount(1728, 64)), "1 shulker");
		assert.equal(formatPartition(partitionCount(28 * 64 + 3, 64)), "1 shulker + 1 stack + 3");
	});

	it("builds descending counts from fake NBT with partitions", () => {
		const data = {
			structure: {
				palette: {
					default: {
						block_palette: [
							{ name: "minecraft:stone" },
							{ name: "minecraft:powered_repeater" },
							{ name: "minecraft:unpowered_repeater" },
							{ name: "minecraft:air" }
						]
					}
				},
				block_indices: [
					// stone x1, powered x2, unpowered x3  → stone:1, repeater:5
					new Int32Array([0, 1, 1, 2, 2, 2, -1])
				]
			}
		};
		const list = buildMaterialListFromNbt(data);
		assert.deepEqual(
			list.map(r => [r.id, r.count]),
			[
				["repeater", 5],
				["stone", 1]
			]
		);
		assert.ok(list[0].count >= list[1].count);
		assert.equal(list[0].stackSize, 64);
		assert.equal(list[0].partition, "5");
		assert.equal(formatMaterialLabel("redstone_torch"), "Redstone Torch");
	});
});

describe("double chest pair classify", async () => {
	const { classifyChestPair } = await import("../../src/viewer/doubleChest.js");

	it("maps partner direction to left/right from the front", () => {
		assert.equal(classifyChestPair("north", 1, 0)?.half, "left");
		assert.equal(classifyChestPair("north", -1, 0)?.half, "right");
		assert.equal(classifyChestPair("south", -1, 0)?.half, "left");
		assert.equal(classifyChestPair("south", 1, 0)?.half, "right");
		assert.equal(classifyChestPair("east", 0, 1)?.half, "left");
		assert.equal(classifyChestPair("east", 0, -1)?.half, "right");
		assert.equal(classifyChestPair("west", 0, -1)?.half, "left");
		assert.equal(classifyChestPair("west", 0, 1)?.half, "right");
		assert.equal(classifyChestPair("north", 0, 0), null);
		assert.equal(classifyChestPair("north", 1, 1), null);
	});
});

describe("appearance fallback", async () => {
	const { resolveBlockShapeName } = await import("../../src/viewer/appearanceFallback.js");

	it("uses table hits and unit-cube fallback", () => {
		const individual = { chest: "chest" };
		const patterns = [[/_stairs$/, "stairs"], [/_planks$/, "block"]];
		assert.deepEqual(resolveBlockShapeName("chest", individual, patterns), {
			shape: "chest",
			fallback: false
		});
		assert.deepEqual(resolveBlockShapeName("oak_stairs", individual, patterns), {
			shape: "stairs",
			fallback: false
		});
		assert.deepEqual(resolveBlockShapeName("oak_planks", individual, patterns), {
			shape: "block",
			fallback: false
		});
		assert.deepEqual(resolveBlockShapeName("completely_unknown_mod_block", individual, patterns), {
			shape: "block",
			fallback: true
		});
	});
});

describe("block upgrade apply (flatten + forgot-to-bump)", async () => {
	const {
		applyBlockUpdateSchema,
		applyFlattenedProperty,
		packedSchemaVersion,
		schemaFilenamesToApply
	} = await import("../../src/viewer/blockUpgradeApply.js");

	it("flattens concrete color into a new id", () => {
		const schema = {
			maxVersionMajor: 1,
			maxVersionMinor: 20,
			maxVersionPatch: 0,
			maxVersionRevision: 33,
			flattenedProperties: {
				"minecraft:concrete": {
					prefix: "minecraft:",
					flattenedProperty: "color",
					suffix: "_concrete"
				}
			}
		};
		const block = {
			name: "minecraft:concrete",
			states: { color: "black" },
			version: 1
		};
		assert.equal(applyBlockUpdateSchema(schema, block), true);
		assert.equal(block.name, "minecraft:black_concrete");
		assert.equal(block.states.color, undefined);
		assert.equal(block.version, packedSchemaVersion(schema));
	});

	it("applyFlattenedProperty is a no-op without the state", () => {
		const block = { name: "minecraft:concrete", states: {} };
		assert.equal(
			applyFlattenedProperty(
				{ prefix: "minecraft:", flattenedProperty: "color", suffix: "_concrete" },
				block
			),
			false
		);
		assert.equal(block.name, "minecraft:concrete");
	});

	it("applies every schema when several share the same packed version", () => {
		const packed = packedSchemaVersion({
			maxVersionMajor: 1,
			maxVersionMinor: 21,
			maxVersionPatch: 60,
			maxVersionRevision: 33
		});
		assert.equal(packed, 18168865);
		const both = schemaFilenamesToApply(
			{ [packed]: [{ filename: "0321.json" }, { filename: "0331.json" }] },
			packed
		);
		assert.deepEqual(both, ["0321.json", "0331.json"]);
		const single = schemaFilenamesToApply(
			{ [packed]: [{ filename: "only.json" }] },
			packed
		);
		assert.deepEqual(single, []);
	});
});

describe("item upgrade schemas", async () => {
	const { applyItemUpgradeSchemas, upgradeItemStack } = await import(
		"../../src/viewer/itemUpgrade.js"
	);

	it("renames ids then remaps meta", () => {
		const schemas = [
			{ renamedIds: { "minecraft:nametag": "minecraft:name_tag" } },
			{
				remappedMetas: {
					"minecraft:dye": { "15": "minecraft:bone_meal" }
				}
			}
		];
		assert.equal(applyItemUpgradeSchemas("nametag", null, schemas).name, "name_tag");
		assert.equal(applyItemUpgradeSchemas("minecraft:dye", 15, schemas).name, "bone_meal");
		const stack = upgradeItemStack({ name: "dye", count: 8, slot: 0, damage: 15, raw: {} }, schemas);
		assert.equal(stack.name, "bone_meal");
		assert.equal(stack.count, 8);
	});
});

describe("paper theme", async () => {
	const { getSavedTheme, resolvedTheme } = await import("../../src/app/theme.js");

	it("treats missing localStorage as follow-OS", () => {
		assert.equal(getSavedTheme(), null);
		assert.ok(resolvedTheme() === "light" || resolvedTheme() === "dark");
	});

	it("paper stylesheet overlays peek docks, not magenta HoloPrint chrome", () => {
		const paper = readFileSync(join(root, "src/styles/paper.css"), "utf8");
		assert.match(paper, /--basi-float-peek/);
		assert.doesNotMatch(paper, /grid-template-areas:\s*"nav preview detail"/);
		assert.doesNotMatch(paper, /#D899D8|#C57CC5|#D38AD3/);
		const html = readFileSync(join(root, "src/index.html"), "utf8");
		assert.match(html, /themeBtn/);
		assert.match(html, /styles\/paper\.css/);
		assert.doesNotMatch(html, /Hover left edge/);
	});

	it("compass yaw maps look direction to Minecraft north=-Z", async () => {
		const { facingFromLookDir } = await import("../../src/ui/cameraCompass.js");
		assert.equal(facingFromLookDir(0, 0, -1).cardinal, "N");
		assert.equal(facingFromLookDir(1, 0, 0).cardinal, "E");
		assert.equal(facingFromLookDir(0, 0, 1).cardinal, "S");
		assert.equal(facingFromLookDir(-1, 0, 0).cardinal, "W");
		assert.equal(facingFromLookDir(0, -1, 0).cardinal, "Top");
		assert.ok(Math.abs(facingFromLookDir(0, 0, -1).yaw) < 1);
		assert.ok(Math.abs(facingFromLookDir(1, 0, 0).yaw - 90) < 1);
	});

	it("camera bar pops up from the bottom on hover or C", () => {
		const html = readFileSync(join(root, "src/index.html"), "utf8");
		assert.match(html, /id="camDock"/);
		assert.match(html, /id="camCompass"/);
		assert.match(html, /basi-cam-hit/);
		assert.match(html, /basi-cam-slide/);
		const css = readFileSync(join(root, "src/viewer/viewer.css"), "utf8");
		assert.match(css, /\.basi-cam-slide/);
		assert.match(css, /translateY\(calc\(100% \+ 8px\)\)/);
		assert.match(css, /\.basi-cam-dock:hover \.basi-cam-slide/);
		const chrome = readFileSync(join(root, "src/ui/previewChrome.js"), "utf8");
		assert.match(chrome, /toggleCamDock/);
		assert.match(chrome, /e\.key === "c"/);
	});

	it("details dock scrolls as one column instead of clipping", () => {
		const html = readFileSync(join(root, "src/index.html"), "utf8");
		assert.match(html, /id="detailScroll"/);
		const css = readFileSync(join(root, "src/viewer/viewer.css"), "utf8");
		assert.match(css, /\.basi-detail-scroll/);
		assert.match(css, /overscroll-behavior:\s*contain/);
	});

	it("details dock uses structure name, Information, Materials, and feature picker", () => {
		const html = readFileSync(join(root, "src/index.html"), "utf8");
		assert.match(html, /id="detailFloatTitle"/);
		assert.match(html, />Information</);
		assert.match(html, />Materials</);
		assert.doesNotMatch(html, />Materials List</);
		assert.doesNotMatch(html, />Info</);
		assert.match(html, /id="detailAddFeatureBtn"/);
		assert.match(html, />\+ Add feature</);
		assert.match(html, /id="featureDialog"/);
		const css = readFileSync(join(root, "src/viewer/viewer.css"), "utf8");
		assert.match(css, /\.basi-feat-dialog\[open\]/);
		assert.match(css, /white-space:\s*normal/);
		const actionsAt = html.indexOf('class="basi-detail-actions"');
		const materialsAt = html.indexOf('id="materialsSection"');
		assert.ok(materialsAt > 0 && actionsAt > materialsAt, "Reload/Download/Remove should sit below Materials");
	});
});

describe("preview load cache / preload", () => {
	it("fetchers replay bytes in memory and do not copy older pins into the current cache", () => {
		const src = readFileSync(join(root, "src/fetchers.js"), "utf8");
		assert.match(src, /memoryEntries/);
		assert.match(src, /replayEntry/);
		assert.doesNotMatch(src, /previousCache/);
	});

	it("viewer preview skips hologram opacity stack and PNG-roundtrip when possible", () => {
		const preview = readFileSync(join(root, "src/viewer/structurePreview.js"), "utf8");
		assert.match(preview, /MULTIPLE_OPACITIES: partial\.MULTIPLE_OPACITIES \?\? false/);
		assert.match(preview, /SKIP_TEXTURE_CROP/);
		assert.match(preview, /atlasImageData/);
		assert.match(preview, /BUILD_ID/);
		const atlas = readFileSync(join(root, "src/TextureAtlas.js"), "utf8");
		assert.match(atlas, /packedAtlasCache/);
		assert.match(atlas, /mapPool/);
		const pool = readFileSync(join(root, "src/viewer/systems/PreviewResourcePool.js"), "utf8");
		assert.match(pool, /materialSide === "front"/);
		assert.match(pool, /getOrCreateGeos/);
		assert.doesNotMatch(pool, /getOrCreateGeo\(/);
		const renderer = readFileSync(join(root, "src/PreviewRenderer.js"), "utf8");
		assert.match(renderer, /materialSide: "front"/);
		assert.match(renderer, /logarithmicDepthBuffer: true/);
		const geoMaker = readFileSync(join(root, "src/BlockGeoMaker.js"), "utf8");
		assert.match(geoMaker, /#templateMemo/);
		const layer = readFileSync(join(root, "src/viewer/systems/LayerMeshSystem.js"), "utf8");
		assert.match(layer, /doubleChestNeedsPreviewXMirror/);
		assert.match(layer, /polyMeshTemplateToBufferGeos/);
		assert.match(layer, /getOrCreateGeos/);
		assert.doesNotMatch(layer, /paperThin/);
		assert.doesNotMatch(layer, /some\(f => f\.doubleSide\)/);
		const geoSys = readFileSync(join(root, "src/viewer/systems/BlockGeoSystem.js"), "utf8");
		assert.match(geoSys, /mirrorX/);
		assert.match(geoSys, /partitionTemplateFaces/);
	});

	it("TextureAtlas caches decoded ImageData; ResourcePackStack caches vanilla pack JSON", () => {
		const atlas = readFileSync(join(root, "src/TextureAtlas.js"), "utf8");
		assert.match(atlas, /packAssetStore\.decodeTexture/);
		const store = readFileSync(join(root, "src/viewer/appearance/PackAssetStore.js"), "utf8");
		assert.match(store, /#decoded/);
		assert.match(store, /texture_list\.json/);
		const rps = readFileSync(join(root, "src/ResourcePackStack.js"), "utf8");
		assert.match(rps, /#vanillaJsonByPath/);
		assert.match(rps, /JSON_FILES_TO_MERGE/);
		assert.doesNotMatch(rps, /sharedVanilla/);
	});

	it("entity kit fetches all kinds in parallel through ResourcePackStack", () => {
		const src = readFileSync(join(root, "src/viewer/entityGeoThree.js"), "utf8");
		assert.match(src, /Promise\.all/);
		assert.match(src, /Object\.entries\(VANILLA_ENTITY_MODELS\)/);
		assert.doesNotMatch(src, /vanillaTextureBlobCache/);
		assert.doesNotMatch(src, /cdn\.jsdelivr\.net\/gh\/Mojang\/bedrock-samples/);
	});

	it("item upgrade schemas start before atlas packing", () => {
		const src = readFileSync(join(root, "src/viewer/structurePreview.js"), "utf8");
		const start = src.indexOf("loadItemUpgradeSchemas");
		const atlas = src.indexOf("textureAtlas.makeAtlas");
		assert.ok(start > 0 && atlas > start);
		assert.doesNotMatch(src, /rps:vanilla:/);
	});

	it("product NBT.read always goes through mcstructureCodec with compression null", () => {
		const codec = readFileSync(join(root, "src/viewer/core/nbt/mcstructureCodec.js"), "utf8");
		assert.match(codec, /compression:\s*null/);
		assert.match(codec, /endian:\s*"little"/);
		assert.match(codec, /NBT\.read\(buffer,\s*MCSTRUCTURE_READ_OPTIONS\)/);
		assert.match(codec, /writeMcstructure/);
		assert.doesNotMatch(codec, /ZIP_TOO_MANY_ENTRIES/);
		const fill = readFileSync(join(root, "scripts/fill-sign-test-text.mjs"), "utf8");
		assert.match(fill, /writeMcstructure/);
		assert.doesNotMatch(fill, /NBT\.write\(root\)/);
		for (const rel of [
			"src/viewer/parseStructure.js",
			"src/viewer/structurePreview.js",
			"src/viewer/hopperStats.js",
			"src/viewer/materialList.js",
			"src/holoprint/HoloPrint.js"
		]) {
			const src = readFileSync(join(root, rel), "utf8");
			assert.match(src, /readMcstructure/);
			if (rel.endsWith("HoloPrint.js")) {
				assert.match(src, /from \"..\/viewer\/palette.js\"/);
				assert.doesNotMatch(src, /async function tweakBlockPalette/);
			}
			assert.doesNotMatch(src, /NBT\.read\(arrayBuffer\)/);
			assert.doesNotMatch(src, /NBT\.read\(ab\)/);
			assert.doesNotMatch(src, /NBT\.read\(arrayBuffer,\s*options\)/);
		}
	});
});

describe("mcstructureCodec", async () => {
	const {
		gateMcstructureBytes,
		readMcstructure,
		McstructureCodecError,
		MCSTRUCTURE_MAX_BYTES,
		isNBTValidMcstructure
	} = await import("../../src/viewer/core/nbt/mcstructureCodec.js");

	it("rejects empty, oversized, gzip, and zlib before nbtify", () => {
		assert.throws(() => gateMcstructureBytes({ byteLength: 0 }), e => e.code === "STRUCTURE_EMPTY");
		assert.throws(
			() => gateMcstructureBytes({ byteLength: MCSTRUCTURE_MAX_BYTES + 1 }),
			e => e.code === "STRUCTURE_TOO_LARGE"
		);
		const gzip = new Uint8Array([0x1f, 0x8b, 0, 0, 0, 0, 0, 0, 0, 0]);
		assert.throws(() => gateMcstructureBytes(gzip), e => e.code === "STRUCTURE_COMPRESSED");
		const zlib = new Uint8Array([0x78, 0x9c, 0, 0, 0, 0, 0, 0, 0, 0]);
		assert.throws(() => gateMcstructureBytes(zlib), e => e.code === "STRUCTURE_COMPRESSED");
	});

	it("parses sample hoppers.mcstructure", async () => {
		const p = join(root, "tests/sampleStructures/hoppers.mcstructure");
		if (!existsSync(p)) return;
		const buf = readFileSync(p);
		const { nbt, diagnostics } = await readMcstructure(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
		assert.equal(isNBTValidMcstructure(nbt), true);
		assert.ok(diagnostics.volume > 0);
	});

	it("rejects missing format_version after a compound-shaped object via layers assert", async () => {
		const { assertMcstructureLayers } = await import("../../src/viewer/core/nbt/mcstructureCodec.js");
		assert.throws(
			() => assertMcstructureLayers({ format_version: 2, size: new Int32Array([1, 1, 1]) }),
			e => e instanceof McstructureCodecError && e.code === "STRUCTURE_NBT_REJECTED"
		);
	});

	it("rejects one-layer block_indices and oversize cell product", async () => {
		const { assertMcstructureLayers } = await import("../../src/viewer/core/nbt/mcstructureCodec.js");
		const base = {
			format_version: 1,
			size: new Int32Array([1, 1, 1]),
			structure_world_origin: new Int32Array([0, 0, 0]),
			structure: { block_indices: [new Int32Array([0])] }
		};
		assert.throws(
			() => assertMcstructureLayers(base),
			e => e instanceof McstructureCodecError && e.code === "STRUCTURE_NBT_REJECTED"
		);
		assert.throws(
			() => assertMcstructureLayers({
				...base,
				size: new Int32Array([2048, 2048, 2048]),
				structure: { block_indices: [new Int32Array(0), new Int32Array(0)] }
			}),
			e => e instanceof McstructureCodecError && e.code === "STRUCTURE_NBT_REJECTED"
		);
	});

	it("rejects NBT depth over 64", async () => {
		const { assertNbtQuotas } = await import("../../src/viewer/core/nbt/mcstructureCodec.js");
		let nest = {};
		let cur = nest;
		for (let i = 0; i < 70; i++) {
			cur.child = {};
			cur = cur.child;
		}
		assert.throws(
			() => assertNbtQuotas(nest, 1),
			e => e instanceof McstructureCodecError && e.code === "STRUCTURE_NBT_REJECTED"
		);
	});

	it("does not treat uint32 length coincidence as level.dat", () => {
		const buf = new Uint8Array(16);
		buf[0] = 0x0a;
		buf[3] = 0x01;
		new DataView(buf.buffer).setUint32(4, 8, true);
		buf[8] = 0x0a;
		assert.doesNotThrow(() => gateMcstructureBytes(buf));
	});

	it("detects a real level.dat version header", () => {
		const buf = new Uint8Array(16);
		const v = new DataView(buf.buffer);
		v.setUint32(0, 8, true);
		v.setUint32(4, 8, true);
		buf[8] = 0x0a;
		assert.throws(() => gateMcstructureBytes(buf), e => e.code === "STRUCTURE_LEVEL_DAT");
	});

	it("round-trips hoppers.mcstructure through writeMcstructure", async () => {
		const p = join(root, "tests/sampleStructures/hoppers.mcstructure");
		if (!existsSync(p)) return;
		const { writeMcstructure } = await import("../../src/viewer/core/nbt/mcstructureCodec.js");
		const buf = readFileSync(p);
		const { nbt } = await readMcstructure(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
		const out = await writeMcstructure(nbt);
		const { nbt: again } = await readMcstructure(out);
		assert.equal(isNBTValidMcstructure(again), true);
		assert.ok(again.size instanceof Int32Array);
		assert.ok(again.structure_world_origin instanceof Int32Array);
		assert.equal(again.size.length, 3);
	});
});

describe("preview face winding (FrontSide)", () => {
	async function loadJsonc(rel) {
		const stripJsonComments = (await import("strip-json-comments")).default;
		return JSON.parse(stripJsonComments(readFileSync(join(root, rel), "utf8")));
	}

	function stubAtlas(n) {
		return {
			textureWidth: 16,
			textureHeight: 16,
			uvs: Array.from({ length: Math.max(n, 1) }, () => ({
				uv: [0, 0],
				uv_size: [16, 16],
				transparency: 0
			}))
		};
	}

	/** After Z-flip + reversed indices, winding should point away from the cube center. */
	function inwardCount(faces) {
		const center = [8, 8, 8];
		let inward = 0;
		for (const face of faces) {
			const flipped = face.vertices.map(v => [v.pos[0], v.pos[1], 16 - v.pos[2]]);
			const v0 = flipped[0], v1 = flipped[1], v2 = flipped[2];
			const a = [v1[0] - v2[0], v1[1] - v2[1], v1[2] - v2[2]];
			const b = [v0[0] - v2[0], v0[1] - v2[1], v0[2] - v2[2]];
			const n = [
				a[1] * b[2] - a[2] * b[1],
				a[2] * b[0] - a[0] * b[2],
				a[0] * b[1] - a[1] * b[0]
			];
			const mid = flipped.reduce(
				(acc, p) => [acc[0] + p[0] / 4, acc[1] + p[1] / 4, acc[2] + p[2] / 4],
				[0, 0, 0]
			);
			const out = [mid[0] - center[0], mid[1] - center[1], mid[2] - center[2]];
			if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] <= 1e-6) inward++;
		}
		return inward;
	}

	it("keeps dropper and observer faces outward after UV corner-sort", async () => {
		const BlockGeoMaker = (await import("../../src/BlockGeoMaker.js")).default;
		const maker = new BlockGeoMaker(
			{ SCALE: 1, IGNORED_BLOCKS: [] },
			{ entityModelToCubes: async () => [] },
			await loadJsonc("src/data/blockShapes.json"),
			await loadJsonc("src/data/blockShapeGeos.json"),
			await loadJsonc("src/data/blockStateDefinitions.json"),
			await loadJsonc("src/data/blockEigenvariants.json")
		);
		const palette = [
			...[0, 1, 2, 3, 4, 5].map(fd => ({
				name: "dropper",
				states: { facing_direction: fd, triggered_bit: 0 }
			})),
			...["down", "up", "north", "south", "east", "west"].map(d => ({
				name: "observer",
				states: { "minecraft:facing_direction": d, powered_bit: 0 }
			})),
			{ name: "stone", states: {} }
		];
		const { templates } = await maker.makePolyMeshTemplates(palette);
		const atlas = stubAtlas(maker.textureRefs.size);
		for (let i = 0; i < templates.length; i++) {
			const resolved = BlockGeoMaker.resolveTemplateFaceUvs(structuredClone(templates[i]), atlas);
			assert.equal(
				inwardCount(resolved),
				0,
				`palette ${i} (${palette[i].name}) has inward faces after UV resolve`
			);
		}
	});

	it("tags only 0-thickness cubes as doubleSide", async () => {
		const BlockGeoMaker = (await import("../../src/BlockGeoMaker.js")).default;
		const { partitionTemplateFaces } = await import("../../src/viewer/systems/BlockGeoSystem.js");
		const maker = new BlockGeoMaker(
			{ SCALE: 1, IGNORED_BLOCKS: [] },
			{ entityModelToCubes: async () => [] },
			await loadJsonc("src/data/blockShapes.json"),
			await loadJsonc("src/data/blockShapeGeos.json"),
			await loadJsonc("src/data/blockStateDefinitions.json"),
			await loadJsonc("src/data/blockEigenvariants.json")
		);
		const palette = [
			{ name: "stone", states: {} },
			{ name: "deadbush", states: {} },
			{ name: "unpowered_repeater", states: { repeater_delay: 0, direction: 0 } },
			{ name: "redstone_torch", states: { torch_facing_direction: "top" } }
		];
		const { templates } = await maker.makePolyMeshTemplates(palette);
		const atlas = stubAtlas(maker.textureRefs.size);
		const split = templates.map((t, i) => {
			const resolved = BlockGeoMaker.resolveTemplateFaceUvs(structuredClone(t), atlas);
			const { volume, cards } = partitionTemplateFaces(resolved);
			return { name: palette[i].name, volume: volume.length, cards: cards.length };
		});
		assert.equal(split[0].cards, 0, "stone is volumetric");
		assert.ok(split[0].volume > 0, "stone has volume faces");
		assert.equal(split[1].volume, 0, "deadbush is all cards");
		assert.ok(split[1].cards > 0, "deadbush has card faces");
		assert.ok(split[2].volume > 0 && split[2].cards > 0, "repeater is mixed");
		assert.ok(split[3].volume > 0 && split[3].cards > 0, "redstone torch is mixed");
	});
});

describe("boot leftover", () => {
	it("boot preloads via ResourcePackStack + BlockUpdater module cache", () => {
		const preload = readFileSync(join(root, "src/viewer/preloadVanilla.js"), "utf8");
		assert.match(preload, /JSON_FILES_TO_MERGE/);
		assert.match(preload, /VANILLA_ENTITY_MODELS/);
		assert.match(preload, /loadItemUpgradeSchemas/);
		assert.match(preload, /ensureSchemaIndex/);
		assert.doesNotMatch(preload, /getSharedBlockUpdater|sharedVanilla/);
		const boot = readFileSync(join(root, "src/index.js"), "utf8");
		assert.match(boot, /preloadVanillaAssets/);
		const updater = readFileSync(join(root, "src/BlockUpdater.js"), "utf8");
		assert.match(updater, /const schemaLoads = new Map/);
		assert.match(updater, /data\/blockUpgradeSchemaList\.json/);
		assert.match(updater, /location\.href/);
		assert.doesNotMatch(updater, /import\.meta\.url/);
		assert.doesNotMatch(updater, /schemaListHref/);
		assert.doesNotMatch(updater, /getSharedBlockUpdater/);
		const palette = readFileSync(join(root, "src/viewer/palette.js"), "utf8");
		assert.match(palette, /new BlockUpdater\s*\(/);
	});
});

console.log("viewer unit tests finished definitions");
