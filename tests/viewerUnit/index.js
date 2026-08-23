/**
 * Unit tests for Structure Inspector improvements (Node --test).
 * Pure logic + lightweight mocks — no browser / WebGL required.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
		assert.equal(e.categoryId, null);
		assert.equal(cat.list().length, 1);
		assert.equal(cat.search({ query: "stone" }).length, 1);
		assert.equal(cat.search({ query: "minecart" }).length, 0);
		assert.equal(cat.search({ query: "2" }).length, 1); // entityCount
		await cat.remove(e.id);
		assert.equal(cat.list().length, 0);
	});

	it("supports categories: create, move, reorder, collapse, delete", async () => {
		const cat = new StructureCatalog();
		cat.setPersistEnabled(false);
		const file = new File([new Uint8Array([0])], "a.mcstructure");
		const e1 = await cat.add({
			name: "alpha",
			sourceName: "a.mcstructure",
			sourceKind: "mcstructure",
			size: [1, 1, 1],
			worldOrigin: null,
			paletteSize: 1,
			blockCount: 1,
			blockNames: ["stone"],
			entityCount: 0,
			file
		});
		const e2 = await cat.add({
			name: "beta",
			sourceName: "b.mcstructure",
			sourceKind: "mcstructure",
			size: [1, 1, 1],
			worldOrigin: null,
			paletteSize: 1,
			blockCount: 1,
			blockNames: ["dirt"],
			entityCount: 0,
			file
		});

		const c1 = await cat.addCategory("Farms");
		const c2 = await cat.addCategory("Redstone");
		assert.equal(cat.listCategories().length, 2);
		assert.equal(cat.listCategories()[0].name, "Farms");

		await cat.setEntryCategory(e1.id, c1.id);
		assert.equal(cat.get(e1.id).categoryId, c1.id);
		assert.equal(cat.get(e2.id).categoryId, null);

		await cat.reorderCategory(c2.id, -1);
		assert.equal(cat.listCategories()[0].id, c2.id);

		await cat.setCategoryCollapsed(c1.id, true);
		assert.equal(cat.getCategory(c1.id).collapsed, true);

		const groups = cat.listGrouped();
		assert.equal(groups[0].isUncategorized, true);
		assert.equal(groups[0].entries.some(x => x.id === e2.id), true);
		const farmGroup = groups.find(g => g.categoryId === c1.id);
		assert.ok(farmGroup);
		assert.equal(farmGroup.entries.length, 1);
		assert.equal(farmGroup.entries[0].id, e1.id);
		assert.equal(farmGroup.collapsed, true);

		await cat.removeCategory(c1.id);
		assert.equal(cat.get(e1.id).categoryId, null);
		assert.equal(cat.listCategories().length, 1);
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
		const { SIGN_BOARD, signFaceLocalOffset, TEXT_LIFT } = await import("../../src/viewer/signPlacement.js");
		const board = SIGN_BOARD.standing;
		const f = signFaceLocalOffset(board, false);
		const bk = signFaceLocalOffset(board, true);
		assert.ok(Math.abs(f.z) > board.halfT, `front |z| ${f.z} should exceed halfT ${board.halfT}`);
		assert.ok(Math.abs(bk.z) > board.halfT, `back |z| ${bk.z}`);
		assert.equal(Math.sign(f.z), 1);
		assert.equal(Math.sign(bk.z), -1);
		assert.ok(TEXT_LIFT > 0.3);
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
		assert.deepEqual(d.front.three, [-135.081, 12.125, -8.919]);
		assert.deepEqual(d.back.three, [-136.919, 12.125, -7.081]);
		assert.deepEqual(d.front.dBoard, [0.919, 0, -0.919]);
		assert.deepEqual(d.back.dBoard, [-0.919, 0, 0.919]);
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
			blockEntity: {
				id: "ItemFrame",
				Item: { Name: "minecraft:diamond", Count: 1 },
				ItemRotation: 90
			},
			items: [{ name: "diamond", count: 1, slot: null, damage: 0 }]
		});
		blocks.set("0,1,0", {
			x: 0, y: 1, z: 0,
			name: "glow_frame",
			states: { facing_direction: 2 },
			blockEntityId: "GlowItemFrame",
			blockEntity: {
				id: "GlowItemFrame",
				Item: { Name: "minecraft:apple", Count: 1 },
				ItemRotation: 0
			},
			items: []
		});
		blocks.set("2,0,0", {
			x: 2, y: 0, z: 0,
			name: "frame",
			states: { facing_direction: 2 },
			blockEntityId: "ItemFrame",
			blockEntity: { id: "ItemFrame" },
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
		const c = classifyChestPair("north", 1, 0); // pair east of north-facing
		assert.ok(c);
		assert.ok(c.half === "a" || c.half === "b");
		assert.equal(chestFacing({ "minecraft:cardinal_direction": "west" }), "west");
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

console.log("viewer unit tests finished definitions");
