/**
 * Ingest sniff / zip budget / unknown-extension refusal.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
import {
	IngestError,
	sniffSourceMagic,
	assertZipBudget,
	assertZipEntryInflation,
	detectSourceKind,
	expandSourceFile,
	ingestFiles,
	sanitizeZipEntryName,
	ZIP_MAX_ENTRIES,
	ZIP_MAX_UNCOMPRESSED,
	ZIP_MAX_RATIO,
	INGEST_MAX_TOP_FILES
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

	it("rejects declared uncompressed size over 64 MiB", () => {
		assert.throws(
			() => assertZipBudget([{ uncompressedSize: ZIP_MAX_UNCOMPRESSED + 1 }]),
			e => e instanceof IngestError && e.code === "ZIP_TOO_LARGE"
		);
	});

	it("sanitizes zip entry names to a basename", () => {
		assert.equal(sanitizeZipEntryName("a/../../x.mcstructure"), "x.mcstructure");
		assert.equal(sanitizeZipEntryName("..\\evil.mcstructure"), "evil.mcstructure");
		assert.equal(sanitizeZipEntryName(".."), "");
		assert.equal(sanitizeZipEntryName(""), "");
	});

	it("caps top-level picker files and warns", async () => {
		const files = Array.from({ length: INGEST_MAX_TOP_FILES + 3 }, (_, i) =>
			fakeFile(new Uint8Array([0x00, 0x01, 0x02, 0x03]), `f${i}.bin`)
		);
		const r = await ingestFiles(files);
		assert.ok(r.warnings.some(w => /first 32/.test(w)));
		assert.equal(r.errors.length, INGEST_MAX_TOP_FILES);
	});

	it("propagates abort", async () => {
		const ac = new AbortController();
		ac.abort();
		await assert.rejects(
			() => ingestFiles([fakeFile(new Uint8Array([0x0a]), "a.mcstructure")], { signal: ac.signal }),
			e => e && e.name === "AbortError"
		);
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

	it("refuses gzip and zlib unknown-extensions as compressed data", async () => {
		await assert.rejects(
			() => expandSourceFile(fakeFile(new Uint8Array([0x1f, 0x8b, 0, 0, 0, 0]), "mystery.dat")),
			e => e instanceof IngestError && e.code === "SOURCE_COMPRESSED" && /gzip/.test(e.message)
		);
		await assert.rejects(
			() => expandSourceFile(fakeFile(new Uint8Array([0x78, 0x9c]), "mystery.dat")),
			e => e instanceof IngestError && e.code === "SOURCE_COMPRESSED" && /zlib/.test(e.message)
		);
	});

	it("rejects a declared compression ratio over 1000:1 and ignores a missing compressed size", () => {
		assert.throws(
			() => assertZipEntryInflation({ uncompressedSize: ZIP_MAX_RATIO + 1, compressedSize: 1 }),
			e => e instanceof IngestError && e.code === "ZIP_TOO_LARGE"
		);
		assert.doesNotThrow(() => assertZipEntryInflation({ uncompressedSize: 5000, compressedSize: 0 }));
		assert.doesNotThrow(() => assertZipEntryInflation({ uncompressedSize: 5000 }));
		assert.doesNotThrow(() => assertZipEntryInflation({ uncompressedSize: ZIP_MAX_RATIO, compressedSize: 1 }));
	});

	it("extracts a small zipped mcstructure through the counting writer", async () => {
		const zip = await import("@zip.js/zip.js");
		const sample = readFileSync(join(root, "tests/sampleStructures/levers.mcstructure"));
		const writer = new zip.ZipWriter(new zip.BlobWriter());
		await writer.add("levers.mcstructure", new zip.Uint8ArrayReader(sample));
		const blob = await writer.close();
		const file = new File([await blob.arrayBuffer()], "pack.zip");
		const expanded = await expandSourceFile(file);
		assert.equal(expanded.structures.length, 1);
		assert.equal(expanded.structures[0].name, "levers.mcstructure");
	});

	it("rejects a zip member whose declared ratio exceeds 1000:1", async () => {
		const zip = await import("@zip.js/zip.js");
		const zeros = new Uint8Array(2_000_000);
		const writer = new zip.ZipWriter(new zip.BlobWriter());
		await writer.add("bomb.mcstructure", new zip.Uint8ArrayReader(zeros), { level: 9 });
		const blob = await writer.close();
		const probe = new zip.ZipReader(new zip.BlobReader(blob));
		const [entry] = await probe.getEntries();
		await probe.close();
		assert.ok(entry.uncompressedSize / entry.compressedSize > ZIP_MAX_RATIO);
		const file = new File([await blob.arrayBuffer()], "bomb.zip");
		await assert.rejects(
			() => expandSourceFile(file),
			e => e instanceof IngestError && e.code === "ZIP_TOO_LARGE"
		);
	});

	it("rejects a world database member whose declared ratio exceeds 1000:1", async () => {
		const zip = await import("@zip.js/zip.js");
		const zeros = new Uint8Array(2_000_000);
		const writer = new zip.ZipWriter(new zip.BlobWriter());
		await writer.add("db/CURRENT", new zip.Uint8ArrayReader(new Uint8Array([0x0a])));
		await writer.add("db/000005.ldb", new zip.Uint8ArrayReader(zeros), { level: 9 });
		const blob = await writer.close();
		const file = new File([await blob.arrayBuffer()], "bomb.mcworld");
		await assert.rejects(
			() => expandSourceFile(file),
			e => e instanceof IngestError && e.code === "ZIP_TOO_LARGE"
		);
	});

	it("rejects a world zip that has no CURRENT file", async () => {
		const zip = await import("@zip.js/zip.js");
		const writer = new zip.ZipWriter(new zip.BlobWriter());
		await writer.add("readme.txt", new zip.Uint8ArrayReader(new Uint8Array([1, 2, 3])));
		const blob = await writer.close();
		const file = new File([await blob.arrayBuffer()], "empty.mcworld");
		await assert.rejects(
			() => expandSourceFile(file),
			e => e instanceof IngestError && e.code === "UNRECOGNIZED_SOURCE"
		);
	});
});

