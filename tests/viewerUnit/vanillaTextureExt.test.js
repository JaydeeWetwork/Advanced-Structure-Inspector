import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { preferTgaForVanillaPath } from "../../src/viewer/appearance/vanillaTextureExt.js";
import PackAssetStore from "../../src/viewer/appearance/PackAssetStore.js";

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
			"textures/items/reeds"
		];
		for (const p of png) assert.equal(preferTgaForVanillaPath(p), false, p);
	});
});

describe("PackAssetStore.extensionsToTry", () => {
	it("requests only the real extension (no 404 probe of the other)", () => {
		const store = new PackAssetStore();
		assert.deepEqual(store.extensionsToTry("textures/blocks/planks_oak"), [".png"]);
		assert.deepEqual(store.extensionsToTry("textures/blocks/kelp_a"), [".tga"]);
		assert.deepEqual(store.extensionsToTry("textures/blocks/cactus_side"), [".tga"]);
		assert.deepEqual(store.extensionsToTry("textures/blocks/grindstone_round"), [".tga"]);
		assert.deepEqual(store.extensionsToTry("textures/items/reeds"), [".png"]);
	});
});
