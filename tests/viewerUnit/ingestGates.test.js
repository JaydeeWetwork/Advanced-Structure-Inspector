/**
 * Ingest sniff / zip budget / unknown-extension refusal.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
	IngestError,
	sniffSourceMagic,
	assertZipBudget,
	detectSourceKind,
	expandSourceFile,
	ingestFiles,
	ZIP_MAX_ENTRIES
} from "../../src/viewer/ingest.js";

function fakeFile(bytes, name) {
	const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	return {
		name,
		size: u8.byteLength,
		slice(start = 0, end = u8.byteLength) {
			const sub = u8.subarray(start, end);
			return {
				arrayBuffer: async () => sub.buffer.slice(sub.byteOffset, sub.byteOffset + sub.byteLength)
			};
		},
		arrayBuffer: async () => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength)
	};
}

describe("ingest gates", () => {
	it("sniffs gzip / zip / nbt compound and classifies java / addon names", () => {
		assert.equal(sniffSourceMagic(new Uint8Array([0x1f, 0x8b, 0, 0])), "gzip");
		assert.equal(sniffSourceMagic(new Uint8Array([0x50, 0x4b, 0x03, 0x04])), "zip");
		assert.equal(sniffSourceMagic(new Uint8Array([0x0a, 0x00, 0x00])), "nbt-compound");
		assert.equal(detectSourceKind({ name: "foo.litematic" }), "java-nbt");
		assert.equal(detectSourceKind({ name: "pack.mcaddon" }), "mcaddon");
	});

	it("rejects zip entry count over 10k with IngestError", () => {
		assert.throws(
			() => assertZipBudget(Array.from({ length: ZIP_MAX_ENTRIES + 1 }, () => ({ uncompressedSize: 0 }))),
			e => e instanceof IngestError && e.code === "ZIP_TOO_MANY_ENTRIES"
		);
		assert.doesNotThrow(() => assertZipBudget([{ uncompressedSize: 10 }]));
	});

	it("does not catalog a gzip file with an unknown extension", async () => {
		const f = fakeFile(new Uint8Array([0x1f, 0x8b, 0, 0, 0, 0]), "mystery.dat");
		const r = await ingestFiles([f]);
		assert.equal(r.entries.length, 0);
		assert.ok(r.errors.length >= 1);
	});

	it("refuses unrecognized unknown-extension bytes", async () => {
		await assert.rejects(
			() => expandSourceFile(fakeFile(new Uint8Array([0x00, 0x01, 0x02, 0x03]), "mystery.bin")),
			e => e instanceof IngestError && e.code === "UNRECOGNIZED_SOURCE"
		);
	});

	it("refuses gzip unknown-extension as Java NBT via IngestError", async () => {
		await assert.rejects(
			() => expandSourceFile(fakeFile(new Uint8Array([0x1f, 0x8b, 0, 0, 0, 0]), "mystery.dat")),
			e => e instanceof IngestError && e.code === "JAVA_NBT_DETECTED"
		);
	});
});

