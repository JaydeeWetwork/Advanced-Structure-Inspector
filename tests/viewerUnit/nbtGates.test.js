/**
 * NBT array-length gate: INT/LONG/LIST bounds before nbtify.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertNbtArrayLengths } from "../../src/viewer/core/nbt/nbtArrayLengthGate.js";

function fail(code, message) {
	const e = new Error(message);
	e.code = code;
	throw e;
}

function unnamedCompound(payload) {
	return new Uint8Array([0x0a, 0x00, 0x00, ...payload, 0x00]);
}

describe("nbtArrayLengthGate", () => {
	it("rejects INT_ARRAY length that exceeds remaining bytes", () => {
		const buf = unnamedCompound([
			0x0b, 0x01, 0x00, 0x61,
			0xff, 0xff, 0xff, 0x7f
		]);
		assert.throws(
			() => assertNbtArrayLengths(buf, fail),
			e => e.code === "STRUCTURE_NBT_REJECTED"
		);
	});

	it("rejects non-empty LIST of TAG_END without spinning", () => {
		const buf = unnamedCompound([
			0x09, 0x01, 0x00, 0x61,
			0x00,
			0xff, 0xff, 0xff, 0x7f
		]);
		const t0 = Date.now();
		assert.throws(
			() => assertNbtArrayLengths(buf, fail),
			e => e.code === "STRUCTURE_NBT_REJECTED" && /TAG_END/.test(e.message)
		);
		assert.ok(Date.now() - t0 < 1000, "END-list reject must be immediate");
	});

	it("accepts empty LIST of TAG_END (empty-list encoding)", () => {
		const buf = unnamedCompound([
			0x09, 0x01, 0x00, 0x61,
			0x00,
			0x00, 0x00, 0x00, 0x00
		]);
		assert.doesNotThrow(() => assertNbtArrayLengths(buf, fail));
	});

	it("rejects LIST of compounds whose length cannot fit remaining bytes", () => {
		const buf = unnamedCompound([
			0x09, 0x01, 0x00, 0x61,
			0x0a,
			0x00, 0x00, 0x00, 0x7f
		]);
		assert.throws(
			() => assertNbtArrayLengths(buf, fail),
			e => e.code === "STRUCTURE_NBT_REJECTED"
		);
	});

	it("rejects 20000 nested compounds without a stack overflow", () => {
		const depth = 20_000;
		const bytes = [0x0a, 0x00, 0x00];
		for (let i = 0; i < depth; i++) bytes.push(0x0a, 0x01, 0x00, 0x61);
		for (let i = 0; i < depth + 1; i++) bytes.push(0x00);
		const buf = Uint8Array.from(bytes);
		assert.throws(
			() => assertNbtArrayLengths(buf, fail),
			e => e.code === "STRUCTURE_NBT_REJECTED" && !(e instanceof RangeError)
		);
	});

	it("rejects a huge list of empty compounds before allocating them", () => {
		const len = 4_000_000;
		const header = Uint8Array.from([
			0x0a, 0x00, 0x00,
			0x09, 0x01, 0x00, 0x61,
			0x0a,
			len & 255, (len >>> 8) & 255, (len >>> 16) & 255, (len >>> 24) & 255
		]);
		const buf = new Uint8Array(header.length + len + 1);
		buf.set(header, 0);
		const before = process.memoryUsage().heapUsed;
		assert.throws(
			() => assertNbtArrayLengths(buf, fail),
			e => e.code === "STRUCTURE_NBT_REJECTED"
		);
		const grew = process.memoryUsage().heapUsed - before;
		assert.ok(grew < 50 * 1024 * 1024, `heap grew by ${grew} bytes`);
	});

	it("rejects a __proto__ compound name and a block_position_data key", async () => {
		const { readMcstructure, McstructureCodecError } = await import("../../src/viewer/core/nbt/mcstructureCodec.js");
		const proto = [0x5f, 0x5f, 0x70, 0x72, 0x6f, 0x74, 0x6f, 0x5f, 0x5f];
		const palette = Uint8Array.from([
			0x0a, 0x00, 0x00,
			0x0a, 0x09, 0x00, ...proto,
			0x08, 0x04, 0x00, 0x6e, 0x61, 0x6d, 0x65, 0x0d, 0x00, ...new TextEncoder().encode("minecraft:tnt"),
			0x00,
			0x00
		]);
		const bpdName = new TextEncoder().encode("block_position_data");
		const bpd = Uint8Array.from([
			0x0a, 0x00, 0x00,
			0x0a, bpdName.length, 0x00, ...bpdName,
			0x0a, 0x09, 0x00, ...proto,
			0x00,
			0x00,
			0x00
		]);
		const before = Object.prototype.polluted;
		for (const buf of [palette, bpd]) {
			await assert.rejects(
				readMcstructure(buf),
				e => e instanceof McstructureCodecError && e.code === "STRUCTURE_NBT_REJECTED"
			);
		}
		assert.equal(Object.prototype.polluted, before);
	});

	it("quota walk rejects a palette entry and block_position_data whose prototype changed", async () => {
		const { assertNbtQuotas } = await import("../../src/viewer/core/nbt/mcstructureCodec.js");
		const entry = {};
		entry["__proto__"] = { name: "minecraft:tnt" };
		const positions = {};
		positions["__proto__"] = { block_entity_data: { id: "Chest" } };
		const nbt = {
			format_version: 1,
			size: [1, 1, 1],
			structure_world_origin: [0, 0, 0],
			structure: {
				block_indices: [new Int32Array([0]), new Int32Array([-1])],
				palette: { default: { block_palette: [entry], block_position_data: positions } },
				entities: []
			}
		};
		assert.throws(
			() => assertNbtQuotas(nbt, 1),
			e => e.code === "STRUCTURE_NBT_REJECTED"
		);
		assert.equal(Object.prototype.polluted, undefined);
	});

	it("walks nbtify number boxes and still rejects a compound hanging off one", async () => {
		const { assertNbtQuotas } = await import("../../src/viewer/core/nbt/mcstructureCodec.js");
		const { Int32 } = await import("nbtify");
		const typed = {
			format_version: new Int32(1),
			size: [new Int32(1), new Int32(1), new Int32(1)],
			structure_world_origin: [new Int32(0), new Int32(0), new Int32(0)],
			structure: {
				block_indices: [new Int32Array([0])],
				palette: { default: { block_palette: [{ name: "minecraft:stone", version: new Int32(1) }] } },
				entities: []
			}
		};
		assert.doesNotThrow(() => assertNbtQuotas(typed, 1));
		const hung = {};
		Object.setPrototypeOf(hung, Int32.prototype);
		hung.name = "minecraft:tnt";
		assert.throws(
			() => assertNbtQuotas({
				format_version: 1,
				size: [1, 1, 1],
				structure: { block_indices: [new Int32Array([0])], palette: { default: { block_palette: [hung] } } }
			}, 1),
			e => e.code === "STRUCTURE_NBT_REJECTED"
		);
	});
});
