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
});
