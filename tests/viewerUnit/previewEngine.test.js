/**
 * Unit tests for Bedrock Layers (Node --test).
 * Pure logic + lightweight mocks — no browser / WebGL required.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BUILD_ID, VERSION_BUILD, VERSION_MAJOR, VERSION_MINOR } from "../../src/buildId.js";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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

describe("PreviewRenderer performance API", () => {
	it("exposes PERFORMANCE_OPTIONS used by viewer", async () => {
		// Cannot fully construct without three.js/DOM; verify shell + viewport contracts
		const src = readFileSync(join(root, "src/viewer/engine/PreviewRenderer.js"), "utf8");
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

describe("true isometric showcase", async () => {
	const {
		ISO_ELEVATION_DEG,
		ISO_OFFSETS,
		applyOrthoFrustum,
		isoDirectionInfo,
		isoOffset,
		isIsoCameraPreset,
		normalizeCameraPreset,
		normalizeCameraZoom,
		normalizeIsoPreset,
		orthoHalfExtents,
		perspectiveDistanceFromOrthoHalfHeight
	} = await import("../../src/viewer/systems/isoCamera.js");

	it("uses cube-diagonal 45° / 35.264° offsets", () => {
		assert.deepEqual(isoOffset("iso-north"), [1, 1, -1]);
		assert.deepEqual(isoOffset("iso-south"), [-1, 1, 1]);
		assert.deepEqual(isoOffset("iso-east"), [1, 1, 1]);
		assert.deepEqual(isoOffset("iso-west"), [-1, 1, -1]);
		assert.deepEqual(isoOffset("iso"), ISO_OFFSETS["iso-north"]);
		assert.equal(normalizeIsoPreset("iso"), "iso-north");
		assert.equal(isIsoCameraPreset("iso-east"), true);
		assert.equal(isIsoCameraPreset("north"), false);
		assert.ok(Math.abs(ISO_ELEVATION_DEG - 35.264) < 0.01);
		for (const id of ["iso-north", "iso-south", "iso-east", "iso-west"]) {
			const info = isoDirectionInfo(id);
			assert.ok(Math.abs(info.elevationDeg - ISO_ELEVATION_DEG) < 0.05);
			const az = ((info.azimuthDeg % 360) + 360) % 360;
			const nearest45 = Math.round(az / 45) * 45;
			assert.ok(Math.abs(az - nearest45) < 0.05 || Math.abs(az - nearest45 + 360) < 0.05);
			assert.ok(nearest45 % 45 === 0);
			assert.ok(az % 90 !== 0);
		}
		const n = isoDirectionInfo("iso-north");
		assert.ok(Math.abs(n.azimuthDeg - 45) < 0.05);
	});

	it("ortho frustum grows with AABB and shrinks with user zoom", () => {
		const a = orthoHalfExtents(20, 10, 2, 1, 1);
		assert.equal(a.halfHeight, 10);
		assert.equal(a.halfWidth, 20);
		const close = orthoHalfExtents(20, 10, 2, 1, 2);
		assert.equal(close.halfHeight, 5);
		const bigger = orthoHalfExtents(40, 20, 1, 1, 1);
		assert.ok(bigger.halfHeight > a.halfHeight);
		const cam = { left: 0, right: 0, top: 0, bottom: 0 };
		applyOrthoFrustum(cam, 10, 2);
		assert.equal(cam.left, -20);
		assert.equal(cam.right, 20);
		assert.equal(cam.top, 10);
		assert.equal(cam.bottom, -10);
	});

	it("omitted Bedrock default-0 states do not error; bed color falls back from id", async () => {
		const {
			bedColorIndex,
			omittedStateDefault
		} = await import("../../src/viewer/engine/BlockGeoMaker.js");
		assert.equal(omittedStateDefault("0"), 0);
		assert.equal(omittedStateDefault("3"), 0);
		assert.equal(omittedStateDefault("bottom"), undefined);
		assert.equal(omittedStateDefault("north"), undefined);
		const { pickTextureVariantIndex } = await import("../../src/viewer/engine/BlockGeoMaker.js");
		assert.equal(pickTextureVariantIndex([0, 1], 2), 1);
		assert.equal(pickTextureVariantIndex([0, 1], 0), 0);
		assert.equal(bedColorIndex({ name: "bed" }), 14);
		assert.equal(bedColorIndex({ name: "minecraft:red_bed" }), 14);
		assert.equal(bedColorIndex({ name: "white_bed" }), 0);
		assert.equal(bedColorIndex({ name: "light_gray_bed" }), 8);
		const shapes = readFileSync(join(root, "src/data/blockShapes.json"), "utf8");
		assert.match(shapes, /\(\?<!straw\)_bed\$/);
		const { preferTgaForVanillaPath } = await import(
			"../../src/viewer/appearance/vanillaTextureExt.js"
		);
		assert.equal(preferTgaForVanillaPath("textures/blocks/grindstone_pivot"), true);
		assert.equal(preferTgaForVanillaPath("textures/items/reeds"), false);
	});

	it("extended piston head uses the face texture, not the wood arm sheet", () => {
		const geos = readFileSync(join(root, "src/data/blockShapeGeos.json"), "utf8");
		const pistonAt = geos.indexOf('"piston":');
		const nextShape = geos.indexOf('\n\t"dispenser"', pistonAt);
		const piston = geos.slice(pistonAt, nextShape > 0 ? nextShape : pistonAt + 2500);
		assert.match(piston, /entity\.State\?\?0 == 0/);
		assert.match(piston, /entity\.State\?\?0 == 1/);
		assert.match(piston, /"pos": \[0, 28, 0\]/);
		const headAt = piston.indexOf('"pos": [0, 28, 0]');
		assert.ok(headAt > 0);
		const head = piston.slice(headAt, headAt + 280);
		assert.match(head, /carried\.up/);
		assert.doesNotMatch(head, /#tex/);
		const maker = readFileSync(join(root, "src/viewer/engine/BlockGeoMaker.js"), "utf8");
		assert.match(maker, /usingBlockEntityData\) \{\s*return false;/);
	});

	it("iso path uses OrthographicCamera; other presets stay perspective", () => {
		const ctrl = readFileSync(join(root, "src/viewer/systems/CameraController.js"), "utf8");
		assert.match(ctrl, /OrthographicCamera/);
		assert.match(ctrl, /#applyIso/);
		assert.match(ctrl, /#ensurePerspective/);
		assert.match(ctrl, /isIsoCameraPreset/);
		assert.doesNotMatch(ctrl, /0\.5,\s*0\.72,\s*-1/);
		const view = readFileSync(join(root, "src/viewer/systems/ViewportSystem.js"), "utf8");
		assert.match(view, /isOrthographicCamera/);
		assert.match(view, /orthoHalfHeight/);
		const orbit = readFileSync(join(root, "src/viewer/systems/orbitBootstrap.js"), "utf8");
		assert.match(orbit, /controls\.object/);
	});

	it("normalizes default camera zoom and iso aliases", () => {
		assert.equal(normalizeCameraZoom(2.4), 2);
		assert.equal(normalizeCameraZoom("nope"), 1);
		assert.equal(normalizeCameraPreset("iso"), "iso-north");
		assert.equal(normalizeCameraPreset("west"), "west");
	});

	it("iso→fly keeps orbit target and look; only dolly to match ortho size", () => {
		const d = perspectiveDistanceFromOrthoHalfHeight(100, 70);
		assert.ok(d > 16);
		assert.ok(Math.abs(d - 100 / Math.tan((70 * Math.PI) / 360)) < 0.01);
		const ctrl = readFileSync(join(root, "src/viewer/systems/CameraController.js"), "utf8");
		const fly = ctrl.match(/#enterFly\(\) \{[\s\S]*?\n\t\}/);
		assert.ok(fly, "#enterFly body");
		assert.match(fly[0], /perspectiveDistanceFromOrthoHalfHeight/);
		assert.match(fly[0], /wasOrtho/);
		assert.match(fly[0], /controls\.target/);
		assert.match(fly[0], /orthoHalfHeight \/ oldZoom/);
		assert.doesNotMatch(fly[0], /boundsForLayer/);
		assert.doesNotMatch(fly[0], /getCenter/);
		assert.match(ctrl, /PerspectiveCamera[\s\S]*next\.zoom = ortho/);
	});

	it("free orbit does not switch iso ortho to perspective", () => {
		const ctrl = readFileSync(join(root, "src/viewer/systems/CameraController.js"), "utf8");
		const enter = ctrl.match(/enterFreeCamera\(\) \{[\s\S]*?\n\t\}/);
		assert.ok(enter, "enterFreeCamera body");
		assert.doesNotMatch(enter[0], /#ensurePerspective/);
		const freePreset = ctrl.match(/if \(preset === "free"\) \{[\s\S]*?return true;\s*\}/);
		assert.ok(freePreset, "setPreset free branch");
		assert.doesNotMatch(freePreset[0], /#ensurePerspective/);
	});
});

describe("product version", () => {
	it("shows major.minor.build in the header with no build word", () => {
		assert.equal(VERSION_MAJOR, 0);
		assert.equal(VERSION_MINOR, 1);
		assert.equal(BUILD_ID, `${VERSION_MAJOR}.${VERSION_MINOR}.${VERSION_BUILD}`);
		assert.match(BUILD_ID, /^\d+\.\d+\.\d+$/);
		assert.doesNotMatch(BUILD_ID, /build/i);
		const html = readFileSync(join(root, "src/index.html"), "utf8");
		const label = html.match(/id="buildLabel" title="([^"]*)">([^<]*)</);
		assert.ok(label);
		assert.equal(label[1], BUILD_ID);
		assert.equal(label[2], BUILD_ID);
		assert.match(html, new RegExp(`\\?v=${BUILD_ID.replaceAll(".", "\\.")}`));
		const boot = readFileSync(join(root, "src/index.js"), "utf8");
		assert.match(boot, /buildLabel\.textContent = BUILD_ID/);
		assert.match(boot, /buildLabel\.title = BUILD_ID/);
		assert.doesNotMatch(boot, /Build \$\{BUILD_ID\}/);
		const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
		assert.equal(pkg.version, BUILD_ID);
	});
});

describe("preview load cache / preload", () => {
	it("fetchers replay bytes in memory and do not copy older pins into the current cache", () => {
		const src = readFileSync(join(root, "src/viewer/engine/fetchers.js"), "utf8");
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
		const atlas = readFileSync(join(root, "src/viewer/engine/TextureAtlas.js"), "utf8");
		assert.match(atlas, /packedAtlasCache/);
		assert.match(atlas, /Promise\.all\(allTexturePaths/);
		assert.doesNotMatch(atlas, /mapPool/);
		assert.doesNotMatch(atlas, /VANILLA_CDN_SLOTS/);
		const pool = readFileSync(join(root, "src/viewer/systems/PreviewResourcePool.js"), "utf8");
		assert.match(pool, /materialSide === "front"/);
		assert.match(pool, /transparentMat\.side = side/);
		assert.match(pool, /depthWrite: true/);
		assert.doesNotMatch(pool, /depthWrite: false/);
		assert.match(pool, /ensureTransparentCardMat/);
		assert.match(pool, /getOrCreateGeos/);
		assert.doesNotMatch(pool, /getOrCreateGeo\(/);
		const renderer = readFileSync(join(root, "src/viewer/engine/PreviewRenderer.js"), "utf8");
		assert.match(renderer, /materialSide: "front"/);
		assert.match(renderer, /logarithmicDepthBuffer: true/);
		const geoMaker = readFileSync(join(root, "src/viewer/engine/BlockGeoMaker.js"), "utf8");
		assert.match(geoMaker, /#templateMemo/);
		const layer = readFileSync(join(root, "src/viewer/systems/LayerMeshSystem.js"), "utf8");
		assert.match(layer, /doubleChestNeedsPreviewXMirror/);
		assert.match(layer, /faceTemplateToBufferGeos/);
		assert.match(preview, /SCALE: partial\.SCALE \?\? 1/);
		assert.match(atlas, /exportPackTextures/);
		assert.doesNotMatch(renderer, /new PolyMeshMaker/);
		assert.match(layer, /const count = to - from/);
		assert.match(layer, /mesh\.renderOrder = count/);
		assert.doesNotMatch(layer, /BLENDED_RENDER_ORDER/);
		assert.match(layer, /getOrCreateGeos/);
		assert.doesNotMatch(layer, /paperThin/);
		assert.doesNotMatch(layer, /some\(f => f\.doubleSide\)/);
		const geoSys = readFileSync(join(root, "src/viewer/systems/BlockGeoSystem.js"), "utf8");
		assert.match(geoSys, /mirrorX/);
		assert.match(geoSys, /partitionTemplateFaces/);
	});

	it("TextureAtlas caches decoded ImageData; ResourcePackStack caches vanilla pack JSON", () => {
		const atlas = readFileSync(join(root, "src/viewer/engine/TextureAtlas.js"), "utf8");
		assert.match(atlas, /packAssetStore\.decodeTexture/);
		const store = readFileSync(join(root, "src/viewer/appearance/PackAssetStore.js"), "utf8");
		assert.match(store, /#decoded/);
		assert.match(store, /walksToNextPackTag/);
		assert.match(store, /shouldCachePackResult/);
		assert.doesNotMatch(store, /texture_list/);
		assert.doesNotMatch(store, /#extByTag/);
		assert.doesNotMatch(store, /transient/);
		const rps = readFileSync(join(root, "src/viewer/engine/ResourcePackStack.js"), "utf8");
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
		const limits = readFileSync(join(root, "src/viewer/core/nbt/mcstructureLimits.js"), "utf8");
		assert.match(limits, /compression:\s*null/);
		assert.match(limits, /endian:\s*"little"/);
		assert.match(codec, /readMcstructure/);
		assert.match(codec, /writeMcstructure/);
		assert.doesNotMatch(codec, /NBT\.read\(/);
		assert.doesNotMatch(codec, /ZIP_TOO_MANY_ENTRIES/);
		const nbtDir = join(root, "src/viewer/core/nbt");
		/** @type {Record<string, RegExp>} */
		const allowedRead = {
			"mcstructureRead.js": /NBT\.read\(buffer,\s*MCSTRUCTURE_READ_OPTIONS\)/,
			"mcstructureInflate.js": /NBT\.read\(inflated,\s*\{\s*\.\.\.MCSTRUCTURE_READ_OPTIONS,\s*strict:\s*true\s*\}\)/,
			"mcstructureTyped.js": /NBT\.read\([\s\S]*?\.\.\.MCSTRUCTURE_READ_OPTIONS,\s*rootName:\s*true/
		};
		for (const name of readdirSync(nbtDir)) {
			if (!name.endsWith(".js")) continue;
			const src = readFileSync(join(nbtDir, name), "utf8");
			const calls = src.match(/NBT\.read\(/g) ?? [];
			if (!Object.hasOwn(allowedRead, name)) {
				assert.equal(calls.length, 0, `${name} calls NBT.read`);
				continue;
			}
			assert.equal(calls.length, 1, `${name} NBT.read count`);
			assert.match(src, allowedRead[name]);
		}
		const typed = readFileSync(join(nbtDir, "mcstructureTyped.js"), "utf8");
		const gate = typed.indexOf("await readMcstructure(buffer)");
		const second = typed.indexOf("NBT.read(");
		assert.ok(gate > 0 && second > gate);
		const fill = readFileSync(join(root, "scripts/fill-sign-test-text.mjs"), "utf8");
		assert.match(fill, /writeMcstructure/);
		assert.doesNotMatch(fill, /NBT\.write\(root\)/);
		for (const rel of [
			"src/viewer/parseStructure.js",
			"src/viewer/structurePreview.js",
			"src/viewer/hopperStats.js",
			"src/viewer/materialList.js",
			"src/pack/packConfig.js"
		]) {
			const src = readFileSync(join(root, rel), "utf8");
			assert.match(src, /readMcstructure/);
			assert.doesNotMatch(src, /NBT\.read\(arrayBuffer\)/);
			assert.doesNotMatch(src, /NBT\.read\(ab\)/);
			assert.doesNotMatch(src, /NBT\.read\(arrayBuffer,\s*options\)/);
		}
		const holo = readFileSync(join(root, "src/pack/HoloPrint.js"), "utf8");
		assert.match(holo, /readStructureNBT/);
		assert.match(holo, /from \"..\/viewer\/palette.js\"/);
		assert.doesNotMatch(holo, /async function tweakBlockPalette/);
		assert.doesNotMatch(holo, /NBT\.read\(/);
		assert.doesNotMatch(holo, /renderStructurePreview/);
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
		const BlockGeoMaker = (await import("../../src/viewer/engine/BlockGeoMaker.js")).default;
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
		const BlockGeoMaker = (await import("../../src/viewer/engine/BlockGeoMaker.js")).default;
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
