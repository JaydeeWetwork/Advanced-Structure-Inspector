/**
 * Inspect index typed fields — no raw NBT blob on UI records.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildInspectIndex, nbtBool } from "../../src/viewer/inspectStructure.js";

describe("buildInspectIndex typed records", () => {
	it("reads lectern book pages from item tag and does not store blockEntity", () => {
		const data = {
			size: [1, 1, 1],
			structure_world_origin: [0, 0, 0],
			structure: {
				block_indices: [new Int32Array([0]), new Int32Array([-1])],
				palette: {
					default: {
						block_palette: [{ name: "minecraft:lectern", states: {} }],
						block_position_data: {
							0: {
								block_entity_data: {
									id: "Lectern",
									x: 0,
									y: 0,
									z: 0,
									hasBook: 1,
									page: 0,
									book: {
										Name: "minecraft:written_book",
										Count: 1,
										tag: { pages: ["hello from tag"], title: "T", author: "A" }
									}
								}
							}
						}
					}
				},
				entities: []
			}
		};
		const idx = buildInspectIndex(data);
		const b = idx.blocks.get("0,0,0");
		assert.ok(b);
		assert.equal(b.blockEntity, undefined);
		assert.equal(b.lectern?.hasBook, true);
		assert.equal(b.lectern?.book?.title, "T");
		assert.equal(b.lectern?.book?.pages?.[0], "hello from tag");
		assert.equal(b.lectern?.rawBook, undefined);
	});

	it("stores hopper minecart enabled and items without raw NBT", () => {
		const data = {
			size: [1, 1, 1],
			structure_world_origin: [0, 0, 0],
			structure: {
				block_indices: [new Int32Array([-1]), new Int32Array([-1])],
				palette: { default: { block_palette: [], block_position_data: {} } },
				entities: [{
					identifier: "minecraft:hopper_minecart",
					Pos: [0.5, 1, 0.5],
					Enabled: 0,
					Items: [{ Name: "minecraft:dirt", Count: 2, Slot: 1 }]
				}]
			}
		};
		const idx = buildInspectIndex(data);
		assert.equal(idx.entities.length, 1);
		const e = idx.entities[0];
		assert.equal(e.enabled, false);
		assert.equal(e.raw, undefined);
		assert.equal(e.items[0].name, "dirt");
		assert.equal(e.items[0].count, 2);
		assert.equal(e.items[0].raw, undefined);
	});
});

describe("nbtBool", () => {
	it("coerces NBT flags and leaves unknown as null", () => {
		assert.equal(nbtBool(1), true);
		assert.equal(nbtBool("true"), true);
		assert.equal(nbtBool(0), false);
		assert.equal(nbtBool("false"), false);
		assert.equal(nbtBool(null), null);
		assert.equal(nbtBool(2), null);
	});
});
