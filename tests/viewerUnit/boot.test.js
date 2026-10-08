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
		const updater = readFileSync(join(root, "src/viewer/engine/BlockUpdater.js"), "utf8");
		assert.match(updater, /const schemaLoads = new Map/);
		assert.match(updater, /data\/blockUpgradeSchemaList\.json/);
		assert.match(updater, /location\.href/);
		const items = readFileSync(join(root, "src/viewer/itemUpgrade.js"), "utf8");
		assert.match(items, /data\/itemUpgradeSchemaList\.json/);
		assert.match(items, /schemaCdnPath/);
		assert.match(items, /location\.href/);
		assert.doesNotMatch(items, /ITEM_UPGRADE_SCHEMA_FILES/);
		assert.doesNotMatch(updater, /import\.meta\.url/);
		assert.doesNotMatch(updater, /schemaListHref/);
		assert.doesNotMatch(updater, /getSharedBlockUpdater/);
		const palette = readFileSync(join(root, "src/viewer/palette.js"), "utf8");
		assert.match(palette, /new BlockUpdater\s*\(/);
	});
});

console.log("viewer unit tests finished definitions");
