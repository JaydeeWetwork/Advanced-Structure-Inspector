/**
 * Pack particle file names stay inside the zip.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { addBlockValidationParticles } from "../../src/pack/hologramMotion.js";
import {
	assertSafePackEntryName,
	particleNameFor,
	resetParticleNames
} from "../../src/pack/particleName.js";

describe("particleNameFor", () => {
	it("sanitizes block ids and keeps collisions unique", () => {
		resetParticleNames();
		const evil = particleNameFor("evil:/../../manifest");
		const abc = particleNameFor("a:b:c");
		const stone = particleNameFor("minecraft:stone");
		for (const name of [evil, abc, stone]) {
			assert.match(name, /^validate_[\w.-]+$/);
		}
		assert.equal(new Set([evil, abc, stone]).size, 3);
		assert.equal(particleNameFor("a:b"), "validate_a_b");
		assert.equal(particleNameFor("a_b"), "validate_a_b_2");
		assert.equal(evil.includes("..") || !evil.split("/").includes(".."), true);
		assert.equal(evil.split("/").includes(".."), false);
	});

	it("uses the same id the pack registers for a namespaced block", () => {
		resetParticleNames();
		const controllers = {
			animation_controllers: {
				"controller.animation.holoprint.hologram.block_validation": {
					states: { default: { transitions: [] } }
				}
			}
		};
		const blocks = [
			{ pos: [0, 0, 0], locator: "b_0_0_0", block: "mymod:custom_block" },
			{ pos: [1, 0, 0], locator: "b_1_0_0", block: "minecraft:stone" }
		];
		addBlockValidationParticles(controllers, 0, blocks, [2, 1, 1]);
		const states = controllers.animation_controllers["controller.animation.holoprint.hologram.block_validation"].states;
		const referenced = states.validate_0.particle_effects.map(effect => effect.effect);
		const registered = ["mymod:custom_block", "minecraft:stone"].map(name => particleNameFor(name));
		assert.deepEqual(referenced, ["validate_mymod_custom_block", "validate_minecraft_stone"]);
		assert.deepEqual(registered, referenced);
	});

	it("rejects pack paths that leave the archive", () => {
		assert.doesNotThrow(() => assertSafePackEntryName("particles/validate_minecraft_stone.json"));
		assert.throws(() => assertSafePackEntryName("particles/../../manifest.json"), /Unsafe pack entry/);
		assert.throws(() => assertSafePackEntryName("/particles/a.json"), /Unsafe pack entry/);
		assert.throws(() => assertSafePackEntryName("particles\\a.json"), /Unsafe pack entry/);
	});
});
