/**
 * Persist structure bytes as ArrayBuffer copies (Safari File-in-IDB).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	bytesFromStoredBlob,
	fileFromBytes,
	fileFromStoredBlob
} from "../../src/viewer/db.js";

describe("bytesFromStoredBlob", () => {
	it("copies an ArrayBuffer", async () => {
		const src = new Uint8Array([10, 0, 0, 0]).buffer;
		const copy = await bytesFromStoredBlob(src);
		assert.equal(copy.byteLength, 4);
		assert.notEqual(copy, src);
		new Uint8Array(src)[0] = 99;
		assert.equal(new Uint8Array(copy)[0], 10);
	});

	it("copies a typed array view", async () => {
		const u8 = new Uint8Array([1, 2, 3, 4]);
		const copy = await bytesFromStoredBlob(u8.subarray(1, 3));
		assert.deepEqual([...new Uint8Array(copy)], [2, 3]);
	});

	it("returns empty for null", async () => {
		assert.equal((await bytesFromStoredBlob(null)).byteLength, 0);
	});
});

describe("fileFromStoredBlob", () => {
	it("wraps copied bytes in a File", async () => {
		const file = await fileFromStoredBlob(
			new Uint8Array([10, 0]).buffer,
			"hut.mcstructure"
		);
		assert.equal(file.name, "hut.mcstructure");
		assert.equal(file.size, 2);
		assert.equal(file.type, "application/mcstructure");
	});

	it("empty stored blob stays size 0", async () => {
		const file = await fileFromStoredBlob(new ArrayBuffer(0), "gone.mcstructure");
		assert.equal(file.size, 0);
	});
});

describe("fileFromBytes", () => {
	it("names the file", () => {
		const f = fileFromBytes(new Uint8Array([1]).buffer, "a.mcstructure");
		assert.equal(f.name, "a.mcstructure");
		assert.equal(f.size, 1);
	});
});
