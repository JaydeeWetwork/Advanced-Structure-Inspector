import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { VANILLA_SAMPLES_TAG } from "../../src/data/packPins.js";
import { VANILLA_SAMPLES_TGA_TAG } from "../../src/data/vanillaTgaTextures.js";
import { preferTgaForVanillaPath } from "../../src/viewer/appearance/vanillaTextureExt.js";
import { createFetchSlotGate, VANILLA_CDN_SLOTS } from "../../src/viewer/engine/fetchers.js";
import PackAssetStore, { shouldCachePackResult, walksToNextPackTag } from "../../src/viewer/appearance/PackAssetStore.js";

describe("vanilla samples pin", () => {
	it("keeps the color TGA list on the same tag as the render pin", () => {
		assert.equal(VANILLA_SAMPLES_TGA_TAG, VANILLA_SAMPLES_TAG);
	});
});

describe("preferTgaForVanillaPath", () => {
	it("uses the samples-pin TGA tree (no PNG probe)", () => {
		const tga = [
			"textures/blocks/kelp_a",
			"textures/blocks/cactus_side",
			"textures/blocks/grindstone_pivot",
			"textures/blocks/tallgrass_carried",
			"textures/blocks/double_plant_grass_bottom",
			"textures/entity/dragon/dragon",
			"textures/entity/banner/banner_base"
		];
		for (const p of tga) assert.equal(preferTgaForVanillaPath(p), true, p);
	});

	it("leaves PNG-only samples-pin files as PNG", () => {
		const png = [
			"textures/blocks/planks_oak",
			"textures/blocks/grass_top",
			"textures/blocks/stone",
			"textures/blocks/wool_colored_white",
			"textures/blocks/web",
			"textures/entity/cushion/cyan_cushion",
			"textures/blocks/stone_mers",
			"textures/items/reeds"
		];
		for (const p of png) assert.equal(preferTgaForVanillaPath(p), false, p);
	});
});

describe("walksToNextPackTag", () => {
	it("follows an older pin only after a 404", () => {
		assert.equal(walksToNextPackTag(404), true);
		for (const status of [0, 200, 403, 429, 500, 502, 503]) {
			assert.equal(walksToNextPackTag(status), false, String(status));
		}
	});
});

describe("shouldCachePackResult", () => {
	it("keeps a success or a 404 and retries any other status", () => {
		assert.equal(shouldCachePackResult(200), true);
		assert.equal(shouldCachePackResult(404), true);
		for (const status of [0, 403, 429, 500, 502, 503]) {
			assert.equal(shouldCachePackResult(status), false, String(status));
		}
	});
});

describe("createFetchSlotGate", () => {
	it("runs queued downloads in the order they were requested", async () => {
		assert.ok(VANILLA_CDN_SLOTS >= 16);
		const acquire = createFetchSlotGate(1);
		const order = [];
		const releaseHeld = await acquire();
		const second = acquire().then(release => {
			order.push("second");
			release();
		});
		const third = acquire().then(release => {
			order.push("third");
			release();
		});
		releaseHeld();
		await second;
		await third;
		assert.deepEqual(order, ["second", "third"]);
	});
});

describe("PackAssetStore.extensionsToTry", () => {
	it("returns the one real extension (no 404 probe of the other)", () => {
		const store = new PackAssetStore();
		assert.equal(store.extensionsToTry("textures/blocks/planks_oak"), ".png");
		assert.equal(store.extensionsToTry("textures/blocks/kelp_a"), ".tga");
		assert.equal(store.extensionsToTry("textures/blocks/cactus_side"), ".tga");
		assert.equal(store.extensionsToTry("textures/blocks/grindstone_round"), ".tga");
		assert.equal(store.extensionsToTry("textures/items/reeds"), ".png");
	});
});
